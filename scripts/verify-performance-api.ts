// biome-ignore-all lint: one-shot manual verification script for Phase 15C.
//
// End-to-end check of the Performance oRPC API against a running local API (:3000)
// + seeded data. Highest-risk focus: private-note redaction + peer anonymity.
//
//   export $(grep -v '^#' apps/server/.env | xargs)
//   bun run scripts/seed-performance.ts        # fresh idempotent baseline
//   # restart apps/server so the NEW performance router is loaded (lesson #76)
//   cp scripts/verify-performance-api.ts apps/web/_v.ts \
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
	const hr = makeClient(await signIn("hr@atlas-shipping.com"));
	const manager = makeClient(await signIn("manager@atlas-shipping.com"));
	const employee = makeClient(await signIn("employee@atlas-shipping.com"));
	const auditor = makeClient(await signIn("auditor@atlas-shipping.com"));
	const payroll = makeClient(await signIn("payroll@atlas-shipping.com"));
	const recruiter = makeClient(await signIn("recruiter@atlas-shipping.com"));
	const pm = makeClient(await signIn("pm@atlas-shipping.com"));

	// Resolve employee ids via the objective list (HR sees all + employeeName).
	const allObjectives = (await admin.performance.objectives.list({})) as any[];
	const byEmp = (name: string) =>
		allObjectives.find((o) => o.employeeName === name)?.employeeId as string;
	const rohanId = byEmp("Rohan Gopaul");
	const andreId = byEmp("Andre Sealey");
	const rohanGoal = allObjectives.find(
		(o) => o.employeeName === "Rohan Gopaul"
	) as any;
	const andreGoal = allObjectives.find(
		(o) => o.employeeName === "Andre Sealey"
	) as any;

	console.log("\n── 1. Objective scope + IDOR ──");
	ok(
		"admin sees all 7 objectives",
		allObjectives.length === 7,
		`got ${allObjectives.length}`
	);
	const empGoals = (await employee.performance.objectives.list({
		mine: true,
	})) as any[];
	ok(
		"employee mine = own goals only (all Rohan Gopaul)",
		empGoals.length > 0 &&
			empGoals.every((o) => o.employeeName === "Rohan Gopaul"),
		`n=${empGoals.length}`
	);
	await expectError(
		"employee getById a teammate's goal → FORBIDDEN (IDOR)",
		"FORBIDDEN",
		() => employee.performance.objectives.getById({ id: andreGoal.id })
	);
	await expectAnyError("recruiter objectives.list BLOCKED (no goal AC)", () =>
		recruiter.performance.objectives.list({})
	);
	await expectAnyError(
		"project_manager objectives.list BLOCKED (no goal AC)",
		() => pm.performance.objectives.list({})
	);

	console.log("\n── 2. Read-only project-task link (the guardrail) ──");
	const rohanDetail = (await admin.performance.objectives.getById({
		id: rohanGoal.id,
	})) as any;
	// Find the network objective (has the linked KR) via admin.
	const networkGoal = allObjectives.find((o) =>
		o.title?.includes("network upgrade")
	) as any;
	const netDetail = (await admin.performance.objectives.getById({
		id: networkGoal.id,
	})) as any;
	const linkedKr = netDetail.keyResults.find((k: any) => k.linkedProjectTaskId);
	ok("a key result carries a linkedProjectTaskId", Boolean(linkedKr));
	ok(
		"linked task resolved READ-ONLY (title/status/completedAt only)",
		Boolean(linkedKr?.linkedTask?.title) &&
			"status" in (linkedKr?.linkedTask ?? {}) &&
			"completedAt" in (linkedKr?.linkedTask ?? {})
	);
	// Adding a KR with a bogus linked task → BAD_REQUEST (tenant-verified).
	await expectError(
		"add KR with cross-tenant linkedProjectTaskId → BAD_REQUEST",
		"BAD_REQUEST",
		() =>
			admin.performance.objectives.keyResults.add({
				objectiveId: networkGoal.id,
				title: "bad link",
				linkedProjectTaskId: "not-a-real-task",
			})
	);

	console.log("\n── 3. Private manager-note redaction (HIGHEST RISK) ──");
	// The seed 1-on-1 with a private note (Andre manager, Rohan employee, completed).
	const hrOneOnOnes = (await hr.performance.oneOnOnes.list({})) as any[];
	const privateMeeting = hrOneOnOnes.find((m) => m.privateManagerNotes);
	ok("HR sees a 1-on-1 with a private manager note", Boolean(privateMeeting));
	const mId = privateMeeting.id;
	const hrView = (await hr.performance.oneOnOnes.getById({ id: mId })) as any;
	ok("HR getById → private note present", Boolean(hrView.privateManagerNotes));
	const mgrView = (await manager.performance.oneOnOnes.getById({
		id: mId,
	})) as any;
	ok(
		"owning manager (Andre) getById → private note present",
		Boolean(mgrView.privateManagerNotes)
	);
	const empView = (await employee.performance.oneOnOnes.getById({
		id: mId,
	})) as any;
	ok(
		"EMPLOYEE participant getById → private note REDACTED (null)",
		empView.privateManagerNotes === null,
		`value=${empView.privateManagerNotes}`
	);
	ok(
		"employee payload does NOT contain the private probe text",
		!JSON.stringify(empView).includes("promotion readiness")
	);
	ok("employee still sees the shared note", Boolean(empView.sharedNotes));
	const audOneOnOnes = (await auditor.performance.oneOnOnes.list({})) as any[];
	const audMeeting = audOneOnOnes.find((m) => m.id === mId);
	ok(
		"auditor reads the 1-on-1 but private note REDACTED",
		Boolean(audMeeting) && audMeeting.privateManagerNotes === null
	);
	ok(
		"auditor list never leaks any private probe text",
		!JSON.stringify(audOneOnOnes).includes("promotion readiness")
	);

	console.log("\n── 4. Peer-review anonymity (HIGHEST RISK) ──");
	// Below threshold: the seed cycle (threshold 3, 1 submitted peer) → subject sees hidden.
	const cycles = (await hr.performance.reviewCycles.list({})) as any[];
	const seedCycle = cycles.find((c) => c.type === "three_sixty");
	const subjResultsBelow =
		(await employee.performance.reviewCycles.responses.results({
			cycleId: seedCycle.id,
		})) as any;
	ok(
		"subject view BELOW threshold → peers hidden",
		subjResultsBelow.peers.mode === "hidden",
		`mode=${subjResultsBelow.peers.mode}`
	);
	ok(
		"hidden peer payload contains NO reviewer names/responses",
		!JSON.stringify(subjResultsBelow.peers).match(/Shanice|Dwayne|answerText/i)
	);
	ok(
		"self/manager responses are NOT anonymised (named)",
		subjResultsBelow.named.some((n: any) => n.reviewerName)
	);
	// HR raw view sees peer identity even below threshold.
	const hrResults = (await hr.performance.reviewCycles.responses.results({
		cycleId: seedCycle.id,
		subjectEmployeeId: rohanId,
	})) as any;
	ok("HR raw view → peers mode raw", hrResults.peers.mode === "raw");

	// Above threshold: build a fresh cycle (threshold 1) via the API.
	const c2 = (await hr.performance.reviewCycles.create({
		name: "Anonymity test cycle",
		type: "three_sixty",
		anonymityThreshold: 1,
		isAnonymousPeers: true,
	})) as any;
	await hr.performance.reviewCycles.activate({ id: c2.id });
	await hr.performance.reviewCycles.requests.generate({
		cycleId: c2.id,
		subjectEmployeeId: rohanId,
		reviewers: [{ employeeId: andreId, relationship: "peer" }],
	});
	// Andre (the peer) submits.
	const andreRequests =
		(await manager.performance.reviewCycles.requests.assignedToMe({
			cycleId: c2.id,
		})) as any[];
	ok("peer reviewer sees their assigned request", andreRequests.length === 1);
	await manager.performance.reviewCycles.responses.save({
		requestId: andreRequests[0].id,
		answerText: "ANON-PROBE great teammate",
	});
	await manager.performance.reviewCycles.responses.submit({
		requestId: andreRequests[0].id,
	});
	const subjResultsAbove =
		(await employee.performance.reviewCycles.responses.results({
			cycleId: c2.id,
		})) as any;
	ok(
		"subject view AT threshold → peers aggregated",
		subjResultsAbove.peers.mode === "aggregated",
		`mode=${subjResultsAbove.peers.mode}`
	);
	ok(
		"aggregated peer payload has the response but NO reviewer name",
		JSON.stringify(subjResultsAbove.peers).includes("ANON-PROBE") &&
			!JSON.stringify(subjResultsAbove.peers).includes("Andre Sealey")
	);
	const hrResultsAbove = (await hr.performance.reviewCycles.responses.results({
		cycleId: c2.id,
		subjectEmployeeId: rohanId,
	})) as any;
	ok(
		"HR raw view of the same cycle DOES show the reviewer name",
		JSON.stringify(hrResultsAbove.peers).includes("Andre Sealey")
	);

	console.log("\n── 5. Review submit scope ──");
	await expectError(
		"employee submits a request NOT theirs → FORBIDDEN",
		"FORBIDDEN",
		() =>
			employee.performance.reviewCycles.responses.submit({
				requestId: andreRequests[0].id,
			})
	);

	console.log("\n── 6. Recognition is a ledger, not pay ──");
	const empRec = (await employee.performance.recognition.list({
		mine: true,
	})) as any[];
	ok("employee sees own recognition", empRec.length > 0);
	ok(
		"recognition rows carry points + isPay:false, NO money field",
		empRec.every(
			(r) =>
				typeof r.points === "number" &&
				r.isPay === false &&
				!("amount" in r || "currency" in r || "salary" in r || "pay" in r)
		)
	);
	const award = (await hr.performance.recognition.award({
		employeeId: rohanId,
		points: 25,
		reason: "Verify award",
	})) as any;
	ok("HR can award recognition", Boolean(award.id));
	await expectAnyError(
		"employee cannot award recognition (no recognition:award)",
		() =>
			employee.performance.recognition.award({
				employeeId: andreId,
				points: 10,
				reason: "nope",
			})
	);
	await expectAnyError(
		"recruiter cannot award/read recognition (no recognition AC)",
		() => recruiter.performance.recognition.list({})
	);
	const payRec = (await payroll.performance.recognition.list({})) as any[];
	ok("payroll can READ recognition (recognition:read)", Array.isArray(payRec));
	await expectAnyError("payroll cannot AWARD recognition", () =>
		payroll.performance.recognition.award({
			employeeId: rohanId,
			points: 5,
			reason: "nope",
		})
	);

	console.log("\n── 7. Objective complete scope ──");
	// employee completes own draft/active goal; admin completes any.
	const ownActive = empGoals.find(
		(o) => !["completed", "cancelled"].includes(o.status)
	);
	if (ownActive) {
		await employee.performance.objectives.complete({ id: ownActive.id });
		ok("employee completes own goal", true);
		// 15H: an on-time completion auto-awards a NON-MONETARY recognition point.
		const recAfter = (await employee.performance.recognition.list({})) as any[];
		const autoAward = recAfter.find(
			(r) =>
				r.objectiveId === ownActive.id && r.source === "objective_completed"
		);
		ok(
			"on-time goal completion auto-awards recognition (objective_completed, non-pay)",
			Boolean(autoAward) && autoAward.isPay === false,
			autoAward ? `pts=${autoAward.points}` : "none"
		);
	}
	await expectError(
		"employee complete a teammate's goal → FORBIDDEN",
		"FORBIDDEN",
		() => employee.performance.objectives.complete({ id: andreGoal.id })
	);

	console.log("\n── 8. Activity reads shared audit_event ──");
	const activity = (await hr.performance.activity.list({})) as any[];
	ok(
		"HR activity.list returns audit events",
		Array.isArray(activity) && activity.length > 0,
		`n=${activity.length}`
	);
	await expectError(
		"employee activity.list → FORBIDDEN (management read)",
		"FORBIDDEN",
		() => employee.performance.activity.list({})
	);

	console.log(`\n══ RESULT: ${pass} passed, ${fail} failed ══`);
	process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error("verify crashed:", err);
	process.exit(1);
});
