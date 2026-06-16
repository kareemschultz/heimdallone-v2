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

// ── Reviewed production-write enablement (Phase 21R cutover) ──────────────────
// By default the migration tooling can ONLY write to a disposable scratch DB.
// A REAL production load (e.g. the cutover into a fresh v2 database) requires an
// explicit, double-gated opt-in:
//   - CONFIRM_PRODUCTION_WRITE=1, AND
//   - PRODUCTION_WRITE_TARGET=<exact db name> that matches the target URL's db.
// The v1 database (karetech_erp) can NEVER be a write target, even with the
// opt-in. This is deliberately narrow and loud so a production write is always a
// conscious, named act — never an accident.
export function isProductionWriteEnabled(): boolean {
	return process.env.CONFIRM_PRODUCTION_WRITE === "1";
}

export function assertProductionTarget(name: string): void {
	const declared = process.env.PRODUCTION_WRITE_TARGET ?? "";
	if (!declared) {
		throw new Error(
			"Refusing: CONFIRM_PRODUCTION_WRITE=1 requires PRODUCTION_WRITE_TARGET=<exact db name>."
		);
	}
	if (declared !== name) {
		throw new Error(
			`Refusing: target db '${name}' does not match PRODUCTION_WRITE_TARGET '${declared}'.`
		);
	}
	process.stdout.write(
		`\n⚠️  PRODUCTION WRITE ENABLED — target database: ${name}\n` +
			"   (scratch guards bypassed by explicit CONFIRM_PRODUCTION_WRITE + PRODUCTION_WRITE_TARGET)\n\n"
	);
}

export function assertScratchTarget(url: string): void {
	const name = dbNameOf(url);
	// v1 is NEVER a write target — not even with the production opt-in.
	if (name === "karetech_erp") {
		throw new Error(
			"Refusing: target is the v1 production database (karetech_erp)."
		);
	}
	// Explicit, named production-write opt-in bypasses the scratch-only checks.
	if (isProductionWriteEnabled()) {
		assertProductionTarget(name);
		return;
	}
	if (!SCRATCH_NAME_RE.test(name)) {
		throw new Error(
			`Refusing: scratch DB name '${name}' must contain scratch/staging/test/migrat. ` +
				"This guard prevents writing to a real database. (For a real cutover load set " +
				"CONFIRM_PRODUCTION_WRITE=1 + PRODUCTION_WRITE_TARGET=<db>.)"
		);
	}
	assertNotProduction(url); // refuses prod v2 + v1 + non-disposable
}

export function assertWriteConfirmed(): void {
	if (
		process.env.CONFIRM_SCRATCH_WRITE !== "1" &&
		process.env.CONFIRM_PRODUCTION_WRITE !== "1"
	) {
		throw new Error(
			"Refusing to write: set CONFIRM_SCRATCH_WRITE=1 (scratch) or " +
				"CONFIRM_PRODUCTION_WRITE=1 + PRODUCTION_WRITE_TARGET (production cutover)."
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
