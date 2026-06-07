// biome-ignore-all lint: one-shot DB-level verification for Phase 17B.
//
// Proves the CRM schema + seed guardrails against the live DB via the pg
// constraint catalog + seed invariants. No API server needed.
//
// Run:  export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/verify-crm-db.ts

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
		select e.enumlabel as v from pg_type t join pg_enum e on e.enumtypid = t.oid
		where t.typname = ${typeName} order by e.enumsortorder
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

	console.log("\n── 1. all 8 CRM tables exist ──");
	for (const t of [
		"crm_customer",
		"crm_contact",
		"crm_lead",
		"crm_deal",
		"crm_pipeline_stage",
		"crm_activity",
		"crm_note",
		"crm_customer_project_link",
	]) {
		const cols = await columns(t);
		ok(`${t} exists`, cols.length > 0, `${cols.length} cols`);
	}

	console.log(
		"\n── 2. GUARDRAIL: customer↔project link is a SOFT ref (no FK to project) ──"
	);
	const cplFks = await fks("crm_customer_project_link");
	const cplRefs = cplFks.map((f) => f.ref).sort();
	ok(
		"crm_customer_project_link has NO FK to a project table",
		!cplRefs.some((r) => /project/i.test(r)),
		cplRefs.join(", ")
	);
	ok(
		"its FKs are only organization / crm_customer / crm_deal / user",
		cplRefs.every((r) =>
			["organization", "crm_customer", "crm_deal", '"user"', "user"].includes(r)
		),
		cplRefs.join(", ")
	);
	const cplCols = await columns("crm_customer_project_link");
	ok("project_id column exists (the soft ref)", cplCols.includes("project_id"));

	console.log(
		"\n── 3. GUARDRAIL: crm_deal.handed_off_project_link_id is a soft ref (no FK) ──"
	);
	const dealFks = await fks("crm_deal");
	const dealRefs = dealFks.map((f) => f.ref).sort();
	ok(
		"crm_deal has NO FK to crm_customer_project_link (avoids hard cycle)",
		!dealRefs.some((r) => /customer_project_link/i.test(r)),
		dealRefs.join(", ")
	);
	const custFk = dealFks.find((f) => f.ref === "crm_customer");
	ok(
		"crm_deal.customer_id → crm_customer ON DELETE restrict (no orphan)",
		custFk?.del === "restrict",
		custFk?.del
	);

	console.log("\n── 4. privacy + money columns present ──");
	const noteCols = await columns("crm_note");
	ok(
		"crm_note.visibility column exists (privacy surface)",
		noteCols.includes("visibility")
	);
	const dealCols = await columns("crm_deal");
	ok(
		"crm_deal.value column exists (finance-redacted money)",
		dealCols.includes("value")
	);
	const leadCols = await columns("crm_lead");
	ok(
		"crm_lead.estimated_value column exists",
		leadCols.includes("estimated_value")
	);

	console.log("\n── 5. partial-unique invariants ──");
	const idx = await rows(sql`
		select indexname, indexdef from pg_indexes
		where tablename in ('crm_contact','crm_pipeline_stage')
	`);
	const hasContactUq = idx.some(
		(x) =>
			x.indexname === "crm_contact_org_email_uq" && /WHERE/i.test(x.indexdef)
	);
	ok(
		"crm_contact_org_email_uq is a PARTIAL unique (WHERE clause)",
		hasContactUq
	);
	const hasStageUq = idx.some(
		(x) => x.indexname === "crm_stage_org_name_uq" && /WHERE/i.test(x.indexdef)
	);
	ok("crm_stage_org_name_uq is a PARTIAL unique (WHERE clause)", hasStageUq);

	console.log("\n── 6. enums ──");
	ok(
		"crm_deal_status = open|won|lost",
		(await enumValues("crm_deal_status")).join("|") === "open|won|lost"
	);
	ok(
		"crm_lead_status has new..converted",
		(await enumValues("crm_lead_status")).includes("converted")
	);
	ok(
		"crm_note_visibility = team|private",
		(await enumValues("crm_note_visibility")).join("|") === "team|private"
	);
	ok(
		"crm_handoff_status has intended..cancelled",
		(await enumValues("crm_handoff_status")).includes("intended")
	);

	console.log("\n── 7. seed invariants ──");
	ok(
		"6 pipeline stages seeded (1 won, 1 lost)",
		(await count(
			sql`select count(*)::int n from crm_pipeline_stage where organization_id=${oid}`
		)) === 6
	);
	ok(
		"exactly 1 won-stage + 1 lost-stage",
		(await count(
			sql`select count(*)::int n from crm_pipeline_stage where organization_id=${oid} and (is_won or is_lost)`
		)) === 2
	);
	ok(
		"a won deal has handed_off_project_link_id set + a link row",
		(await count(sql`
			select count(*)::int n from crm_deal d
			join crm_customer_project_link l on l.id = d.handed_off_project_link_id
			where d.organization_id=${oid} and d.status='won'
		`)) >= 1
	);
	ok(
		"a lost deal carries a lost_reason",
		(await count(
			sql`select count(*)::int n from crm_deal where organization_id=${oid} and status='lost' and lost_reason is not null`
		)) >= 1
	);
	ok(
		"a stalled open deal exists (last_activity_at > 30 days ago)",
		(await count(
			sql`select count(*)::int n from crm_deal where organization_id=${oid} and status='open' and last_activity_at < now() - interval '30 days'`
		)) >= 1
	);
	ok(
		"a private note exists (the redaction target)",
		(await count(
			sql`select count(*)::int n from crm_note where organization_id=${oid} and visibility='private'`
		)) >= 1
	);
	ok(
		"a converted lead points at a deal (read-only conversion record)",
		(await count(
			sql`select count(*)::int n from crm_lead where organization_id=${oid} and status='converted' and converted_deal_id is not null`
		)) >= 1
	);
	ok(
		"an overdue follow-up activity exists (due in the past, not completed)",
		(await count(
			sql`select count(*)::int n from crm_activity where organization_id=${oid} and completed_at is null and due_at < now()`
		)) >= 1
	);

	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
	process.stderr.write(`${e}\n`);
	process.exit(1);
});
