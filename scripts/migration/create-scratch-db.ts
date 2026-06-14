// biome-ignore-all lint: scratch-DB provisioner with WRITE GUARDS (Phase 21C).
//
// Provisions a DISPOSABLE scratch database for migration staging. Multiple guards
// make it impossible to point this at production:
//   - target DB name MUST contain scratch/staging/test
//   - target MUST NOT be the v1 DB (karetech_erp) or the v2 production DB
//   - writes require CONFIRM_SCRATCH_WRITE=1
//   - the target DB name is printed before any write
// Staging is "source-only": v1 rows are parked in migration_source_* JSONB tables
// (NOT the v2 app schema) — that proves the load path without needing to satisfy
// the full v2 schema, and is the right home for roster data with no v2 table yet.

import { Client } from "pg";
import { assertNotProduction } from "./v2-staging";

const SCRATCH_NAME_RE = /scratch|staging|test|migrat/i;

export function getScratchUrl(): string {
	const url = process.env.V2_STAGING_DATABASE_URL;
	if (!url) {
		throw new Error(
			"V2_STAGING_DATABASE_URL is not set. Point it at a DISPOSABLE scratch database, e.g. " +
				"postgres://user:pw@host:port/heimdallone_v2_migration_scratch"
		);
	}
	return url;
}

export function dbNameOf(url: string): string {
	try {
		return new URL(url).pathname.replace(/^\//, "");
	} catch {
		return "";
	}
}

export function assertScratchTarget(url: string): void {
	const name = dbNameOf(url);
	if (!SCRATCH_NAME_RE.test(name)) {
		throw new Error(
			`Refusing: scratch DB name '${name}' must contain scratch/staging/test/migrat. ` +
				"This guard prevents writing to a real database."
		);
	}
	if (name === "karetech_erp") {
		throw new Error(
			"Refusing: target is the v1 production database (karetech_erp)."
		);
	}
	assertNotProduction(url); // refuses prod v2 + v1 + non-disposable
}

export function assertWriteConfirmed(): void {
	if (process.env.CONFIRM_SCRATCH_WRITE !== "1") {
		throw new Error(
			"Refusing to write: set CONFIRM_SCRATCH_WRITE=1 to allow scratch writes. " +
				"(This is the first write-capable migration phase — explicit opt-in required.)"
		);
	}
}

function adminUrl(url: string): string {
	const u = new URL(url);
	u.pathname = "/postgres";
	return u.toString();
}

const SOURCE_TABLES = [
	"migration_source_organization",
	"migration_source_employee",
	"migration_source_payslip",
	"migration_source_attendance_punch",
	"migration_source_roster",
	"migration_source_work_schedule",
	// 21L-C: complete v1 GL preserved for accountant review of excluded journals.
	"migration_source_journal",
	"migration_source_journal_line",
] as const;

/** Create the scratch DB (if absent) + the source-staging tables. */
export async function ensureScratchDb(): Promise<void> {
	const url = getScratchUrl();
	assertScratchTarget(url);
	assertWriteConfirmed();
	const name = dbNameOf(url);
	console.log(`[scratch] target database: ${name} (host ${new URL(url).host})`);

	// 1. create database if missing (via maintenance DB)
	const admin = new Client({ connectionString: adminUrl(url) });
	await admin.connect();
	try {
		const exists = await admin.query(
			"SELECT 1 FROM pg_database WHERE datname = $1",
			[name]
		);
		if (exists.rowCount === 0) {
			// name is guard-validated above; safe to interpolate the identifier.
			await admin.query(`CREATE DATABASE "${name}"`);
			console.log(`[scratch] created database ${name}`);
		} else {
			console.log(`[scratch] database ${name} already exists`);
		}
	} finally {
		await admin.end();
	}

	// 2. create source-staging tables
	const db = new Client({ connectionString: url });
	await db.connect();
	try {
		if (process.env.RESET_SCRATCH === "1") {
			for (const t of SOURCE_TABLES) {
				await db.query(`DROP TABLE IF EXISTS "${t}"`);
			}
			console.log("[scratch] RESET_SCRATCH=1 — dropped source-staging tables");
		}
		for (const t of SOURCE_TABLES) {
			await db.query(
				`CREATE TABLE IF NOT EXISTS "${t}" (
					id text PRIMARY KEY,
					tenant_id text,
					payload jsonb NOT NULL,
					loaded_at timestamptz NOT NULL DEFAULT now()
				)`
			);
		}
		console.log(
			`[scratch] ensured ${SOURCE_TABLES.length} source-staging tables`
		);
	} finally {
		await db.end();
	}
}

export async function openScratchWritable(): Promise<Client> {
	const url = getScratchUrl();
	assertScratchTarget(url);
	assertWriteConfirmed();
	const client = new Client({ connectionString: url });
	await client.connect();
	return client;
}

export { SOURCE_TABLES };

if (import.meta.main) {
	ensureScratchDb()
		.then(() => console.log("[scratch] ready"))
		.catch((e) => {
			console.error("[scratch] FAILED:", e.message);
			process.exit(1);
		});
}
