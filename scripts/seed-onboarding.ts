// biome-ignore-all lint/style/noNonNullAssertion: seed script — array indices are constructed in-place and safe
// biome-ignore-all lint/performance/noNamespaceImport: seed scripts use schema-wide imports (matches seed-dev / seed-recruitment pattern)
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: a one-shot seed script is naturally one long imperative function

/**
 * Onboarding seed — Atlas Shipping demo data for the onboarding module.
 * Requires seed-dev.ts and seed-hr-core.ts to have run first.
 *
 * Creates: 3 onboarding templates (Standard / Operations / Management) with
 * template tasks, 5 employee_onboarding instances across all statuses
 * (not_started / in_progress / blocked / completed / cancelled), per-instance
 * snapshot tasks with varied statuses, document requests across the lifecycle,
 * policy acknowledgements, and timeline activities.
 *
 * Usage:
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-onboarding.ts
 */

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { createDb } from "../packages/db/src/index";
import * as schema from "../packages/db/src/schema";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (base: Date, days: number) =>
	new Date(base.getTime() + days * DAY_MS);

type Category =
	| "document"
	| "equipment"
	| "policy"
	| "training"
	| "introduction"
	| "other";

interface TaskDef {
	category: Category;
	description: string;
	dueOffsetDays: number;
	required: boolean;
	role: string;
	title: string;
}

const STANDARD_TASKS: TaskDef[] = [
	{
		title: "HR document collection",
		description: "Collect signed offer, contract, and personal details form.",
		category: "document",
		role: "hr_admin",
		dueOffsetDays: 0,
		required: true,
	},
	{
		title: "Identity documents (ID / passport / TIN / NIS)",
		description: "New hire uploads government ID, TIN and NIS numbers.",
		category: "document",
		role: "new_hire",
		dueOffsetDays: 1,
		required: true,
	},
	{
		title: "Bank details collection",
		description: "Capture bank account details for payroll.",
		category: "document",
		role: "hr_admin",
		dueOffsetDays: 1,
		required: true,
	},
	{
		title: "Code of conduct acknowledgement",
		description: "Read and acknowledge the company code of conduct.",
		category: "policy",
		role: "new_hire",
		dueOffsetDays: 2,
		required: true,
	},
	{
		title: "Safety & policy training",
		description: "Complete workplace safety and policy induction.",
		category: "training",
		role: "hr_admin",
		dueOffsetDays: 3,
		required: true,
	},
	{
		title: "IT account setup",
		description: "Provision system accounts and access.",
		category: "equipment",
		role: "it_admin",
		dueOffsetDays: 1,
		required: true,
	},
	{
		title: "Email / account creation",
		description: "Create company email and directory entry.",
		category: "other",
		role: "it_admin",
		dueOffsetDays: 1,
		required: true,
	},
	{
		title: "Equipment handover",
		description: "Issue laptop, badge, and any PPE.",
		category: "equipment",
		role: "it_admin",
		dueOffsetDays: 2,
		required: true,
	},
	{
		title: "Manager welcome meeting",
		description: "Introductory meeting with the line manager.",
		category: "introduction",
		role: "manager",
		dueOffsetDays: 1,
		required: true,
	},
	{
		title: "First-week check-in",
		description: "Manager checks in at the end of week one.",
		category: "introduction",
		role: "manager",
		dueOffsetDays: 5,
		required: false,
	},
	{
		title: "Payroll readiness checklist",
		description: "Confirm the new hire is ready for the next pay run.",
		category: "other",
		role: "hr_admin",
		dueOffsetDays: 3,
		required: true,
	},
];

const OPERATIONS_TASKS: TaskDef[] = [
	STANDARD_TASKS[0]!,
	STANDARD_TASKS[1]!,
	STANDARD_TASKS[2]!,
	{
		title: "Safety induction (yard & equipment)",
		description: "Mandatory safety induction for operations/logistics staff.",
		category: "training",
		role: "hr_admin",
		dueOffsetDays: 1,
		required: true,
	},
	{
		title: "PPE issue",
		description: "Issue personal protective equipment.",
		category: "equipment",
		role: "it_admin",
		dueOffsetDays: 1,
		required: true,
	},
	STANDARD_TASKS[8]!,
	STANDARD_TASKS[10]!,
];

