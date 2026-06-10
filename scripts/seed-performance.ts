// Seed Performance / PMS data for Atlas Shipping — Phase 15B.
//
// Idempotent: deletes existing performance data for the org (FK-safe order) then
// re-inserts.
//
// COORDINATION-LAYER GUARDRAIL: this seed only writes the performance tables. It
// READS one real project_task id to populate the read-only progress link on a
// key result — it NEVER writes to Projects / Payroll. Recognition points are a
// PMS-owned ledger (non-monetary), not pay.
//
// Run:  export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-performance.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { createDb } from "../packages/db/src/index";
import { organization, user } from "../packages/db/src/schema/auth";
import { employeeProfile } from "../packages/db/src/schema/hr-core";
import {
	oneOnOne,
	performanceKeyResult,
	performanceObjective,
	questionTemplate,
	recognitionPoint,
	reviewCycle,
	reviewQuestion,
	reviewRequest,
	reviewResponse,
} from "../packages/db/src/schema/performance";
import { projectTask } from "../packages/db/src/schema/projects";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();
const DAY = 24 * 60 * 60 * 1000;
const dayOffset = (n: number) => new Date(Date.now() + n * DAY);
const pad = (n: number) => String(n).padStart(6, "0");

type ObjStatus =
	| "draft"
	| "active"
	| "on_track"
	| "at_risk"
	| "behind"
	| "completed"
	| "cancelled";
type KrType = "percentage" | "number" | "currency" | "boolean";
type KrStatus = "not_started" | "on_track" | "at_risk" | "done";

interface ObjectiveDef {
	completedOffset?: number;
	description: string;
	dueOffset: number;
	employee: string;
	internalNote?: string;
	key: string;
	keyResults: {
		current: number;
		linkTask?: boolean;
		start: number;
		status: KrStatus;
		target: number;
		title: string;
		type: KrType;
	}[];
	progressPercent: number;
	startOffset: number;
	status: ObjStatus;
	title: string;
	weight: number;
}

const OBJECTIVE_DEFS: ObjectiveDef[] = [
	{
		key: "o-network",
		employee: "Andre Sealey",
		title: "Deliver the office network upgrade on schedule",
		description: "Land the core switch + Wi-Fi upgrade this quarter.",
		status: "on_track",
		weight: 40,
		startOffset: -20,
		dueOffset: 25,
		progressPercent: 60,
		internalNote: "Manager note: budget sign-off still pending from finance.",
		keyResults: [
			{
				title: "Complete the core switch rollout",
				type: "percentage",
				start: 0,
				current: 60,
				target: 100,
				status: "on_track",
				linkTask: true,
			},
			{
				title: "Keep downtime under 2 hours",
				type: "number",
				start: 0,
				current: 1,
				target: 2,
				status: "on_track",
			},
		],
	},
	{
		key: "o-cert",
		employee: "Rohan Gopaul",
		title: "Earn a networking certification",
		description: "Pass the CCNA exam to deepen routing/switching skills.",
		status: "active",
		weight: 20,
		startOffset: -10,
		dueOffset: 60,
		progressPercent: 30,
		keyResults: [
			{
				title: "Complete study modules",
				type: "percentage",
				start: 0,
				current: 30,
				target: 100,
				status: "on_track",
			},
			{
				title: "Pass the certification exam",
				type: "boolean",
				start: 0,
				current: 0,
				target: 100,
				status: "not_started",
			},
		],
	},
	{
		key: "o-payroll",
		employee: "Rohan Gopaul",
		title: "Support the payroll rollout reconciliation",
		description: "Help reconcile the parallel payroll run before go-live.",
		status: "at_risk",
		weight: 25,
		startOffset: -30,
		dueOffset: 5,
		progressPercent: 40,
		keyResults: [
			{
				title: "Reconcile parallel-run variances",
				type: "currency",
				start: 0,
				current: 4000,
				target: 10_000,
				status: "at_risk",
			},
		],
	},
	{
		key: "o-docs",
		employee: "Rohan Gopaul",
		title: "Finish the HR document digitization",
		description: "Scan and index the historical HR documents.",
		status: "completed",
		weight: 15,
		startOffset: -60,
		dueOffset: -8,
		completedOffset: -6,
		progressPercent: 100,
		keyResults: [
			{
				title: "Scan all personnel files",
				type: "percentage",
				start: 0,
				current: 100,
				target: 100,
				status: "done",
			},
		],
	},
	{
		key: "o-overdue",
		employee: "Dwayne Wilson",
		title: "Stage the CPE installation batch",
		description: "Prepare customer-premises equipment for the first batch.",
		status: "behind",
		weight: 20,
		startOffset: -15,
		dueOffset: -2,
		progressPercent: 35,
		keyResults: [
			{
				title: "Stage CPE units",
				type: "number",
				start: 0,
				current: 7,
				target: 20,
				status: "at_risk",
			},
		],
	},
	{
		key: "o-draft",
		employee: "Andre Sealey",
		title: "Draft the FY plan for the network team",
		description: "Outline next year's network roadmap.",
		status: "draft",
		weight: 10,
		startOffset: 0,
		dueOffset: 40,
		progressPercent: 0,
		keyResults: [],
	},
	{
		key: "o-cancelled",
		employee: "Dwayne Wilson",
		title: "Pilot a second vendor (cancelled)",
		description: "Evaluate an alternative CPE vendor — cancelled.",
		status: "cancelled",
		weight: 5,
		startOffset: -25,
		dueOffset: 10,
		progressPercent: 10,
		keyResults: [],
	},
];

