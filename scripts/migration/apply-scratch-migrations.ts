// biome-ignore-all lint: scratch migrator (Phase 21K rehearsal, scratch ONLY).
//
// Applies the full v2 Drizzle migration set to a DISPOSABLE scratch database
// using the programmatic migrator (deterministic — bypasses drizzle-kit's env
// injection and version checks). Reuses the same write guards as the rest of the
// migration tooling:
//   - target MUST be V2_STAGING_DATABASE_URL whose db name contains
//     scratch/staging/test/migrat AND is not karetech_erp / not the prod v2 DB,
//   - writes require CONFIRM_SCRATCH_WRITE=1,
//   - the prod env.DATABASE_URL is NEVER opened (own pool on the scratch URL).
//
// Run:
//   export V2_STAGING_DATABASE_URL="postgres://…/heimdallone_v2_migration_scratch"
//   export CONFIRM_SCRATCH_WRITE=1
//   bun run scripts/migration/apply-scratch-migrations.ts

import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import {
	assertScratchTarget,
	assertWriteConfirmed,
	dbNameOf,
	getScratchUrl,
} from "./create-scratch-db";

async function main() {
	const url = getScratchUrl();
	assertScratchTarget(url); // refuses prod v2 / v1 / non-disposable
	assertWriteConfirmed(); // requires CONFIRM_SCRATCH_WRITE=1
	process.stdout.write(`[migrate-scratch] target db: ${dbNameOf(url)}\n`);

	const migrationsFolder = join(
		import.meta.dir,
		"../../packages/db/src/migrations"
	);
	const pool = new Pool({ connectionString: url, statement_timeout: 120_000 });
	const db = drizzle(pool);
	try {
		await migrate(db, { migrationsFolder });
		const { rows } = await pool.query(
			"SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
		);
		process.stdout.write(
			`[migrate-scratch] DONE — ${rows[0]?.n ?? 0} public tables present\n`
		);
	} finally {
		await pool.end();
	}
}

main().catch((e) => {
	process.stderr.write(`[migrate-scratch] FAILED: ${e.message}\n`);
	process.exit(1);
});
