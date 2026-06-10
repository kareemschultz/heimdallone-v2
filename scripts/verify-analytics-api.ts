// biome-ignore-all lint: one-shot manual verification script for Phase 18C.
//
// End-to-end check of the Analytics oRPC API against a running local API (:3000)
// + seeded data. Focus: executive summary KPI shape, manager department-scope
// (⊆ admin) + scoped flag, trend/breakdown shapes, CSV export, and RBAC
// negatives (employee/recruiter blocked; manager cannot export).
//
//   export $(grep -v '^#' apps/server/.env | xargs)
//   # restart apps/server so the NEW analytics router is loaded (lesson #76)
//   cp scripts/verify-analytics-api.ts apps/web/_v.ts \
//     && (cd apps/web && bun run _v.ts); rm apps/web/_v.ts
//
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "../packages/api/src/routers/index";

const BASE = "http://localhost:3000";
const PW = process.env.TEST_PASSWORD ?? "HeimdallTest2026!";
const ORIGIN = "http://localhost:3002";

const FROM = "2020-01-01";
const TO = "2035-12-31";
const range = { from: FROM, to: TO };

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
	const cookies = res.headers.getSetCookie();
	return cookies.map((c) => c.split(";")[0]).join("; ");
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

	console.log("\n§1 Executive summary (admin = whole org)");
	const aSum = await admin.analytics.executive.summary(range);
	ok("admin summary returns KPI object", typeof aSum.headcount === "number");
	ok(
		"admin summary not scoped",
		aSum.scoped === false,
		`scoped=${aSum.scoped}`
	);
	ok("headcount > 0", aSum.headcount > 0, `${aSum.headcount}`);
	ok(
		"all KPI fields present",
		[
			aSum.activeContracts,
			aSum.payrollCost,
			aSum.employerContributions,
			aSum.openHelpdesk,
			aSum.overdueHelpdesk,
			aSum.activeProjects,
			aSum.atRiskProjects,
			aSum.openDeals,
			aSum.pipelineValue,
		].every((v) => typeof v === "number"),
		`currency=${aSum.currency}`
	);

	console.log("\n§2 Manager summary (department-scoped ⊆ admin)");
	const mSum = await manager.analytics.executive.summary(range);
	ok("manager summary scoped", mSum.scoped === true, `scoped=${mSum.scoped}`);
	ok(
		"manager headcount ⊆ admin",
		mSum.headcount <= aSum.headcount,
		`mgr=${mSum.headcount} admin=${aSum.headcount}`
	);
	ok(
		"manager active projects ⊆ admin",
		mSum.activeProjects <= aSum.activeProjects,
		`mgr=${mSum.activeProjects} admin=${aSum.activeProjects}`
	);
	ok(
		"manager open deals ⊆ admin",
		mSum.openDeals <= aSum.openDeals,
		`mgr=${mSum.openDeals} admin=${aSum.openDeals}`
	);

	console.log("\n§3 Auditor + payroll see all (seesAllAnalytics)");
	const audSum = await auditor.analytics.executive.summary(range);
	ok("auditor not scoped", audSum.scoped === false);
	ok(
		"auditor headcount == admin",
		audSum.headcount === aSum.headcount,
		`${audSum.headcount}`
	);
	const paySum = await payroll.analytics.executive.summary(range);
	ok("payroll not scoped", paySum.scoped === false);

	console.log("\n§4 Trends + breakdowns (shapes)");
	const hct = await admin.analytics.executive.headcountTrend({ months: 6 });
	ok("headcountTrend returns 6 buckets", hct.length === 6, `${hct.length}`);
	ok(
		"headcountTrend bucket shape",
		hct.every(
			(b) => typeof b.period === "string" && typeof b.count === "number"
		)
	);
	const pct = await admin.analytics.executive.payrollCostTrend(range);
	ok("payrollCostTrend is array", Array.isArray(pct), `${pct.length} periods`);
	const pbs = await admin.analytics.executive.pipelineByStage({});
	ok("pipelineByStage is array", Array.isArray(pbs), `${pbs.length} stages`);
	ok(
		"pipelineByStage shape",
		pbs.every(
			(s) =>
				typeof s.stage === "string" &&
				typeof s.count === "number" &&
				typeof s.value === "number"
		)
	);
	const mix = await admin.analytics.executive.workforceMix({});
	ok("workforceMix is array", Array.isArray(mix), `${mix.length} depts`);
	const feed = await admin.analytics.executive.attentionFeed({});
	ok("attentionFeed is array", Array.isArray(feed), `${feed.length} items`);

	console.log("\n§5 CSV export");
	const csv = await admin.analytics.export.summaryCsv(range);
	ok(
		"admin export returns csv",
		csv.content.includes("Headcount") && csv.filename.endsWith(".csv"),
		csv.filename
	);
	const audCsv = await auditor.analytics.export.summaryCsv(range);
	ok("auditor can export", audCsv.content.includes("Metric"));

	console.log("\n§6 RBAC negatives");
	await expectAnyError("employee summary blocked", () =>
		employee.analytics.executive.summary(range)
	);
	await expectAnyError("recruiter summary blocked", () =>
		recruiter.analytics.executive.summary(range)
	);
	await expectAnyError("employee export blocked", () =>
		employee.analytics.export.summaryCsv(range)
	);
	await expectAnyError("manager export blocked (no analytics:export)", () =>
		manager.analytics.export.summaryCsv(range)
	);
	await expectAnyError("recruiter workforceMix blocked", () =>
		recruiter.analytics.executive.workforceMix({})
	);

	console.log(`\n── Analytics API verify: ${pass} passed, ${fail} failed ──`);
	if (fail > 0) {
		process.exit(1);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
