# Heimdallone v2 Device Bridge (Pi → v2 ingest)

The on-site Raspberry Pi polls the ZKTeco terminal (TCP/4370) and POSTs new
punches to the **v2** ingest endpoint. This is the live, forward-sync agent for
**Phase 21O-D**. Historical punches are loaded separately by the backfill bridge
(`scripts/migration/attendance-bridge/`).

This is a clean v2 agent — it does **not** carry v1's endpoints or bugs. It keeps
the one genuine operational fix (clock-drift correction).

## Why no on-site visit is needed to re-point the Pi

**The existing Gist auto-update mechanism is reused. The Gist carries code only.
Secrets stay in the Pi `.env`. At cutover, replace the Gist script with the
v2-native script and update the Pi `.env` with the v2 device ID and ingest key.**

The Pi already runs `bridge-autoupdate.sh` from cron every 5 minutes: it pulls
`heimdallone_sync.py` from a **public GitHub Gist**, validates its syntax, hot-
swaps it, and restarts the service. We keep that mechanism unchanged — do not
build a new updater. Shipping the v2 agent = replacing that Gist's
`heimdallone_sync.py` content with this script. Every Pi adopts it within 5
minutes.

The Gist **never** carries secrets. The three identity/secret values live only in
the Pi's `.env`:

- `HEIMDALL_API_URL` — the v2 API base
- `HEIMDALL_DEVICE_ID` — the v2 `attendance_device` row id
- `HEIMDALL_API_KEY` — the v2 ingest key (shown once at registration)

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

> Do **not** perform production device registration before cutover. These steps
> run only at the approved cutover window.

1. Log in to Heimdallone v2 as **platform owner**.
2. **Register the ZKTeco biometric terminal in v2** (Biometric Devices → add
   device: vendor `zkteco`, mode `api_ingest`, model `ZLM60_TFT`, timezone
   `America/Guyana`).
3. Copy the generated v2 **`deviceId`**.
4. Copy the generated **one-time ingest `apiKey`**.
5. Update the Pi local `.env` with:
   - `HEIMDALL_API_URL`
   - `HEIMDALL_DEVICE_ID`
   - `HEIMDALL_API_KEY`
6. Replace the existing Gist `heimdallone_sync.py` **content** with the v2-native
   script from `scripts/device-bridge/heimdallone_sync.py` (code only — no
   secrets).
7. Wait up to 5 minutes for the Pi auto-updater, or `sudo systemctl restart
   heimdallone-bridge`.
8. Confirm punches arrive in v2 (Biometric Devices shows last-sync success).
9. Check the unmatched-punch queue / exception report; map any unmapped slots.
10. Confirm attendance recalculation and payroll reconciliation remain clean.

A brief dual-write window (v1 + v2 both receiving) is safe — the v2
`idempotencyKey` dedupes, and the backfill is idempotent.

## Rollback

- If the existing Gist is used by **only** this Heimdallone bridge / tenant Pi,
  reuse the same Gist directly (replace its content). `bridge-autoupdate.sh`
  defaults to that existing Gist id.
- If **multiple unrelated clients/Pis** share that Gist, create a **new v2 Gist**
  instead and set `HEIMDALL_GIST_ID` (or `GIST_URL`) on the Pi once.
- **Keep a copy of the v1 script** before replacing the Gist content.
- If v2 sync fails during cutover, **restore the old v1 script** in the Gist and
  restart the bridge (`sudo systemctl restart heimdallone-bridge`).

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
