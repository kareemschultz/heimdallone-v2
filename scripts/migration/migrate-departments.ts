// biome-ignore-all lint: one-off migration orchestrator (Phase 21X departments/positions).
// Phase 21X — migrate v1 departments + job titles into v2 and link them onto
// employees' contracts. Closes the "departments/positions empty" QA finding.
//
// v1 has departments + job_titles (per tenant) and each employee carries a
// department_id + job_title_id (preserved in migration_source_employee). This
// reads them read-only from v1, creates v2 department / job_position rows, and
// sets contract.departmentId / contract.jobPositionId from each employee's v1
// links (only where currently null — never overwrites edited values).
//
// SAFETY: writes ONLY department / job_position / contract(dept,position) ;
// refuses v1; prod-write-guarded; idempotent (by org+name, and fills blanks only).
//
// Run: export $(grep -v '^#' deploy/.env.v2 | sed 's/postgres-central/localhost/' | xargs) \
//   && export $(grep -v '^#' .env.migration | sed 's/postgres-central/localhost/' | xargs) \
//   && CONFIRM_PRODUCTION_WRITE=1 PRODUCTION_WRITE_TARGET=heimdallone_v2_prod \
//      bun run scripts/migration/migrate-departments.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDb } from "../../packages/db/src/index";
import {
	contract,
	department,
	jobPosition,
} from "../../packages/db/src/schema/hr-core";
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

	// v1 employee → { v2 employeeId, orgId, v1 dept_id, v1 title_id }; tenant→org.
	const mapRows = (await db.execute(sql`
		with se as (
			select payload->>'id' v1id, payload->>'tenant_id' tenant,
			       payload->>'department_id' dept, payload->>'job_title_id' title,
			       lower(payload->>'email') email,
			       lower(payload->>'first_name') fn, lower(payload->>'last_name') ln
			from migration_source_employee
		)
		select se.v1id, se.tenant, se.dept, se.title, e.id employee_id, e.organization_id
		from se
		join employee_profile e
		  on (se.email is not null and lower(e.email)=se.email)
		  or (se.email is null and lower(e.first_name)=se.fn and lower(e.last_name)=se.ln)
	`)) as unknown as {
		rows: Array<{
			v1id: string;
			tenant: string;
			dept: string | null;
			title: string | null;
			employee_id: string;
			organization_id: string;
		}>;
	};
	const tenantOrg = new Map<string, string>();
	const empInfo = new Map<
		string,
		{ orgId: string; deptV1: string | null; titleV1: string | null }
	>();
	for (const r of mapRows.rows) {
		if (!tenantOrg.has(r.tenant)) {
			tenantOrg.set(r.tenant, r.organization_id);
		}
		empInfo.set(r.employee_id, {
			orgId: r.organization_id,
			deptV1: r.dept,
			titleV1: r.title,
		});
	}

	const v1depts = (
		await v1.query(
			"select id, tenant_id, name from departments where deleted_at is null"
		)
	).rows;
	const v1titles = (
		await v1.query("select id, name from job_titles where deleted_at is null")
	).rows;
	await v1.end();

	// v1 title id → name (v2 positions are created under a department on demand,
	// since v2 job_position.department_id is NOT NULL and v1 titles are org-level).
	const titleName = new Map<string, string>();
	for (const t of v1titles) {
		titleName.set(t.id as string, t.name as string);
	}

	const deptMap = new Map<string, string>(); // v1 dept id → v2 id
	// (org|deptId|name) → v2 job_position id
	const positionByKey = new Map<string, string>();
	let deptN = 0;
	let titleN = 0;
	let linkedDept = 0;
	let linkedTitle = 0;

	await db.transaction(async (tx) => {
		for (const d of v1depts) {
			const orgId = tenantOrg.get(d.tenant_id as string);
			if (!orgId) {
				continue;
			}
			const existing = await tx
				.select({ id: department.id })
				.from(department)
				.where(
					and(
						eq(department.organizationId, orgId),
						eq(department.name, d.name as string)
					)
				)
				.limit(1);
			if (existing[0]) {
				deptMap.set(d.id as string, existing[0].id);
				continue;
			}
			const id = createId();
			await tx.insert(department).values({
				id,
				organizationId: orgId,
				name: d.name as string,
			});
			deptMap.set(d.id as string, id);
			deptN += 1;
		}

		// Ensure a v2 job_position exists for (org, department, title) on demand.
		async function ensurePosition(
			orgId: string,
			deptId: string,
			name: string
		): Promise<string> {
			const key = `${orgId}|${deptId}|${name}`;
			const cached = positionByKey.get(key);
			if (cached) {
				return cached;
			}
			const existing = await tx
				.select({ id: jobPosition.id })
				.from(jobPosition)
				.where(
					and(eq(jobPosition.departmentId, deptId), eq(jobPosition.name, name))
				)
				.limit(1);
			if (existing[0]) {
				positionByKey.set(key, existing[0].id);
				return existing[0].id;
			}
			const id = createId();
			await tx.insert(jobPosition).values({
				id,
				organizationId: orgId,
				departmentId: deptId,
				name,
			});
			positionByKey.set(key, id);
			titleN += 1;
			return id;
		}

		// Link departments/positions onto each employee's contracts (fill blanks).
		for (const [employeeId, info] of empInfo) {
			const deptId = info.deptV1 ? deptMap.get(info.deptV1) : undefined;
			if (deptId) {
				const res = await tx
					.update(contract)
					.set({ departmentId: deptId })
					.where(
						and(
							eq(contract.employeeId, employeeId),
							isNull(contract.departmentId)
						)
					)
					.returning({ id: contract.id });
				linkedDept += res.length;

				const tName = info.titleV1 ? titleName.get(info.titleV1) : undefined;
				if (tName) {
					const positionId = await ensurePosition(info.orgId, deptId, tName);
					const pres = await tx
						.update(contract)
						.set({ jobPositionId: positionId })
						.where(
							and(
								eq(contract.employeeId, employeeId),
								isNull(contract.jobPositionId)
							)
						)
						.returning({ id: contract.id });
					linkedTitle += pres.length;
				}
			}
		}
	});

	process.stdout.write(
		`Departments ${deptN}, job positions ${titleN}; contracts linked — dept ${linkedDept}, position ${linkedTitle}.\n`
	);
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`migrate-departments failed: ${err}\n`);
	process.exit(1);
});
