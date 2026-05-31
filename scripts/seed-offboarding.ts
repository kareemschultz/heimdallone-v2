// biome-ignore-all lint/style/noNonNullAssertion: seed script — array indices are constructed in-place and safe
// biome-ignore-all lint/performance/noNamespaceImport: seed scripts use schema-wide imports (matches seed-dev / seed-recruitment pattern)
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: a one-shot seed script is naturally one long imperative function

/**
 * Offboarding seed — Atlas Shipping demo data for the offboarding module.
 * Requires seed-dev.ts and seed-hr-core.ts to have run first.
 *
 * Creates:
 *   3 offboarding templates (Standard Resignation, Involuntary Termination,
 *     Contract End) with 8–10 template tasks each.
 *   4 offboarding cases across the lifecycle:
 *     1. pending_approval  — resignation awaiting HR approval
 *     2. in_clearance      — termination with tasks in progress
 *     3. pending_settlement — contract end, clearance complete
 *     4. closed            — completed resignation (historical)
 *   Per-case: snapshot tasks, asset returns, access revocations,
 *   document requests, exit interview (cases 3–4), activity entries.
 *
 * Usage:
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-offboarding.ts
 */

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { createDb } from "../packages/db/src/index";
import * as schema from "../packages/db/src/schema";

const db = createDb();

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (base: Date, days: number) =>
	new Date(base.getTime() + days * DAY_MS);

/** Compute a date object from a base date + offset (negative = before, positive = after) */
const lwd = (base: Date, offset: number): Date => addDays(base, offset);

type OBCategory =
	| "clearance"
	| "asset_return"
	| "access_revocation"
	| "document"
	| "handoff"
	| "exit_interview"
	| "other";

interface TaskDef {
	category: OBCategory;
	description: string;
	dueOffsetDays: number;
	required: boolean;
	role: string;
	title: string;
}

// ─── Template task definitions ────────────────────────────────────────────────

const STANDARD_RESIGNATION_TASKS: TaskDef[] = [
	{
		title: "HR exit paperwork",
		description:
			"Complete resignation acknowledgement form and update records.",
		category: "clearance",
		role: "hr",
		dueOffsetDays: -7,
		required: true,
	},
	{
		title: "Knowledge transfer document",
		description:
			"Document current work, outstanding tasks, and handoff instructions.",
		category: "handoff",
		role: "employee",
		dueOffsetDays: -5,
		required: true,
	},
	{
		title: "Manager handoff meeting",
		description: "Meet with direct manager to hand over projects and contacts.",
		category: "handoff",
		role: "manager",
		dueOffsetDays: -3,
		required: true,
	},
	{
		title: "Return company laptop",
		description: "Return assigned laptop, charger, and peripherals to IT.",
		category: "asset_return",
		role: "employee",
		dueOffsetDays: 0,
		required: true,
	},
	{
		title: "Return access badges and keys",
		description: "Return ID badge, office keys, and parking pass.",
		category: "asset_return",
		role: "employee",
		dueOffsetDays: 0,
		required: true,
	},
	{
		title: "Revoke email and system access",
		description: "Deactivate email, HRIS, and all system accounts.",
		category: "access_revocation",
		role: "it",
		dueOffsetDays: 0,
		required: true,
	},
	{
		title: "Leave balance review",
		description: "HR to review outstanding leave balance for encashment.",
		category: "clearance",
		role: "hr",
		dueOffsetDays: -2,
		required: true,
	},
	{
		title: "Loan and advance check",
		description: "Confirm outstanding loan or salary advance balances.",
		category: "clearance",
		role: "hr",
		dueOffsetDays: -3,
		required: true,
	},
	{
		title: "Exit interview",
		description:
			"Conduct exit interview with HR to capture feedback and insights.",
		category: "exit_interview",
		role: "hr",
		dueOffsetDays: -1,
		required: false,
	},
	{
		title: "Payroll final settlement confirmation",
		description:
			"Payroll confirms final salary, outstanding balances, and payment date.",
		category: "clearance",
		role: "hr",
		dueOffsetDays: 3,
		required: true,
	},
];

