# Phase 21X — Time-attendance (Pi) live-sync cutover prep (2026-06-16)

The v2 side is fully wired and the v2 Pi bridge script is built. Live sync needs
one **operator** action on the on-site Raspberry Pi (10.241.1.109) — the host
running this work cannot reach the Pi, and a public Gist cannot carry secrets.

## v2 state (verified)
- Ingest endpoint **live**: `POST https://api.heimdallone.com/rpc/biometric/ingest/submit`
  (public; returns 400 "Input validation failed" for an empty body — i.e. up,
  not 404/500). Auth = device id + ingest key **in the JSON body**.
- Registered device exists (ZKTeco, `api_ingest`, currently `inactive` / never
  synced because the Pi still posts to v1).
- 901 punches + 358 attendance records already loaded; 19 employee↔device maps.
- **No compatibility route is needed**: the v2 bridge script
  (`scripts/device-bridge/heimdallone_sync.py`) **drops the v1 heartbeat** (v2 has
  no heartbeat endpoint) and posts only to the ingest endpoint. The 404 heartbeat
  noise stops the moment the Pi runs the v2 script.

## Cutover = 2 operator steps

### 1. Publish the v2 bridge code to the Gist (code only, no secrets)
The Pi auto-updates `heimdallone_sync.py` from the public Gist
(`0ed7921feaac8a7c316799171d370826`) every 5 min via `bridge-autoupdate.sh`.
- **Back up the current Gist content first** (copy the existing
  `heimdallone_sync.py` revision elsewhere — it's the rollback).
- Replace the Gist's `heimdallone_sync.py` with `scripts/device-bridge/heimdallone_sync.py`.
- Within 5 min the Pi pulls it (syntax-validated before swap).

### 2. Set the Pi `.env` once (secrets — never in the Gist)
Register/rotate the device in v2 (Time clocks → Register device, or rotate on the
device detail) to get the **one-time ingest key**, then on the Pi
(`/home/admin/heimdallone-bridge/.env`):

```sh
# On the Pi — DO NOT paste the key into chat/logs.
sudo cp /home/admin/heimdallone-bridge/heimdallone_sync.py /home/admin/heimdallone-bridge/heimdallone_sync.py.v1bak
sudo cp /home/admin/heimdallone-bridge/.env /home/admin/heimdallone-bridge/.env.v1bak
sudo nano /home/admin/heimdallone-bridge/.env
#   HEIMDALL_API_URL=https://api.heimdallone.com
#   HEIMDALL_DEVICE_ID=<v2 device id from the device page>
#   HEIMDALL_API_KEY=<v2 one-time ingest key>
sudo systemctl restart heimdallone-bridge
journalctl -u heimdallone-bridge -f      # watch the first batch post
```

## Verify after cutover
- v2 device detail → status flips to active, last-sync populates, a sync-run appears.
- New punches land in `attendance_punch` (source=device) → processor → records.
- No 404 heartbeat in server logs (the v2 script doesn't send one).

## Rollback
- Restore `.env.v1bak` + `heimdallone_sync.py.v1bak` on the Pi and restart, OR
  revert the Gist to the backed-up revision. v1 ingest is still up.

## Hard rules honored
No v1 writes; no secrets printed/committed; Gist not replaced by this work
(operator does it after verifying the v2 device + key); v1 script kept as rollback.
