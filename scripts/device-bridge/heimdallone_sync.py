#!/usr/bin/env python3
"""
Heimdallone v2 biometric sync — Raspberry Pi / mini-PC daemon for ZKTeco terminals.

Lives on the tenant's office LAN, polls the terminal over TCP/4370, batches new
attendance punches, and uploads them to the Heimdallone **v2** ingest endpoint.
The terminal has no public IP and never needs one — all traffic is outbound HTTPS.

This is the v2-native agent. It deliberately does NOT carry v1's surface or its
bugs:

    - Targets v2's single public device endpoint:
        POST {api_url}/rpc/biometric/ingest/submit
      (v1 used /rpc/attendance/devices/recordBatchFromDevice — gone in v2.)
    - Auth is the device id + ingest key carried IN THE JSON BODY (v2 ingest is a
      public procedure that derives the org from the device row). v1's
      Bearer + X-Tenant-Id + X-Heimdall-Device-Id headers are not used.
    - Sends v2's punch shape: {deviceUserId, timestamp, direction, verifyMode}.
      The device slot/enrollment id (ZK user_id) is the stable `deviceUserId`
      v2 maps to an employee — never a name, never a guess.
    - Drops v1-only chatter that has no v2 endpoint: the per-cycle heartbeat /
      "Sync Now" flag and the user-list push. v2 owns the slot→employee map in
      the app (seeded by the migration bridge / Biometric Devices screen).
    - Keeps the one genuine operational FIX from v1: clock-drift auto-correction
      for terminals that revert to local GYT (UTC-4) after a power cut. That is a
      real fix, not a v1 quirk, so it stays.
    - Idempotency is the v2 server's unique `idempotencyKey`
      (dev|deviceId|deviceUserId|epoch). The on-disk cursor is only a bandwidth
      optimization; re-running re-uploads nothing.

Configuration via environment variables (see .env.example):
    HEIMDALL_API_URL          required, v2 API base, e.g. https://app.heimdallone.com
    HEIMDALL_DEVICE_ID        required, the v2 attendance_device.id from registration
    HEIMDALL_API_KEY          required, the v2 ingest key shown ONCE at registration
    HEIMDALL_DEVICE_IP        required, e.g. 10.241.1.109
    HEIMDALL_DEVICE_PORT      optional, default 4370
    HEIMDALL_POLL_INTERVAL    optional, default 60 (seconds)
    HEIMDALL_BATCH_SIZE       optional, default 500 (max 5000 server-side)
    HEIMDALL_CURSOR_PATH      optional, default ./cursor.json
    HEIMDALL_SYNC_DEVICE_TIME optional, default true — overwrite device clock with UTC
    HEIMDALL_DISABLE_DURING_FETCH optional, default true — disable device while reading
    HEIMDALL_DEVICE_PASSWORD  optional, default 0 — numeric device password (0 = none)
    HEIMDALL_VERIFY_MODE      optional, default fingerprint — reported verify method
    HEIMDALL_CLOCK_DRIFT_CORRECT   optional, default true
    HEIMDALL_CLOCK_DRIFT_MIN_HOURS optional, default 3
    HEIMDALL_CLOCK_DRIFT_MAX_HOURS optional, default 5
    HEIMDALL_TELEGRAM_BOT_TOKEN    optional — alert on drift correction
    HEIMDALL_TELEGRAM_CHAT_ID      optional

Install:
    pip install -r requirements.txt

Run:
    python heimdallone_sync.py

Unattended (systemd):
    sudo cp heimdallone-bridge.service /etc/systemd/system/
    sudo systemctl enable --now heimdallone-bridge
    journalctl -u heimdallone-bridge -f
"""

import json
import logging
import os
import socket
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:
    import requests
    from zk import ZK
    from zk.exception import ZKNetworkError
except ImportError:
    print(
        "Missing dependencies. Run: pip install -r requirements.txt",
        file=sys.stderr,
    )
    sys.exit(2)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


def _require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        print(f"ERROR: missing required env var {name}", file=sys.stderr)
        sys.exit(2)
    return val


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


# v2 ingest accepts at most 5000 rows per request (MAX_INGEST_ROWS).
SERVER_MAX_BATCH = 5000

# v2 verifyMode enum — what the device reported, NOT a biometric template.
VALID_VERIFY_MODES = {
    "fingerprint",
    "face",
    "card",
    "password",
    "mobile_gps",
    "manual",
    "unknown",
}