interface QuestionDef {
	options?: string[];
	order: number;
	text: string;
	type: "text" | "rating" | "boolean" | "multi_choice" | "likert";
}

const QUESTION_DEFS: QuestionDef[] = [
	{ order: 1, text: "What did this person do well this period?", type: "text" },
	{
		order: 2,
		text: "How would you rate their overall impact?",
		type: "rating",
	},
	{
		order: 3,
		text: "Did they meet their commitments?",
		type: "boolean",
	},
	{
		order: 4,
		text: "Which strength stood out most?",
		type: "multi_choice",
		options: ["Delivery", "Collaboration", "Ownership", "Communication"],
	},
	{
		order: 5,
		text: "They communicate clearly with the team.",
		type: "likert",
	},
	{
		order: 6,
		text: "What is one thing they could improve?",
		type: "text",
	},
];

// (reviewer name, relationship, status) for the one seeded 360 subject (Rohan).
interface RequestDef {
	answered: boolean;
	relationship: "self" | "manager" | "peer" | "report";
	reviewer: string;
	status: "pending" | "in_progress" | "submitted" | "declined";
}

const SUBJECT = "Rohan Gopaul";
const REQUEST_DEFS: RequestDef[] = [
	{
		reviewer: "Rohan Gopaul",
		relationship: "self",
		status: "submitted",
		answered: true,
	},
	{
		reviewer: "Andre Sealey",
		relationship: "manager",
		status: "submitted",
		answered: true,
	},
	{
		reviewer: "Shanice Powell",
		relationship: "peer",
		status: "submitted",
		answered: true,
	},
	{
		reviewer: "Dwayne Wilson",
		relationship: "peer",
		status: "in_progress",
		answered: false,
	},
	{
		reviewer: "Maya Persaud",
		relationship: "report",
		status: "pending",
		answered: false,
	},
];

interface OneOnOneDef {
	employee: string;
	manager: string;
	privateNote?: string;
	scheduledOffset: number;
	sharedNote?: string;
	status: "scheduled" | "completed" | "cancelled";
}

const ONE_ON_ONE_DEFS: OneOnOneDef[] = [
	{
		manager: "Andre Sealey",
		employee: "Rohan Gopaul",
		scheduledOffset: -3,
		status: "completed",
		sharedNote: "Discussed the cert goal and the payroll reconciliation.",
		privateNote:
			"PRIVATE: discuss promotion readiness next cycle — not for the employee.",
	},
	{
		manager: "Andre Sealey",
		employee: "Shanice Powell",
		scheduledOffset: 4,
		status: "scheduled",
		sharedNote: "Upcoming check-in.",
	},
];

interface RecognitionDef {
	employee: string;
	objectiveKey?: string;
	points: number;
	reason: string;
	source: "manual" | "objective_completed";
}

