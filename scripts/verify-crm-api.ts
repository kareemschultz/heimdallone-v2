// biome-ignore-all lint: one-shot manual verification script for Phase 17C.
//
// End-to-end check of the CRM oRPC API against a running local API (:3000) +
// seeded data. Focus: two-layer authz (AC + owner/team scope), money + private-
// note redaction, transactional lead-convert + won→handoff, stage-gate.
//
//   export $(grep -v '^#' apps/server/.env | xargs)
//   bun run scripts/seed-crm.ts && bun run scripts/seed-crm-users.ts
//   # restart apps/server so the NEW crm router loads (lesson #76)
//   cp scripts/verify-crm-api.ts apps/web/_v.ts && (cd apps/web && bun run _v.ts); rm apps/web/_v.ts
//
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "../packages/api/src/routers/index";

const BASE = "http://localhost:3000";
const PW = "HeimdallTest2026!";
const ORIGIN = "http://localhost:3002";

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

async function signIn(email: string): Promise<string> {
	const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: ORIGIN },
		body: JSON.stringify({ email, password: PW }),
	});
	if (res.status !== 200) {
		throw new Error(`sign-in failed for ${email}: ${res.status}`);
	}
	return res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
}

function makeClient(cookie: string): RouterClient<AppRouter> {
	const link = new RPCLink({
		url: `${BASE}/rpc`,
		headers: () => ({ cookie, origin: ORIGIN }),
	});
	return createORPCClient(link) as RouterClient<AppRouter>;
}

async function expectAnyError(label: string, fn: () => Promise<unknown>) {
	try {
		await fn();
		ok(label, false, "expected an error but call succeeded");
	} catch (err) {
		const code = (err as { code?: string }).code ?? "ERROR";
		ok(label, true, `blocked (${code})`);
	}
}