const INVOLUNTARY_TERMINATION_TASKS: TaskDef[] = [
	{
		title: "HR termination documentation",
		description:
			"Prepare and file termination notice, supporting documentation, and legal review.",
		category: "clearance",
		role: "hr",
		dueOffsetDays: -1,
		required: true,
	},
	{
		title: "Manager notification",
		description:
			"Direct manager briefed on termination process and transition plan.",
		category: "handoff",
		role: "manager",
		dueOffsetDays: -1,
		required: true,
	},
	{
		title: "Immediate account suspension",
		description:
			"IT suspends all accounts immediately upon termination effective date.",
		category: "access_revocation",
		role: "it",
		dueOffsetDays: 0,
		required: true,
	},
	{
		title: "Asset collection",
		description:
			"Collect all company assets — laptop, phone, access cards, keys.",
		category: "asset_return",
		role: "hr",
		dueOffsetDays: 0,
		required: true,
	},
	{
		title: "Payroll final settlement",
		description:
			"Calculate and confirm final pay including any statutory entitlements.",
		category: "clearance",
		role: "hr",
		dueOffsetDays: 2,
		required: true,
	},
	{
		title: "Departure letter issued",
		description:
			"Issue formal departure letter / experience certificate if applicable.",
		category: "document",
		role: "hr",
		dueOffsetDays: 1,
		required: true,
	},
];

const CONTRACT_END_TASKS: TaskDef[] = [
	{
		title: "Contract-end acknowledgement",
		description: "Employee and HR sign contract-end acknowledgement form.",
		category: "clearance",
		role: "hr",
		dueOffsetDays: -5,
		required: true,
	},
	{
		title: "Project handover",
		description: "Handover all ongoing projects and assignments to team.",
		category: "handoff",
		role: "employee",
		dueOffsetDays: -3,
		required: true,
	},
	{
		title: "Return equipment",
		description: "Return all company-issued equipment and assets.",
		category: "asset_return",
		role: "employee",
		dueOffsetDays: 0,
		required: true,
	},
	{
		title: "Access revocation",
		description: "Revoke all system and physical access on last day.",
		category: "access_revocation",
		role: "it",
		dueOffsetDays: 0,
		required: true,
	},
	{
		title: "Experience certificate",
		description: "Issue experience certificate within 5 days of last day.",
		category: "document",
		role: "hr",
		dueOffsetDays: 5,
		required: false,
	},
	{
		title: "Final payroll processing",
		description: "Process final payslip including any outstanding amounts.",
		category: "clearance",
		role: "hr",
		dueOffsetDays: 3,
		required: true,
	},
	{
		title: "Exit interview (optional)",
		description: "Conduct optional exit interview to gather feedback.",
		category: "exit_interview",
		role: "hr",
		dueOffsetDays: -1,
		required: false,
	},
];

// ─── Main seed function ───────────────────────────────────────────────────────