const RECOGNITION_DEFS: RecognitionDef[] = [
	{
		employee: "Rohan Gopaul",
		points: 50,
		reason: "Completed the HR document digitization on time.",
		source: "objective_completed",
		objectiveKey: "o-docs",
	},
	{
		employee: "Shanice Powell",
		points: 20,
		reason: "Helped unblock the core-switch staging.",
		source: "manual",
	},
	{
		employee: "Andre Sealey",
		points: 30,
		reason: "Strong leadership on the network upgrade.",
		source: "manual",
	},
	{
		employee: "Dwayne Wilson",
		points: 15,
		reason: "Picked up the CPE staging at short notice.",
		source: "manual",
	},
	{
		employee: "Rohan Gopaul",
		points: 10,
		reason: "Great peer feedback this cycle.",
		source: "manual",
	},
];

async function resolveOrgId(): Promise<string> {
	const org = (
		await db
			.select()
			.from(organization)
			.where(eq(organization.slug, "atlas-shipping"))
			.limit(1)
	).at(0);
	if (!org) {
		process.stderr.write("Atlas org not found — run seed-dev.ts first.\n");
		process.exit(1);
	}
	return org.id;
}

async function resolveEmployees(orgId: string): Promise<Map<string, string>> {
	const rows = await db
		.select({
			id: employeeProfile.id,
			first: employeeProfile.firstName,
			last: employeeProfile.lastName,
		})
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.organizationId, orgId),
				eq(employeeProfile.isActive, true)
			)
		)
		.limit(40);
	const byName = new Map<string, string>();
	for (const r of rows) {
		byName.set(`${r.first}${r.last ? ` ${r.last}` : ""}`, r.id);
	}
	return byName;
}