CONFIG = {
    "api_url": _require_env("HEIMDALL_API_URL").rstrip("/"),
    "device_id": _require_env("HEIMDALL_DEVICE_ID"),
    "api_key": _require_env("HEIMDALL_API_KEY"),
    "device_ip": _require_env("HEIMDALL_DEVICE_IP"),
    "device_port": int(os.environ.get("HEIMDALL_DEVICE_PORT", "4370")),
    "device_timeout": int(os.environ.get("HEIMDALL_DEVICE_TIMEOUT", "30")),
    "device_password": int(os.environ.get("HEIMDALL_DEVICE_PASSWORD", "0")),
    "poll_interval_sec": int(os.environ.get("HEIMDALL_POLL_INTERVAL", "60")),
    "batch_size": min(
        int(os.environ.get("HEIMDALL_BATCH_SIZE", "500")), SERVER_MAX_BATCH
    ),
    "cursor_path": Path(os.environ.get("HEIMDALL_CURSOR_PATH", "./cursor.json")),
    "sync_device_time": _bool_env("HEIMDALL_SYNC_DEVICE_TIME", True),
    "disable_during_fetch": _bool_env("HEIMDALL_DISABLE_DURING_FETCH", True),
    "verify_mode": os.environ.get("HEIMDALL_VERIFY_MODE", "fingerprint"),
    # Clock-drift correction — the one genuine fix carried over from v1.
    # After a power cut the terminal can revert to local GYT (UTC-4); punches in
    # that window land ~4h behind UTC. Detect the 3-5h signature and shift +4h.
    # Outside the window: leave untouched (recent punch < 3h; long catchup > 5h).
    "clock_drift_correct": _bool_env("HEIMDALL_CLOCK_DRIFT_CORRECT", True),
    "clock_drift_min_hours": float(
        os.environ.get("HEIMDALL_CLOCK_DRIFT_MIN_HOURS", "3")
    ),
    "clock_drift_max_hours": float(
        os.environ.get("HEIMDALL_CLOCK_DRIFT_MAX_HOURS", "5")
    ),
    "telegram_bot_token": os.environ.get("HEIMDALL_TELEGRAM_BOT_TOKEN", ""),
    "telegram_chat_id": os.environ.get("HEIMDALL_TELEGRAM_CHAT_ID", ""),
}

if CONFIG["verify_mode"] not in VALID_VERIFY_MODES:
    print(
        f"ERROR: HEIMDALL_VERIFY_MODE='{CONFIG['verify_mode']}' is not one of "
        f"{sorted(VALID_VERIFY_MODES)}",
        file=sys.stderr,
    )
    sys.exit(2)


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)
log = logging.getLogger("heimdall-bridge-v2")


# ---------------------------------------------------------------------------
# ZK punch state -> v2 direction (in / out / unknown)
#
# v2's model is a 3-state direction; the processor infers shift/overtime from
# the record + the tenant's shift_rule, so the agent does not preserve v1's six
# punch types. Overtime in/out collapse to in/out; break punches are 'unknown'.
# This matches the migration backfill mapper (directionFor) so the live and
# historical paths agree.
# ---------------------------------------------------------------------------

DIRECTION_BY_STATE: dict[int, str] = {
    0: "in",
    1: "out",
    2: "unknown",  # break_start
    3: "unknown",  # break_end
    4: "in",       # overtime_in
    5: "out",      # overtime_out
}


def map_direction(state: int) -> str:
    return DIRECTION_BY_STATE.get(state, "unknown")


# ---------------------------------------------------------------------------
# Cursor — JSON file on disk, survives restart.
# ---------------------------------------------------------------------------


def load_cursor() -> dict[str, Any]:
    path = CONFIG["cursor_path"]
    if not path.exists():
        return {"last_uid": 0, "last_success_at": None, "consecutive_failures": 0}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "last_uid": int(data.get("last_uid", 0)),
            "last_success_at": data.get("last_success_at"),
            "consecutive_failures": int(data.get("consecutive_failures", 0)),
        }
    except (OSError, ValueError) as exc:
        log.warning("Cursor file unreadable (%s); resetting to fresh state.", exc)
        return {"last_uid": 0, "last_success_at": None, "consecutive_failures": 0}


def save_cursor(cursor: dict[str, Any]) -> None:
    path = CONFIG["cursor_path"]
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(cursor, f, indent=2)
    tmp.replace(path)  # atomic on POSIX


# ---------------------------------------------------------------------------
# Device fetch — disable terminal during read so no punch happens mid-sync.
# ---------------------------------------------------------------------------


