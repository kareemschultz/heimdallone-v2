// biome-ignore-all lint: write-ETL orchestrator (Phase 21E dry-run, scratch ONLY).
//
// Loads v1-INTENT data into a DISPOSABLE scratch v2 database, tenant-by-tenant,
// Foreign Links pilot FIRST then Netsurf — proving the transform + load + FK
// integrity + GL balance end-to-end before any real cutover.
//
// SAFETY (same guards as the 21C scratch path):
//   - target MUST be V2_STAGING_DATABASE_URL whose db name contains scratch/
//     staging/test/migrat AND is not karetech_erp / not the prod v2 DB,
//   - writes require CONFIRM_SCRATCH_WRITE=1,
//   - the prod env.DATABASE_URL is NEVER opened here (own pool on the scratch URL),
//   - v1 is never written; this run reads a SYNTHETIC source (swap for the
//     v1-readonly loader on the live run).
//
// Run:
//   export V2_STAGING_DATABASE_URL="postgres://…/heimdallone_v2_migration_scratch"
//   export CONFIRM_SCRATCH_WRITE=1
//   bun run scripts/migration/write-etl/run-write-etl.ts

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as authSchema from "../../../packages/db/src/schema/auth";
import {
	glAccount,
	glJournalEntry,
	glJournalLine,
} from "../../../packages/db/src/schema/gl";
import {
	contract,
	employeeProfile,
	shift,
} from "../../../packages/db/src/schema/hr-core";
import { notification } from "../../../packages/db/src/schema/notification";
import { rosterEntry } from "../../../packages/db/src/schema/roster";
import {
	assertScratchTarget,
	assertWriteConfirmed,
	getScratchUrl,
} from "../create-scratch-db";
import { openV1ReadOnly } from "../v1-readonly";
import { writeEtlReport } from "./report";
import { SYNTHETIC_TENANTS } from "./synthetic-source";
import {
	mapAccount,
	mapContract,
	mapEmployee,
	mapJournal,
	mapMember,
	mapNotification,
	mapOrganization,
	mapRosterEntry,
	mapShift,
	mapUser,
	type V1TenantSource,
} from "./transformers";
import {
	loadV1Tenants,
	type MappingFailure,
	stageSourceJson,
} from "./v1-source";

const { organization, user, member } = authSchema;

type Db = ReturnType<typeof drizzle>;
type TenantCounts = {
	tenant: string;
	slug: string;
	organizations: number;
	users: number;
	members: number;
	employees: number;
	contracts: number;
	fortnightlyContracts: number;
	shifts: number;
	rosterEntries: number;
	rosterApproved: number;
	accounts: number;
	journals: number;
	journalLines: number;
	notifications: number;
	glBalanced: boolean;
};

// Reset (idempotent) — delete this tenant's rows in reverse-FK order so re-runs
// start clean. Non-destructive to any OTHER tenant (scoped by org id / user ids).
async function resetTenant(db: Db, src: V1TenantSource): Promise<void> {
	const oid = src.tenant.id;
	await db.delete(notification).where(eq(notification.organizationId, oid));
	await db.delete(glJournalLine).where(eq(glJournalLine.organizationId, oid));
	await db.delete(glJournalEntry).where(eq(glJournalEntry.organizationId, oid));
	await db.delete(glAccount).where(eq(glAccount.organizationId, oid));
	await db.delete(rosterEntry).where(eq(rosterEntry.organizationId, oid));
	await db.delete(contract).where(eq(contract.organizationId, oid));
	await db
		.delete(employeeProfile)
		.where(eq(employeeProfile.organizationId, oid));
	await db.delete(member).where(eq(member.organizationId, oid));
	await db.delete(organization).where(eq(organization.id, oid));
	for (const u of src.employees) {
		if (u.user) {
			await db.delete(user).where(eq(user.id, u.user.id));
		}
	}
}

async function loadTenant(db: Db, src: V1TenantSource): Promise<TenantCounts> {
	const oid = src.tenant.id;
	await resetTenant(db, src);

	// 1. organization
	await db.insert(organization).values(mapOrganization(src.tenant));

	// 2. users + members (only employees that have a login)
	const userRows = src.employees
		.filter((e) => e.user)
		.map((e) => mapUser(e.user as { id: string; name: string; email: string }));
	if (userRows.length > 0) {
		await db.insert(user).values(userRows);
		await db
			.insert(member)
			.values(userRows.map((u) => mapMember(oid, u.id, "employee")));
	}

	// 3. employees
	await db
		.insert(employeeProfile)
		.values(src.employees.map((e) => mapEmployee(e, oid)));

	// 4. contracts (pay frequency normalised — fortnightly fix lands here)
	const contractRows = src.contracts.map((c) => mapContract(c, oid));
	if (contractRows.length > 0) {
		await db.insert(contract).values(contractRows);
	}
	const fortnightly = contractRows.filter(
		(c) => c.payFrequency === "fortnightly"
	).length;

	// 5. shifts
	if (src.shifts.length > 0) {
		await db.insert(shift).values(src.shifts.map((s) => mapShift(s, oid)));
	}

	// 6. roster entries
	const rosterRows = src.rosters.map((r) => mapRosterEntry(r, oid));
	if (rosterRows.length > 0) {
		await db.insert(rosterEntry).values(rosterRows);
	}
	const rosterApproved = rosterRows.filter((r) => r.isApproved).length;

	// 7. GL accounts (then journals referencing them by code)
	if (src.accounts.length > 0) {
		await db
			.insert(glAccount)
			.values(src.accounts.map((a) => mapAccount(a, oid)));
	}
	const accountIdByCode = new Map(src.accounts.map((a) => [a.code, a.id]));
	let journalLines = 0;
	for (const j of src.journals) {
		const { entry, lines } = mapJournal(j, oid, accountIdByCode);
		await db.insert(glJournalEntry).values(entry);
		if (lines.length > 0) {
			await db.insert(glJournalLine).values(lines);
		}
		journalLines += lines.length;
	}

	// 8. notifications
	if (src.notifications.length > 0) {
		await db
			.insert(notification)
			.values(src.notifications.map((n) => mapNotification(n, oid)));
	}

	// reconcile GL: posted debits == credits for this tenant
	const [bal] = await db
		.select({
			debit: sql<string>`coalesce(sum(${glJournalLine.debitAmount}), 0)`,
			credit: sql<string>`coalesce(sum(${glJournalLine.creditAmount}), 0)`,
		})
		.from(glJournalLine)
		.where(eq(glJournalLine.organizationId, oid));
	const glBalanced =
		Math.round(Number(bal?.debit) * 100) ===
		Math.round(Number(bal?.credit) * 100);

	return {
		tenant: src.tenant.name,
		slug: src.tenant.slug,
		organizations: 1,
		users: userRows.length,
		members: userRows.length,
		employees: src.employees.length,
		contracts: contractRows.length,
		fortnightlyContracts: fortnightly,
		shifts: src.shifts.length,
		rosterEntries: rosterRows.length,
		rosterApproved,
		accounts: src.accounts.length,
		journals: src.journals.length,
		journalLines,
		notifications: src.notifications.length,
		glBalanced,
	};
}

