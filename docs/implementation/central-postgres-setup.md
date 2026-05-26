# Central Postgres Setup

Heimdallone uses the shared `postgres-central` container to avoid running a separate database instance per project.

---

## Prerequisites

- Docker running with `postgres-central` container (postgres:18-alpine)
- `socat` installed on the host (for localhost port forwarding)
- Bun installed

## Architecture

```
Host (bun run dev:server / dev:web)
  │
  ├─ localhost:5432 ──socat──→ postgres-central (Docker container)
  │                              │
  │                              ├─ Database: Heimdallone
  │                              └─ Role: heimdallone (login, owner)
  │
  ├─ localhost:3000 ── Hono API server
  └─ localhost:3001 ── TanStack Start web app
```

The `postgres-central` container does not bind port 5432 to the host. A `socat` proxy bridges localhost:5432 to the container's Docker network IP.

---

## One-Time Setup

### 1. Create database and role

```bash
# Create database
docker exec postgres-central psql -U postgres -c 'CREATE DATABASE "Heimdallone"'

# Create role with login
docker exec postgres-central psql -U postgres -c "CREATE ROLE heimdallone WITH LOGIN PASSWORD 'heimdallone_dev_2026'"

# Grant ownership and permissions
docker exec postgres-central psql -U postgres -c 'ALTER DATABASE "Heimdallone" OWNER TO heimdallone'
docker exec postgres-central psql -U postgres -c 'GRANT ALL PRIVILEGES ON DATABASE "Heimdallone" TO heimdallone'
docker exec postgres-central psql -U postgres -d Heimdallone -c 'GRANT ALL ON SCHEMA public TO heimdallone'
```

### 2. Create .env files

```bash
# apps/server/.env
cat > apps/server/.env << 'EOF'
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
DATABASE_URL=postgresql://heimdallone:heimdallone_dev_2026@localhost:5432/Heimdallone
EOF

# apps/web/.env
cat > apps/web/.env << 'EOF'
VITE_SERVER_URL=http://localhost:3000
EOF
```

If the web dev server picks a different port (3001 is in use), update `CORS_ORIGIN` to match.

### 3. Push schema

```bash
bun run db:push
```

This runs `drizzle-kit push` from `packages/db/`, reads `apps/server/.env` via dotenv, and creates the Better Auth tables (user, session, account, verification) owned by the `heimdallone` role.

---

## Dev Workflow

### Start services (in order)

```bash
# 1. Start socat proxy (if not already running)
#    Resolves postgres-central's Docker IP dynamically
PG_IP=$(docker inspect postgres-central --format '{{(index .NetworkSettings.Networks "pangolin").IPAddress}}')
socat TCP-LISTEN:5432,fork,reuseaddr TCP:${PG_IP}:5432 &

# 2. Start API server
cd apps/server && bun run --hot src/index.ts

# 3. Start web app (in another terminal)
bun run dev:web
```

Or use the turbo commands:
```bash
# Start socat first, then:
bun run dev    # starts both server and web
```

### Create a test user

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3001" \
  -d '{"email":"maya@atlas-shipping.com","password":"HeimdallTest2026!","name":"Maya Persaud"}'
```

### Sign in

Navigate to `http://localhost:3001/login`, enter the test credentials. On success, you'll be redirected to `/app`.

---

## Troubleshooting

### `bun run db:push` hangs on "Pulling schema..."

The `pg` Node.js driver cannot connect. Check:

1. Is socat running? `ss -tlnp | grep 5432`
2. Is postgres-central healthy? `docker ps --filter name=postgres-central`
3. Test connection: `timeout 2 bash -c 'echo > /dev/tcp/localhost/5432' && echo OK`

### CORS errors on sign-in

The `CORS_ORIGIN` in `apps/server/.env` must exactly match the web app URL (including port). If Vite picks a different port (e.g., 3003 because 3001 is in use), update `CORS_ORIGIN` and restart the server.

### "fetch failed" on /app routes

The web app's `beforeLoad` auth check calls the API server. Make sure the API server is running on port 3000 and `VITE_SERVER_URL=http://localhost:3000` is set in `apps/web/.env`.

---

## What NOT to do

- Do not start the scaffold's `packages/db/docker-compose.yml` postgres — use central postgres instead
- Do not hardcode Docker container IPs (e.g., `172.19.0.2`) in .env files — use `localhost` via socat
- Do not manually create Better Auth tables with raw SQL — use `bun run db:push`
- Do not commit `.env` files with secrets