def fetch_punches_from_device() -> list[dict[str, Any]]:
    """Pull the attendance log from the terminal as v2-shaped punch dicts:
    {deviceUserId, timestamp(UTC ISO 'Z'), direction, verifyMode}, plus an
    internal _uid for cursor bookkeeping (stripped before upload)."""
    zk = ZK(
        CONFIG["device_ip"],
        port=CONFIG["device_port"],
        timeout=CONFIG["device_timeout"],
        password=CONFIG["device_password"],
        # Skip pyzk's UDP pre-ping: some ZK firmwares close the next TCP
        # connection if pinged first. The TCP connect is the liveness check.
        ommit_ping=True,
    )
    conn = None
    out: list[dict[str, Any]] = []
    try:
        log.info(
            "Connecting to terminal at %s:%s",
            CONFIG["device_ip"],
            CONFIG["device_port"],
        )
        conn = zk.connect()

        if CONFIG["sync_device_time"]:
            try:
                conn.set_time(datetime.now(timezone.utc).replace(tzinfo=None))
                log.info("Synced terminal clock with UTC")
            except Exception as exc:  # noqa: BLE001
                log.warning("Clock sync failed (non-fatal): %s", exc)

        if CONFIG["disable_during_fetch"]:
            try:
                conn.disable_device()
            except Exception as exc:  # noqa: BLE001
                log.warning("disable_device() failed (non-fatal): %s", exc)

        attendances = conn.get_attendance() or []
        log.info("Fetched %d total attendance records", len(attendances))

        for att in attendances:
            ts = att.timestamp
            # Clock is synced to UTC above, so att.timestamp is naive UTC.
            # Format without microseconds — the server parses ISO 'Z'.
            ts_utc = ts.replace(tzinfo=timezone.utc)
            out.append(
                {
                    "_uid": int(att.uid),  # internal — not sent
                    "deviceUserId": str(att.user_id),
                    "timestamp": ts_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "direction": map_direction(int(att.punch)),
                    "verifyMode": CONFIG["verify_mode"],
                }
            )

        if CONFIG["disable_during_fetch"]:
            try:
                conn.enable_device()
            except Exception as exc:  # noqa: BLE001
                log.warning("enable_device() failed (non-fatal): %s", exc)

    finally:
        if conn is not None:
            try:
                conn.disconnect()
            except Exception:  # noqa: BLE001
                pass

    return out


# ---------------------------------------------------------------------------
# Upload — v2 ingest, one batch POST per chunk.
# ---------------------------------------------------------------------------


def upload_batch(punches: list[dict[str, Any]]) -> dict[str, Any]:
    """POST a chunk to v2's /rpc/biometric/ingest/submit.

    The device id + ingest key travel in the body (public procedure; org is
    derived from the device row). Returns the parsed summary
    {runId, created, duplicate, errored}. Raises on HTTP error so the caller
    decides whether to advance the cursor.
    """
    url = f"{CONFIG['api_url']}/rpc/biometric/ingest/submit"
    headers = {"Content-Type": "application/json"}
    # oRPC wire format wraps the input under a "json" key.
    payload = {
        "json": {
            "deviceId": CONFIG["device_id"],
            "apiKey": CONFIG["api_key"],
            "punches": [
                {k: v for k, v in p.items() if not k.startswith("_")}
                for p in punches
            ],
        }
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"Ingest returned {resp.status_code}: {resp.text[:400]}")
    body = resp.json()
    return body.get("json", body)


# ---------------------------------------------------------------------------
# Clock-drift detection and correction (the one fix carried from v1)
# ---------------------------------------------------------------------------


