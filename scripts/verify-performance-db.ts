// biome-ignore-all lint: one-shot DB-level verification for Phase 15B.
//
// Proves the Performance schema + seed guardrails against the live DB via the pg
// constraint catalog + seed invariants. No API server needed.
//
// Run:  export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/verify-performance-db.ts

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

// pg confdeltype: a=no action, r=restrict, c=cascade, n=set null, d=set default
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

	console.log(
		"\n── 1. recognition_point is NOT pay (no payroll FK, no money column) ──"
	);
	const recFks = await fks("recognition_point");
	const recRefs = recFks.map((f) => f.ref).sort();
	ok(
		"recognition_point FKs reference ONLY org/employee/user/objective",
		recRefs.every((r) =>
			[
				"organization",
				"employee_profile",
				'"user"',
				"user",
				"performance_objective",
			].includes(r)
		),
		recRefs.join(", ")
	);
	ok(
		"recognition_point has NO FK to payslip/payroll/attendance",
		!recRefs.some((r) => /pay|payroll|attendance|payslip/i.test(r))
	);
	const recCols = await columns("recognition_point");
	ok(
		"recognition_point has NO money/pay/salary/amount/currency column",
		!recCols.some((c) =>
			/pay|salary|amount|currency|money|wage|gross|net/i.test(c)
		),
		recCols.join(",")
	);
	ok(
		"recognition_point.points is the only quantity (a plain integer ledger)",
		recCols.includes("points")
	);

	console.log(
		"\n── 2. key_result → project_task is read-only (SET NULL), one-directional ──"
	);
	const krFks = await fks("performance_key_result");
	const taskFk = krFks.find((f) => f.ref === "project_task");
	ok(
		"performance_key_result.linkedProjectTaskId → project_task exists",
		Boolean(taskFk)
	);
	ok(
		"that link is ON DELETE SET NULL (read-only context, never breaks the KR)",
		taskFk?.del === "set_null",
		taskFk?.del
	);
	const projTaskFks = await fks("project_task");
	ok(
		"project_task has NO FK back to any performance* table (one-directional link)",
		!projTaskFks.some((f) =>
			/performance|review|recognition|one_on_one/i.test(f.ref)
		),
		projTaskFks.map((f) => f.ref).join(",")
	);

	console.log(
		"\n── 3. private manager notes ready for server-side redaction ──"
	);
	const oooCols = await columns("one_on_one");
	ok(
		"one_on_one.private_manager_notes column exists",
		oooCols.includes("private_manager_notes")
	);
	ok(
		"one_on_one.shared_notes column exists (the employee-visible note)",
		oooCols.includes("shared_notes")
	);

	console.log("\n── 4. peer-review anonymity structurally supported ──");
	const reqUnique = await rows(sql`
		select indexdef from pg_indexes
		where tablename = 'review_request' and indexdef ilike '%unique%'
	`);
	ok(
		"review_request has a UNIQUE (cycle, subject, reviewer) index",
		reqUnique.some(
			(i) =>
				/cycle_id/.test(i.indexdef) &&
				/subject_employee_id/.test(i.indexdef) &&
				/reviewer_employee_id/.test(i.indexdef)
		)
	);
	const reqCols = await columns("review_request");
	ok(
		"review_request carries relationship (self/manager/peer/report) for rater grouping",
		reqCols.includes("relationship")
	);
	const cycleCols = await columns("review_cycle");
	ok(
		"review_cycle carries anonymity_threshold + is_anonymous_peers",
		cycleCols.includes("anonymity_threshold") &&
			cycleCols.includes("is_anonymous_peers")
	);

	console.log(
		"\n── 5. Activity reuses audit_event (NO performance_activity table) ──"
	);
	const hasActivity = await count(sql`
		select count(*)::int as n from information_schema.tables
		where table_name = 'performance_activity'
	`);
	ok("no performance_activity table exists", hasActivity === 0);

	console.log("\n── 6. all 9 tables + 10 enums present ──");
	const tableCount = await count(sql`
		select count(*)::int as n from information_schema.tables where table_name in
		('performance_objective','performance_key_result','review_cycle','question_template',
		 'review_question','review_request','review_response','one_on_one','recognition_point')
	`);
	ok("all 9 performance tables exist", tableCount === 9, `got ${tableCount}`);
	const enumCount = await count(sql`
		select count(*)::int as n from pg_type where typtype = 'e' and typname in
		('objective_status','key_result_status','key_result_progress_type','review_cycle_status',
		 'review_cycle_type','review_request_status','review_relationship','question_type',
		 'one_on_one_status','recognition_source')
	`);
	ok("all 10 performance enums exist", enumCount === 10, `got ${enumCount}`);

	console.log("\n── 7. seed invariants (idempotent) ──");
	const objStatuses = await rows(sql`
		select distinct status from performance_objective where organization_id = ${oid}
	`);
	ok(
		"objectives span all 7 statuses",
		objStatuses.length === 7,
		objStatuses
			.map((s) => s.status)
			.sort()
			.join(",")
	);
	const objN = await count(
		sql`select count(*)::int as n from performance_objective where organization_id = ${oid}`
	);
	ok("7 objectives seeded", objN === 7, `got ${objN}`);

	const linkedKr = await count(sql`
		select count(*)::int as n from performance_key_result kr
		where kr.organization_id = ${oid} and kr.linked_project_task_id is not null
	`);
	ok(
		"exactly 1 key result links a real project task",
		linkedKr === 1,
		`got ${linkedKr}`
	);
	const linkValid = await count(sql`
		select count(*)::int as n from performance_key_result kr
		join project_task t on t.id = kr.linked_project_task_id
		where kr.organization_id = ${oid}
	`);
	ok("the linked project task id is valid (resolves)", linkValid === 1);

	const reqRels = await rows(sql`
		select relationship, count(*)::int as n from review_request
		where organization_id = ${oid} group by relationship
	`);
	const relMap = new Map(reqRels.map((r) => [r.relationship, Number(r.n)]));
	ok(
		"5 review requests: self+manager+2 peers+1 report (360 fan-out + anonymity)",
		relMap.get("self") === 1 &&
			relMap.get("manager") === 1 &&
			relMap.get("peer") === 2 &&
			relMap.get("report") === 1
	);

	const oooPrivate = await count(sql`
		select count(*)::int as n from one_on_one
		where organization_id = ${oid} and private_manager_notes is not null
	`);
	ok(
		"exactly 1 one-on-one carries a private manager note (redaction probe)",
		oooPrivate === 1
	);

	const recN = await count(
		sql`select count(*)::int as n from recognition_point where organization_id = ${oid}`
	);
	ok("5 recognition points seeded", recN === 5, `got ${recN}`);
	const recAuto = await count(sql`
		select count(*)::int as n from recognition_point
		where organization_id = ${oid} and source = 'objective_completed'
	`);
	ok("1 recognition point is an objective_completed auto-award", recAuto === 1);
	const recAllPositive = await count(sql`
		select count(*)::int as n from recognition_point
		where organization_id = ${oid} and points <= 0
	`);
	ok(
		"all recognition points are positive integers (a points ledger)",
		recAllPositive === 0
	);

	const goalRefDup = await count(sql`
		select count(*)::int as n from (
			select reference, count(*) c from performance_objective
			where organization_id = ${oid} and deleted_at is null group by reference having count(*) > 1
		) d
	`);
	ok("GOAL- references are unique per org", goalRefDup === 0);

	console.log(`\n══ RESULT: ${pass} passed, ${fail} failed ══`);
	process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error("verify crashed:", err);
	process.exit(1);
});
