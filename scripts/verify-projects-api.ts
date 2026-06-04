// biome-ignore-all lint: one-shot manual verification script for Phase 14C.
//
// End-to-end check of the Projects oRPC API against a running local API (:3000)
// + seeded data. `@orpc/client` is an apps/web dependency, so run from there
// (the AppRouter import is type-only and erased):
//
//   export $(grep -v '^#' apps/server/.env | xargs)
//   bun run scripts/seed-projects.ts        # fresh, idempotent baseline
//   bun run scripts/seed-pm-user.ts         # ensure the project_manager user
//   # restart apps/server so the NEW projects router is loaded (lesson #76)
//   cp scripts/verify-projects-api.ts apps/web/_v.ts \
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

async function main() {
	const admin = makeClient(await signIn("admin@atlas-shipping.com"));
	const pm = makeClient(await signIn("pm@atlas-shipping.com"));
	const manager = makeClient(await signIn("manager@atlas-shipping.com"));
	const employee = makeClient(await signIn("employee@atlas-shipping.com"));
	const auditor = makeClient(await signIn("auditor@atlas-shipping.com"));
	const payroll = makeClient(await signIn("payroll@atlas-shipping.com"));
	const recruiter = makeClient(await signIn("recruiter@atlas-shipping.com"));

	// Resolve project ids by reference (admin sees all).
	const allProjects = await admin.projects.list({});
	const byRef = new Map(allProjects.map((p: any) => [p.reference, p]));
	const network = byRef.get("PRJ-000001")!;
	const wifi = byRef.get("PRJ-000002")!;
	const payrollProj = byRef.get("PRJ-000003")!;
	const docs = byRef.get("PRJ-000004")!;
	const cpe = byRef.get("PRJ-000005")!;

	// Resolve task ids by reference (admin sees all tasks).
	const allTasks = await admin.projects.tasks.list({ limit: 200 });
	const taskByRef = new Map(allTasks.map((t: any) => [t.reference, t]));
	const t2 = taskByRef.get("TSK-000002")!; // network, assignee Marcus, linked asset, internal comment
	const t3 = taskByRef.get("TSK-000003")!; // network, assignee Rohan (employee@)
	const t4 = taskByRef.get("TSK-000004")!; // network, linked helpdesk ticket
	const t8 = taskByRef.get("TSK-000008")!; // wifi, unassigned

	console.log("\n── 1. List scope ──");
	ok(
		"admin list = 5 active projects",
		allProjects.length === 5,
		`got ${allProjects.length}`
	);
	ok(
		"pm (project_manager) list = 5 (sees all)",
		(await pm.projects.list({})).length === 5
	);
	ok("auditor list = 5", (await auditor.projects.list({})).length === 5);
	ok("payroll list = 5", (await payroll.projects.list({})).length === 5);
	const mgrList = await manager.projects.list({});
	ok(
		"manager list is SCOPED (< 5, includes network he leads)",
		mgrList.length < 5 &&
			mgrList.some((p: any) => p.reference === "PRJ-000001"),
		`got ${mgrList.length}`
	);
	const empList = await employee.projects.list({});
	const empRefs = new Set(empList.map((p: any) => p.reference));
	ok(
		"employee list = member projects only (network/payroll/docs)",
		empRefs.has("PRJ-000001") &&
			empRefs.has("PRJ-000003") &&
			empRefs.has("PRJ-000004") &&
			!empRefs.has("PRJ-000002") &&
			!empRefs.has("PRJ-000005"),
		`refs=${[...empRefs].join(",")}`
	);
	await expectAnyError("recruiter list BLOCKED (no project AC)", () =>
		recruiter.projects.list({})
	);

	console.log("\n── 2. Budget finance-redaction ──");
	await admin.projects.update({ id: network.id, budget: "50000.00" });
	const adminNet = await admin.projects.getById({ id: network.id });
	ok(
		"admin sees budget + canViewBudget",
		adminNet.budget === "50000.00" && adminNet.canViewBudget === true,
		`budget=${adminNet.budget}`
	);
	const audNet = await auditor.projects.getById({ id: network.id });
	ok(
		"auditor sees budget",
		audNet.budget === "50000.00" && audNet.canViewBudget === true
	);
	const payNet = await payroll.projects.getById({ id: network.id });
	ok(
		"payroll sees budget",
		payNet.budget === "50000.00" && payNet.canViewBudget === true
	);
	const pmNet = await pm.projects.getById({ id: network.id });
	ok(
		"project_manager budget REDACTED (null, canViewBudget false)",
		pmNet.budget === null && pmNet.canViewBudget === false,
		`budget=${pmNet.budget}`
	);
	const mgrNet = await manager.projects.getById({ id: network.id });
	ok(
		"manager budget REDACTED",
		mgrNet.budget === null && mgrNet.canViewBudget === false
	);
	const empNet = await employee.projects.getById({ id: network.id });
	ok(
		"employee budget REDACTED",
		empNet.budget === null && empNet.canViewBudget === false
	);

	console.log("\n── 3. IDOR no-leak (employee) ──");
	await expectError("employee getById(wifi) FORBIDDEN", "FORBIDDEN", () =>
		employee.projects.getById({ id: wifi.id })
	);
	await expectError("employee getById(cpe) FORBIDDEN", "FORBIDDEN", () =>
		employee.projects.getById({ id: cpe.id })
	);

	console.log("\n── 4. Derived health (never stored) ──");
	const payHealth = (await admin.projects.getById({ id: payrollProj.id }))
		.health;
	ok(
		"payroll project health = off_track (missed milestone)",
		payHealth === "off_track",
		`got ${payHealth}`
	);
	const docsHealth = (await admin.projects.getById({ id: docs.id })).health;
	ok(
		"completed project health = completed",
		docsHealth === "completed",
		`got ${docsHealth}`
	);
	ok(
		"network health is tracked (on_track/at_risk)",
		["on_track", "at_risk"].includes(adminNet.health),
		`got ${adminNet.health}`
	);

	console.log("\n── 5. Create + reference allocation ──");
	const created = await admin.projects.create({ name: "Verify Project A" });
	ok(
		"admin create → PRJ-000006",
		created.reference === "PRJ-000006",
		created.reference
	);
	const pmCreated = await pm.projects.create({ name: "Verify Project B" });
	ok(
		"project_manager create → PRJ-000007",
		pmCreated.reference === "PRJ-000007",
		pmCreated.reference
	);
	await expectAnyError("manager create project BLOCKED", () =>
		manager.projects.create({ name: "Nope" })
	);
	await expectAnyError("employee create project BLOCKED", () =>
		employee.projects.create({ name: "Nope" })
	);

	console.log("\n── 6. Members ──");
	const members = await admin.projects.members.list({ projectId: network.id });
	ok(
		"admin members.list(network) ≥ 2 + has a lead",
		members.length >= 2 && members.some((m: any) => m.role === "lead"),
		`n=${members.length}`
	);
	// Add Dwayne (not yet a network member) then remove.
	const dwayne = (
		allTasks.find((t: any) => t.assigneeName === "Dwayne Wilson") as any
	)?.assigneeEmployeeId;
	if (dwayne) {
		const added = await admin.projects.members.add({
			projectId: network.id,
			employeeId: dwayne,
		});
		ok("admin members.add → ok", Boolean(added.id));
		await expectError("duplicate member → CONFLICT", "CONFLICT", () =>
			admin.projects.members.add({ projectId: network.id, employeeId: dwayne })
		);
		await expectAnyError("manager members.add BLOCKED", () =>
			manager.projects.members.add({
				projectId: network.id,
				employeeId: dwayne,
			})
		);
		await admin.projects.members.remove({
			projectId: network.id,
			memberId: added.id,
		});
		ok("admin members.remove → ok", true);
	}

	console.log("\n── 7. Milestones ──");
	ok(
		"admin milestones.list(network) = 3",
		(await admin.projects.milestones.list({ projectId: network.id })).length ===
			3
	);
	const ms = await admin.projects.milestones.create({
		projectId: network.id,
		name: "Verify Milestone",
	});
	ok("admin milestones.create → ok", Boolean(ms.id));
	await expectAnyError(
		"manager milestones.create BLOCKED (no project:update)",
		() =>
			manager.projects.milestones.create({
				projectId: network.id,
				name: "Nope",
			})
	);
	await admin.projects.milestones.complete({ id: ms.id });
	ok("admin milestones.complete → ok", true);

	console.log("\n── 8. Tasks ──");
	ok(
		"admin tasks.list(network) = 7",
		(await admin.projects.tasks.list({ projectId: network.id })).length === 7
	);
	const mine = await employee.projects.tasks.list({ mine: true });
	ok(
		"employee tasks.list(mine) all assigned to Rohan",
		mine.length > 0 &&
			mine.every((t: any) => t.assigneeName === "Rohan Gopaul"),
		`n=${mine.length}`
	);
	const t2Detail = await admin.projects.tasks.getById({ id: t2.id });
	ok(
		"task getById resolves read-only linked ASSET (context)",
		t2Detail.linked.some((l: any) => l.kind === "asset" && l.label),
		JSON.stringify(t2Detail.linked)
	);
	const t4Detail = await admin.projects.tasks.getById({ id: t4.id });
	ok(
		"task getById resolves linked HELPDESK ref",
		t4Detail.linked.some((l: any) => l.kind === "helpdesk_request"),
		JSON.stringify(t4Detail.linked)
	);
	const taskCreated = await admin.projects.tasks.create({
		projectId: network.id,
		title: "Verify Task A",
	});
	ok(
		"admin tasks.create → TSK-000026",
		taskCreated.reference === "TSK-000026",
		taskCreated.reference
	);
	await expectAnyError("manager tasks.create BLOCKED (no task:create)", () =>
		manager.projects.tasks.create({ projectId: network.id, title: "Nope" })
	);
	await expectAnyError("employee tasks.create BLOCKED", () =>
		employee.projects.tasks.create({ projectId: network.id, title: "Nope" })
	);
	// changeStatus self-scope
	await employee.projects.tasks.changeStatus({
		id: t3.id,
		status: "in_progress",
	});
	ok("employee changeStatus OWN task → ok", true);
	await expectError(
		"employee changeStatus NON-own task FORBIDDEN",
		"FORBIDDEN",
		() =>
			employee.projects.tasks.changeStatus({ id: t2.id, status: "in_progress" })
	);
	await manager.projects.tasks.changeStatus({
		id: t2.id,
		status: "in_progress",
	});
	ok("manager changeStatus any network task → ok", true);
	// assign
	await admin.projects.tasks.assign({
		id: t8.id,
		assigneeEmployeeId: mine[0].assigneeEmployeeId,
	});
	ok("admin tasks.assign → ok", true);
	await expectAnyError("employee tasks.assign BLOCKED", () =>
		employee.projects.tasks.assign({
			id: t8.id,
			assigneeEmployeeId: mine[0].assigneeEmployeeId,
		})
	);

	console.log("\n── 9. Task comments + internal redaction (THE guardrail) ──");
	const adminComments = await admin.projects.tasks.comments.list({
		taskId: t2.id,
	});
	ok(
		"admin sees internal note on t2",
		adminComments.some((c: any) => c.isInternal),
		`n=${adminComments.length}`
	);
	ok(
		"pm sees internal note",
		(await pm.projects.tasks.comments.list({ taskId: t2.id })).some(
			(c: any) => c.isInternal
		)
	);
	ok(
		"auditor sees internal note",
		(await auditor.projects.tasks.comments.list({ taskId: t2.id })).some(
			(c: any) => c.isInternal
		)
	);
	const mgrComments = await manager.projects.tasks.comments.list({
		taskId: t2.id,
	});
	ok(
		"manager internal note REDACTED",
		mgrComments.length > 0 && mgrComments.every((c: any) => !c.isInternal)
	);
	const empComments = await employee.projects.tasks.comments.list({
		taskId: t2.id,
	});
	ok(
		"employee internal note REDACTED",
		empComments.every((c: any) => !c.isInternal)
	);
	ok(
		"payroll internal note REDACTED",
		(await payroll.projects.tasks.comments.list({ taskId: t2.id })).every(
			(c: any) => !c.isInternal
		)
	);
	await employee.projects.tasks.comments.create({
		taskId: t3.id,
		body: "Working on the VLANs.",
	});
	ok("employee public comment → ok", true);
	await expectError(
		"employee createInternal FORBIDDEN (handler redaction gate)",
		"FORBIDDEN",
		() =>
			employee.projects.tasks.comments.createInternal({
				taskId: t3.id,
				body: "secret",
			})
	);
	await expectError("manager createInternal FORBIDDEN", "FORBIDDEN", () =>
		manager.projects.tasks.comments.createInternal({
			taskId: t3.id,
			body: "secret",
		})
	);
	const pmInternal = await pm.projects.tasks.comments.createInternal({
		taskId: t3.id,
		body: "PM internal note",
	});
	ok("project_manager createInternal → ok", Boolean(pmInternal.id));

	console.log("\n── 10. Time entries: self-scope + approval ──");
	const te = await employee.projects.timeEntries.create({
		projectId: network.id,
		taskId: t3.id,
		entryDate: new Date().toISOString().slice(0, 10),
		minutes: 90,
	});
	ok("employee timeEntries.create (own) → ok", Boolean(te.id));
	const myTime = await employee.projects.timeEntries.list({ mine: true });
	ok(
		"employee time list(mine) all Rohan",
		myTime.length > 0 &&
			myTime.every((e: any) => e.employeeName === "Rohan Gopaul")
	);
	await employee.projects.timeEntries.submit({ id: te.id });
	ok("employee submit own draft → ok", true);
	await expectAnyError("employee approve BLOCKED (no time_entry:approve)", () =>
		employee.projects.timeEntries.approve({ id: te.id })
	);
	await manager.projects.timeEntries.approve({ id: te.id });
	ok("manager approve (network visible to PM-manager) → ok", true);
	// reject path: a fresh submitted entry
	const te2 = await employee.projects.timeEntries.create({
		projectId: network.id,
		taskId: t3.id,
		entryDate: new Date().toISOString().slice(0, 10),
		minutes: 30,
	});
	await employee.projects.timeEntries.submit({ id: te2.id });
	await pm.projects.timeEntries.reject({
		id: te2.id,
		reason: "Please split by task.",
	});
	ok("project_manager reject with reason → ok", true);
	await expectError(
		"approve a non-submitted entry → PRECONDITION_FAILED",
		"PRECONDITION_FAILED",
		() => manager.projects.timeEntries.approve({ id: te2.id })
	);
	// A seeded time entry NOT owned by Rohan (e.g. Marcus on the network project).
	const allTime = await admin.projects.timeEntries.list({ limit: 200 });
	const othersEntry = allTime.find(
		(e: any) => e.employeeName !== "Rohan Gopaul"
	);
	if (othersEntry) {
		await expectError(
			"employee edit ANOTHER's entry FORBIDDEN",
			"FORBIDDEN",
			() =>
				employee.projects.timeEntries.update({ id: othersEntry.id, minutes: 5 })
		);
	}

	console.log("\n── 11. Cross-module guardrail: link is read-only ──");
	// The linked asset id on t2 is resolved read-only; verify it is unchanged after
	// task mutations (no Projects op ever writes Assets). We re-read the task and
	// confirm the linkedAssetId is intact.
	const t2After = await admin.projects.tasks.getById({ id: t2.id });
	ok(
		"linkedAssetId intact after task mutations (never mutated)",
		t2After.linkedAssetId === t2Detail.linkedAssetId &&
			Boolean(t2After.linkedAssetId)
	);

	console.log(`\n══ RESULT: ${pass} passed, ${fail} failed ══`);
	process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error("verify crashed:", err);
	process.exit(1);
});