async function main() {
	// ── Look up Atlas Shipping ──────────────────────────────────────────────────
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

	// ── Fetch employees ─────────────────────────────────────────────────────────
	const employees = await db
		.select({
			id: schema.employeeProfile.id,
			firstName: schema.employeeProfile.firstName,
			lastName: schema.employeeProfile.lastName,
		})
		.from(schema.employeeProfile)
		.where(eq(schema.employeeProfile.organizationId, orgId))
		.limit(12);
	if (employees.length < 4) {
		console.error("Need at least 4 employees. Run seed-hr-core.ts first.");
		process.exit(1);
	}
	console.log(`Employees: ${employees.length} found`);

	// Use later employees in the list to avoid overlap with onboarding seed
	const caseEmployees = employees.slice(-4);
	const [emp0, emp1, emp2, emp3] = caseEmployees;

	// ── Fetch users for HR and owner ────────────────────────────────────────────
	const ownerUsers = await db
		.select()
		.from(schema.user)
		.where(eq(schema.user.email, "owner@atlas-shipping.com"))
		.limit(1);
	const hrUsers = await db
		.select()
		.from(schema.user)
		.where(eq(schema.user.email, "hr@atlas-shipping.com"))
		.limit(1);
	if (ownerUsers.length === 0 || hrUsers.length === 0) {
		console.error("Owner/HR user not found. Run seed-dev.ts first.");
		process.exit(1);
	}
	const ownerUserId = ownerUsers[0]!.id;
	const hrUserId = hrUsers[0]!.id;

	// ── Wipe existing offboarding rows (idempotent re-run) ─────────────────────
	await db
		.delete(schema.offboardingActivity)
		.where(eq(schema.offboardingActivity.organizationId, orgId));
	await db
		.delete(schema.offboardingExitInterview)
		.where(eq(schema.offboardingExitInterview.organizationId, orgId));
	await db
		.delete(schema.offboardingDocumentRequest)
		.where(eq(schema.offboardingDocumentRequest.organizationId, orgId));
	await db
		.delete(schema.offboardingAccessRevocation)
		.where(eq(schema.offboardingAccessRevocation.organizationId, orgId));
	await db
		.delete(schema.offboardingAssetReturn)
		.where(eq(schema.offboardingAssetReturn.organizationId, orgId));
	await db
		.delete(schema.offboardingTask)
		.where(eq(schema.offboardingTask.organizationId, orgId));
	await db
		.delete(schema.offboardingCase)
		.where(eq(schema.offboardingCase.organizationId, orgId));
	await db
		.delete(schema.offboardingTemplateTask)
		.where(eq(schema.offboardingTemplateTask.organizationId, orgId));
	await db
		.delete(schema.offboardingTemplate)
		.where(eq(schema.offboardingTemplate.organizationId, orgId));
	console.log("Cleared existing offboarding seed data.");

	// ════════════════════════════════════════════════════════════════════════════
	// TEMPLATES
	// ════════════════════════════════════════════════════════════════════════════

	const tmplResignId = createId();
	const tmplTerminationId = createId();
	const tmplContractEndId = createId();

	await db.insert(schema.offboardingTemplate).values([
		{
			id: tmplResignId,
			organizationId: orgId,
			name: "Standard resignation offboarding",
			description:
				"Default clearance checklist for employee-initiated resignations. Covers knowledge transfer, asset return, access removal, and final settlement.",
			exitType: "resignation",
			isActive: true,
		},
		{
			id: tmplTerminationId,
			organizationId: orgId,
			name: "Involuntary termination offboarding",
			description:
				"Streamlined checklist for employer-initiated terminations. Prioritises immediate account suspension and asset collection.",
			exitType: "involuntary",
			isActive: true,
		},
		{
			id: tmplContractEndId,
			organizationId: orgId,
			name: "Contract end offboarding",
			description:
				"Clearance checklist for fixed-term contract completions and natural contract expirations.",
			exitType: "contract_end",
			isActive: true,
		},
	]);

	// ── Template tasks ──────────────────────────────────────────────────────────

	async function insertTemplateTasks(
		templateId: string,
		tasks: TaskDef[]
	): Promise<void> {
		for (let i = 0; i < tasks.length; i++) {
			const t = tasks[i]!;
			await db.insert(schema.offboardingTemplateTask).values({
				id: createId(),
				organizationId: orgId,
				templateId,
				title: t.title,
				description: t.description,
				category: t.category,
				defaultAssigneeRole: t.role,
				dueOffsetDays: t.dueOffsetDays,
				isRequired: t.required,
				sortOrder: i,
			});
		}
	}

	await insertTemplateTasks(tmplResignId, STANDARD_RESIGNATION_TASKS);
	await insertTemplateTasks(tmplTerminationId, INVOLUNTARY_TERMINATION_TASKS);
	await insertTemplateTasks(tmplContractEndId, CONTRACT_END_TASKS);

	const [resignTasks, termTasks, contractTasks] = await Promise.all([
		db
			.select()
			.from(schema.offboardingTemplateTask)
			.where(eq(schema.offboardingTemplateTask.templateId, tmplResignId)),
		db
			.select()
			.from(schema.offboardingTemplateTask)
			.where(eq(schema.offboardingTemplateTask.templateId, tmplTerminationId)),
		db
			.select()
			.from(schema.offboardingTemplateTask)
			.where(eq(schema.offboardingTemplateTask.templateId, tmplContractEndId)),
	]);

	console.log(
		`Templates: 3 created (${resignTasks.length} + ${termTasks.length} + ${contractTasks.length} tasks)`
	);

	// ════════════════════════════════════════════════════════════════════════════
	// OFFBOARDING CASES + SNAPSHOTS
	// ════════════════════════════════════════════════════════════════════════════

	const now = new Date();

	// ─── Case 1: pending_approval — resignation submitted 3 days ago ────────────
	const case1Id = createId();
	const case1Lwd = addDays(now, 25); // LWD ~25 days from now (notice period)
	await db.insert(schema.offboardingCase).values({
		id: case1Id,
		organizationId: orgId,
		employeeId: emp0!.id,
		exitType: "resignation",
		exitReason:
			"Pursuing a new opportunity closer to home. Grateful for the experience at Atlas Shipping.",
		noticePeriodDays: 28,
		noticePeriodStartDate: now,
		lastWorkingDay: case1Lwd,
		status: "pending_approval",
		initiatedByUserId: hrUserId,
		templateId: tmplResignId,
	});

	await db.insert(schema.offboardingActivity).values({
		id: createId(),
		organizationId: orgId,
		caseId: case1Id,
		kind: "case_created",
		actorUserId: hrUserId,
		summary: `Resignation submitted by ${emp0!.firstName} ${emp0!.lastName ?? ""}. Awaiting HR approval.`,
		metadata: { exitType: "resignation" },
		createdAt: addDays(now, -3),
	});

	// ─── Case 2: in_clearance — termination, tasks underway ─────────────────────
	const case2Id = createId();
	const case2Lwd = addDays(now, 3); // LWD in 3 days
	await db.insert(schema.offboardingCase).values({
		id: case2Id,
		organizationId: orgId,
		employeeId: emp1!.id,
		exitType: "termination",
		exitReason:
			"Redundancy — role eliminated following departmental restructure.",
		noticePeriodDays: 14,
		noticePeriodStartDate: addDays(now, -11),
		lastWorkingDay: case2Lwd,
		status: "in_clearance",
		initiatedByUserId: ownerUserId,
		approvedByUserId: ownerUserId,
		approvedAt: addDays(now, -11),
		internalNote:
			"Redundancy confirmed by board. Statutory notice served. Settlement calculation in progress.",
		templateId: tmplTerminationId,
	});

	// Snapshot tasks for case 2
	for (const tt of termTasks) {
		const isDone =
			tt.title === "HR termination documentation" ||
			tt.title === "Manager notification" ||
			tt.title === "Immediate account suspension";
		await db.insert(schema.offboardingTask).values({
			id: createId(),
			organizationId: orgId,
			caseId: case2Id,
			templateTaskId: tt.id,
			titleSnapshot: tt.title,
			descriptionSnapshot: tt.description,
			category: tt.category,
			dueAt: lwd(case2Lwd, tt.dueOffsetDays),
			status: isDone ? "done" : "todo",
			completedAt: isDone ? addDays(now, -8) : null,
			completedByUserId: isDone ? hrUserId : null,
		});
	}

	// Asset returns for case 2
	await db.insert(schema.offboardingAssetReturn).values([
		{
			id: createId(),
			organizationId: orgId,
			caseId: case2Id,
			assetDescription: "Dell Latitude 5520 Laptop",
			assetTag: "ATL-LT-0042",
			expectedReturnDate: case2Lwd,
			status: "pending",
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case2Id,
			assetDescription: "Office access card #204",
			assetTag: "ATL-AC-0204",
			expectedReturnDate: case2Lwd,
			status: "pending",
		},
	]);

	// Access revocations for case 2
	await db.insert(schema.offboardingAccessRevocation).values([
		{
			id: createId(),
			organizationId: orgId,
			caseId: case2Id,
			system: "Email (Google Workspace)",
			description:
				"Disable Google account and transfer calendar/Drive ownership",
			scheduledRevokeAt: case2Lwd,
			status: "revoked",
			revokedAt: addDays(now, -11),
			revokedByUserId: hrUserId,
			note: "Account suspended immediately on termination date.",
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case2Id,
			system: "VPN",
			description: "Remove VPN certificate and user profile",
			scheduledRevokeAt: case2Lwd,
			status: "revoked",
			revokedAt: addDays(now, -11),
			revokedByUserId: hrUserId,
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case2Id,
			system: "HRIS (Heimdallone)",
			description: "Set employee inactive on last working day",
			scheduledRevokeAt: case2Lwd,
			status: "pending",
		},
	]);

	// Documents for case 2
	await db.insert(schema.offboardingDocumentRequest).values([
		{
			id: createId(),
			organizationId: orgId,
			caseId: case2Id,
			documentType: "Termination Notice",
			title: "Formal termination letter",
			requestedByUserId: hrUserId,
			status: "approved",
			uploadedAt: addDays(now, -10),
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case2Id,
			documentType: "Experience Certificate",
			title: "Employment experience certificate",
			requestedByUserId: hrUserId,
			status: "requested",
		},
	]);

	await db.insert(schema.offboardingActivity).values([
		{
			id: createId(),
			organizationId: orgId,
			caseId: case2Id,
			kind: "case_created",
			actorUserId: ownerUserId,
			summary:
				"Termination case opened following board decision on restructure.",
			metadata: { exitType: "termination" },
			createdAt: addDays(now, -11),
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case2Id,
			kind: "status_changed",
			actorUserId: ownerUserId,
			summary: "Case advanced to in_clearance. Notice period complete.",
			metadata: { from: "active", to: "in_clearance" },
			createdAt: addDays(now, -2),
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case2Id,
			kind: "task_completed",
			actorUserId: hrUserId,
			summary: "HR termination documentation completed.",
			createdAt: addDays(now, -8),
		},
	]);

	// ─── Case 3: pending_settlement — contract end, clearance done ──────────────
	const case3Id = createId();
	const case3Lwd = addDays(now, -2); // LWD was 2 days ago
	await db.insert(schema.offboardingCase).values({
		id: case3Id,
		organizationId: orgId,
		employeeId: emp2!.id,
		exitType: "contract_end",
		exitReason:
			"Fixed-term contract for Berbice Port expansion project completed as planned.",
		noticePeriodDays: 7,
		noticePeriodStartDate: addDays(now, -9),
		lastWorkingDay: case3Lwd,
		status: "pending_settlement",
		initiatedByUserId: hrUserId,
		approvedByUserId: hrUserId,
		approvedAt: addDays(now, -30),
		templateId: tmplContractEndId,
	});

	// Snapshot tasks for case 3 — most done
	for (const tt of contractTasks) {
		const isPostLwd = tt.dueOffsetDays > 0;
		const isDone = !isPostLwd;
		await db.insert(schema.offboardingTask).values({
			id: createId(),
			organizationId: orgId,
			caseId: case3Id,
			templateTaskId: tt.id,
			titleSnapshot: tt.title,
			descriptionSnapshot: tt.description,
			category: tt.category,
			dueAt: lwd(case3Lwd, tt.dueOffsetDays),
			status: isDone ? "done" : "todo",
			completedAt: isDone ? addDays(now, -3) : null,
			completedByUserId: isDone ? hrUserId : null,
		});
	}

	// Asset for case 3
	await db.insert(schema.offboardingAssetReturn).values({
		id: createId(),
		organizationId: orgId,
		caseId: case3Id,
		assetDescription: "HP EliteBook 840 Laptop",
		assetTag: "ATL-LT-0031",
		expectedReturnDate: case3Lwd,
		returnedAt: case3Lwd,
		condition: "Good — minor wear on keyboard",
		receivedByUserId: hrUserId,
		status: "returned",
	});

	// Access for case 3
	await db.insert(schema.offboardingAccessRevocation).values([
		{
			id: createId(),
			organizationId: orgId,
			caseId: case3Id,
			system: "Email (Google Workspace)",
			scheduledRevokeAt: case3Lwd,
			revokedAt: case3Lwd,
			revokedByUserId: hrUserId,
			status: "revoked",
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case3Id,
			system: "Project Management (Asana)",
			scheduledRevokeAt: case3Lwd,
			revokedAt: case3Lwd,
			revokedByUserId: hrUserId,
			status: "revoked",
		},
	]);

	// Documents for case 3
	await db.insert(schema.offboardingDocumentRequest).values([
		{
			id: createId(),
			organizationId: orgId,
			caseId: case3Id,
			documentType: "Contract Completion Letter",
			title: "Fixed-term contract completion acknowledgement",
			requestedByUserId: hrUserId,
			status: "approved",
			uploadedAt: addDays(now, -4),
			approvedByUserId: hrUserId,
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case3Id,
			documentType: "Experience Certificate",
			title: "Employment experience certificate",
			requestedByUserId: hrUserId,
			status: "uploaded",
			uploadedAt: addDays(now, -1),
		},
	]);

	// Exit interview for case 3
	await db.insert(schema.offboardingExitInterview).values({
		id: createId(),
		organizationId: orgId,
		caseId: case3Id,
		conductedByUserId: hrUserId,
		conductedAt: addDays(now, -3),
		isPrivate: false,
		overallRating: 4,
		reasonForLeaving:
			"Contract concluded naturally. Would consider returning for future project work.",
		whatWentWell: "Team collaboration and management support were excellent.",
		whatCouldImprove:
			"More structured onboarding documentation for contract roles.",
		wouldRehire: true,
		internalNotes:
			"Strong performer. Flag for re-engagement on Demerara terminal expansion.",
	});

	await db.insert(schema.offboardingActivity).values([
		{
			id: createId(),
			organizationId: orgId,
			caseId: case3Id,
			kind: "case_created",
			actorUserId: hrUserId,
			summary:
				"Contract-end offboarding initiated. 7-day notice period started.",
			createdAt: addDays(now, -9),
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case3Id,
			kind: "asset_returned",
			actorUserId: hrUserId,
			summary: "HP EliteBook 840 received in good condition.",
			createdAt: case3Lwd,
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case3Id,
			kind: "interview_recorded",
			actorUserId: hrUserId,
			summary: "Exit interview completed. Rating: 4/5. Eligible for rehire.",
			createdAt: addDays(now, -3),
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case3Id,
			kind: "status_changed",
			actorUserId: hrUserId,
			summary:
				"All clearance tasks complete. Case advanced to pending_settlement.",
			metadata: { from: "in_clearance", to: "pending_settlement" },
			createdAt: addDays(now, -1),
		},
	]);

	// ─── Case 4: closed — completed resignation (historical, ~60 days ago) ───────
	const case4Id = createId();
	const case4Lwd = addDays(now, -60);
	await db.insert(schema.offboardingCase).values({
		id: case4Id,
		organizationId: orgId,
		employeeId: emp3!.id,
		exitType: "resignation",
		exitReason:
			"Relocating to Barbados. Thank you for three great years with Atlas Shipping.",
		noticePeriodDays: 21,
		noticePeriodStartDate: addDays(case4Lwd, -21),
		lastWorkingDay: case4Lwd,
		status: "closed",
		initiatedByUserId: hrUserId,
		approvedByUserId: hrUserId,
		approvedAt: addDays(case4Lwd, -19),
		closedByUserId: hrUserId,
		closedAt: addDays(case4Lwd, 5),
		templateId: tmplResignId,
	});

	// Snapshot tasks for case 4 — all done
	for (const tt of resignTasks) {
		await db.insert(schema.offboardingTask).values({
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			templateTaskId: tt.id,
			titleSnapshot: tt.title,
			descriptionSnapshot: tt.description,
			category: tt.category,
			dueAt: lwd(case4Lwd, tt.dueOffsetDays),
			status: "done",
			completedAt: lwd(case4Lwd, tt.dueOffsetDays),
			completedByUserId: hrUserId,
		});
	}

	// Assets for case 4
	await db.insert(schema.offboardingAssetReturn).values([
		{
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			assetDescription: 'MacBook Pro 14" (M2)',
			assetTag: "ATL-LT-0018",
			expectedReturnDate: case4Lwd,
			returnedAt: case4Lwd,
			condition: "Excellent",
			receivedByUserId: hrUserId,
			status: "returned",
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			assetDescription: "iPhone 13 (company phone)",
			assetTag: "ATL-PH-0007",
			expectedReturnDate: case4Lwd,
			returnedAt: case4Lwd,
			condition: "Good",
			receivedByUserId: hrUserId,
			status: "returned",
		},
	]);

	// Access for case 4
	await db.insert(schema.offboardingAccessRevocation).values([
		{
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			system: "Email (Google Workspace)",
			revokedAt: case4Lwd,
			revokedByUserId: hrUserId,
			status: "revoked",
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			system: "Slack",
			revokedAt: case4Lwd,
			revokedByUserId: hrUserId,
			status: "revoked",
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			system: "GitHub",
			revokedAt: case4Lwd,
			revokedByUserId: hrUserId,
			status: "revoked",
		},
	]);

	// Documents for case 4
	await db.insert(schema.offboardingDocumentRequest).values([
		{
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			documentType: "Resignation Letter",
			title: "Signed resignation letter",
			requestedByUserId: hrUserId,
			status: "approved",
			uploadedAt: addDays(case4Lwd, -19),
			approvedByUserId: hrUserId,
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			documentType: "Experience Certificate",
			title: "Three-year employment certificate",
			requestedByUserId: hrUserId,
			status: "approved",
			uploadedAt: addDays(case4Lwd, 3),
			approvedByUserId: hrUserId,
		},
	]);

	// Exit interview for case 4
	await db.insert(schema.offboardingExitInterview).values({
		id: createId(),
		organizationId: orgId,
		caseId: case4Id,
		conductedByUserId: hrUserId,
		conductedAt: addDays(case4Lwd, -2),
		isPrivate: true,
		overallRating: 5,
		reasonForLeaving: "Personal — family relocation to Barbados.",
		whatWentWell:
			"Excellent team, strong management support, competitive compensation.",
		whatCouldImprove: "More remote work flexibility would help retain talent.",
		wouldRehire: true,
		internalNotes:
			"Top performer — 3-year tenure. Compensation was competitive. Left on very good terms. Consider for remote advisory / consultant engagement.",
	});

	await db.insert(schema.offboardingActivity).values([
		{
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			kind: "case_created",
			actorUserId: hrUserId,
			summary: "Resignation submitted. 21-day notice period commenced.",
			createdAt: addDays(case4Lwd, -21),
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			kind: "interview_recorded",
			actorUserId: hrUserId,
			summary: "Exit interview completed. Rating: 5/5. Eligible for rehire.",
			createdAt: addDays(case4Lwd, -2),
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			kind: "asset_returned",
			actorUserId: hrUserId,
			summary: "MacBook Pro and iPhone returned in excellent condition.",
			createdAt: case4Lwd,
		},
		{
			id: createId(),
			organizationId: orgId,
			caseId: case4Id,
			kind: "case_closed",
			actorUserId: hrUserId,
			summary:
				"Offboarding closed. Final settlement confirmed. Employee deactivated.",
			createdAt: addDays(case4Lwd, 5),
		},
	]);

	// ════════════════════════════════════════════════════════════════════════════
	// VERIFICATION COUNTS
	// ════════════════════════════════════════════════════════════════════════════

	const [
		templateCount,
		templateTaskCount,
		caseCount,
		taskCount,
		assetCount,
		accessCount,
		docCount,
		interviewCount,
		activityCount,
	] = await Promise.all([
		db
			.select()
			.from(schema.offboardingTemplate)
			.where(eq(schema.offboardingTemplate.organizationId, orgId)),
		db
			.select()
			.from(schema.offboardingTemplateTask)
			.where(eq(schema.offboardingTemplateTask.organizationId, orgId)),
		db
			.select()
			.from(schema.offboardingCase)
			.where(eq(schema.offboardingCase.organizationId, orgId)),
		db
			.select()
			.from(schema.offboardingTask)
			.where(eq(schema.offboardingTask.organizationId, orgId)),
		db
			.select()
			.from(schema.offboardingAssetReturn)
			.where(eq(schema.offboardingAssetReturn.organizationId, orgId)),
		db
			.select()
			.from(schema.offboardingAccessRevocation)
			.where(eq(schema.offboardingAccessRevocation.organizationId, orgId)),
		db
			.select()
			.from(schema.offboardingDocumentRequest)
			.where(eq(schema.offboardingDocumentRequest.organizationId, orgId)),
		db
			.select()
			.from(schema.offboardingExitInterview)
			.where(eq(schema.offboardingExitInterview.organizationId, orgId)),
		db
			.select()
			.from(schema.offboardingActivity)
			.where(eq(schema.offboardingActivity.organizationId, orgId)),
	]);

	console.log("\n✓ Offboarding seed complete:");
	console.log(`  Templates:           ${templateCount.length} (expected 3)`);
	console.log(
		`  Template tasks:      ${templateTaskCount.length} (expected ${STANDARD_RESIGNATION_TASKS.length + INVOLUNTARY_TERMINATION_TASKS.length + CONTRACT_END_TASKS.length})`
	);
	console.log(`  Cases:               ${caseCount.length} (expected 4)`);
	console.log(
		`  Case tasks:          ${taskCount.length} (expected ${termTasks.length + contractTasks.length + resignTasks.length + resignTasks.length})`
	);
	console.log(`  Asset returns:       ${assetCount.length}`);
	console.log(`  Access revocations:  ${accessCount.length}`);
	console.log(`  Document requests:   ${docCount.length}`);
	console.log(`  Exit interviews:     ${interviewCount.length} (expected 2)`);
	console.log(`  Activity entries:    ${activityCount.length}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