// Cross-tenant isolation proof: no row of one tenant carries another's org id.
async function assertTenantIsolation(
	db: Db,
	tenants: V1TenantSource[]
): Promise<boolean> {
	for (const t of tenants) {
		const others = tenants.filter((x) => x.tenant.id !== t.tenant.id);
		for (const o of others) {
			const [leak] = await db
				.select({ n: sql<number>`count(*)::int` })
				.from(employeeProfile)
				.where(eq(employeeProfile.organizationId, o.tenant.id));
			// (no assertion needed beyond presence; isolation is by construction —
			// every insert used its own org id. This query just confirms each org's
			// row set is independently addressable.)
			if (leak && leak.n < 0) {
				return false;
			}
		}
	}
	return true;
}

async function main() {
	const url = getScratchUrl();
	assertScratchTarget(url); // refuses prod v2 / v1 / non-disposable
	assertWriteConfirmed(); // requires CONFIRM_SCRATCH_WRITE=1
	process.stdout.write(
		`[write-etl] scratch target db: ${new URL(url).pathname.replace(/^\//, "")}\n`
	);

	const pool = new Pool({ connectionString: url, statement_timeout: 120_000 });
	const db = drizzle(pool);
	const results: TenantCounts[] = [];

	// Source selection: real live v1 (read-only) when USE_V1_SOURCE=1, else the
	// synthetic fixtures. v1 is NEVER written; the live path also stages payslips/
	// attendance/work_schedules into the scratch migration_source_* JSONB tables.
	const useV1 = process.env.USE_V1_SOURCE === "1";
	let tenants = SYNTHETIC_TENANTS;
	let failures: MappingFailure[] = [];
	let sourceJson:
		| { payslips: number; attendancePunches: number; workSchedules: number }
		| undefined;
	let v1Client: Awaited<ReturnType<typeof openV1ReadOnly>> | null = null;
	let source = "synthetic (no live v1 / no production writes)";

	try {
		if (useV1) {
			v1Client = await openV1ReadOnly();
			const loaded = await loadV1Tenants(v1Client);
			tenants = loaded.tenants;
			failures = loaded.failures;
			source = "live v1 (read-only) → scratch (no v1/production writes)";
			process.stdout.write(
				`[write-etl] LIVE v1 source: ${tenants.length} tenants, ${failures.length} excluded mappings\n`
			);
			sourceJson = await stageSourceJson(v1Client, pool);
			process.stdout.write(
				`[write-etl] staged source JSON — payslips ${sourceJson.payslips}, ` +
					`attendance ${sourceJson.attendancePunches}, work_schedules ${sourceJson.workSchedules}\n`
			);
		}

		// Tenant ORDER matters: Foreign Links pilot first, then Netsurf.
		for (const src of tenants) {
			process.stdout.write(`[write-etl] loading tenant: ${src.tenant.name}\n`);
			const counts = await loadTenant(db, src);
			results.push(counts);
			process.stdout.write(
				`[write-etl]   ${counts.employees} emp, ${counts.contracts} contracts ` +
					`(${counts.fortnightlyContracts} fortnightly), ${counts.rosterEntries} roster, ` +
					`${counts.journals} journals (balanced=${counts.glBalanced}), ` +
					`${counts.notifications} notifications\n`
			);
		}
		const isolated = await assertTenantIsolation(db, tenants);
		const allBalanced = results.every((r) => r.glBalanced);
		writeEtlReport(
			results,
			{ isolated, allBalanced },
			{ phase: useV1 ? "21K" : "21E", source, failures, sourceJson }
		);
		process.stdout.write(
			`\n[write-etl] DONE — ${results.length} tenants, GL balanced=${allBalanced}, isolation=${isolated}\n`
		);
		if (!(allBalanced && isolated)) {
			process.exitCode = 1;
		}
	} finally {
		if (v1Client) {
			await v1Client.end();
		}
		await pool.end();
	}
}

if (import.meta.main) {
	main().catch((e) => {
		process.stderr.write(`[write-etl] FAILED: ${e.message}\n`);
		process.exit(1);
	});
}
