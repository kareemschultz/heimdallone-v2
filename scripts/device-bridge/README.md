# Heimdallone v2 Device Bridge (Pi → v2 ingest)

The on-site Raspberry Pi polls the ZKTeco terminal (TCP/4370) and POSTs new
punches to the **v2** ingest endpoint. This is the live, forward-sync agent for
**Phase 21O-D**. Historical punches are loaded separately by the backfill bridge
(`scripts/migration/attendance-bridge/`).

This is a clean v2 agent — it does **not** carry v1's endpoints or bugs. It keeps
the one genuine operational fix (clock-drift correction).

## Why no on-site visit is needed to re-point the Pi

The Pi runs `bridge-autoupdate.sh` from cron every 5 minutes. It pulls
`heimdallone_sync.py` from a **public GitHub Gist**, validates its syntax, hot-
swaps it, and restarts the service. So shipping the v2 script = publishing this
`heimdallone_sync.py` to the Gist. Every Pi adopts it within 5 minutes.

The auto-updater **cannot** carry the three identity/secret values — they live in
the Pi's `.env`, never in a public Gist:

- `HEIMDALL_API_URL` — the v2 API base
- `HEIMDALL_DEVICE_ID` — the v2 `attendance_device` row id
- `HEIMDALL_API_KEY` — the v2 ingest key (shown once)

## v1 → v2 differences (what changed and why)

| | v1 agent | v2 agent (this) |
| --- | --- | --- |
| Endpoint | `POST /rpc/attendance/devices/recordBatchFromDevice` | `POST /rpc/biometric/ingest/submit` |
| Auth | `Authorization: Bearer` + `X-Tenant-Id` + `X-Heimdall-Device-Id` headers | `deviceId` + `apiKey` in the JSON body (public proc; org derived from device row) |
| Punch shape | `{employeeExternalId, deviceTimestamp, punchType, deviceSideId}` | `{deviceUserId, timestamp, direction, verifyMode}` |
| Punch states | 6 (`in/out/break_*/overtime_*`) | 3-state `direction` (`in/out/unknown`); overtime→in/out, break→unknown — shift/OT inferred server-side from `shift_rule` |
| Heartbeat / "Sync Now" | yes (`/heartbeat`) | dropped (no v2 public endpoint) |
| User-list push | yes (`/recordDeviceUsers`) | dropped — v2 owns the slot→employee map in-app |
| Idempotency | Pi cursor + DB unique `(tenant,emp,punch_at,type)` | Pi cursor + server `idempotencyKey` `dev\|deviceId\|deviceUserId\|epoch` |
| Clock-drift fix | yes | **yes (kept — genuine fix)** |

The `deviceUserId` sent is the terminal slot / ZK `user_id` — the stable
enrolment id v2 maps to an employee. Punches for unmapped slots become
`attendance_exception` rows in the v2 review queue (never guessed by name).

## Cutover steps (operator)

1. **Register the terminal in v2** (production write — needs owner sign-off).
   Biometric Devices → add device: vendor `zkteco`, mode `api_ingest`,
   model `ZLM60_TFT`, timezone `America/Guyana`. Copy the **ingest key** shown
   once.
2. **Publish this `heimdallone_sync.py` to the v2 Gist**, and point
   `bridge-autoupdate.sh` `GIST_ID` at it (or set `HEIMDALL_GIST_ID` in env).
3. **On the Pi**, set the three `.env` values (`HEIMDALL_API_URL`,
   `HEIMDALL_DEVICE_ID`, `HEIMDALL_API_KEY`).
4. Wait one auto-update cycle (≤5 min) or `sudo systemctl restart
   heimdallone-bridge`.
5. **Confirm first sync**: Biometric Devices shows last-sync success; punches
   appear; check the exception queue for any unmapped slots and map them.

A brief dual-write window (v1 + v2 both receiving) is safe — the v2
`idempotencyKey` dedupes, and the backfill is idempotent.

## Manual run / local test

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in the three required values
python heimdallone_sync.py
```

## Files

- `heimdallone_sync.py` — the agent (publish this to the Gist).
- `.env.example` — copy to `.env` on the Pi.
- `requirements.txt` — `pyzk`, `requests`.
- `bridge-autoupdate.sh` — cron auto-updater (set the v2 Gist id).
- `heimdallone-bridge.service` — systemd unit.

See `docs/architecture/device-sync-bridge-plan.md` and
`docs/architecture/../../apps/docs/content/docs/time/biometric-devices.mdx`.
