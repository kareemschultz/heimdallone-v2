# Phase 21U — Day-of Command Packet

Copy/paste commands for the freeze + final delta load. **DO NOT RUN any
🛑-labelled step until the owner sends "Approve Phase 21U freeze."** ✅ steps are
read-only and safe. Run on the host (`kt-titan-01`). Never print/commit secrets.

```bash
# Env setup (once). Secrets come from gitignored files, never echoed.
cd /home/karetech/Heimdallone
set -a; . .env.migration; . apps/server/.env; set +a
export V1_DATABASE_URL="${V1_DATABASE_URL/@postgres-central:/@localhost:}"   # read-only v1
export V2_PROD="postgres://heimdallone:***@postgres-central:5432/heimdallone_v2_prod"  # from deploy/.env.v2
export STAMP=$(date +%Y%m%d-%H%M)
```

## 1. Preflight (✅ read-only)
```bash
git fetch origin && git rev-parse HEAD               # == origin/master
docker ps --format '{{.Names}} {{.Status}}' | grep -E 'heimdallone-v2|heimdallone-(server|nginx)'
curl -fsS http://127.0.0.1:3100/health               # {"status":"ok"}
bun run migration:dry-run                            # 0 feature gaps
bun run migration:reconcile                          # READY 46/46
```

## 2. 🛑 Freeze v1 — DO NOT RUN until approved
```bash
echo "CONFIRM: freezing live v1 (karetech_erp) read-only. Users will be locked out of writes."
# announce downtime first, then:
docker exec postgres-central psql -U postgres -c \
  "ALTER DATABASE karetech_erp SET default_transaction_read_only = on;"
# verify no new writes are arriving before continuing
```

## 3. 🛑 Backup v1 — DO NOT RUN until approved (read of v1, writes a dump file)
```bash
mkdir -p backups
docker exec postgres-central pg_dump -U postgres -Fc karetech_erp > backups/v1-karetech_erp-$STAMP.dump
echo "v1 backup: $(du -h backups/v1-karetech_erp-$STAMP.dump)"
```

## 4. 🛑 Backup v2 restore point — DO NOT RUN until approved
```bash
docker exec postgres-central pg_dump -U postgres -Fc heimdallone_v2_prod > backups/v2-prefreeze-$STAMP.dump
echo "v2 restore point: $(du -h backups/v2-prefreeze-$STAMP.dump)"
```

## 5. ✅ Final dry-run + reconcile against FROZEN v1
```bash
bun run migration:dry-run        # 0 gaps
bun run migration:reconcile      # READY 46/46
```

## 6. 🛑 Final production write-ETL (delta) — DO NOT RUN until approved
```bash
echo "CONFIRM: loading frozen v1 → heimdallone_v2_prod (PRODUCTION write). Idempotent."
export V2_STAGING_DATABASE_URL="$V2_PROD"
export DATABASE_URL="$V2_PROD"
export CONFIRM_PRODUCTION_WRITE=1
export PRODUCTION_WRITE_TARGET=heimdallone_v2_prod   # NEVER karetech_erp
export USE_V1_SOURCE=1
bun run migration:write-etl                          # pilot-first, idempotent
bun run migration:attendance-bridge                  # punches → records
```

## 7. ✅ Final validation queries (post-load)
```bash
bun run migration:reconcile      # MUST stay READY 46/46
docker exec postgres-central psql -U postgres -d heimdallone_v2_prod -tAc "
SELECT 'orgs '||count(*) FROM organization
UNION ALL SELECT 'members '||count(*) FROM member
UNION ALL SELECT 'users '||count(*) FROM \"user\"
UNION ALL SELECT 'employees '||count(*) FROM employee_profile
UNION ALL SELECT 'no_login '||count(*) FROM employee_profile WHERE email IS NULL
UNION ALL SELECT 'statutory '||count(*) FROM employee_statutory
UNION ALL SELECT 'contracts '||count(*) FROM contract
UNION ALL SELECT 'attendance_records '||count(*) FROM attendance_record;"
# GL balance per tenant (debit == credit)
docker exec postgres-central psql -U postgres -d heimdallone_v2_prod -tAc "
SELECT o.name, round(sum(l.debit_amount),2)=round(sum(l.credit_amount),2) balanced
FROM gl_journal_line l JOIN gl_journal_entry e ON e.id=l.journal_entry_id
JOIN organization o ON o.id=e.organization_id GROUP BY o.name;"
```
Expected (will grow with the delta): orgs 2 · members 25 · employees 23 · no_login 6 ·
attendance_records ≥358 · GL balanced=t.

## 8. 🛑 Restart v2 stack with PRODUCTION config — DO NOT RUN until approved
```bash
# deploy/.env.v2 must hold prod values (VITE_SERVER_URL/BETTER_AUTH_URL/CORS_ORIGIN/
# PLATFORM_ADMIN_USER_ID/GOOGLE_* = https://api|app.heimdallone.com + real secrets)
docker compose -f deploy/docker-compose.v2.yml --env-file deploy/.env.v2 up -d
curl -fsS http://127.0.0.1:3100/health
```

## 9. ✅ Logs to check (no secrets, no karetech_erp, no crashes)
```bash
docker logs --tail=200 heimdallone-v2-server
docker logs --tail=200 heimdallone-v2-web
```

## STOP POINTS
- After step 1/5/7 (✅) — review before any 🛑.
- Before step 2 (freeze), 6 (prod write), 8 (prod-config restart) — owner go each.
- **Device cutover = Phase 21V; Pangolin flip = Phase 21W** — separate gated packets.
- If any validation fails → **do not flip**; restore v2 from step-4 dump, lift v1
  freeze (`SET default_transaction_read_only = off`), diagnose, retry.
