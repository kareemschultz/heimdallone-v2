// biome-ignore-all lint: v2 staging connector + PRODUCTION GUARD (Phase 21B).
//
// Phase 21B is DRY-RUN ONLY — this module never writes. It exists to:
//   1. refuse, loudly, to ever target the v2 production database, and
//   2. (optionally) introspect a real staging/scratch v2 DB read-only so the
//      coverage matrix can confirm target tables exist.
// Actual staging writes are implemented in Phase 21C.

import { Client } from "pg";

const V1_DB_NAME = "karetech_erp";

/** Best-effort v2 production URL, used only to REFUSE to target it. */
function getProdV2Url(): string | undefined {
	return process.env.V2_PROD_DATABASE_URL ?? process.env.DATABASE_URL;
}

/** Normalized {host:port, db} — lowercased host, default port 5432 supplied. */
function normKey(url: string): { hostPort: string; db: string } {
	try {
		const u = new URL(url);
		return {
			hostPort: `${u.hostname.toLowerCase()}:${u.port || "5432"}`,
			db: u.pathname.replace(/^\//, ""),
		};
	} catch {
		return { hostPort: url, db: "" };
	}
}

export function assertNotProduction(url: string): void {
	const t = normKey(url);
	if (t.db === V1_DB_NAME) {
		throw new Error(
			"Refusing: the v2 staging target must not be the v1 database (karetech_erp)."
		);
	}
	const prod = getProdV2Url();
	if (prod) {
		const p = normKey(prod);
		// Same host+db, OR same db NAME regardless of host (a prod DB reachable via
		// a different host alias / the container IP must still be refused).
		if (
			(t.hostPort === p.hostPort && t.db === p.db) ||
			(t.db && t.db === p.db)
		) {
			throw new Error(
				"Refusing: V2_STAGING_DATABASE_URL resolves to the v2 PRODUCTION database. " +
					"Use a disposable staging/scratch database."
			);
		}
	}
	// Disposability heuristic tests the DB NAME only (not the whole URL, so a
	// username/host containing 'test' can't smuggle a real DB through).
	const looksDisposable =
		process.env.ALLOW_V2_TARGET === "1" ||
		/stag|scratch|migrat|test/i.test(t.db);
	if (!looksDisposable) {
		throw new Error(
			"Refusing: v2 staging target does not look like a staging/scratch DB. " +
				"Set ALLOW_V2_TARGET=1 to override (only for a genuinely disposable DB)."
		);
	}
}

export function getStagingUrl(): string | null {
	return process.env.V2_STAGING_DATABASE_URL ?? null;
}

/** Read-only handle to the staging DB, or null when none is configured. */
export async function openV2StagingReadOnly(): Promise<Client | null> {
	const url = getStagingUrl();
	if (!url) {
		return null;
	}
	assertNotProduction(url);
	const client = new Client({
		connectionString: url,
		statement_timeout: 60_000,
	});
	await client.connect();
	await client.query("SET default_transaction_read_only = on");
	return client;
}

export async function introspectV2Tables(client: Client): Promise<Set<string>> {
	const r = await client.query(
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
	);
	return new Set(r.rows.map((row: any) => row.table_name as string));
}

/** Writes are intentionally NOT available in Phase 21B. */
export function refuseWrite(): never {
	throw new Error(
		"Phase 21B is DRY-RUN ONLY. Staging writes are implemented in Phase 21C."
	);
}
