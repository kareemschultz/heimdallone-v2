// biome-ignore-all lint: one-shot manual verification script for Phase 7I.
//
// End-to-end check of the leave policy engine against a running local API (:3000)
// + seeded system templates. Mixes the oRPC client (run from apps/web, where
// @orpc/client resolves) with a tiny direct-DB mutation to prove the snapshot
// invariant (there is intentionally NO RPC to edit a system template).
//
//   bun run scripts/seed-leave-policy.ts                 # fresh system templates
//   # restart apps/server `bun run --hot src/index.ts`   # load the new router (#76)
//   cp scripts/verify-leave-policy-engine.ts apps/web/_v.ts \
//     && (cd apps/web && bun run _v.ts); rm apps/web/_v.ts
//
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
// Runtime path is relative to apps/web/_v.ts (where this is copied + run).
import { createDb } from "../../packages/db/src/index";
import { leavePolicyRule } from "../../packages/db/src/schema/leave-policy";
import type { AppRouter } from "../packages/api/src/routers/index";

const BASE = "http://localhost:3000";
const PW = process.env.TEST_PASSWORD ?? "HeimdallTest2026!";
const ORIGIN = "http://localhost:3002";
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

async function expectError(
	label: string,
	wantCode: string,
	fn: () => Promise<unknown>
) {
	try {
		await fn();
		ok(label, false, `expected ${wantCode} but call succeeded`);
	} catch (err) {
		const code = (err as { code?: string }).code ?? "ERROR";
		ok(label, code === wantCode, `got ${code}`);
	}
}

