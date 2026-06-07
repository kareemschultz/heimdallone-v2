// biome-ignore-all lint: one-shot manual verification script for Phase 16C.
//
// End-to-end check of the Finance oRPC API against a running local API (:3000)
// + seeded data. Focus: cost math (employer contributions included), manager
// department-scoping, project-costing estimate flag, budget CRUD + tenant-verify
// of the soft scopeId, variance math, and RBAC negatives.
//
//   export $(grep -v '^#' apps/server/.env | xargs)
//   bun run scripts/seed-finance.ts            # fresh idempotent baseline
//   # restart apps/server so the NEW finance router is loaded (lesson #76)
//   cp scripts/verify-finance-api.ts apps/web/_v.ts \
//     && (cd apps/web && bun run _v.ts); rm apps/web/_v.ts
//
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "../packages/api/src/routers/index";

const BASE = "http://localhost:3000";
const PW = "HeimdallTest2026!";
const ORIGIN = "http://localhost:3002";

// Wide window covering all seeded payslips + budgets.
const FROM = "2020-01-01";
const TO = "2035-12-31";

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

const range = { from: FROM, to: TO };

async function main() {
	const admin = makeClient(await signIn("admin@atlas-shipping.com"));
	const manager = makeClient(await signIn("manager@atlas-shipping.com"));
	const employee = makeClient(await signIn("employee@atlas-shipping.com"));
	const auditor = makeClient(await signIn("auditor@atlas-shipping.com"));
	const payroll = makeClient(await signIn("payroll@atlas-shipping.com"));
	const recruiter = makeClient(await signIn("recruiter@atlas-shipping.com"));

	console.log("\n── 1. Cost summary math (employer contributions included) ──");
	const sum = (await admin.finance.costReports.summary(range)) as any;
	ok(
		"admin summary returns a currency",
		typeof sum.currency === "string",
		sum.currency
	);
	ok(
		"totalCost === grossPay + totalEmployerContributions",
		Math.abs(sum.totalCost - (sum.grossPay + sum.totalEmployerContributions)) <
			0.01,
		`${sum.totalCost} = ${sum.grossPay} + ${sum.totalEmployerContributions}`
	);
	ok("admin summary not department-scoped", sum.scoped === false);
	ok("payslipCount >= 0", typeof sum.payslipCount === "number");

	console.log("\n── 2. By-department + by-cost-type ──");
	const byDept = (await admin.finance.costReports.byDepartment(range)) as any[];
	ok("byDepartment returns rows", Array.isArray(byDept));
	ok(
		"every dept row: totalCost = gross + employer",
		byDept.every(
			(r) =>
				Math.abs(r.totalCost - (r.grossPay + r.totalEmployerContributions)) <
				0.01
		)
	);
	const byType = (await admin.finance.costReports.byCostType(range)) as any[];
	ok("byCostType returns rows", Array.isArray(byType));
	const hasEmployer = byType.some((r) => r.type === "employer_contribution");
	ok(
		"byCostType includes an employer_contribution bucket (if any contributions)",
		hasEmployer || sum.totalEmployerContributions === 0,
		byType.map((r) => r.type).join(",")
	);

	console.log("\n── 3. Trend ──");
	const trend = (await admin.finance.costReports.trend(range)) as any[];
	ok("trend returns period rows", Array.isArray(trend));
	ok(
		"trend rows carry periodStart/periodEnd/totalCost",
		trend.every(
			(r) => r.periodStart && r.periodEnd && typeof r.totalCost === "number"
		) || trend.length === 0
	);

	console.log("\n── 4. Project costing is an ESTIMATE ──");
	const pc = (await admin.finance.costReports.projectCosting(range)) as any;
	ok("projectCosting flagged isEstimate=true", pc.isEstimate === true);
	ok(
		"projectCosting carries a method note",
		typeof pc.method === "string" && pc.method.length > 0
	);
	ok("projectCosting returns a projects array", Array.isArray(pc.projects));
	ok(
		"each project row has hours + estimatedCost + contributorCount",
		pc.projects.every(
			(p: any) =>
				typeof p.hours === "number" &&
				typeof p.estimatedCost === "number" &&
				typeof p.contributorCount === "number"
		)
	);

	console.log("\n── 5. Manager is DEPARTMENT-SCOPED ──");
	const mgrSum = (await manager.finance.costReports.summary(range)) as any;
	ok("manager summary is scoped=true", mgrSum.scoped === true);
	const mgrDept = (await manager.finance.costReports.byDepartment(
		range
	)) as any[];
	ok(
		"manager byDepartment ⊆ admin byDepartment (never wider)",
		mgrDept.length <= byDept.length,
		`mgr=${mgrDept.length} admin=${byDept.length}`
	);
	const mgrPc = (await manager.finance.costReports.projectCosting(
		range
	)) as any;
	ok(
		"manager projectCosting is empty (management-only data)",
		mgrPc.projects.length === 0
	);

	console.log("\n── 6. RBAC negatives ──");
	await expectAnyError("employee summary → blocked (no finance:read)", () =>
		(employee as any).finance.costReports.summary(range)
	);
	await expectAnyError("recruiter summary → blocked", () =>
		(recruiter as any).finance.costReports.summary(range)
	);
	await expectAnyError(
		"manager budgets.create → blocked (no manage_budget)",
		() =>
			(manager as any).finance.budgets.create({
				scope: "organization",
				label: "x",
				category: "labour",
				periodStart: FROM,
				periodEnd: TO,
				currency: "GYD",
				budgetedAmount: 1,
			})
	);
	await expectAnyError(
		"auditor budgets.create → blocked (read+export only)",
		() =>
			(auditor as any).finance.budgets.create({
				scope: "organization",
				label: "x",
				category: "labour",
				periodStart: FROM,
				periodEnd: TO,
				currency: "GYD",
				budgetedAmount: 1,
			})
	);

	console.log("\n── 7. Auditor reads + exports, never mutates ──");
	const audSum = (await auditor.finance.costReports.summary(range)) as any;
	ok("auditor can read summary", typeof audSum.totalCost === "number");
	const audCsv = (await auditor.finance.export.costCsv({
		...range,
		report: "summary",
	})) as any;
	ok(
		"auditor can export cost CSV",
		typeof audCsv.csv === "string" && audCsv.filename.endsWith(".csv")
	);

	console.log("\n── 8. Budgets list + CRUD + tenant-verify of soft scopeId ──");
	const budgets = (await admin.finance.budgets.list({})) as any[];
	ok("admin sees seeded budgets", budgets.length >= 3, `n=${budgets.length}`);
	const orgBudget = budgets.find((b) => b.scope === "organization");
	ok(
		"an org-wide budget has null scopeId",
		orgBudget && orgBudget.scopeId === null
	);

	// create with a bogus department scopeId → tenant-verify rejects.
	await expectAnyError(
		"budgets.create with foreign/bogus department scopeId → rejected",
		() =>
			payroll.finance.budgets.create({
				scope: "department",
				scopeId: "not-a-real-department-id",
				label: "bogus",
				category: "labour",
				periodStart: FROM,
				periodEnd: TO,
				currency: "GYD",
				budgetedAmount: 100,
			})
	);

	// payroll_admin creates a valid org budget, updates, removes (full lifecycle).
	const created = (await payroll.finance.budgets.create({
		scope: "organization",
		label: "VERIFY temp budget",
		category: "labour",
		periodStart: "2099-01-01",
		periodEnd: "2099-12-31",
		currency: "GYD",
		budgetedAmount: 12345,
	})) as any;
	ok("payroll_admin created a budget", typeof created.id === "string");
	await payroll.finance.budgets.update({
		id: created.id,
		budgetedAmount: 99999,
	});
	const fetched = (await admin.finance.budgets.getById({
		id: created.id,
	})) as any;
	ok(
		"budget update persisted",
		fetched.budgetedAmount === 99999,
		`${fetched.budgetedAmount}`
	);
	await payroll.finance.budgets.remove({ id: created.id });
	await expectAnyError("removed budget no longer retrievable", () =>
		admin.finance.budgets.getById({ id: created.id })
	);

	console.log("\n── 9. Variance math ──");
	const variance = (await admin.finance.budgets.variance(range)) as any[];
	ok(
		"variance returns rows for seeded budgets",
		Array.isArray(variance) && variance.length >= 1,
		`n=${variance.length}`
	);
	ok(
		"variance === budgeted − actual for each row",
		variance.every(
			(v) =>
				Math.abs(v.variance - (v.budget.budgetedAmount - v.actualCost)) < 0.01
		)
	);
	ok(
		"pctUsed is null or actual/budgeted×100",
		variance.every(
			(v) =>
				v.pctUsed === null ||
				Math.abs(v.pctUsed - (v.actualCost / v.budget.budgetedAmount) * 100) <
					0.2
		)
	);

	console.log(
		"\n── 10. Manager variance never includes org/project budgets ──"
	);
	const mgrVar = (await manager.finance.budgets.variance(range)) as any[];
	ok(
		"manager variance contains only department-scoped budgets",
		mgrVar.every((v) => v.budget.scope === "department"),
		mgrVar.map((v) => v.budget.scope).join(",") || "(none)"
	);

	console.log(
		"\n── 11. Manager budget READ is department-scoped (no org leak) ──"
	);
	const mgrBudgets = (await manager.finance.budgets.list({})) as any[];
	ok(
		"manager budgets.list contains only department-scoped budgets",
		mgrBudgets.every((b) => b.scope === "department"),
		mgrBudgets.map((b) => b.scope).join(",") || "(none)"
	);
	const adminBudgets2 = (await admin.finance.budgets.list({})) as any[];
	const orgWide = adminBudgets2.find((b) => b.scope === "organization");
	if (orgWide) {
		await expectAnyError(
			"manager getById an org-wide budget → blocked (NOT_FOUND)",
			() => manager.finance.budgets.getById({ id: orgWide.id })
		);
	} else {
		ok("an org-wide budget exists to test against", false, "none found");
	}

	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
	process.stderr.write(`${e}\n`);
	process.exit(1);
});