async function resetOrg(orgId: string) {
	await db
		.delete(reviewResponse)
		.where(eq(reviewResponse.organizationId, orgId));
	await db.delete(reviewRequest).where(eq(reviewRequest.organizationId, orgId));
	await db
		.delete(reviewQuestion)
		.where(eq(reviewQuestion.organizationId, orgId));
	await db
		.delete(questionTemplate)
		.where(eq(questionTemplate.organizationId, orgId));
	await db.delete(reviewCycle).where(eq(reviewCycle.organizationId, orgId));
	await db
		.delete(recognitionPoint)
		.where(eq(recognitionPoint.organizationId, orgId));
	await db.delete(oneOnOne).where(eq(oneOnOne.organizationId, orgId));
	await db
		.delete(performanceKeyResult)
		.where(eq(performanceKeyResult.organizationId, orgId));
	await db
		.delete(performanceObjective)
		.where(eq(performanceObjective.organizationId, orgId));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one-shot seed script — sequential inserts across the 9 tables, flat not tangled
async function main() {
	const orgId = await resolveOrgId();
	const emp = await resolveEmployees(orgId);
	const empId = (name: string) => emp.get(name) ?? [...emp.values()][0];

	const userRows = await db
		.select({ id: user.id, email: user.email })
		.from(user);
	const uidByEmail = new Map(userRows.map((u) => [u.email, u.id]));
	const adminUid = uidByEmail.get("admin@atlas-shipping.com") ?? null;
	const managerUid = uidByEmail.get("manager@atlas-shipping.com") ?? null;

	const linkTaskId =
		(
			await db
				.select({ id: projectTask.id })
				.from(projectTask)
				.where(eq(projectTask.organizationId, orgId))
				.limit(1)
		).at(0)?.id ?? null;

	await resetOrg(orgId);

	// Objectives + key results.
	let objSeq = 0;
	let krLinked = false;
	const objIdByKey: Record<string, string> = {};
	for (const o of OBJECTIVE_DEFS) {
		const id = createId();
		objIdByKey[o.key] = id;
		await db.insert(performanceObjective).values({
			id,
			organizationId: orgId,
			reference: `GOAL-${pad(++objSeq)}`,
			employeeId: empId(o.employee),
			ownerUserId: managerUid,
			title: o.title,
			description: o.description,
			status: o.status,
			weight: o.weight,
			startDate: dayOffset(o.startOffset),
			dueDate: dayOffset(o.dueOffset),
			completedAt:
				o.completedOffset === undefined ? null : dayOffset(o.completedOffset),
			progressPercent: o.progressPercent,
			internalNote: o.internalNote ?? null,
			isArchived: false,
		});
		let krOrder = 0;
		for (const kr of o.keyResults) {
			const useLink = Boolean(kr.linkTask && linkTaskId && !krLinked);
			if (useLink) {
				krLinked = true;
			}
			await db.insert(performanceKeyResult).values({
				id: createId(),
				organizationId: orgId,
				objectiveId: id,
				title: kr.title,
				progressType: kr.type,
				startValue: String(kr.start),
				currentValue: String(kr.current),
				targetValue: String(kr.target),
				status: kr.status,
				linkedProjectTaskId: useLink ? linkTaskId : null,
				displayOrder: ++krOrder,
			});
		}
	}

	// Review cycle + question template + questions.
	const templateId = createId();
	await db.insert(questionTemplate).values({
		id: templateId,
		organizationId: orgId,
		name: "Quarterly 360 review",
		description: "Standard 6-question 360 review template.",
		isArchived: false,
	});
	const questionIdByOrder: Record<number, string> = {};
	for (const q of QUESTION_DEFS) {
		const qid = createId();
		questionIdByOrder[q.order] = qid;
		await db.insert(reviewQuestion).values({
			id: qid,
			organizationId: orgId,
			templateId,
			text: q.text,
			type: q.type,
			options: q.options ? q.options : null,
			displayOrder: q.order,
		});
	}

	const cycleId = createId();
	await db.insert(reviewCycle).values({
		id: cycleId,
		organizationId: orgId,
		reference: `REV-${pad(1)}`,
		name: "Q2 2026 360 review",
		description: "The active quarterly 360 cycle.",
		type: "three_sixty",
		status: "active",
		startDate: dayOffset(-14),
		endDate: dayOffset(28),
		anonymityThreshold: 3,
		isAnonymousPeers: true,
	});

	// Fan-out requests for the one subject + a few responses.
	let requestCount = 0;
	let responseCount = 0;
	for (const r of REQUEST_DEFS) {
		const reqId = createId();
		await db.insert(reviewRequest).values({
			id: reqId,
			organizationId: orgId,
			cycleId,
			subjectEmployeeId: empId(SUBJECT),
			reviewerEmployeeId: empId(r.reviewer),
			relationship: r.relationship,
			status: r.status,
			submittedAt: r.status === "submitted" ? dayOffset(-2) : null,
		});
		requestCount++;
		if (r.answered) {
			await db.insert(reviewResponse).values({
				id: createId(),
				organizationId: orgId,
				requestId: reqId,
				questionId: questionIdByOrder[1],
				answerText: "Consistently delivered and helped the team.",
			});
			await db.insert(reviewResponse).values({
				id: createId(),
				organizationId: orgId,
				requestId: reqId,
				questionId: questionIdByOrder[2],
				answerRating: 4,
			});
			responseCount += 2;
		}
	}

	// One-on-ones (one with a private manager note to prove redaction).
	let oneCount = 0;
	for (const m of ONE_ON_ONE_DEFS) {
		await db.insert(oneOnOne).values({
			id: createId(),
			organizationId: orgId,
			managerEmployeeId: empId(m.manager),
			employeeId: empId(m.employee),
			scheduledAt: dayOffset(m.scheduledOffset),
			status: m.status,
			sharedNotes: m.sharedNote ?? null,
			privateManagerNotes: m.privateNote ?? null,
		});
		oneCount++;
	}

	// Recognition points (PMS-owned ledger — non-monetary).
	let recCount = 0;
	for (const rec of RECOGNITION_DEFS) {
		await db.insert(recognitionPoint).values({
			id: createId(),
			organizationId: orgId,
			employeeId: empId(rec.employee),
			points: rec.points,
			reason: rec.reason,
			source: rec.source,
			awardedByUserId: adminUid,
			objectiveId: rec.objectiveKey
				? (objIdByKey[rec.objectiveKey] ?? null)
				: null,
		});
		recCount++;
	}

	process.stdout.write(
		`Performance seed complete: ${OBJECTIVE_DEFS.length} objectives, ` +
			`${QUESTION_DEFS.length} questions, 1 cycle, ${requestCount} requests, ` +
			`${responseCount} responses, ${oneCount} one-on-ones, ${recCount} recognition points. ` +
			`KR→task link: ${krLinked ? "yes (read-only)" : "no"}.\n`
	);
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`seed failed: ${err}\n`);
	process.exit(1);
});
