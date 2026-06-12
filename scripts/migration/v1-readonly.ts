// biome-ignore-all lint: one-shot READ-ONLY v1 connector (Phase 21B).
//
// Opens a strictly read-only connection to the live v1 database (karetech_erp).
// Safety: refuses any URL that is not the v1 database, and forces the session
// into read-only mode so a stray write throws instead of mutating client data.
//
// Run (host): point V1_DATABASE_URL at the postgres-central container IP, e.g.
//   export V1_DATABASE_URL="postgres://heimdallone:****@172.19.0.2:5432/karetech_erp"

import { Client } from "pg";

const V1_DB_NAME = "karetech_erp";

export function redact(url: string): string {
	return url.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@");
}

export function getV1Url(): string {
	const url = process.env.V1_DATABASE_URL;
	if (!url) {
		throw new Error(
			"V1_DATABASE_URL is not set. Point it at the READ-ONLY v1 database " +
				`(${V1_DB_NAME}). From the host use the postgres-central container IP, e.g. ` +
				`postgres://heimdallone:****@172.19.0.2:5432/${V1_DB_NAME}`
		);
	}
	if (!url.includes(V1_DB_NAME)) {
		throw new Error(
			`Refusing to connect: V1_DATABASE_URL must target the v1 database '${V1_DB_NAME}' ` +
				`(got: ${redact(url)}).`
		);
	}
	return url;
}

export async function openV1ReadOnly(): Promise<Client> {
	const url = getV1Url();
	const client = new Client({
		connectionString: url,
		statement_timeout: 120_000,
	});
	await client.connect();
	// Belt-and-suspenders: force read-only at the session level. Any write throws.
	await client.query("SET default_transaction_read_only = on");
	return client;
}

/** All user tables in the v1 public schema. */
export async function listV1Tables(client: Client): Promise<string[]> {
	const r = await client.query(
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		 ORDER BY table_name`
	);
	return r.rows.map((row: any) => row.table_name as string);
}

/** Row count for a registry table name (not user input — safe to interpolate). */
export async function v1Count(client: Client, table: string): Promise<number> {
	const r = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
	return r.rows[0]?.n ?? 0;
}

export async function v1Rows<T = any>(
	client: Client,
	sql: string,
	params: any[] = []
): Promise<T[]> {
	const r = await client.query(sql, params);
	return r.rows as T[];
}
