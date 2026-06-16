// biome-ignore-all lint: one-off migration orchestrator (Phase 21X leave migration).
// Phase 21X — migrate v1 leave (policies → leave types, balances, requests) into v2.
//
// v1 had 6 leave policies, 36 balances (all 2026), 2 requests that the original
// ETL skipped. This reads them from v1 (read-only), maps each policy to a v2
// leave_type and each employee via migration_source_employee (email else name),
// and inserts leave_type / leave_balance / leave_request. Idempotent: leave_type
// by unique(org,name); balance by unique(employee,type); request by
// (employee,type,start). Any employee that can't be mapped is skipped + reported
// (leave is not a financial record, so a partial map is logged, not fatal).
//
// SAFETY: writes ONLY leave_type / leave_balance / leave_request; refuses v1 as a
// write target; requires the production-write opt-in.
//
// Run: export $(grep -v '^#' deploy/.env.v2 | sed 's/postgres-central/localhost/' | xargs) \
//   && export $(grep -v '^#' .env.migration | sed 's/postgres-central/localhost/' | xargs) \
//   && CONFIRM_PRODUCTION_WRITE=1 PRODUCTION_WRITE_TARGET=heimdallone_v2_prod \
//      bun run scripts/migration/migrate-leave.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDb } from "../../packages/db/src/index";
import {
	leaveBalance,
	leaveRequest,
	leaveType,
} from "../../packages/db/src/schema/leave";
import { assertProductionTarget } from "./create-scratch-db";

