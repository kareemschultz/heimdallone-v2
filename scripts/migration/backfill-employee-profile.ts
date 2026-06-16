// biome-ignore-all lint: one-off migration orchestrator (Phase 21X employee profile backfill).
// Phase 21X — backfill employee_profile personal fields the original ETL dropped.
//
// The first load mapped only name + email (+ statutory in its satellite). v1
// also carried phone, date of birth and employee number for these staff. This
// fills those into v2 ONLY where the v2 field is currently empty (never
// overwrites edited data), matching v1→v2 by email else name-within-org.
//
// SAFETY: updates ONLY phone / date_of_birth / badge_id on employee_profile;
// refuses v1; requires the production-write opt-in; idempotent (only fills blanks).
//
// Run: export $(grep -v '^#' deploy/.env.v2 | sed 's/postgres-central/localhost/' | xargs) \
//   && CONFIRM_PRODUCTION_WRITE=1 PRODUCTION_WRITE_TARGET=heimdallone_v2_prod \
//      bun run scripts/migration/backfill-employee-profile.ts

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { createDb } from "../../packages/db/src/index";
import { employeeProfile } from "../../packages/db/src/schema/hr-core";
import { assertProductionTarget } from "./create-scratch-db";

function dbName(url: string): string {
	if (url.includes("karetech_erp")) {
		throw new Error(
			"Refusing: write target is the v1 database (karetech_erp)."
		);
	}
	return new URL(url).pathname.replace(/^\//, "");
}

async function main() {
	const url = process.env.DATABASE_URL ?? "";
	assertProductionTarget(dbName(url));
	const db = createDb();

	// Resolve v1 source → v2 employee by email (else name within org).
	const matched = (await db.execute(sql`
		with se as (
			select lower(payload->>'email') email,
			       lower(payload->>'first_name') fn, lower(payload->>'last_name') ln,
			       payload->>'phone' phone,
			       payload->>'date_of_birth' dob,
			       payload->>'employee_number' empno
			from migration_source_employee
		)
		select e.id, se.phone, se.dob, se.empno
		from se
		join employee_profile e
		  on (se.email is not null and lower(e.email)=se.email)
		  or (se.email is null and lower(e.first_name)=se.fn and lower(e.last_name)=se.ln)
	`)) as unknown as {
		rows: Array<{
			id: string;
			phone: string | null;
			dob: string | null;
			empno: string | null;
		}>;
	};

	let phoneN = 0;
	let dobN = 0;
	let badgeN = 0;
	for (const r of matched.rows) {
		const set: Record<string, unknown> = {};
		if (r.phone) {
			set.phone = r.phone;
		}
		if (r.dob) {
			set.dateOfBirth = new Date(r.dob);
		}
		if (r.empno) {
			set.badgeId = r.empno;
		}
		if (Object.keys(set).length === 0) {
			continue;
		}
		// Only fill blanks — never overwrite values an HR user may have edited.
		if (set.phone) {
			const res = await db
				.update(employeeProfile)
				.set({ phone: set.phone as string })
				.where(
					and(
						eq(employeeProfile.id, r.id),
						or(isNull(employeeProfile.phone), eq(employeeProfile.phone, ""))
					)
				)
				.returning({ id: employeeProfile.id });
			phoneN += res.length;
		}
		if (set.dateOfBirth) {
			const res = await db
				.update(employeeProfile)
				.set({ dateOfBirth: set.dateOfBirth as Date })
				.where(
					and(eq(employeeProfile.id, r.id), isNull(employeeProfile.dateOfBirth))
				)
				.returning({ id: employeeProfile.id });
			dobN += res.length;
		}
		if (set.badgeId) {
			const res = await db
				.update(employeeProfile)
				.set({ badgeId: set.badgeId as string })
				.where(
					and(
						eq(employeeProfile.id, r.id),
						or(isNull(employeeProfile.badgeId), eq(employeeProfile.badgeId, ""))
					)
				)
				.returning({ id: employeeProfile.id });
			badgeN += res.length;
		}
	}
	process.stdout.write(
		`Backfilled — phone ${phoneN}, date_of_birth ${dobN}, badge_id ${badgeN}.\n`
	);
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`backfill-employee-profile failed: ${err}\n`);
	process.exit(1);
});