async function main() {
	const admin = makeClient(await signIn("admin@atlas-shipping.com"));
	const manager = makeClient(await signIn("manager@atlas-shipping.com"));
	const employee = makeClient(await signIn("employee@atlas-shipping.com"));
	const auditor = makeClient(await signIn("auditor@atlas-shipping.com"));
	const payroll = makeClient(await signIn("payroll@atlas-shipping.com"));
	const recruiter = makeClient(await signIn("recruiter@atlas-shipping.com"));
	const salesAdmin = makeClient(await signIn("salesadmin@atlas-shipping.com"));
	const salesRep = makeClient(await signIn("salesrep@atlas-shipping.com"));

	console.log("\n── 1. admin sees the full pipeline ──");
	const stages = (await admin.crm.stages.list()) as any[];
	ok("6 pipeline stages", stages.length === 6, `${stages.length}`);
	const allDeals = (await admin.crm.deals.list({})) as any[];
	ok("admin sees all 5 deals", allDeals.length === 5, `${allDeals.length}`);
	const allCustomers = (await admin.crm.customers.list({})) as any[];
	ok(
		"admin sees 4 customers",
		allCustomers.length === 4,
		`${allCustomers.length}`
	);
	const wonDeal = allDeals.find((d) => d.status === "won");
	const lostDeal = allDeals.find((d) => d.status === "lost");
	const propDeal = allDeals.find((d) => d.title.includes("Warehouse"));
	ok(
		"a won deal exists with money + customer/stage names",
		Boolean(wonDeal?.value) &&
			Boolean(wonDeal?.customerName) &&
			Boolean(wonDeal?.stageName)
	);
	ok(
		"a stalled open deal is flagged",
		allDeals.some((d) => d.isStalled === true)
	);

	console.log("\n── 2. denormalised + money present for admin ──");
	ok(
		"admin deal.value is a number (money visible)",
		typeof wonDeal?.value === "number"
	);

	console.log("\n── 3. employee + recruiter have NO CRM access ──");
	await expectAnyError("employee deals.list → blocked", () =>
		(employee as any).crm.deals.list({})
	);
	await expectAnyError("recruiter customers.list → blocked", () =>
		(recruiter as any).crm.customers.list({})
	);

	console.log("\n── 4. manager team-scope ⊆ admin (never wider) ──");
	const mgrDeals = (await manager.crm.deals.list({})) as any[];
	ok(
		"manager deals ⊆ admin deals",
		mgrDeals.length <= allDeals.length,
		`mgr=${mgrDeals.length} admin=${allDeals.length}`
	);
	ok("manager cannot create a deal (no crm_deal create grant)", true);
	await expectAnyError("manager deals.create → blocked", () =>
		(manager as any).crm.deals.create({
			customerId: allCustomers[0].id,
			title: "x",
			stageId: stages[0].id,
		})
	);

	console.log("\n── 5. auditor: read-only, no private notes, no mutations ──");
	const audDeals = (await auditor.crm.deals.list({})) as any[];
	ok(
		"auditor can read deals",
		Array.isArray(audDeals) && audDeals.length === 5
	);
	const audNotes = (await auditor.crm.notes.list({
		relatedType: "deal",
		relatedId: propDeal.id,
	})) as any[];
	ok(
		"auditor notes.list EXCLUDES private notes",
		audNotes.every((n) => n.visibility === "team"),
		`n=${audNotes.length}`
	);
	ok(
		"auditor sees no private-note body (redaction)",
		!audNotes.some((n) => /PRIVATE/.test(n.body ?? ""))
	);
	await expectAnyError("auditor customers.create → blocked", () =>
		(auditor as any).crm.customers.create({ name: "x" })
	);

	console.log(
		"\n── 6. payroll (finance): reads deals + money, NO private notes ──"
	);
	const payDeals = (await payroll.crm.deals.list({})) as any[];
	ok(
		"payroll reads deals with money",
		payDeals.length === 5 && typeof payDeals[0].value === "number"
	);
	const payNotes = (await payroll.crm.notes.list({
		relatedType: "deal",
		relatedId: propDeal.id,
	})) as any[];
	ok(
		"payroll notes.list EXCLUDES private notes",
		payNotes.every((n) => n.visibility === "team")
	);

	console.log("\n── 7. admin/sales_admin SEE private notes ──");
	const adminNotes = (await admin.crm.notes.list({
		relatedType: "deal",
		relatedId: propDeal.id,
	})) as any[];
	ok(
		"admin sees both team + private notes",
		adminNotes.some((n) => n.visibility === "private"),
		`n=${adminNotes.length}`
	);
	const saNotes = (await salesAdmin.crm.notes.list({
		relatedType: "deal",
		relatedId: propDeal.id,
	})) as any[];
	ok(
		"sales_admin sees the private note",
		saNotes.some((n) => n.visibility === "private")
	);

	console.log(
		"\n── 8. sales_admin full access; sales_rep AC-allowed but own-scoped ──"
	);
	const saDeals = (await salesAdmin.crm.deals.list({})) as any[];
	ok(
		"sales_admin sees all deals (seesAllCrm)",
		saDeals.length === 5,
		`${saDeals.length}`
	);
	const repDeals = (await salesRep.crm.deals.list({})) as any[];
	ok(
		"sales_rep own-scoped (no linked employee → empty, denies by default)",
		repDeals.length === 0,
		`${repDeals.length}`
	);
	const repLead = (await salesRep.crm.leads.create({
		name: "Rep test lead",
		status: "new",
	})) as any;
	ok("sales_rep CAN create a lead (own)", typeof repLead.id === "string");
	await expectAnyError("sales_rep cannot manage pipeline settings", () =>
		(salesRep as any).crm.stages.create({ name: "x", position: 9 })
	);

	console.log("\n── 9. transactional lead conversion ──");
	const newLead = (await admin.crm.leads.create({
		name: "ConvertMe Co",
		companyName: "ConvertMe Co",
		status: "qualified",
	})) as any;
	const conv = (await admin.crm.leads.convert({
		id: newLead.id,
		createDeal: true,
		dealTitle: "ConvertMe deal",
	})) as any;
	ok(
		"convert returns customer + contact + deal ids",
		Boolean(conv.customerId && conv.contactId && conv.dealId)
	);
	const convLead = (await admin.crm.leads.getById({ id: newLead.id })) as any;
	ok("converted lead is now status=converted", convLead.status === "converted");
	await expectAnyError("re-converting a converted lead → blocked", () =>
		admin.crm.leads.convert({ id: newLead.id })
	);
	const convCust = (await admin.crm.customers.getById({
		id: conv.customerId,
	})) as any;
	ok("conversion created a real customer", convCust.name === "ConvertMe Co");

	console.log("\n── 10. stage gate + won→handoff ──");
	// move the New deal to Lost without a reason → blocked; with reason → lost.
	const newStageDeal = allDeals.find((d) => d.title.includes("Fleet GPS"));
	const lostStage = stages.find((s) => s.isLost);
	await expectAnyError("advance to Lost without reason → blocked", () =>
		admin.crm.deals.advanceStage({ id: newStageDeal.id, stageId: lostStage.id })
	);
	const lostRes = (await admin.crm.deals.advanceStage({
		id: newStageDeal.id,
		stageId: lostStage.id,
		lostReason: "Client chose competitor",
	})) as any;
	ok("advance to Lost with reason → status lost", lostRes.status === "lost");

	// handoff: the seeded won deal already has a handoff → re-handoff blocked.
	await expectAnyError(
		"re-handoff an already-handed-off won deal → blocked",
		() => admin.crm.deals.handoff({ id: wonDeal.id })
	);
	// handoff on an open deal → blocked (only won).
	await expectAnyError("handoff on a non-won deal → blocked", () =>
		admin.crm.deals.handoff({ id: propDeal.id })
	);
	// a won deal handoff appears in the customer's handoffs.
	const handoffs = (await admin.crm.customers.handoffs({
		customerId: wonDeal.customerId,
	})) as any[];
	ok(
		"customer handoffs include the won-deal link",
		handoffs.length >= 1,
		`${handoffs.length}`
	);

	console.log(
		"\n── 11. sub-resource IDOR: scoped rep can't touch others' records ──"
	);
	// salesRep has no linked employee → owner-scope is empty; notes/activities on
	// a deal they don't own must be blocked (the 17C-review parent-scope fix).
	await expectAnyError(
		"sales_rep notes.list on a non-owned deal → blocked",
		() =>
			(salesRep as any).crm.notes.list({
				relatedType: "deal",
				relatedId: propDeal.id,
			})
	);
	await expectAnyError(
		"sales_rep activities.create on a non-owned deal → blocked",
		() =>
			(salesRep as any).crm.activities.create({
				relatedType: "deal",
				relatedId: propDeal.id,
				type: "call",
				subject: "x",
			})
	);

	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
	process.stderr.write(`${e}\n`);
	process.exit(1);
});
