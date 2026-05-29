// biome-ignore-all lint: one-shot manual verification script for Phase 9F.
//
// Manual end-to-end check of the onboarding oRPC API against a running local
// API (:3000) + seeded data. `@orpc/client` is an apps/web dependency, so run
// the script from there (the AppRouter import is type-only and erased):
//
//   bun run dev:server                                  # API on :3000
//   bun run scripts/seed-onboarding.ts                  # fresh seed
//   cp scripts/verify-onboarding-api.ts apps/web/_v.ts \
//     && (cd apps/web && bun run _v.ts); rm apps/web/_v.ts
//
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "../packages/api/src/routers/index";

const BASE = "http://localhost:3000";
const PW = "HeimdallTest2026!";
const ORIGIN = "http://localhost:3002";

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

async function expectForbidden(label: string, fn: () => Promise<unknown>) {
	try {
		await fn();
		console.log(`  ✗ ${label}: expected FORBIDDEN but call succeeded`);
	} catch (err) {
		const code = (err as { code?: string }).code ?? "ERROR";
		console.log(`  ✓ ${label}: blocked (${code})`);
	}
}

async function main() {
	console.log("Phase 9F — onboarding API verification\n");

	const admin = makeClient(await signIn("admin@atlas-shipping.com"));

	// 1. templates.list returns 3 seeded templates
	const templates = await admin.onboarding.templates.list({});
	console.log(`1. templates.list total = ${templates.total} (expect 3)`);
	const standard = templates.data.find((t) => t.name.includes("Standard"));
	if (!standard) {
		throw new Error("Standard template not found");
	}

	// employee to onboard
	const emps = await admin.hrCore.employees.list({ page: 1, pageSize: 5 });
	const employeeId = (emps.data as { id: string }[])[0]!.id;
	const otherEmployeeId = (emps.data as { id: string }[])[1]!.id;

	// 2. start onboarding → snapshot tasks
	const started = await admin.onboarding.employeeOnboarding.start({
		employeeId,
		templateId: standard.id,
	});
	console.log(
		`2. start → onboardingId, taskCount = ${started.taskCount} (expect 11)`
	);
	const tasks = await admin.onboarding.tasks.list({ onboardingId: started.id });
	console.log(
		`   tasks.list count = ${tasks.length}; all todo = ${tasks.every((t) => t.status === "todo")}`
	);

	// 3. complete a task → status + activity
	const firstTask = tasks[0]!;
	await admin.onboarding.tasks.complete({ id: firstTask.id });
	const refetched = await admin.onboarding.tasks.getById({ id: firstTask.id });
	const activity = await admin.onboarding.activity.list({
		onboardingId: started.id,
	});
	console.log(
		`3. task after complete = ${refetched.status} (expect completed); activity kinds = ${activity.map((a) => a.kind).join(",")}`
	);

	// 4. archive template does NOT remove existing onboarding tasks
	const tmp = await admin.onboarding.templates.create({
		name: `QA Temp ${Date.now()}`,
		isDefault: false,
	});
	await admin.onboarding.templateTasks.create({
		templateId: tmp.id,
		title: "QA task",
		category: "document",
		dueOffsetDays: 0,
	});
	const tmpStart = await admin.onboarding.employeeOnboarding.start({
		employeeId: otherEmployeeId,
		templateId: tmp.id,
	});
	await admin.onboarding.templates.archive({ id: tmp.id });
	const survivingTasks = await admin.onboarding.tasks.list({
		onboardingId: tmpStart.id,
	});
	console.log(
		`4. after archiving template, onboarding tasks still present = ${survivingTasks.length} (expect >=1)`
	);
	const templatesAfter = await admin.onboarding.templates.list({});
	console.log(
		`   archived template hidden from list = ${!templatesAfter.data.some((t) => t.id === tmp.id)}`
	);

	// 5. employee self-scope
	const employeeClient = makeClient(
		await signIn("employee@atlas-shipping.com")
	);
	console.log("5. employee self-scope:");
	await expectForbidden("employee cross-employee list", () =>
		employeeClient.onboarding.employeeOnboarding.list({})
	);
	await expectForbidden("employee templates.create", () =>
		employeeClient.onboarding.templates.create({ name: "nope" })
	);

	// 6. auditor read-only
	const auditorClient = makeClient(await signIn("auditor@atlas-shipping.com"));
	console.log("6. auditor read-only:");
	const auditorTemplates = await auditorClient.onboarding.templates.list({});
	console.log(
		`  ✓ auditor templates.list works (total ${auditorTemplates.total})`
	);
	await expectForbidden("auditor templates.create", () =>
		auditorClient.onboarding.templates.create({ name: "nope" })
	);
	await expectForbidden("auditor onboarding.start", () =>
		auditorClient.onboarding.employeeOnboarding.start({
			employeeId,
			templateId: standard.id,
		})
	);

	console.log("\nVerification complete.");
	process.exit(0);
}

main().catch((err) => {
	console.error("VERIFY FAILED:", err);
	process.exit(1);
});