def _correct_clock_drift(new_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Shift UTC-slipped timestamps forward by 4h, in-place. Returns a list of
    applied corrections for alerting."""
    if not new_records:
        return []

    now_utc = datetime.now(timezone.utc)
    drift_min = timedelta(hours=CONFIG["clock_drift_min_hours"])
    drift_max = timedelta(hours=CONFIG["clock_drift_max_hours"])
    correction = timedelta(hours=4)

    applied: list[dict[str, Any]] = []
    for r in new_records:
        ts = datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00"))
        drift = now_utc - ts
        if not (drift_min < drift < drift_max):
            continue

        original = r["timestamp"]
        if CONFIG["clock_drift_correct"]:
            fixed = ts + correction
            r["timestamp"] = fixed.strftime("%Y-%m-%dT%H:%M:%SZ")
            log.warning(
                "Clock-drift corrected: uid=%s  %s -> %s  (drift=%.1fh)",
                r["_uid"],
                original,
                r["timestamp"],
                drift.total_seconds() / 3600,
            )
        else:
            log.warning(
                "Clock-drift detected (correction disabled): uid=%s ts=%s drift=%.1fh",
                r["_uid"],
                original,
                drift.total_seconds() / 3600,
            )

        applied.append(
            {
                "uid": r["_uid"],
                "deviceUserId": r["deviceUserId"],
                "original": original,
                "corrected": r["timestamp"],
            }
        )

    return applied


def _send_drift_alert(corrections: list[dict[str, Any]]) -> None:
    token = CONFIG["telegram_bot_token"]
    chat_id = CONFIG["telegram_chat_id"]
    if not token or not chat_id or not corrections:
        return

    action = (
        "corrected (+4h)"
        if CONFIG["clock_drift_correct"]
        else "detected (not corrected)"
    )
    lines = [
        f"Heimdallone v2 — terminal clock-drift {action}",
        f"Device: {CONFIG['device_ip']}",
        f"{len(corrections)} punch(es) affected:",
    ]
    for c in corrections:
        lines.append(
            f"  - slot {c['deviceUserId']}: {c['original']} -> {c['corrected']}"
        )

    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": "\n".join(lines)},
            timeout=10,
        )
        log.info("Drift alert sent to Telegram.")
    except Exception as exc:  # noqa: BLE001
        log.warning("Telegram drift alert failed (non-fatal): %s", exc)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def chunk(items: list[Any], n: int) -> list[list[Any]]:
    return [items[i : i + n] for i in range(0, len(items), n)]


def run_once() -> None:
    cursor = load_cursor()
    last_uid = cursor["last_uid"]

    try:
        all_records = fetch_punches_from_device()
    except (socket.timeout, ZKNetworkError) as exc:
        cursor["consecutive_failures"] += 1
        save_cursor(cursor)
        log.warning(
            "Terminal unreachable — network timeout (consecutive failures: %d): %s",
            cursor["consecutive_failures"],
            exc,
        )
        return
    except Exception as exc:  # noqa: BLE001
        cursor["consecutive_failures"] += 1
        save_cursor(cursor)
        log.error(
            "Terminal fetch failed (consecutive failures: %d): %s",
            cursor["consecutive_failures"],
            exc,
        )
        return

    new_records = [r for r in all_records if r["_uid"] > last_uid]

    drift_corrections = _correct_clock_drift(new_records)
    if drift_corrections:
        _send_drift_alert(drift_corrections)

    if not new_records:
        cursor["consecutive_failures"] = 0
        cursor["last_success_at"] = datetime.now(timezone.utc).isoformat()
        save_cursor(cursor)
        log.info("No new punches since uid=%s", last_uid)
        return

    log.info("Uploading %d new punches (uid > %s)", len(new_records), last_uid)

    chunks = chunk(new_records, CONFIG["batch_size"])
    high_water_uid = last_uid

    for batch in chunks:
        try:
            summary = upload_batch(batch)
        except requests.exceptions.Timeout as exc:
            cursor["last_uid"] = high_water_uid  # commit partial progress
            cursor["consecutive_failures"] += 1
            save_cursor(cursor)
            log.warning(
                "Upload timed out at batch starting uid=%s (failures: %d): %s",
                batch[0]["_uid"],
                cursor["consecutive_failures"],
                exc,
            )
            return
        except Exception as exc:  # noqa: BLE001
            cursor["last_uid"] = high_water_uid  # commit partial progress
            cursor["consecutive_failures"] += 1
            save_cursor(cursor)
            log.error(
                "Upload failed at batch starting uid=%s (failures: %d): %s",
                batch[0]["_uid"],
                cursor["consecutive_failures"],
                exc,
            )
            return

        created = summary.get("created", 0)
        duplicate = summary.get("duplicate", 0)
        errored = summary.get("errored", 0)
        log.info(
            "Batch %d->%d: %d created, %d duplicate, %d errored (runId=%s)",
            batch[0]["_uid"],
            batch[-1]["_uid"],
            created,
            duplicate,
            errored,
            summary.get("runId", "?"),
        )
        # Unmatched device users surface as exceptions in the v2 review queue,
        # not as per-row rejections here — admins map the slot in the app.

        high_water_uid = batch[-1]["_uid"]

    cursor["last_uid"] = high_water_uid
    cursor["last_success_at"] = datetime.now(timezone.utc).isoformat()
    cursor["consecutive_failures"] = 0
    save_cursor(cursor)
    log.info("Cycle complete; cursor advanced to uid=%s", high_water_uid)


def main() -> None:
    log.info("Heimdallone v2 biometric sync starting")
    log.info(
        "  API: %s | Device: %s | Terminal: %s:%s",
        CONFIG["api_url"],
        CONFIG["device_id"],
        CONFIG["device_ip"],
        CONFIG["device_port"],
    )
    log.info(
        "  Poll every %ds, batch size %d",
        CONFIG["poll_interval_sec"],
        CONFIG["batch_size"],
    )

    while True:
        try:
            run_once()
        except KeyboardInterrupt:
            log.info("Interrupted; shutting down")
            return
        except Exception as exc:  # noqa: BLE001
            log.exception("Unhandled error in main loop: %s", exc)

        remaining = CONFIG["poll_interval_sec"]
        while remaining > 0:
            time.sleep(min(15, remaining))
            remaining -= 15


if __name__ == "__main__":
    main()
