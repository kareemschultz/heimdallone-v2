// biome-ignore-all lint: one-shot DB-level verification for Phase 16B.
//
// Proves the Finance schema + seed guardrails against the live DB via the pg
// constraint catalog + seed invariants. No API server needed.
//
// Run:  export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/verify-finance-db.ts

import { sql } from "drizzle-orm";
import { createDb } from "../packages/db/src/index";

const db = createDb();

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, extra = "") {
	if (cond) {
		pass++;
		console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
	} else {
		fail++;
		console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
	}
}

async function rows(query: any): Promise<any[]> {
	const res: any = await db.execute(query);
	return res.rows ?? res ?? [];
}

const DELTYPE: Record<string, string> = {
	a: "no_action",
	r: "restrict",
	c: "cascade",
	n: "set_null",
	d: "set_default",
};

async function fks(table: string): Promise<{ ref: string; del: string }[]> {
	const r = await rows(sql`
		select confrelid::regclass::text as ref, confdeltype as del
		from pg_constraint
		where conrelid = ${table}::regclass and contype = 'f'
	`);
	return r.map((x) => ({ ref: x.ref, del: DELTYPE[x.del] ?? x.del }));
}

async function columns(table: string): Promise<string[]> {
	const r = await rows(sql`
		select column_name from information_schema.columns where table_name = ${table}
	`);
	return r.map((x) => x.column_name as string);
}

async function enumValues(typeName: string): Promise<string[]> {
	const r = await rows(sql`
		select e.enumlabel as v
		from pg_type t join pg_enum e on e.enumtypid = t.oid
		where t.typname = ${typeName}
		order by e.enumsortorder
	`);
	return r.map((x) => x.v as string);
}

async function orgId(): Promise<string> {
	const r = await rows(
		sql`select id from organization where slug = 'atlas-shipping' limit 1`
	);
	if (r.length === 0) {
		throw new Error("Atlas org not found — run seed-dev.ts");
	}
	return r[0].id as string;
}

async function count(query: any): Promise<number> {
	const r = await rows(query);
	return Number(r[0]?.n ?? 0);
}

async function main() {
	const oid = await orgId();

	console.log("\n── 1. finance_budget exists with the expected columns ──");
	const cols = await columns("finance_budget");
	for (const c of [
		"id",
		"organization_id",
		"scope",
		"scope_id",
		"label",
		"category",
		"period_start",
		"period_end",
		"currency",
		"budgeted_amount",
		"notes",
		"created_by",
	]) {
		ok(`finance_budget.${c} column exists`, cols.includes(c));
	}

	console.log(
		"\n── 2. GUARDRAIL: scopeId is a SOFT ref — NO FK to department/project ──"
	);
	const fbFks = await fks("finance_budget");
	const refs = fbFks.map((f) => f.ref).sort();
	ok(
		"finance_budget FKs reference ONLY organization + user",
		refs.every((r) => ["organization", '"user"', "user"].includes(r)),
		refs.join(", ")
	);
	ok(
		"finance_budget has NO FK to department (soft ref — survives dept archive)",
		!refs.some((r) => /department/i.test(r))
	);
	ok(
		"finance_budget has NO FK to project (soft ref — survives project archive)",
		!refs.some((r) => /project/i.test(r))
	);
	ok(
		"finance_budget has NO FK to payroll/payslip/contract (link, never own)",
		!refs.some((r) => /pay|payroll|payslip|contract|attendance/i.test(r))
	);
	const orgFk = fbFks.find((f) => f.ref === "organization");
	ok(
		"finance_budget.organizationId → organization ON DELETE cascade",
		orgFk?.del === "cascade",
		orgFk?.del
	);
	const userFk = fbFks.find((f) => /user/.test(f.ref));
	ok(
		"finance_budget.createdBy → user ON DELETE set null",
		userFk?.del === "set_null",
		userFk?.del
	);

	console.log("\n── 3. enums ──");
	const scopeEnum = await enumValues("finance_budget_scope");
	ok(
		"finance_budget_scope = organization|department|project",
		["organization", "department", "project"].every((v) =>
			scopeEnum.includes(v)
		),
		scopeEnum.join("|")
	);
	const catEnum = await enumValues("finance_budget_category");
	ok(
		"finance_budget_category = labour|total",
		["labour", "total"].every((v) => catEnum.includes(v)),
		catEnum.join("|")
	);

	console.log("\n── 4. unique constraint prevents duplicate scope/period ──");
	const uq = await rows(sql`
		select conname from pg_constraint
		where conrelid = 'finance_budget'::regclass and contype = 'u'
	`);
	ok(
		"finance_budget_scope_period_uq exists",
		uq.some((x) => x.conname === "finance_budget_scope_period_uq"),
		uq.map((x: any) => x.conname).join(",")
	);

	console.log("\n── 5. seed invariants ──");
	const total = await count(
		sql`select count(*)::int as n from finance_budget where organization_id = ${oid}`
	);
	ok("at least 3 budgets seeded for Atlas", total >= 3, `${total} rows`);
	const orgScoped = await count(
		sql`select count(*)::int as n from finance_budget where organization_id = ${oid} and scope = 'organization' and scope_id is null`
	);
	ok("org-wide budget has NULL scope_id", orgScoped >= 1, `${orgScoped}`);
	const deptScoped = await count(
		sql`select count(*)::int as n from finance_budget where organization_id = ${oid} and scope = 'department' and scope_id is not null`
	);
	ok(
		"department budgets carry a non-null soft scope_id",
		deptScoped >= 1,
		`${deptScoped}`
	);
	// Soft-ref integrity: seeded dept scope_ids actually match a real department.
	const deptMatch = await count(sql`
		select count(*)::int as n
		from finance_budget fb
		join department d on d.id = fb.scope_id and d.organization_id = fb.organization_id
		where fb.organization_id = ${oid} and fb.scope = 'department'
	`);
	ok(
		"seeded department scope_ids resolve to real departments (soft ref valid)",
		deptMatch === deptScoped,
		`${deptMatch}/${deptScoped}`
	);
	const labourOnly = await count(
		sql`select count(*)::int as n from finance_budget where organization_id = ${oid} and category <> 'labour'`
	);
	ok("all seeded budgets are category=labour (MVP)", labourOnly === 0);

	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
	process.stderr.write(`${e}\n`);
	process.exit(1);
});
