#!/usr/bin/env bash
# bridge-autoupdate.sh  (Heimdallone v2)
#
# Runs on the Pi via cron (every 5 minutes). Checks a public Gist for the latest
# version of the v2 sync script and hot-swaps it if anything changed. No GitHub
# token needed — the Gist is public. This is the mechanism that lets us re-point
# the Pi at v2 (and ship future fixes) WITHOUT an on-site visit: publish the new
# heimdallone_sync.py to the Gist and every Pi picks it up within 5 minutes.
#
# What this CANNOT change: the Pi's .env (HEIMDALL_API_URL / HEIMDALL_DEVICE_ID /
# HEIMDALL_API_KEY). Secrets never go in a public Gist — set those once on the Pi
# at cutover.
#
# Install on the Pi (one-time). Point GIST_ID at the v2 Gist you publish:
#   sudo curl -fsSL "<raw url of THIS file>" -o /home/admin/heimdallone-bridge/bridge-autoupdate.sh
#   sudo chmod +x /home/admin/heimdallone-bridge/bridge-autoupdate.sh
#   (sudo crontab -l 2>/dev/null; echo "*/5 * * * * /home/admin/heimdallone-bridge/bridge-autoupdate.sh >> /var/log/heimdallone-autoupdate.log 2>&1") | sudo crontab -

set -euo pipefail

BRIDGE_DIR="/home/admin/heimdallone-bridge"
# v2 Gist — replace with the Gist id you publish heimdallone_sync.py to.
GIST_ID="${HEIMDALL_GIST_ID:-REPLACE_WITH_V2_GIST_ID}"
GIST_OWNER="${HEIMDALL_GIST_OWNER:-kareemschultz}"
GIST_FILE="heimdallone_sync.py"
INSTALL_PATH="${BRIDGE_DIR}/heimdallone_sync.py"
VERSION_FILE="${BRIDGE_DIR}/.version"
SERVICE="heimdallone-bridge"

GIST_URL="https://gist.githubusercontent.com/${GIST_OWNER}/${GIST_ID}/raw/${GIST_FILE}"

CURRENT_SHA=$(cat "$VERSION_FILE" 2>/dev/null || echo "")

LATEST_SHA=$(curl -sf \
    "https://api.github.com/gists/${GIST_ID}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['history'][0]['version'][:12])" \
    2>/dev/null || echo "")

if [ -n "$LATEST_SHA" ] && [ "$LATEST_SHA" = "$CURRENT_SHA" ]; then
    exit 0  # nothing to do
fi

echo "$(TZ='America/Guyana' date +'%Y-%m-%d %I:%M:%S %p GYT') [INFO] Update available: ${CURRENT_SHA:-none} -> ${LATEST_SHA:-unknown}"

# Download to temp first — never overwrite the live script with a partial file.
TMP=$(mktemp /tmp/heimdallone_sync.XXXXXX.py)
curl -fsSL "$GIST_URL" -o "$TMP"

# Validate syntax before replacing.
python3 -c "import ast; ast.parse(open('$TMP').read())" || {
    echo "$(TZ='America/Guyana' date +'%Y-%m-%d %I:%M:%S %p GYT') [ERROR] Downloaded file failed Python syntax check — aborting"
    rm -f "$TMP"
    exit 1
}

cp "$TMP" "$INSTALL_PATH"
rm -f "$TMP"

[ -n "$LATEST_SHA" ] && echo "$LATEST_SHA" > "$VERSION_FILE"

echo "$(TZ='America/Guyana' date +'%Y-%m-%d %I:%M:%S %p GYT') [INFO] Script updated — restarting ${SERVICE}"
systemctl restart "$SERVICE"
echo "$(TZ='America/Guyana' date +'%Y-%m-%d %I:%M:%S %p GYT') [INFO] Done"