async function main() {
	console.log("Phase 7I — leave policy engine verification\n");

	const admin = makeClient(await signIn("admin@atlas-shipping.com"));
	const manager = makeClient(await signIn("manager@atlas-shipping.com"));
	const employee = makeClient(await signIn("employee@atlas-shipping.com"));
	const auditor = makeClient(await signIn("auditor@atlas-shipping.com"));
	const payroll = makeClient(await signIn("payroll@atlas-shipping.com"));

	const emps = (await admin.hrCore.employees.list({ page: 1, pageSize: 100 }))
		.data as { id: string; firstName: string; lastName: string | null }[];
	const andre = emps.find(
		(e) => e.firstName === "Andre" && e.lastName === "Sealey"
	);
	const rohan = emps.find(
		(e) => e.firstName === "Rohan" && e.lastName === "Gopaul"
	);

	// ── 1. Template library + verification mix ────────────────────────────────
	console.log("1. statutory template library");
	const templates = await admin.leavePolicy.templates.list({});
	const gy = templates.find(
		(t) => t.countryCode === "GY" && t.isSystemTemplate
	);
	ok("GY system template present", Boolean(gy), gy?.verificationStatus);
	ok(
		"BB/TT/JM draft system templates present",
		["BB", "TT", "JM"].every((c) =>
			templates.some((t) => t.countryCode === c && t.isSystemTemplate)
		)
	);
	const gyDetail = await admin.leavePolicy.templates.getById({ id: gy!.id });
	const mat = gyDetail.rules.find((r) => r.leaveCategory === "maternity");
	const annual = gyDetail.rules.find((r) => r.leaveCategory === "annual");
	const paternity = gyDetail.rules.find((r) => r.leaveCategory === "paternity");
	ok(
		"per-rule verification mix (maternity verified, annual needs_review, paternity draft)",
		mat?.verificationStatus === "verified" &&
			annual?.verificationStatus === "needs_review" &&
			paternity?.verificationStatus === "draft"
	);

	// ── 2. payroll-treatment redaction ────────────────────────────────────────
	console.log("\n2. payroll-treatment visibility");
	const payView = await payroll.leavePolicy.templates.getById({ id: gy!.id });
	ok(
		"payroll_admin sees payrollTreatment",
		payView.rules.some(
			(r) => (r as { payrollTreatment: unknown }).payrollTreatment != null
		)
	);
	const mgrView = await manager.leavePolicy.templates.getById({ id: gy!.id });
	ok(
		"manager payrollTreatment REDACTED to null",
		mgrView.rules.every(
			(r) => (r as { payrollTreatment: unknown }).payrollTreatment == null
		)
	);
	await expectError("employee templates.list FORBIDDEN", "FORBIDDEN", () =>
		employee.leavePolicy.templates.list({})
	);

	// ── 3. adopt + SNAPSHOT INVARIANT ─────────────────────────────────────────
	console.log("\n3. adopt template + snapshot invariant");
	const adopted = await admin.leavePolicy.orgPolicies.adoptTemplate({
		templateId: gy!.id,
		name: "Atlas Guyana leave (verify run)",
	});
	ok(
		"adoptTemplate snapshots rules",
		adopted.ruleCount === 6,
		`ruleCount=${adopted.ruleCount}`
	);
	const adoptedDetail = await admin.leavePolicy.orgPolicies.getById({
		id: adopted.id,
	});
	const adoptedAnnual = adoptedDetail.rules.find(
		(r) => r.leaveCategory === "annual"
	)!;
	const beforeAmount = (adoptedAnnual as { entitlementAmount: string | null })
		.entitlementAmount;
	const sourceRuleId = (adoptedAnnual as { sourceRuleId: string | null })
		.sourceRuleId!;

	// Mutate the SYSTEM template rule directly (no RPC path for this on purpose).
	await db
		.update(leavePolicyRule)
		.set({ entitlementAmount: "99.00" })
		.where(eq(leavePolicyRule.id, sourceRuleId));
	const afterDetail = await admin.leavePolicy.orgPolicies.getById({
		id: adopted.id,
	});
	const afterAnnual = afterDetail.rules.find(
		(r) => r.leaveCategory === "annual"
	)!;
	const afterAmount = (afterAnnual as { entitlementAmount: string | null })
		.entitlementAmount;
	ok(
		"editing the SYSTEM template does NOT mutate the adopted org policy",
		afterAmount === beforeAmount && afterAmount !== "99.00",
		`adopted stayed ${afterAmount} (system now 99.00)`
	);
	// restore the system rule
	await db
		.update(leavePolicyRule)
		.set({ entitlementAmount: beforeAmount })
		.where(eq(leavePolicyRule.id, sourceRuleId));

	// ── 4. custom + override + compare ────────────────────────────────────────
	console.log("\n4. custom policy, rule override, compare-to-baseline");
	const custom = await admin.leavePolicy.orgPolicies.createCustom({
		name: "Atlas custom leave",
		countryCode: "GY",
	});
	ok("createCustom succeeds", Boolean(custom.id));

	await admin.leavePolicy.orgPolicies.updateRule({
		ruleId: adoptedAnnual.id,
		patch: {
			entitlementAmount: "15.00",
			customOverrideNote: "Enhanced annual",
		},
	});
	const cmp = await admin.leavePolicy.orgPolicies.compareToBaseline({
		id: adopted.id,
	});
	const annualCmp = cmp.find((c) => c.leaveCategory === "annual");
	ok(
		"override marks rule customized + compare shows the diff",
		Boolean(annualCmp?.isCustomized) &&
			(annualCmp?.differences ?? []).some(
				(d) => d.field === "entitlementAmount"
			)
	);

	// ── 5. lifecycle: activate (one active per country) + archive ─────────────
	console.log("\n5. activate / archive lifecycle");
	const activated = await admin.leavePolicy.orgPolicies.activate({
		id: adopted.id,
	});
	ok("activate succeeds", activated.id === adopted.id);
	const adopted2 = await admin.leavePolicy.orgPolicies.adoptTemplate({
		templateId: gy!.id,
	});
	await expectError(
		"second active GY policy → CONFLICT (one active per country)",
		"CONFLICT",
		() => admin.leavePolicy.orgPolicies.activate({ id: adopted2.id })
	);
	const archived = await admin.leavePolicy.orgPolicies.archive({
		id: adopted.id,
	});
	ok("archive succeeds", archived.id === adopted.id);

	// ── 6. RBAC + IDOR ────────────────────────────────────────────────────────
	console.log("\n6. RBAC + tenant verification");
	await expectError("getById bogus → NOT_FOUND", "NOT_FOUND", () =>
		admin.leavePolicy.orgPolicies.getById({ id: "bogus_policy" })
	);
	await expectError("manager adoptTemplate FORBIDDEN", "FORBIDDEN", () =>
		manager.leavePolicy.orgPolicies.adoptTemplate({ templateId: gy!.id })
	);
	await expectError("auditor activate FORBIDDEN", "FORBIDDEN", () =>
		auditor.leavePolicy.orgPolicies.activate({ id: adopted2.id })
	);
	await expectError("payroll updateRule FORBIDDEN", "FORBIDDEN", () =>
		payroll.leavePolicy.orgPolicies.updateRule({
			ruleId: adoptedAnnual.id,
			patch: { entitlementAmount: "1.00" },
		})
	);

	// ── 7. employee "why this balance?" + scope ───────────────────────────────
	console.log("\n7. balance explanation (self-scope) + payroll path intact");
	const mine = await employee.leavePolicy.balanceExplanation.forSelf({});
	ok(
		"employee balanceExplanation.forSelf returns",
		Array.isArray(mine.balances)
	);
	ok(
		"balance lines carry pending + isPaid (payroll inputs intact)",
		mine.balances.every(
			(b) => "pending" in (b as object) && "isPaid" in (b as object)
		)
	);
	if (andre && rohan) {
		await expectError(
			"employee forEmployee(other) FORBIDDEN",
			"FORBIDDEN",
			() =>
				employee.leavePolicy.balanceExplanation.forEmployee({
					employeeId: andre.id,
				})
		);
		await expectError(
			"manager forEmployee(non-report Rohan) FORBIDDEN",
			"FORBIDDEN",
			() =>
				manager.leavePolicy.balanceExplanation.forEmployee({
					employeeId: rohan.id,
				})
		);
	}

	// ── 8. unverified-policy signal does not break payroll ────────────────────
	console.log("\n8. unverified signal present, payroll unaffected");
	const adopted3 = await admin.leavePolicy.orgPolicies.getById({
		id: adopted2.id,
	});
	ok(
		"adopted GY policy carries unverified (needs_review/draft) rules → warning signal",
		adopted3.rules.some(
			(r) =>
				(r as { verificationStatus: string }).verificationStatus ===
					"needs_review" ||
				(r as { verificationStatus: string }).verificationStatus === "draft"
		)
	);

	console.log(`\n──────────────\nRESULT: ${pass} passed, ${fail} failed\n`);
	process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("verify failed:", err);
	process.exit(1);
});
