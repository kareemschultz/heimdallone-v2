// biome-ignore-all lint: one-shot manual verification script for Phase 12C.
//
// End-to-end check of the assets oRPC API against a running local API (:3000)
// + seeded data. `@orpc/client` is an apps/web dependency, so run from there
// (the AppRouter import is type-only and erased):
//
//   bun run scripts/seed-assets.ts                      # fresh seed
//   # restart the API server so the NEW assets router is loaded (lesson #76):
//   #   kill the apps/server `bun run --hot src/index.ts` pid, then relaunch
//   cp scripts/verify-assets-api.ts apps/web/_v.ts \
//     && (cd apps/web && bun run _v.ts); rm apps/web/_v.ts
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

async function expectAnyError(label: string, fn: () => Promise<unknown>) {
	try {
		await fn();
		ok(label, false, "expected an error but call succeeded");
	} catch (err) {
		const code = (err as { code?: string }).code ?? "ERROR";
		ok(label, true, `blocked (${code})`);
	}
}

async function expectMessage(
	label: string,
	substr: string,
	fn: () => Promise<unknown>
) {
	try {
		await fn();
		ok(label, false, "expected an error but call succeeded");
	} catch (err) {
		const msg = (err as { message?: string }).message ?? "";
		ok(label, msg.includes(substr), `message="${msg}"`);
	}
}