function dbName(url: string): string {
	if (url.includes("karetech_erp")) {
		throw new Error(
			"Refusing: write target is the v1 database (karetech_erp)."
		);
	}
	return new URL(url).pathname.replace(/^\//, "");
}

const STATUS_MAP: Record<
	string,
	"requested" | "approved" | "rejected" | "cancelled"
> = {
	pending: "requested",
	requested: "requested",
	approved: "approved",
	rejected: "rejected",
	cancelled: "cancelled",
	canceled: "cancelled",
};

async function main() {
	const v2url = process.env.DATABASE_URL ?? "";
	assertProductionTarget(dbName(v2url));
	const v1url = (process.env.V1_DATABASE_URL ?? "").replace(
		"postgres-central",
		"localhost"
	);
	if (!v1url) {
		throw new Error("V1_DATABASE_URL required.");
	}
	const db = createDb();
	const v1 = new Pool({ connectionString: v1url });

	// v1 employee id → { v2 employeeId, orgId }; also tenant → org.
	const mapRows = (await db.execute(sql`
		with se as (
			select payload->>'id' v1id, payload->>'tenant_id' tenant,
			       lower(payload->>'email') email,
			       lower(payload->>'first_name') fn, lower(payload->>'last_name') ln
			from migration_source_employee
		)
		select se.v1id, se.tenant, e.id employee_id, e.organization_id
		from se
		join employee_profile e
		  on (se.email is not null and lower(e.email)=se.email)
		  or (se.email is null and lower(e.first_name)=se.fn and lower(e.last_name)=se.ln)
	`)) as unknown as {
		rows: Array<{
			v1id: string;
			tenant: string;
			employee_id: string;
			organization_id: string;
		}>;
	};
	const empMap = new Map<string, { employeeId: string; orgId: string }>();
	const tenantOrg = new Map<string, string>();
	for (const r of mapRows.rows) {
		empMap.set(r.v1id, { employeeId: r.employee_id, orgId: r.organization_id });
		if (!tenantOrg.has(r.tenant)) {
			tenantOrg.set(r.tenant, r.organization_id);
		}
	}

	const policies = (
		await v1.query(
			"select id, tenant_id, name, leave_type, days_per_year, is_carry_over_allowed, max_carry_over_days, exclude_public_holidays, is_archived from leave_policies"
		)
	).rows;
	const balances = (
		await v1.query(
			"select employee_id, leave_policy_id, year, entitled_days, taken_days from leave_balances"
		)
	).rows;
	const requests = (
		await v1.query(
			"select employee_id, leave_policy_id, start_date, end_date, days_requested, status, reason from leave_requests"
		)
	).rows;
	await v1.end();

	let typesN = 0;
	let balN = 0;
	let reqN = 0;
	const skipped: string[] = [];
	// v1 policy id → v2 leaveType id
	const policyType = new Map<string, string>();

	await db.transaction(async (tx) => {
		for (const p of policies) {
			const orgId = tenantOrg.get(p.tenant_id as string);
			if (!orgId) {
				skipped.push(`policy ${p.name} (tenant ${p.tenant_id} unmapped)`);
				continue;
			}
			const existing = await tx
				.select({ id: leaveType.id })
				.from(leaveType)
				.where(
					and(
						eq(leaveType.organizationId, orgId),
						eq(leaveType.name, p.name as string)
					)
				)
				.limit(1);
			if (existing[0]) {
				policyType.set(p.id as string, existing[0].id);
				continue;
			}
			const id = createId();
			await tx.insert(leaveType).values({
				id,
				organizationId: orgId,
				name: p.name as string,
				isPaid: (p.leave_type as string) !== "unpaid",
				accrualAmount: String(Number(p.days_per_year ?? 0)),
				accrualPeriod: "year",
				limitDays: p.days_per_year != null ? String(p.days_per_year) : null,
				resetBasis: "yearly",
				carryForwardType: p.is_carry_over_allowed ? "carry" : "none",
				carryForwardMax:
					p.max_carry_over_days != null ? String(p.max_carry_over_days) : null,
				excludeHolidays: Boolean(p.exclude_public_holidays),
				isActive: !p.is_archived,
			});
			policyType.set(p.id as string, id);
			typesN += 1;
		}

		for (const b of balances) {
			const em = empMap.get(b.employee_id as string);
			const typeId = policyType.get(b.leave_policy_id as string);
			if (!(em && typeId)) {
				skipped.push(`balance emp ${b.employee_id}`);
				continue;
			}
			const existing = await tx
				.select({ id: leaveBalance.id })
				.from(leaveBalance)
				.where(
					and(
						eq(leaveBalance.employeeId, em.employeeId),
						eq(leaveBalance.leaveTypeId, typeId)
					)
				)
				.limit(1);
			if (existing[0]) {
				continue;
			}
			await tx.insert(leaveBalance).values({
				id: createId(),
				employeeId: em.employeeId,
				leaveTypeId: typeId,
				availableDays: String(Number(b.entitled_days ?? 0)),
				usedDays: String(Number(b.taken_days ?? 0)),
				carryForwardDays: "0",
				assignedDate: new Date(`${b.year}-01-01`),
			});
			balN += 1;
		}

		for (const r of requests) {
			const em = empMap.get(r.employee_id as string);
			const typeId = policyType.get(r.leave_policy_id as string);
			if (!(em && typeId)) {
				skipped.push(`request emp ${r.employee_id}`);
				continue;
			}
			const start = new Date(r.start_date as string);
			const existing = await tx
				.select({ id: leaveRequest.id })
				.from(leaveRequest)
				.where(
					and(
						eq(leaveRequest.employeeId, em.employeeId),
						eq(leaveRequest.leaveTypeId, typeId),
						eq(leaveRequest.startDate, start)
					)
				)
				.limit(1);
			if (existing[0]) {
				continue;
			}
			await tx.insert(leaveRequest).values({
				id: createId(),
				organizationId: em.orgId,
				employeeId: em.employeeId,
				leaveTypeId: typeId,
				startDate: start,
				endDate: new Date(r.end_date as string),
				requestedDays: String(Number(r.days_requested ?? 0)),
				description: (r.reason as string) ?? null,
				status: STATUS_MAP[(r.status as string) ?? "pending"] ?? "requested",
			});
			reqN += 1;
		}
	});

	process.stdout.write(
		`Leave migrated — types ${typesN}, balances ${balN}, requests ${reqN}.\n`
	);
	if (skipped.length > 0) {
		process.stdout.write(`Skipped (unmapped): ${skipped.length}\n`);
	}
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`migrate-leave failed: ${err}\n`);
	process.exit(1);
});
