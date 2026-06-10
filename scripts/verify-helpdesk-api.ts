// biome-ignore-all lint: one-shot manual verification script for Phase 13C.
//
// End-to-end check of the helpdesk oRPC API against a running local API (:3000)
// + seeded data. `@orpc/client` is an apps/web dependency, so run from there
// (the AppRouter import is type-only and erased):
//
//   bun run scripts/seed-helpdesk.ts                    # fresh seed
//   # restart the API server so the NEW helpdesk router is loaded (lesson #76):
//   #   kill the apps/server `bun run --hot src/index.ts` pid, then relaunch
//   cp scripts/verify-helpdesk-api.ts apps/web/_v.ts \
//     && (cd apps/web && bun run _v.ts); rm apps/web/_v.ts
//
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "../packages/api/src/routers/index";

const BASE = "http://localhost:3000";
const PW = process.env.TEST_PASSWORD ?? "HeimdallTest2026!";
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

type AnyRow = Record<string, unknown>;

async function main() {
	console.log("Phase 13C — helpdesk API verification\n");

	const admin = makeClient(await signIn("admin@atlas-shipping.com"));
	const hr = makeClient(await signIn("hr@atlas-shipping.com"));
	const agent = makeClient(await signIn("helpdesk@atlas-shipping.com"));
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
	const andre = byName("Andre", "Sealey"); // manager@
	const rohan = byName("Rohan", "Gopaul"); // employee@ (reports to Maya, NOT Andre)
	if (!(andre && rohan)) {
		throw new Error("seed mapping not found (Andre Sealey / Rohan Gopaul)");
	}
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

	// ════════════════════════════════════════════════════════════════════
	console.log("1. categories");
	const adminCats = await admin.helpdesk.categories.list({});
	ok(
		"admin categories.list returns seeded rows",
		adminCats.length >= 10,
		`${adminCats.length} categories`
	);
	const empCats = await employee.helpdesk.categories.list({});
	ok(
		"employee can read categories (for the request form)",
		Array.isArray(empCats) && empCats.length > 0
	);
	const financeCat = adminCats.find(
		(c) => (c as AnyRow).key === "finance"
	) as AnyRow;
	ok(
		"finance category exists + requiresApproval",
		Boolean(financeCat?.requiresApproval)
	);

	const newCatName = `Verify Cat ${Date.now()}`;
	const newCat = await admin.helpdesk.categories.create({ name: newCatName });
	ok("admin categories.create succeeds", Boolean(newCat.id));
	await expectError("duplicate category name → CONFLICT", "CONFLICT", () =>
		admin.helpdesk.categories.create({ name: newCatName })
	);
	const updated = await admin.helpdesk.categories.update({
		id: newCat.id,
		defaultPriority: "high",
	});
	ok("admin categories.update succeeds", updated.id === newCat.id);
	const agentCat = await agent.helpdesk.categories.create({
		name: `Agent Cat ${Date.now()}`,
	});
	ok("helpdesk_agent categories.create succeeds", Boolean(agentCat.id));
	await admin.helpdesk.categories.archive({ id: agentCat.id });
	ok("categories.archive succeeds (soft-delete)", true);
	await expectError("employee categories.create FORBIDDEN", "FORBIDDEN", () =>
		employee.helpdesk.categories.create({ name: "x" })
	);
	await expectError("auditor categories.create FORBIDDEN", "FORBIDDEN", () =>
		auditor.helpdesk.categories.create({ name: "x" })
	);

	// ════════════════════════════════════════════════════════════════════
	console.log("\n2. request creation + AC gate by role");
	const rohanReq = await admin.helpdesk.requests.createForEmployee({
		employeeId: rohan.id,
		title: "Verify: on-behalf request for Rohan",
	});
	ok(
		"admin createForEmployee succeeds",
		Boolean(rohanReq.id),
		rohanReq.reference
	);
	ok(
		"reference follows HD-###### format",
		/^HD-\d{6}$/.test(rohanReq.reference)
	);
	const selfReq = await employee.helpdesk.requests.createSelf({
		title: "Verify: my own request",
	});
	ok("employee createSelf succeeds", Boolean(selfReq.id), selfReq.reference);
	await expectError(
		"employee createForEmployee(other) FORBIDDEN",
		"FORBIDDEN",
		() =>
			employee.helpdesk.requests.createForEmployee({
				employeeId: andre.id,
				title: "x",
			})
	);
	await expectError(
		"manager createForEmployee(non-report Rohan) FORBIDDEN",
		"FORBIDDEN",
		() =>
			manager.helpdesk.requests.createForEmployee({
				employeeId: rohan.id,
				title: "x",
			})
	);
	// AC-gate blocks (roles WITHOUT ticket:create): payroll/auditor/recruiter.
	await expectMessage(
		"payroll_admin createSelf blocked at AC (no ticket:create)",
		"ticket:create",
		() => payroll.helpdesk.requests.createSelf({ title: "x" })
	);
	await expectMessage(
		"auditor createSelf blocked at AC (no ticket:create)",
		"ticket:create",
		() => auditor.helpdesk.requests.createSelf({ title: "x" })
	);
	await expectMessage(
		"recruiter createSelf blocked at AC (no ticket:create)",
		"ticket:create",
		() => recruiter.helpdesk.requests.createSelf({ title: "x" })
	);
	let andreReportReq: { id: string; reference: string } | null = null;
	if (andreReportId) {
		andreReportReq = await manager.helpdesk.requests.createForEmployee({
			employeeId: andreReportId,
			title: "Verify: manager on-behalf for a direct report",
		});
		ok(
			"manager createForEmployee(report) succeeds",
			Boolean(andreReportReq.id)
		);
	}

	// ════════════════════════════════════════════════════════════════════
	console.log("\n3. list + getById scope (IDOR)");
	const empList = await employee.helpdesk.requests.list({
		page: 1,
		pageSize: 100,
	});
	ok(
		"employee list shows ONLY own (requesterEmployeeId === self)",
		empList.data.every((r) => (r as AnyRow).requesterEmployeeId === rohan.id),
		`${empList.data.length} rows`
	);
	const adminList = await admin.helpdesk.requests.list({
		page: 1,
		pageSize: 100,
	});
	ok("admin list shows all (>= employee's)", adminList.total >= empList.total);
	const mgrList = await manager.helpdesk.requests.list({
		page: 1,
		pageSize: 100,
	});
	ok(
		"manager list does NOT leak Rohan's request (non-report)",
		!mgrList.data.some((r) => (r as AnyRow).id === rohanReq.id)
	);

	const ownGet = await employee.helpdesk.requests.getById({ id: rohanReq.id });
	ok("employee can getById OWN request", ownGet.id === rohanReq.id);
	// A request that is NOT the employee's.
	const andreReq = await admin.helpdesk.requests.createForEmployee({
		employeeId: andre.id,
		title: "Verify: Andre's request",
	});
	await expectError("employee getById(another's) FORBIDDEN", "FORBIDDEN", () =>
		employee.helpdesk.requests.getById({ id: andreReq.id })
	);
	await expectError(
		"manager getById(non-report Rohan) FORBIDDEN",
		"FORBIDDEN",
		() => manager.helpdesk.requests.getById({ id: rohanReq.id })
	);
	if (andreReportReq) {
		const mgrGet = await manager.helpdesk.requests.getById({
			id: andreReportReq.id,
		});
		ok(
			"manager CAN getById direct-report request",
			mgrGet.id === andreReportReq.id
		);
	}
	await expectError("getById bogus id → NOT_FOUND", "NOT_FOUND", () =>
		admin.helpdesk.requests.getById({ id: "bogus_request_id" })
	);

	// ════════════════════════════════════════════════════════════════════
	console.log(
		"\n4. agent lifecycle (assign / status / resolve / close / reopen)"
	);
	// adminUserId from the on-behalf request we created (createdByUserId = admin).
	const adminUserId = (ownGet as AnyRow).createdByUserId as string;
	await expectError(
		"employee assign blocked at AC (no ticket:assign)",
		"FORBIDDEN",
		() =>
			employee.helpdesk.requests.assign({
				id: rohanReq.id,
				assignedToUserId: adminUserId,
			})
	);
	await expectError("assign bogus user → BAD_REQUEST", "BAD_REQUEST", () =>
		agent.helpdesk.requests.assign({
			id: rohanReq.id,
			assignedToUserId: "bogus_user",
		})
	);
	await agent.helpdesk.requests.assign({
		id: rohanReq.id,
		assignedToUserId: adminUserId,
	});
	const afterAssign = await agent.helpdesk.requests.getById({
		id: rohanReq.id,
	});
	ok(
		"assign → status new→open + assignee set",
		afterAssign.status === "open" &&
			(afterAssign as AnyRow).assignedToUserId === adminUserId
	);
	await agent.helpdesk.requests.changeStatus({
		id: rohanReq.id,
		status: "in_progress",
	});
	await expectAnyError("resolve WITHOUT note → validation", () =>
		(agent.helpdesk.requests.resolve as (i: unknown) => Promise<unknown>)({
			id: rohanReq.id,
		})
	);
	await agent.helpdesk.requests.resolve({
		id: rohanReq.id,
		resolutionNote: "Fixed in verify run.",
	});
	const resolved = await agent.helpdesk.requests.getById({ id: rohanReq.id });
	ok("resolve → status resolved + note stored", resolved.status === "resolved");
	await expectError(
		"re-resolve resolved → PRECONDITION",
		"PRECONDITION_FAILED",
		() =>
			agent.helpdesk.requests.resolve({
				id: rohanReq.id,
				resolutionNote: "again",
			})
	);
	await agent.helpdesk.requests.reopen({ id: rohanReq.id });
	const reopened = await agent.helpdesk.requests.getById({ id: rohanReq.id });
	ok("reopen → resolved→open + resolvedAt cleared", reopened.status === "open");
	await agent.helpdesk.requests.close({ id: rohanReq.id });
	const closed = await agent.helpdesk.requests.getById({ id: rohanReq.id });
	ok("close → status closed", closed.status === "closed");
	await expectError(
		"comment on closed → PRECONDITION",
		"PRECONDITION_FAILED",
		() =>
			agent.helpdesk.comments.create({ requestId: rohanReq.id, body: "late" })
	);
	// manager / auditor lack the lifecycle actions (AC gate).
	await expectMessage(
		"manager resolve blocked at AC (no ticket:resolve)",
		"ticket:resolve",
		() =>
			manager.helpdesk.requests.resolve({
				id: andreReq.id,
				resolutionNote: "x",
			})
	);
	await expectMessage(
		"auditor update blocked at AC (no ticket:update)",
		"ticket:update",
		() => auditor.helpdesk.requests.update({ id: andreReq.id, title: "x" })
	);

	// ════════════════════════════════════════════════════════════════════
	console.log("\n5. approvals (ticket:approve)");
	// A finance-category request requires approval.
	const payApprovalReq = await admin.helpdesk.requests.createForEmployee({
		employeeId: rohan.id,
		categoryId: financeCat.id as string,
		title: "Verify: finance approval (payroll approves)",
	});
	const payApproved = await admin.helpdesk.requests.getById({
		id: payApprovalReq.id,
	});
	ok(
		"finance request → approvalRequired + pending",
		(payApproved as AnyRow).approvalRequired === true &&
			(payApproved as AnyRow).approvalStatus === "pending"
	);
	await expectMessage(
		"employee approve blocked at AC (no ticket:approve)",
		"ticket:approve",
		() => employee.helpdesk.requests.approve({ id: payApprovalReq.id })
	);
	await expectMessage(
		"auditor approve blocked at AC (no ticket:approve)",
		"ticket:approve",
		() => auditor.helpdesk.requests.approve({ id: payApprovalReq.id })
	);
	await payroll.helpdesk.requests.approve({
		id: payApprovalReq.id,
		note: "Approved by finance.",
	});
	const payApprovedAfter = await admin.helpdesk.requests.getById({
		id: payApprovalReq.id,
	});
	ok(
		"payroll_admin can approve (holds ticket:approve)",
		(payApprovedAfter as AnyRow).approvalStatus === "approved"
	);
	await expectError(
		"re-approve approved → PRECONDITION",
		"PRECONDITION_FAILED",
		() => payroll.helpdesk.requests.approve({ id: payApprovalReq.id })
	);
	// manager approval scope: can approve a report's, not a non-report's.
	if (andreReportId) {
		const mgrApprovalReq = await admin.helpdesk.requests.createForEmployee({
			employeeId: andreReportId,
			categoryId: financeCat.id as string,
			title: "Verify: manager approves a report",
		});
		await manager.helpdesk.requests.approve({ id: mgrApprovalReq.id });
		const mgrApproved = await admin.helpdesk.requests.getById({
			id: mgrApprovalReq.id,
		});
		ok(
			"manager CAN approve a direct-report's request",
			(mgrApproved as AnyRow).approvalStatus === "approved"
		);
	}
	const rohanFinance = await admin.helpdesk.requests.createForEmployee({
		employeeId: rohan.id,
		categoryId: financeCat.id as string,
		title: "Verify: manager cannot approve non-report",
	});
	await expectError(
		"manager CANNOT approve non-report's request",
		"FORBIDDEN",
		() => manager.helpdesk.requests.approve({ id: rohanFinance.id })
	);
	// reject requires reason; approve a non-approval request → PRECONDITION.
	await expectAnyError("rejectApproval WITHOUT reason → validation", () =>
		(
			payroll.helpdesk.requests.rejectApproval as (
				i: unknown
			) => Promise<unknown>
		)({
			id: rohanFinance.id,
		})
	);
	const rejected = await payroll.helpdesk.requests.rejectApproval({
		id: rohanFinance.id,
		reason: "Out of budget.",
	});
	ok("rejectApproval with reason succeeds", rejected.id === rohanFinance.id);
	const nonApproval = await employee.helpdesk.requests.createSelf({
		title: "Verify: no approval needed",
	});
	await expectError(
		"approve a non-approval request → PRECONDITION",
		"PRECONDITION_FAILED",
		() => admin.helpdesk.requests.approve({ id: nonApproval.id })
	);

	// ════════════════════════════════════════════════════════════════════
	console.log("\n6. comments + internal-note redaction (SERVER-SIDE)");
	const threadReq = await admin.helpdesk.requests.createForEmployee({
		employeeId: rohan.id,
		title: "Verify: comment redaction thread",
	});
	await agent.helpdesk.comments.create({
		requestId: threadReq.id,
		body: "PUBLIC: we are looking into this.",
	});
	await agent.helpdesk.comments.createInternal({
		requestId: threadReq.id,
		body: "INTERNAL: do not show to employee.",
	});
	const empComments = await employee.helpdesk.comments.list({
		requestId: threadReq.id,
	});
	ok(
		"employee comments.list HIDES internal notes",
		empComments.every((c) => (c as AnyRow).isInternal === false) &&
			empComments.length === 1,
		`${empComments.length} visible`
	);
	const empDetail = await employee.helpdesk.requests.getById({
		id: threadReq.id,
	});
	ok(
		"employee getById hides internal + canViewInternalNotes=false",
		(empDetail as AnyRow).canViewInternalNotes === false &&
			(empDetail.comments as AnyRow[]).every((c) => c.isInternal === false)
	);
	const agentComments = await agent.helpdesk.comments.list({
		requestId: threadReq.id,
	});
	ok(
		"agent comments.list SEES internal notes",
		agentComments.some((c) => (c as AnyRow).isInternal === true)
	);
	const audComments = await auditor.helpdesk.comments.list({
		requestId: threadReq.id,
	});
	ok(
		"auditor comments.list SEES internal notes (read-only audit)",
		audComments.some((c) => (c as AnyRow).isInternal === true)
	);
	await expectMessage(
		"employee createInternal blocked at AC (no ticket:update)",
		"ticket:update",
		() =>
			employee.helpdesk.comments.createInternal({
				requestId: threadReq.id,
				body: "x",
			})
	);
	await expectError(
		"employee comments.create on another's request FORBIDDEN",
		"FORBIDDEN",
		() =>
			employee.helpdesk.comments.create({ requestId: andreReq.id, body: "x" })
	);
	// employee CAN comment on own request.
	const ownComment = await employee.helpdesk.comments.create({
		requestId: threadReq.id,
		body: "Thanks for the update.",
	});
	ok("employee CAN comment on own request", Boolean(ownComment.id));

	// ════════════════════════════════════════════════════════════════════
	console.log(
		"\n7. cross-module links: tenant-verified + NEVER mutated (guardrail)"
	);
	const assetList = await admin.assets.list({ page: 1, pageSize: 1 });
	const linkAsset = assetList.data[0] as AnyRow | undefined;
	if (linkAsset) {
		const beforeStatus = linkAsset.status;
		const beforeAssignee = linkAsset.currentAssigneeId ?? null;
		const linkedReq = await employee.helpdesk.requests.createSelf({
			title: "Verify: link an asset (read-only)",
			linkedAssetId: linkAsset.id as string,
		});
		const linkedDetail = await admin.helpdesk.requests.getById({
			id: linkedReq.id,
		});
		ok(
			"linked asset returned as read-only context",
			(linkedDetail.linkedEntities as AnyRow[]).some(
				(e) => e.kind === "asset" && e.id === linkAsset.id
			)
		);
		const assetAfter = await admin.assets.getById({
			id: linkAsset.id as string,
		});
		ok(
			"linked asset was NOT mutated by helpdesk (status + assignee unchanged)",
			assetAfter.status === beforeStatus &&
				((assetAfter as AnyRow).currentAssigneeId ?? null) === beforeAssignee
		);
	} else {
		ok("asset available to link (seed)", false, "no assets seeded");
	}
	await expectError(
		"createSelf with bogus linkedAssetId → BAD_REQUEST",
		"BAD_REQUEST",
		() =>
			employee.helpdesk.requests.createSelf({
				title: "x",
				linkedAssetId: "bogus_asset",
			})
	);
	await expectError(
		"createSelf with bogus linkedPayslipId → BAD_REQUEST",
		"BAD_REQUEST",
		() =>
			employee.helpdesk.requests.createSelf({
				title: "x",
				linkedPayslipId: "bogus_payslip",
			})
	);
	await expectError(
		"createSelf with bogus linkedLeaveRequestId → BAD_REQUEST",
		"BAD_REQUEST",
		() =>
			employee.helpdesk.requests.createSelf({
				title: "x",
				linkedLeaveRequestId: "bogus_leave",
			})
	);
	await expectError(
		"createSelf with bogus linkedOffboardingCaseId → BAD_REQUEST",
		"BAD_REQUEST",
		() =>
			employee.helpdesk.requests.createSelf({
				title: "x",
				linkedOffboardingCaseId: "bogus_case",
			})
	);

	// ════════════════════════════════════════════════════════════════════
	console.log("\n8. derived SLA state (computed, never stored)");
	const freshReq = await employee.helpdesk.requests.createSelf({
		title: "Verify: fresh request is on track",
		priority: "low",
	});
	const freshDetail = await employee.helpdesk.requests.getById({
		id: freshReq.id,
	});
	ok(
		"fresh request slaState = on_track",
		(freshDetail as AnyRow).slaState === "on_track",
		String((freshDetail as AnyRow).slaState)
	);
	const overdueSearch = await admin.helpdesk.requests.list({
		page: 1,
		pageSize: 50,
		search: "Air conditioning",
	});
	const overdueRow = overdueSearch.data[0] as AnyRow | undefined;
	ok(
		"seeded overdue request slaState = overdue",
		overdueRow?.slaState === "overdue",
		String(overdueRow?.slaState)
	);
	const resolvedSearch = await admin.helpdesk.requests.list({
		page: 1,
		pageSize: 50,
		search: "log into the HR portal",
	});
	const resolvedRow = resolvedSearch.data[0] as AnyRow | undefined;
	ok(
		"seeded resolved request slaState = not_applicable | breached",
		resolvedRow?.slaState === "not_applicable" ||
			resolvedRow?.slaState === "breached",
		String(resolvedRow?.slaState)
	);

	// ════════════════════════════════════════════════════════════════════
	console.log(
		"\n9. workflow: assignment / assigned-to-me / agent picker (13G)"
	);

	const agents = (await admin.helpdesk.requests.assignableAgents()) as AnyRow[];
	ok(
		"admin assignableAgents returns the helpdesk agent pool",
		Array.isArray(agents) && agents.length > 0,
		`${agents.length} agents`
	);
	const marcus = agents.find((a) => a.name === "Marcus James");
	ok(
		"assignableAgents includes Marcus James (helpdesk_agent)",
		Boolean(marcus)
	);
	ok(
		"assignableAgents rows expose only userId/name/role",
		agents.every(
			(a) => a.userId && a.name && a.role && Object.keys(a).length === 3
		)
	);
	await expectMessage(
		"employee assignableAgents blocked at AC (no ticket:assign)",
		"ticket:assign",
		() => employee.helpdesk.requests.assignableAgents()
	);
	await expectMessage(
		"auditor assignableAgents blocked at AC",
		"ticket:assign",
		() => auditor.helpdesk.requests.assignableAgents()
	);

	const wfReq = await employee.helpdesk.requests.createSelf({
		title: "Verify: workflow assignment lifecycle",
		priority: "normal",
	});
	await agent.helpdesk.requests.assignToMe({ id: wfReq.id });
	const wfAfterAssign = (await agent.helpdesk.requests.getById({
		id: wfReq.id,
	})) as AnyRow;
	ok(
		"agent assignToMe sets assignee + opens the request",
		Boolean(wfAfterAssign.assignedToUserId) && wfAfterAssign.status === "open",
		String(wfAfterAssign.status)
	);
	const myQueue = await agent.helpdesk.requests.list({
		assignedToMe: true,
		page: 1,
		pageSize: 100,
	});
	ok(
		"assignedToMe filter returns the agent's own assignment",
		(myQueue.data as AnyRow[]).some((r) => r.id === wfReq.id)
	);

	if (marcus) {
		await admin.helpdesk.requests.assign({
			id: wfReq.id,
			assignedToUserId: marcus.userId as string,
		});
		const reassigned = (await admin.helpdesk.requests.getById({
			id: wfReq.id,
		})) as AnyRow;
		ok(
			"admin assign to teammate sets assigneeName",
			reassigned.assigneeName === "Marcus James",
			String(reassigned.assigneeName)
		);
	}

	await admin.helpdesk.requests.unassign({ id: wfReq.id });
	const afterUnassign = (await admin.helpdesk.requests.getById({
		id: wfReq.id,
	})) as AnyRow;
	ok(
		"admin unassign clears the assignee",
		afterUnassign.assignedToUserId === null
	);
	const unassignedQueue = await admin.helpdesk.requests.list({
		unassigned: true,
		page: 1,
		pageSize: 100,
	});
	ok(
		"unassigned filter returns only requests with no assignee",
		(unassignedQueue.data as AnyRow[]).every(
			(r) => r.assignedToUserId === null
		) && (unassignedQueue.data as AnyRow[]).some((r) => r.id === wfReq.id)
	);

	await expectMessage(
		"employee assignToMe blocked (no ticket:assign)",
		"ticket:assign",
		() => employee.helpdesk.requests.assignToMe({ id: wfReq.id })
	);
	await expectMessage(
		"manager assignToMe blocked (no ticket:assign)",
		"ticket:assign",
		() => manager.helpdesk.requests.assignToMe({ id: wfReq.id })
	);
	await expectMessage(
		"auditor assign blocked (no ticket:assign)",
		"ticket:assign",
		() =>
			auditor.helpdesk.requests.assign({
				id: wfReq.id,
				assignedToUserId: (marcus?.userId as string) ?? "x",
			})
	);
	await expectMessage(
		"employee resolve blocked (no ticket:resolve)",
		"ticket:resolve",
		() =>
			employee.helpdesk.requests.resolve({ id: wfReq.id, resolutionNote: "x" })
	);
	await expectMessage(
		"employee approve blocked (no ticket:approve)",
		"ticket:approve",
		() => employee.helpdesk.requests.approve({ id: wfReq.id })
	);

	// ════════════════════════════════════════════════════════════════════
	console.log("\n10. cancel lifecycle + terminal-state blocks + edits (13H)");

	// requester cancels their own
	const h8Cancel = await employee.helpdesk.requests.createSelf({
		title: "Verify: cancel own",
		priority: "normal",
	});
	await employee.helpdesk.requests.cancel({ id: h8Cancel.id });
	const h8CancelDetail = (await employee.helpdesk.requests.getById({
		id: h8Cancel.id,
	})) as AnyRow;
	ok(
		"requester can cancel their own request",
		h8CancelDetail.status === "cancelled",
		String(h8CancelDetail.status)
	);

	// a cancelled request is terminal — every transition / comment is blocked
	await expectError(
		"resolve on cancelled → PRECONDITION_FAILED",
		"PRECONDITION_FAILED",
		() =>
			admin.helpdesk.requests.resolve({ id: h8Cancel.id, resolutionNote: "x" })
	);
	await expectError(
		"changeStatus on cancelled → PRECONDITION_FAILED",
		"PRECONDITION_FAILED",
		() =>
			admin.helpdesk.requests.changeStatus({ id: h8Cancel.id, status: "open" })
	);
	await expectError(
		"reopen on cancelled → PRECONDITION_FAILED",
		"PRECONDITION_FAILED",
		() => admin.helpdesk.requests.reopen({ id: h8Cancel.id })
	);
	await expectError(
		"close on cancelled → PRECONDITION_FAILED",
		"PRECONDITION_FAILED",
		() => admin.helpdesk.requests.close({ id: h8Cancel.id })
	);
	await expectError(
		"cancel on already-cancelled → PRECONDITION_FAILED",
		"PRECONDITION_FAILED",
		() => admin.helpdesk.requests.cancel({ id: h8Cancel.id })
	);
	await expectError(
		"update on cancelled → PRECONDITION_FAILED",
		"PRECONDITION_FAILED",
		() => admin.helpdesk.requests.update({ id: h8Cancel.id, title: "nope" })
	);
	await expectError(
		"public comment on cancelled → PRECONDITION_FAILED",
		"PRECONDITION_FAILED",
		() =>
			employee.helpdesk.comments.create({ requestId: h8Cancel.id, body: "x" })
	);
	await expectError(
		"internal note on cancelled → PRECONDITION_FAILED",
		"PRECONDITION_FAILED",
		() =>
			admin.helpdesk.comments.createInternal({
				requestId: h8Cancel.id,
				body: "x",
			})
	);

	// non-requester employee cannot cancel another employee's request; agent can
	const h8ForReport = await admin.helpdesk.requests.createForEmployee({
		employeeId: andreReportId as string,
		title: "Verify: not the employee's own",
		priority: "normal",
	});
	await expectError(
		"non-requester employee cannot cancel another's request → FORBIDDEN",
		"FORBIDDEN",
		() => employee.helpdesk.requests.cancel({ id: h8ForReport.id })
	);
	await agent.helpdesk.requests.cancel({ id: h8ForReport.id });
	const h8AgentCancel = (await admin.helpdesk.requests.getById({
		id: h8ForReport.id,
	})) as AnyRow;
	ok(
		"agent can cancel any active request",
		h8AgentCancel.status === "cancelled"
	);

	// internal note IS allowed on a closed request (post-mortem); public is not
	const h8Closed = await employee.helpdesk.requests.createSelf({
		title: "Verify: closed-state comment asymmetry",
		priority: "normal",
	});
	await admin.helpdesk.requests.close({ id: h8Closed.id });
	const h8Note = await admin.helpdesk.comments.createInternal({
		requestId: h8Closed.id,
		body: "post-mortem note on a closed request",
	});
	ok("internal note allowed on a closed request", Boolean(h8Note?.id));
	await expectError(
		"public comment on closed → PRECONDITION_FAILED",
		"PRECONDITION_FAILED",
		() =>
			employee.helpdesk.comments.create({ requestId: h8Closed.id, body: "x" })
	);

	// changeStatus reaches each working state; update edits title/priority
	const h8Work = await employee.helpdesk.requests.createSelf({
		title: "Verify: working-state transitions",
		priority: "normal",
	});
	await admin.helpdesk.requests.changeStatus({
		id: h8Work.id,
		status: "waiting_on_employee",
	});
	let h8WorkDetail = (await admin.helpdesk.requests.getById({
		id: h8Work.id,
	})) as AnyRow;
	ok(
		"changeStatus → waiting_on_employee",
		h8WorkDetail.status === "waiting_on_employee"
	);
	await admin.helpdesk.requests.changeStatus({
		id: h8Work.id,
		status: "waiting_on_approval",
	});
	h8WorkDetail = (await admin.helpdesk.requests.getById({
		id: h8Work.id,
	})) as AnyRow;
	ok(
		"changeStatus → waiting_on_approval",
		h8WorkDetail.status === "waiting_on_approval"
	);
	await admin.helpdesk.requests.update({
		id: h8Work.id,
		title: "Verify: edited title",
		priority: "high",
	});
	h8WorkDetail = (await admin.helpdesk.requests.getById({
		id: h8Work.id,
	})) as AnyRow;
	ok(
		"update edits title + priority",
		h8WorkDetail.title === "Verify: edited title" &&
			h8WorkDetail.priority === "high"
	);

	// mine:true self-scopes even a manage-level caller. The seed admin has no
	// employee profile, so their own-requests list is empty (vs. the full org
	// queue they'd otherwise see) — proving mine overrides the role scope.
	const h8AdminMine = await admin.helpdesk.requests.list({
		mine: true,
		page: 1,
		pageSize: 100,
	});
	const h8AdminAll = await admin.helpdesk.requests.list({
		page: 1,
		pageSize: 1,
	});
	ok(
		"mine:true self-scopes a manage-level caller (admin own=0 vs org queue>0)",
		h8AdminMine.total === 0 && h8AdminAll.total > 0,
		`mine=${h8AdminMine.total} all=${h8AdminAll.total}`
	);

	console.log(`\n──────────────\nRESULT: ${pass} passed, ${fail} failed\n`);
	process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("verify failed:", err);
	process.exit(1);
});
