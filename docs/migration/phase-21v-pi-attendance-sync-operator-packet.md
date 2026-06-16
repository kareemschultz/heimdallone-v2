# Phase 21V — Pi Attendance Sync — Operator Packet (2026-06-16)

Everything an on-site operator needs to make the ZKTeco time clock push live
punches into v2. The VPS **cannot reach the Pi** (10.241.1.109) and a public Gist
**cannot carry secrets**, so these steps are done on-site / by the operator.

> Do NOT print the ingest key in chat, logs, or commits. Do NOT replace the Gist
> until the v2 device + key are verified and the old Gist content is backed up.

## Current state
- v2 ingest endpoint **live**: `POST https://api.heimdallone.com/rpc/biometric/ingest/submit`
  (public; empty body → 400 "Input validation failed" = up, not 404/500).
- Historical punches already loaded (901 punches / 358 records / 19 device maps).
- A ZKTeco device is **registered** in v2 (`api_ingest`, currently `inactive` /
  never synced — because the Pi still posts to **v1**).
- The v2 bridge script (`scripts/device-bridge/heimdallone_sync.py`) is built and
  **drops the v1 heartbeat** (v2 has no heartbeat route) — so once it runs there
  is no 404 heartbeat noise and no compatibility route is needed.

## Current device (verified 2026-06-16, read-only)
- **Device id:** `6a632a46-003d-4515-ab0d-220ffbbdf194` (name "Time terminal",
  ZKTeco, `api_ingest`, org Netsurf) — a UUID, not a secret.
- **Ingest key: NOT generated yet** (`api_key_hash` is null). The operator MUST
  use **Rotate ingest key** on the device detail to generate one (shown once)
  before the Pi can authenticate — without it, ingest will reject the device.
- 19 device↔employee maps + 901 historical punches already loaded; endpoint live.
- The on-site Pi is currently posting **v1** paths (`/rpc/attendance/devices/
  heartbeat` + `recordBatchFromDevice`) → 404 on v2 (harmless; confirms the Pi is
  alive and will flow the moment it's repointed to the v2 script + endpoint).

## Variables the Pi needs (`/home/admin/heimdallone-bridge/.env`)
| var | value |
|-----|-------|
| `HEIMDALL_API_URL` | `https://api.heimdallone.com` |
| `HEIMDALL_DEVICE_ID` | the v2 device id (from the device page — see below) |
| `HEIMDALL_API_KEY` | the v2 one-time ingest key (rotate to obtain — see below) |
| `HEIMDALL_TZ` | `America/Guyana` |

## Get the device id + ingest key (in the v2 app, admin)
1. App → **Time clocks → Devices** → open the registered ZKTeco device.
2. **Device id**: shown on the detail page (safe to copy; it is not a secret).
3. **Ingest key**: use **Rotate ingest key** on the device detail (or Register a
   fresh `api_ingest` device). The key is shown **once** — copy it straight into
   the Pi `.env`; never paste it into chat/email/logs.

## Pi commands (on-site)
```sh
cd /home/admin/heimdallone-bridge
# 1) back up current script + env (rollback)
sudo cp heimdallone_sync.py heimdallone_sync.py.v1bak
sudo cp .env .env.v1bak
# 2) set v2 values (paste the key directly in the editor; do not echo it)
sudo nano .env
#   HEIMDALL_API_URL=https://api.heimdallone.com
#   HEIMDALL_DEVICE_ID=<device id>
#   HEIMDALL_API_KEY=<one-time ingest key>
#   HEIMDALL_TZ=America/Guyana
# 3) restart + watch
sudo systemctl restart heimdallone-bridge
journalctl -u heimdallone-bridge -f
```

## Publishing the v2 bridge code (Gist — code only, no secrets)
The Pi auto-updates `heimdallone_sync.py` from the public Gist
(`0ed7921feaac8a7c316799171d370826`) every 5 min via `bridge-autoupdate.sh`.
1. **Back up** the current Gist `heimdallone_sync.py` revision (copy elsewhere).
2. Replace the Gist file content with this repo's
   `scripts/device-bridge/heimdallone_sync.py`.
3. The Pi pulls within 5 min (syntax-validated before swap), or `sudo systemctl
   restart heimdallone-bridge` to apply immediately.
4. **Rollback:** revert the Gist to the backed-up revision (Pi re-pulls), or
   restore `heimdallone_sync.py.v1bak` + `.env.v1bak` and restart.

## Verify after cutover
- Device detail → status flips **active**, **last-sync** populates, a **sync run**
  appears.
- `attendance_punch` count increments (source=device); processor → events →
  records.
- **No 404 heartbeat** in server logs (the v2 script sends none).
- **No duplicate punches** (idempotency key `dev|device|user|epoch`) and **no
  unmatched flood** (device user slots are mapped — 19 maps loaded).

## Safety
No v1 writes; ingest key never printed/committed; Gist replaced only with a
backup in hand; v1 script/`.env` kept as rollback; v1 ingest stays up until v2 is
confirmed.