const MANAGEMENT_TASKS: TaskDef[] = [
	STANDARD_TASKS[0]!,
	STANDARD_TASKS[2]!,
	STANDARD_TASKS[3]!,
	STANDARD_TASKS[5]!,
	{
		title: "Delegated approvals setup",
		description: "Configure approval authority and signing limits.",
		category: "other",
		role: "hr_admin",
		dueOffsetDays: 2,
		required: true,
	},
	{
		title: "Leadership orientation",
		description: "Orientation session on management policies and reporting.",
		category: "introduction",
		role: "manager",
		dueOffsetDays: 3,
		required: true,
	},
];

async function main() {
	console.log("\nHeimdallone Onboarding Seed");
	console.log("---");

	const orgs = await db
		.select()
		.from(schema.organization)
		.where(eq(schema.organization.slug, "atlas-shipping"))
		.limit(1);
	if (orgs.length === 0) {
		console.error("Atlas Shipping not found. Run seed-dev.ts first.");
		process.exit(1);
	}
	const orgId = orgs[0]!.id;
	console.log(`Org: Atlas Shipping (${orgId})`);

	const employees = await db
		.select({
			id: schema.employeeProfile.id,
			firstName: schema.employeeProfile.firstName,
			lastName: schema.employeeProfile.lastName,
		})
		.from(schema.employeeProfile)
		.where(eq(schema.employeeProfile.organizationId, orgId))
		.limit(12);
	if (employees.length < 5) {
		console.error("Not enough employees. Run seed-hr-core.ts first.");
		process.exit(1);
	}

	const members = await db
		.select({ userId: schema.member.userId })
		.from(schema.member)
		.where(eq(schema.member.organizationId, orgId))
		.limit(3);
	const actorUserId = members[0]?.userId ?? null;

	// ── Clean existing onboarding data (FK-safe order) ──
	const existing = await db
		.select({ id: schema.employeeOnboarding.id })
		.from(schema.employeeOnboarding)
		.where(eq(schema.employeeOnboarding.organizationId, orgId));
	for (const o of existing) {
		await db
			.delete(schema.onboardingActivity)
			.where(eq(schema.onboardingActivity.onboardingId, o.id));
		await db
			.delete(schema.onboardingAcknowledgement)
			.where(eq(schema.onboardingAcknowledgement.onboardingId, o.id));
		await db
			.delete(schema.onboardingDocumentRequest)
			.where(eq(schema.onboardingDocumentRequest.onboardingId, o.id));
		await db
			.delete(schema.onboardingTask)
			.where(eq(schema.onboardingTask.onboardingId, o.id));
	}
	await db
		.delete(schema.employeeOnboarding)
		.where(eq(schema.employeeOnboarding.organizationId, orgId));
	await db
		.delete(schema.onboardingTemplateTask)
		.where(eq(schema.onboardingTemplateTask.organizationId, orgId));
	await db
		.delete(schema.onboardingTemplate)
		.where(eq(schema.onboardingTemplate.organizationId, orgId));

	// ── Templates ──
	const templateDefs = [
		{
			name: "Standard employee onboarding",
			description: "Default onboarding for all new hires.",
			isDefault: true,
			tasks: STANDARD_TASKS,
		},
		{
			name: "Operations / logistics onboarding",
			description: "Onboarding for yard, warehouse and logistics roles.",
			isDefault: false,
			tasks: OPERATIONS_TASKS,
		},
		{
			name: "Management onboarding",
			description: "Onboarding for managers and team leads.",
			isDefault: false,
			tasks: MANAGEMENT_TASKS,
		},
	];

	const templateTaskMap = new Map<string, { id: string; def: TaskDef }[]>();
	let templateCount = 0;
	let templateTaskCount = 0;
	for (const def of templateDefs) {
		const templateId = createId();
		await db.insert(schema.onboardingTemplate).values({
			id: templateId,
			organizationId: orgId,
			name: def.name,
			description: def.description,
			isDefault: def.isDefault,
		});
		templateCount++;
		const taskRows: { id: string; def: TaskDef }[] = [];
		for (let idx = 0; idx < def.tasks.length; idx++) {
			const task = def.tasks[idx]!;
			const id = createId();
			await db.insert(schema.onboardingTemplateTask).values({
				id,
				organizationId: orgId,
				templateId,
				title: task.title,
				description: task.description,
				category: task.category,
				defaultAssigneeRole: task.role,
				dueOffsetDays: task.dueOffsetDays,
				sortOrder: idx,
				isRequired: task.required,
			});
			taskRows.push({ id, def: task });
			templateTaskCount++;
		}
		templateTaskMap.set(templateId, taskRows);
	}
	console.log(
		`${templateCount} templates, ${templateTaskCount} template tasks inserted`
	);

	const templateIds = [...templateTaskMap.keys()];
	const standardTemplateId = templateIds[0]!;

	// ── Employee onboarding instances (one per status) ──
	const now = new Date();
	const instancePlans: {
		status:
			| "not_started"
			| "in_progress"
			| "blocked"
			| "completed"
			| "cancelled";
		startedDaysAgo: number;
		taskStatuses: (
			| "todo"
			| "in_progress"
			| "waiting"
			| "completed"
			| "skipped"
			| "blocked"
		)[];
		completed: boolean;
	}[] = [
		{
			status: "not_started",
			startedDaysAgo: 0,
			taskStatuses: [],
			completed: false,
		},
		{
			status: "in_progress",
			startedDaysAgo: 4,
			taskStatuses: [
				"completed",
				"completed",
				"in_progress",
				"waiting",
				"todo",
			],
			completed: false,
		},
		{
			status: "blocked",
			startedDaysAgo: 6,
			taskStatuses: ["completed", "blocked", "todo", "todo"],
			completed: false,
		},
		{
			status: "completed",
			startedDaysAgo: 20,
			taskStatuses: ["completed", "completed", "completed", "skipped"],
			completed: true,
		},
		{
			status: "cancelled",
			startedDaysAgo: 9,
			taskStatuses: ["completed", "todo"],
			completed: false,
		},
	];

	let instanceCount = 0;
	let taskCount = 0;
	let docCount = 0;
	let ackCount = 0;
	let activityCount = 0;

	for (let i = 0; i < instancePlans.length; i++) {
		const plan = instancePlans[i]!;
		const employee = employees[i % employees.length]!;
		const onboardingId = createId();
		const startedAt = addDays(now, -plan.startedDaysAgo);
		const templateTasks = templateTaskMap.get(standardTemplateId)!;
		const maxOffset = Math.max(
			...templateTasks.map((t) => t.def.dueOffsetDays)
		);

		await db.insert(schema.employeeOnboarding).values({
			id: onboardingId,
			organizationId: orgId,
			employeeId: employee.id,
			templateId: standardTemplateId,
			startedAt,
			targetCompletionAt: addDays(startedAt, maxOffset),
			completedAt: plan.completed ? addDays(startedAt, maxOffset) : null,
			status: plan.status,
		});
		instanceCount++;

		// Snapshot template tasks into per-instance tasks.
		const assignee = employees[(i + 1) % employees.length]!;
		for (let t = 0; t < templateTasks.length; t++) {
			const src = templateTasks[t]!;
			const taskStatus =
				plan.taskStatuses.length > 0
					? (plan.taskStatuses[t % plan.taskStatuses.length] ?? "todo")
					: "todo";
			const isDone = taskStatus === "completed";
			await db.insert(schema.onboardingTask).values({
				id: createId(),
				organizationId: orgId,
				onboardingId,
				templateTaskId: src.id,
				titleSnapshot: src.def.title,
				descriptionSnapshot: src.def.description,
				category: src.def.category,
				assigneeEmployeeId:
					src.def.role === "manager" ? assignee.id : employee.id,
				assigneeUserId: null,
				dueAt: addDays(startedAt, src.def.dueOffsetDays),
				status: taskStatus,
				completedAt: isDone ? addDays(startedAt, src.def.dueOffsetDays) : null,
				completedByUserId: isDone ? actorUserId : null,
				notes:
					taskStatus === "skipped" ? "Not applicable for this hire." : null,
			});
			taskCount++;
		}

		// Document requests across the lifecycle for active/finished instances.
		if (plan.status !== "not_started") {
			const docDefs: {
				type: string;
				status: "requested" | "uploaded" | "approved" | "rejected";
			}[] = [
				{ type: "tax_id", status: "approved" },
				{ type: "bank_statement", status: "uploaded" },
				{
					type: "id_card",
					status: plan.status === "blocked" ? "rejected" : "requested",
				},
			];
			for (const d of docDefs) {
				const uploaded = d.status !== "requested";
				const reviewed = d.status === "approved" || d.status === "rejected";
				await db.insert(schema.onboardingDocumentRequest).values({
					id: createId(),
					organizationId: orgId,
					onboardingId,
					documentType: d.type,
					requiredFileTypes: ["application/pdf", "image/jpeg"],
					status: d.status,
					uploadedFileUrl: uploaded
						? "placeholder://demo-document.pdf (seeded — not a real file)"
						: null,
					uploadedAt: uploaded ? addDays(startedAt, 1) : null,
					reviewedByUserId: reviewed ? actorUserId : null,
					reviewedAt: reviewed ? addDays(startedAt, 2) : null,
					rejectionReason:
						d.status === "rejected"
							? "Document was illegible — please re-upload."
							: null,
				});
				docCount++;
			}
		}

		// Acknowledgements for in_progress + completed instances.
		if (plan.status === "in_progress" || plan.status === "completed") {
			await db.insert(schema.onboardingAcknowledgement).values({
				id: createId(),
				organizationId: orgId,
				onboardingId,
				policyName: "Code of conduct",
				policyVersion: "2026.1",
				policyUrl: "https://policies.atlas-shipping.example/code-of-conduct",
				acknowledgedAt: addDays(startedAt, 2),
				acknowledgedByUserId: actorUserId,
			});
			ackCount++;
		}

		// Timeline activities.
		const activities: { kind: string; summary: string; daysAfter: number }[] = [
			{
				kind: "onboarding_started",
				summary: "Onboarding started.",
				daysAfter: 0,
			},
		];
		if (plan.status !== "not_started") {
			activities.push(
				{
					kind: "task_completed",
					summary: "HR document collection completed.",
					daysAfter: 1,
				},
				{
					kind: "document_uploaded",
					summary: "Bank statement uploaded.",
					daysAfter: 1,
				}
			);
		}
		if (plan.status === "blocked") {
			activities.push({
				kind: "blocker_raised",
				summary: "Identity documents rejected — awaiting re-upload.",
				daysAfter: 2,
			});
		}
		if (plan.status === "completed") {
			activities.push({
				kind: "onboarding_completed",
				summary: "Onboarding completed.",
				daysAfter: 20,
			});
		}
		if (plan.status === "cancelled") {
			activities.push({
				kind: "comment",
				summary: "Onboarding cancelled — candidate did not start.",
				daysAfter: 3,
			});
		}
		for (const act of activities) {
			await db.insert(schema.onboardingActivity).values({
				id: createId(),
				organizationId: orgId,
				onboardingId,
				kind: act.kind,
				actorUserId,
				summary: act.summary,
				metadata: null,
				createdAt: addDays(startedAt, act.daysAfter),
			});
			activityCount++;
		}
	}

	console.log(`${instanceCount} employee onboardings inserted`);
	console.log(`${taskCount} onboarding tasks inserted`);
	console.log(`${docCount} document requests inserted`);
	console.log(`${ackCount} acknowledgements inserted`);
	console.log(`${activityCount} activities inserted`);
	console.log("---");
	console.log("Onboarding seed complete.");
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