async function main() {
	console.log("Phase 12C — assets API verification\n");

	const admin = makeClient(await signIn("admin@atlas-shipping.com"));
	const manager = makeClient(await signIn("manager@atlas-shipping.com"));
	const employee = makeClient(await signIn("employee@atlas-shipping.com"));
	const auditor = makeClient(await signIn("auditor@atlas-shipping.com"));
	const payroll = makeClient(await signIn("payroll@atlas-shipping.com"));
	const recruiter = makeClient(await signIn("recruiter@atlas-shipping.com"));

	// ── Discover employee mapping (cuid ids are random per seed) ──────────────
	const emps = (await admin.hrCore.employees.list({ page: 1, pageSize: 100 }))
		.data as { id: string; firstName: string; lastName: string | null }[];
	const byName = (f: string, l: string) =>
		emps.find((e) => e.firstName === f && e.lastName === l);
	const andre = byName("Andre", "Sealey"); // manager@ user
	const rohan = byName("Rohan", "Gopaul"); // employee@ user, reports to Maya
	if (!(andre && rohan)) {
		throw new Error("seed mapping not found (Andre Sealey / Rohan Gopaul)");
	}
	// A direct report of Andre (for manager positive-scope test).
	let andreReportId: string | null = null;
	for (const e of emps) {
		const detail = (await admin.hrCore.employees.getById({ id: e.id })) as {
			workInfo?: { reportingManagerId?: string | null } | null;
		};
		if (detail.workInfo?.reportingManagerId === andre.id) {
			andreReportId = e.id;
			break;
		}
	}
	console.log(
		`mapping: andre=${andre.id} rohan=${rohan.id} andreReport=${andreReportId}\n`
	);

	// ── 1. RBAC on inventory listing + cost redaction (server-side) ───────────
	console.log("1. inventory listing + purchaseCost redaction");
	const adminList = await admin.assets.list({ page: 1, pageSize: 100 });
	ok(
		"admin assets.list returns rows",
		adminList.data.length > 0,
		`${adminList.total} assets`
	);
	const adminCostSeen = adminList.data.some(
		(a) => (a as { purchaseCost: unknown }).purchaseCost != null
	);
	ok("admin sees purchaseCost", adminCostSeen);
	ok(
		"admin rows carry category + assignee display fields",
		adminList.data.every(
			(a) =>
				"categoryName" in (a as object) &&
				"currentAssigneeName" in (a as object)
		)
	);

	const mgrList = await manager.assets.list({ page: 1, pageSize: 100 });
	const mgrCostAllNull = mgrList.data.every(
		(a) => (a as { purchaseCost: unknown }).purchaseCost == null
	);
	ok("manager purchaseCost REDACTED to null (every row)", mgrCostAllNull);

	const audList = await auditor.assets.list({ page: 1, pageSize: 100 });
	ok(
		"auditor sees purchaseCost (finance/audit role)",
		audList.data.some(
			(a) => (a as { purchaseCost: unknown }).purchaseCost != null
		)
	);
	const payList = await payroll.assets.list({ page: 1, pageSize: 100 });
	ok(
		"payroll_admin sees purchaseCost",
		payList.data.some(
			(a) => (a as { purchaseCost: unknown }).purchaseCost != null
		)
	);

	await expectError("employee assets.list FORBIDDEN", "FORBIDDEN", () =>
		employee.assets.list({ page: 1, pageSize: 10 })
	);
	await expectError("recruiter assets.list FORBIDDEN", "FORBIDDEN", () =>
		recruiter.assets.list({ page: 1, pageSize: 10 })
	);

	// ── 2. Tenant isolation / IDOR ────────────────────────────────────────────
	console.log("\n2. tenant verification / IDOR");
	await expectError("getById bogus id → NOT_FOUND", "NOT_FOUND", () =>
		admin.assets.getById({ id: "bogus_asset_id" })
	);
	await expectError(
		"assign bogus employee → BAD_REQUEST",
		"BAD_REQUEST",
		async () => {
			const a = await admin.assets.create({
				name: "Probe",
				trackingId: `VERIFY-PROBE-${Date.now()}`,
			});
			return admin.assets.assignments.assign({
				assetId: a.id,
				assignedToId: "bogus_employee_id",
			});
		}
	);

	// ── 3. Assign / return lifecycle + invariants ─────────────────────────────
	console.log("\n3. assign / return lifecycle + invariants");
	const cat = await admin.assets.categories.create({
		name: `Verify Cat ${Date.now()}`,
	});
	const asset1 = await admin.assets.create({
		name: "Verify Laptop",
		trackingId: `VERIFY-LAP-${Date.now()}`,
		categoryId: cat.id,
		purchaseCost: "1234.56",
	});

	await expectError("manager cannot assign", "FORBIDDEN", () =>
		manager.assets.assignments.assign({
			assetId: asset1.id,
			assignedToId: rohan.id,
		})
	);
	await expectError("auditor cannot assign", "FORBIDDEN", () =>
		auditor.assets.assignments.assign({
			assetId: asset1.id,
			assignedToId: rohan.id,
		})
	);

	const asn1 = await admin.assets.assignments.assign({
		assetId: asset1.id,
		assignedToId: rohan.id,
	});
	const afterAssign = await admin.assets.getById({ id: asset1.id });
	ok(
		"assign → status in_use + currentAssigneeId set",
		afterAssign.status === "in_use" &&
			(afterAssign as { currentAssigneeId: string | null })
				.currentAssigneeId === rohan.id
	);
	await expectError(
		'double-assign → "Asset is already assigned."',
		"PRECONDITION_FAILED",
		() =>
			admin.assets.assignments.assign({
				assetId: asset1.id,
				assignedToId: rohan.id,
			})
	);

	const histBefore = await admin.assets.assignments.listByAsset({
		assetId: asset1.id,
	});
	await admin.assets.assignments.return({
		assignmentId: asn1.id,
		returnCondition: "healthy",
	});
	const afterReturn = await admin.assets.getById({ id: asset1.id });
	ok(
		"return(healthy) → status available + assignee cleared",
		afterReturn.status === "available" &&
			(afterReturn as { currentAssigneeId: string | null })
				.currentAssigneeId === null
	);
	const histAfter = await admin.assets.assignments.listByAsset({
		assetId: asset1.id,
	});
	ok(
		"history preserved (row count unchanged, returnedAt set)",
		histAfter.length === histBefore.length &&
			histAfter.some((h) => (h as { returnedAt: unknown }).returnedAt != null)
	);
	await expectError(
		'return already-returned → "not currently assigned"',
		"PRECONDITION_FAILED",
		() =>
			admin.assets.assignments.return({
				assignmentId: asn1.id,
				returnCondition: "healthy",
			})
	);

	// major_damage return auto-retires
	const asset2 = await admin.assets.create({
		name: "Verify Phone",
		trackingId: `VERIFY-PHN-${Date.now()}`,
	});
	const asn2 = await admin.assets.assignments.assign({
		assetId: asset2.id,
		assignedToId: rohan.id,
	});
	await admin.assets.assignments.return({
		assignmentId: asn2.id,
		returnCondition: "major_damage",
	});
	const asset2After = await admin.assets.getById({ id: asset2.id });
	ok(
		"return(major_damage) → asset auto-retired",
		asset2After.status === "retired"
	);
	await expectError(
		'assign retired asset → "retired and cannot be assigned"',
		"PRECONDITION_FAILED",
		() =>
			admin.assets.assignments.assign({
				assetId: asset2.id,
				assignedToId: rohan.id,
			})
	);

	// retire precondition: open assignment blocks retire
	const asset3 = await admin.assets.create({
		name: "Verify Router",
		trackingId: `VERIFY-RTR-${Date.now()}`,
	});
	const asn3 = await admin.assets.assignments.assign({
		assetId: asset3.id,
		assignedToId: rohan.id,
	});
	await expectError(
		"retire with open assignment → precondition",
		"PRECONDITION_FAILED",
		() => admin.assets.retire({ id: asset3.id })
	);
	await admin.assets.assignments.return({
		assignmentId: asn3.id,
		returnCondition: "healthy",
	});
	const retired = await admin.assets.retire({ id: asset3.id });
	ok("retire after return succeeds", retired.id === asset3.id);

	// ── 4. Manager / employee lateral scope (IDOR-class) ──────────────────────
	console.log("\n4. lateral scope (manager direct-report / employee self)");
	const empOwn = await employee.assets.assignments.listByEmployee({
		employeeId: rohan.id,
	});
	ok("employee can read OWN custody", Array.isArray(empOwn));
	await expectError("employee CANNOT read another's custody", "FORBIDDEN", () =>
		employee.assets.assignments.listByEmployee({ employeeId: andre.id })
	);
	const mgrSelf = await manager.assets.assignments.listByEmployee({
		employeeId: andre.id,
	});
	ok("manager can read OWN custody", Array.isArray(mgrSelf));
	await expectError(
		"manager CANNOT read non-report custody (Rohan reports to Maya)",
		"FORBIDDEN",
		() => manager.assets.assignments.listByEmployee({ employeeId: rohan.id })
	);
	if (andreReportId) {
		const mgrReport = await manager.assets.assignments.listByEmployee({
			employeeId: andreReportId,
		});
		ok("manager CAN read direct-report custody", Array.isArray(mgrReport));
	}

	// ── 5. Requests: self-service + approval workflow + scope ─────────────────
	console.log("\n5. requests (self-service + approval + scope)");
	const selfReq = await employee.assets.requests.createSelf({
		description: "Need a docking station",
	});
	ok("employee requests.createSelf succeeds", Boolean(selfReq.id));
	const mgrSelfReq = await manager.assets.requests.createSelf({
		description: "Spare charger",
	});
	ok("manager requests.createSelf succeeds (profiled)", Boolean(mgrSelfReq.id));
	// auditor lacks asset:request → blocked at the AC gate ("Missing permission").
	await expectMessage(
		"auditor createSelf blocked at AC gate (no asset:request)",
		"asset:request",
		() => auditor.assets.requests.createSelf({ description: "x" })
	);
	// recruiter HOLDS asset:request (passes the gate) but has no employee profile
	// in this seed → the profile guard fires, NOT the permission gate. Proves the
	// grant is wired (auditor vs recruiter fail for different reasons).
	await expectMessage(
		"recruiter passes AC gate, blocked by profile guard",
		"employee profile",
		() => recruiter.assets.requests.createSelf({ description: "x" })
	);

	const empReqs = await employee.assets.requests.list({
		page: 1,
		pageSize: 100,
	});
	ok(
		"employee requests.list shows ONLY own",
		empReqs.data.every(
			(r) => (r as { employeeId: string }).employeeId === rohan.id
		),
		`${empReqs.data.length} rows`
	);
	const adminReqs = await admin.assets.requests.list({
		page: 1,
		pageSize: 100,
	});
	ok(
		"admin requests.list shows all (>= employee's)",
		adminReqs.total >= empReqs.total
	);

	await expectError(
		"employee createForEmployee(other) FORBIDDEN",
		"FORBIDDEN",
		() =>
			employee.assets.requests.createForEmployee({
				employeeId: andre.id,
				description: "x",
			})
	);
	await expectError(
		"manager createForEmployee(non-report) FORBIDDEN",
		"FORBIDDEN",
		() =>
			manager.assets.requests.createForEmployee({
				employeeId: rohan.id,
				description: "x",
			})
	);
	if (andreReportId) {
		const mgrFor = await manager.assets.requests.createForEmployee({
			employeeId: andreReportId,
			description: "Replacement keyboard",
		});
		ok("manager createForEmployee(report) succeeds", Boolean(mgrFor.id));
	}

	// approve does NOT auto-assign
	const approveReq = await employee.assets.requests.createSelf({
		description: "Monitor",
	});
	await admin.assets.requests.approve({ id: approveReq.id });
	const approved = await admin.assets.requests.getById({ id: approveReq.id });
	ok(
		"approve → status approved, no asset assigned",
		approved.status === "approved" &&
			(approved as { fulfilledAssetId: string | null }).fulfilledAssetId ===
				null
	);
	await expectError(
		"re-approve approved request → precondition",
		"PRECONDITION_FAILED",
		() => admin.assets.requests.approve({ id: approveReq.id })
	);

	// reject requires a reason
	const rejReq = await employee.assets.requests.createSelf({
		description: "x",
	});
	await expectAnyError("reject without reason → validation", () =>
		(admin.assets.requests.reject as (i: unknown) => Promise<unknown>)({
			id: rejReq.id,
		})
	);
	const rejected = await admin.assets.requests.reject({
		id: rejReq.id,
		reason: "Out of budget this quarter",
	});
	ok("reject with reason succeeds", rejected.id === rejReq.id);

	// fulfill assigns a specific asset
	const fulfillReq = await employee.assets.requests.createSelf({
		description: "Laptop please",
	});
	const fulfilAsset = await admin.assets.create({
		name: "Verify Fulfil Laptop",
		trackingId: `VERIFY-FUL-${Date.now()}`,
	});
	const fulfilled = await admin.assets.requests.fulfill({
		id: fulfillReq.id,
		assetId: fulfilAsset.id,
	});
	const fulfilAssetAfter = await admin.assets.getById({ id: fulfilAsset.id });
	ok(
		"fulfill → asset assigned to requester + request resolved",
		fulfilAssetAfter.status === "in_use" &&
			(fulfilAssetAfter as { currentAssigneeId: string | null })
				.currentAssigneeId === rohan.id &&
			Boolean(fulfilled.assignmentId)
	);

	// cancel by requester only
	const cancelReq = await employee.assets.requests.createSelf({
		description: "Cancel me",
	});
	await expectError(
		"manager cannot cancel employee's request",
		"FORBIDDEN",
		() => manager.assets.requests.cancel({ id: cancelReq.id })
	);
	const cancelled = await employee.assets.requests.cancel({ id: cancelReq.id });
	ok("requester can cancel own pending request", cancelled.id === cancelReq.id);

	// ── 6. category/asset write RBAC ──────────────────────────────────────────
	console.log("\n6. write-path RBAC");
	await expectError("employee categories.create FORBIDDEN", "FORBIDDEN", () =>
		employee.assets.categories.create({ name: "x" })
	);
	await expectError("employee assets.create FORBIDDEN", "FORBIDDEN", () =>
		employee.assets.create({ name: "x", trackingId: `Z-${Date.now()}` })
	);
	await expectError("manager assets.create FORBIDDEN", "FORBIDDEN", () =>
		manager.assets.create({ name: "x", trackingId: `Z-${Date.now()}` })
	);
	await expectError("auditor categories.archive FORBIDDEN", "FORBIDDEN", () =>
		auditor.assets.categories.archive({ id: cat.id })
	);

	console.log(`\n──────────────\nRESULT: ${pass} passed, ${fail} failed\n`);
	process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("verify failed:", err);
	process.exit(1);
});
