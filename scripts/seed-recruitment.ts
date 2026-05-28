// biome-ignore-all lint/style/noNonNullAssertion: seed script — array indices are constructed in-place and safe
// biome-ignore-all lint/performance/noNamespaceImport: seed scripts use schema-wide imports (matches seed-dev / seed-contracts pattern)
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: a one-shot seed script is naturally one long imperative function

/**
 * Recruitment seed — Atlas Shipping demo data for the hiring pipeline.
 * Requires seed-dev.ts and seed-hr-core.ts to have run first.
 *
 * Creates: 3 requisitions, 4 job openings, 10 candidates, applications
 * spread across all stages, stage history rows, 4 interviews (mix of
 * scheduled/completed/cancelled), interview feedback rows, 2 offers,
 * candidate documents, recruitment notes.
 *
 * Usage:
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-recruitment.ts
 */

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { createDb } from "../packages/db/src/index";
import * as schema from "../packages/db/src/schema";

const db = createDb();

const PLACEHOLDER_RESUME_URL =
	"placeholder://demo-resume.pdf (seeded — not a real file)";

async function main() {
	console.log("\nHeimdallone Recruitment Seed");
	console.log("---");

	// Look up Atlas Shipping
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

	// Look up a few employees to act as requesters / hiring managers / interviewers
	const employees = await db
		.select({
			id: schema.employeeProfile.id,
			firstName: schema.employeeProfile.firstName,
			lastName: schema.employeeProfile.lastName,
		})
		.from(schema.employeeProfile)
		.where(eq(schema.employeeProfile.organizationId, orgId))
		.limit(8);
	if (employees.length < 3) {
		console.error("Not enough employees. Run seed-hr-core.ts first.");
		process.exit(1);
	}
	const [emp0, emp1, emp2] = employees;
	console.log(`Employees: ${employees.length} found`);

	// Look up departments
	const departments = await db
		.select()
		.from(schema.department)
		.where(eq(schema.department.organizationId, orgId));
	const deptByName = new Map(departments.map((d) => [d.name, d.id]));
	const opsDeptId = deptByName.get("Operations");
	const engDeptId = deptByName.get("Engineering");
	const hrDeptId = deptByName.get("Human Resources");

	// Look up positions
	const positions = await db
		.select()
		.from(schema.jobPosition)
		.where(eq(schema.jobPosition.organizationId, orgId));
	const posByName = new Map(positions.map((p) => [p.name, p.id]));
	const yardOperatorPos = posByName.get("Yard Operator");
	const juniorEngineerPos = posByName.get("Junior Engineer");
	const hrGeneralistPos = posByName.get("HR Generalist");

	// Look up owner user as recruiter / approver
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
		console.error("Owner or HR user not found. Run seed-dev.ts first.");
		process.exit(1);
	}
	const ownerUserId = ownerUsers[0]!.id;
	const hrUserId = hrUsers[0]!.id;

	// Wipe existing recruitment rows so the script is idempotent against re-runs
	await db
		.delete(schema.recruitmentNote)
		.where(eq(schema.recruitmentNote.organizationId, orgId));
	await db
		.delete(schema.candidateDocument)
		.where(eq(schema.candidateDocument.organizationId, orgId));
	await db
		.delete(schema.offerApproval)
		.where(eq(schema.offerApproval.organizationId, orgId));
	await db.delete(schema.offer).where(eq(schema.offer.organizationId, orgId));
	await db
		.delete(schema.interviewFeedback)
		.where(eq(schema.interviewFeedback.organizationId, orgId));
	await db
		.delete(schema.interview)
		.where(eq(schema.interview.organizationId, orgId));
	await db
		.delete(schema.applicationStageHistory)
		.where(eq(schema.applicationStageHistory.organizationId, orgId));
	await db
		.delete(schema.candidateApplication)
		.where(eq(schema.candidateApplication.organizationId, orgId));
	await db
		.delete(schema.candidate)
		.where(eq(schema.candidate.organizationId, orgId));
	await db
		.delete(schema.jobOpening)
		.where(eq(schema.jobOpening.organizationId, orgId));
	await db
		.delete(schema.recruitmentRequisition)
		.where(eq(schema.recruitmentRequisition.organizationId, orgId));
	console.log("Existing recruitment rows wiped (re-run safe)");

	// ───────── Requisitions (3) ─────────
	const req1Id = createId();
	const req2Id = createId();
	const req3Id = createId();
	await db.insert(schema.recruitmentRequisition).values([
		{
			id: req1Id,
			organizationId: orgId,
			title: "Two yard operators — Berbice route",
			description:
				"Q3 expansion — adding capacity at the Berbice yard to handle inland freight.",
			jobPositionId: yardOperatorPos ?? null,
			departmentId: opsDeptId ?? null,
			headcount: 2,
			requestedByEmployeeId: emp0!.id,
			status: "approved",
			approvedByUserId: ownerUserId,
			approvedAt: new Date(Date.now() - 18 * 86_400_000),
		},
		{
			id: req2Id,
			organizationId: orgId,
			title: "Junior engineer for platform team",
			description:
				"Backfill for outgoing junior engineer; full-stack TS/React.",
			jobPositionId: juniorEngineerPos ?? null,
			departmentId: engDeptId ?? null,
			headcount: 1,
			requestedByEmployeeId: emp1!.id,
			status: "pending_approval",
		},
		{
			id: req3Id,
			organizationId: orgId,
			title: "HR generalist — Georgetown",
			description: "Replacement hire; supports payroll + leave operations.",
			jobPositionId: hrGeneralistPos ?? null,
			departmentId: hrDeptId ?? null,
			headcount: 1,
			requestedByEmployeeId: emp2!.id,
			status: "approved",
			approvedByUserId: ownerUserId,
			approvedAt: new Date(Date.now() - 9 * 86_400_000),
		},
	]);
	console.log("3 requisitions inserted");

	// ───────── Job openings (4) ─────────
	const opening1Id = createId(); // open, has candidates
	const opening2Id = createId(); // open, fewer candidates
	const opening3Id = createId(); // open
	const opening4Id = createId(); // closed (historic)
	await db.insert(schema.jobOpening).values([
		{
			id: opening1Id,
			organizationId: orgId,
			requisitionId: req1Id,
			title: "Yard Operator — Berbice (FT)",
			description:
				"Full-time yard operator. Heavy-equipment certification preferred.",
			jobPositionId: yardOperatorPos ?? null,
			departmentId: opsDeptId ?? null,
			workLocation: "Berbice yard",
			employmentType: "full_time",
			vacancyCount: 2,
			hiringManagerEmployeeId: emp0!.id,
			recruiterUserId: hrUserId,
			status: "open",
			publishedAt: new Date(Date.now() - 14 * 86_400_000),
			startDate: new Date(Date.now() + 21 * 86_400_000)
				.toISOString()
				.slice(0, 10),
		},
		{
			id: opening2Id,
			organizationId: orgId,
			requisitionId: req3Id,
			title: "HR Generalist — Georgetown",
			description: "Supports payroll and leave operations. Mid-level.",
			jobPositionId: hrGeneralistPos ?? null,
			departmentId: hrDeptId ?? null,
			workLocation: "Georgetown HQ",
			employmentType: "full_time",
			vacancyCount: 1,
			hiringManagerEmployeeId: emp2!.id,
			recruiterUserId: hrUserId,
			status: "open",
			publishedAt: new Date(Date.now() - 7 * 86_400_000),
			startDate: new Date(Date.now() + 14 * 86_400_000)
				.toISOString()
				.slice(0, 10),
		},
		{
			id: opening3Id,
			organizationId: orgId,
			requisitionId: null,
			title: "Operations Coordinator (fast-track)",
			description:
				"Fast-track hire — internal recommendation; no requisition required.",
			jobPositionId: null,
			departmentId: opsDeptId ?? null,
			workLocation: "Georgetown HQ",
			employmentType: "full_time",
			vacancyCount: 1,
			hiringManagerEmployeeId: emp0!.id,
			recruiterUserId: hrUserId,
			status: "open",
			publishedAt: new Date(Date.now() - 4 * 86_400_000),
		},
		{
			id: opening4Id,
			organizationId: orgId,
			requisitionId: null,
			title: "Junior Engineer — closed posting",
			description: "Closed posting kept for analytics history.",
			jobPositionId: juniorEngineerPos ?? null,
			departmentId: engDeptId ?? null,
			workLocation: "Remote (Caribbean)",
			employmentType: "full_time",
			vacancyCount: 1,
			hiringManagerEmployeeId: emp1!.id,
			recruiterUserId: hrUserId,
			status: "closed",
			publishedAt: new Date(Date.now() - 90 * 86_400_000),
			closedAt: new Date(Date.now() - 40 * 86_400_000),
		},
	]);
	console.log("4 job openings inserted");

	// ───────── Candidates (10) ─────────
	const candidateSeed = [
		{
			firstName: "Aaliyah",
			lastName: "Lall",
			email: "aaliyah.lall@example.com",
			source: "referral" as const,
			referrer: emp0!.id,
		},
		{
			firstName: "Brandon",
			lastName: "Khan",
			email: "brandon.khan@example.com",
			source: "job_board" as const,
		},
		{
			firstName: "Cheyenne",
			lastName: "Phillips",
			email: "cheyenne.phillips@example.com",
			source: "linkedin" as const,
		},
		{
			firstName: "Devon",
			lastName: "Ramcharran",
			email: "devon.ramcharran@example.com",
			source: "agency" as const,
		},
		{
			firstName: "Elena",
			lastName: "Persaud",
			email: "elena.persaud@example.com",
			source: "direct" as const,
		},
		{
			firstName: "Franklyn",
			lastName: "Mohammed",
			email: "franklyn.mohammed@example.com",
			source: "job_board" as const,
		},
		{
			firstName: "Grace",
			lastName: "Singh",
			email: "grace.singh@example.com",
			source: "referral" as const,
			referrer: emp2!.id,
		},
		{
			firstName: "Hassan",
			lastName: "Ali",
			email: "hassan.ali@example.com",
			source: "direct" as const,
		},
		{
			firstName: "Imani",
			lastName: "Roberts",
			email: "imani.roberts@example.com",
			source: "linkedin" as const,
		},
		{
			firstName: "Jared",
			lastName: "Beckles",
			email: "jared.beckles@example.com",
			source: "job_board" as const,
		},
	];
	const candidateIds = candidateSeed.map(() => createId());
	await db.insert(schema.candidate).values(
		candidateSeed.map((c, i) => ({
			id: candidateIds[i]!,
			organizationId: orgId,
			firstName: c.firstName,
			lastName: c.lastName,
			email: c.email,
			phone: `+592-6${String(100_000 + i).padStart(6, "0")}`,
			country: "GY",
			source: c.source,
			referrerEmployeeId: ("referrer" in c ? c.referrer : null) ?? null,
			resumeUrl: PLACEHOLDER_RESUME_URL,
			status: "active" as const,
		}))
	);
	console.log(`${candidateSeed.length} candidates inserted`);

	// ───────── Applications spread across stages ─────────
	// Opening 1 (yard operator) gets 6 candidates across stages
	// Opening 2 (HR generalist) gets 3 candidates
	// Opening 4 (closed) gets 1 hired (historic)
	const applicationPlan = [
		{ candidateIdx: 0, openingId: opening1Id, stage: "interview" as const },
		{ candidateIdx: 1, openingId: opening1Id, stage: "shortlisted" as const },
		{ candidateIdx: 2, openingId: opening1Id, stage: "offer" as const },
		{ candidateIdx: 3, openingId: opening1Id, stage: "new" as const },
		{ candidateIdx: 4, openingId: opening1Id, stage: "screening" as const },
		{ candidateIdx: 5, openingId: opening1Id, stage: "rejected" as const },
		{ candidateIdx: 6, openingId: opening2Id, stage: "interview" as const },
		{ candidateIdx: 7, openingId: opening2Id, stage: "shortlisted" as const },
		{ candidateIdx: 8, openingId: opening2Id, stage: "withdrawn" as const },
		{ candidateIdx: 9, openingId: opening4Id, stage: "hired" as const },
	];
	const applicationIds = applicationPlan.map(() => createId());
	const now = Date.now();
	await db.insert(schema.candidateApplication).values(
		applicationPlan.map((a, i) => ({
			id: applicationIds[i]!,
			organizationId: orgId,
			candidateId: candidateIds[a.candidateIdx]!,
			jobOpeningId: a.openingId,
			stage: a.stage,
			stageEnteredAt: new Date(now - (5 + i) * 86_400_000),
			appliedAt: new Date(now - (10 + i * 2) * 86_400_000),
			outcomeAt:
				a.stage === "hired" || a.stage === "rejected" || a.stage === "withdrawn"
					? new Date(now - i * 86_400_000)
					: null,
			rejectedReason: a.stage === "rejected" ? "not_qualified" : null,
			withdrawnAt:
				a.stage === "withdrawn" ? new Date(now - i * 86_400_000) : null,
		}))
	);
	console.log(`${applicationPlan.length} applications inserted`);

	// ───────── Stage history (synthetic — most apps went new → screening → ...) ─────────
	const stageHistoryRows: (typeof schema.applicationStageHistory.$inferInsert)[] =
		[];
	for (let i = 0; i < applicationPlan.length; i++) {
		const a = applicationPlan[i]!;
		const appId = applicationIds[i]!;
		const path: (typeof schema.applicationStageEnum.enumValues)[number][] = (
			{
				new: ["new"],
				screening: ["new", "screening"],
				shortlisted: ["new", "screening", "shortlisted"],
				interview: ["new", "screening", "shortlisted", "interview"],
				offer: ["new", "screening", "shortlisted", "interview", "offer"],
				hired: [
					"new",
					"screening",
					"shortlisted",
					"interview",
					"offer",
					"hired",
				],
				rejected: ["new", "screening", "rejected"],
				withdrawn: ["new", "screening", "withdrawn"],
			} as const
		)[a.stage].slice();
		for (let s = 1; s < path.length; s++) {
			stageHistoryRows.push({
				id: createId(),
				organizationId: orgId,
				applicationId: appId,
				fromStage: path[s - 1]!,
				toStage: path[s]!,
				changedByUserId: hrUserId,
				changedAt: new Date(now - (path.length - s + i) * 86_400_000),
			});
		}
	}
	if (stageHistoryRows.length > 0) {
		await db.insert(schema.applicationStageHistory).values(stageHistoryRows);
	}
	console.log(`${stageHistoryRows.length} stage-history rows inserted`);

	// ───────── Interviews (4) ─────────
	const interview1Id = createId();
	const interview2Id = createId();
	const interview3Id = createId();
	const interview4Id = createId();
	await db.insert(schema.interview).values([
		{
			id: interview1Id,
			organizationId: orgId,
			applicationId: applicationIds[0]!, // Aaliyah / yard operator — interview stage
			scheduledStart: new Date(now + 2 * 86_400_000),
			scheduledEnd: new Date(now + 2 * 86_400_000 + 45 * 60_000),
			location: "Berbice yard — meeting room 1",
			interviewType: "in_person",
			interviewerEmployeeIds: [emp0!.id, emp2!.id],
			status: "scheduled",
		},
		{
			id: interview2Id,
			organizationId: orgId,
			applicationId: applicationIds[6]!, // Grace / HR generalist
			scheduledStart: new Date(now - 1 * 86_400_000),
			scheduledEnd: new Date(now - 1 * 86_400_000 + 60 * 60_000),
			location: "Video call",
			interviewType: "video",
			interviewerEmployeeIds: [emp2!.id, emp1!.id],
			status: "completed",
			notes: "Strong communication. Solid payroll background.",
		},
		{
			id: interview3Id,
			organizationId: orgId,
			applicationId: applicationIds[2]!, // Cheyenne / offer stage — already interviewed
			scheduledStart: new Date(now - 12 * 86_400_000),
			scheduledEnd: new Date(now - 12 * 86_400_000 + 60 * 60_000),
			location: "Georgetown HQ — boardroom",
			interviewType: "panel",
			interviewerEmployeeIds: [emp0!.id, emp1!.id, emp2!.id],
			status: "completed",
		},
		{
			id: interview4Id,
			organizationId: orgId,
			applicationId: applicationIds[8]!, // Imani — withdrew before interview
			scheduledStart: new Date(now - 3 * 86_400_000),
			scheduledEnd: null,
			location: "Video call",
			interviewType: "video",
			interviewerEmployeeIds: [emp2!.id],
			status: "cancelled",
			notes: "Candidate withdrew the day before.",
		},
	]);
	console.log("4 interviews inserted");

	// ───────── Interview feedback (3 rows) ─────────
	await db.insert(schema.interviewFeedback).values([
		{
			id: createId(),
			organizationId: orgId,
			interviewId: interview2Id,
			interviewerEmployeeId: emp2!.id,
			rating: 4,
			recommend: "hire",
			strengths: "Clear communicator; strong payroll experience.",
			concerns: "Limited Caribbean labour-law exposure.",
		},
		{
			id: createId(),
			organizationId: orgId,
			interviewId: interview2Id,
			interviewerEmployeeId: emp1!.id,
			rating: 5,
			recommend: "strong_hire",
			strengths: "Top of the pile so far.",
		},
		{
			id: createId(),
			organizationId: orgId,
			interviewId: interview3Id,
			interviewerEmployeeId: emp0!.id,
			rating: 5,
			recommend: "strong_hire",
			strengths: "Best yard-ops experience in the pool.",
			notes: "Move to offer.",
		},
	]);
	console.log("3 feedback rows inserted");

	// ───────── Offers (2) ─────────
	// Offer 1 for Cheyenne (yard operator) — sent + accepted
	// Offer 2 for Grace (HR generalist) — pending approval
	const offer1Id = createId();
	const offer2Id = createId();
	await db.insert(schema.offer).values([
		{
			id: offer1Id,
			organizationId: orgId,
			applicationId: applicationIds[2]!,
			status: "accepted",
			currency: "GYD",
			baseAmount: "180000.00",
			baseAmountFrequency: "monthly",
			variableAmount: "20000.00",
			startDate: new Date(now + 14 * 86_400_000).toISOString().slice(0, 10),
			expiresAt: new Date(now + 5 * 86_400_000),
			approvalRequired: true,
			approvedByUserId: ownerUserId,
			approvedAt: new Date(now - 6 * 86_400_000),
			sentAt: new Date(now - 5 * 86_400_000),
			respondedAt: new Date(now - 3 * 86_400_000),
		},
		{
			id: offer2Id,
			organizationId: orgId,
			applicationId: applicationIds[6]!, // Grace / HR generalist
			status: "pending_approval",
			currency: "GYD",
			baseAmount: "215000.00",
			baseAmountFrequency: "monthly",
			variableAmount: null,
			startDate: new Date(now + 28 * 86_400_000).toISOString().slice(0, 10),
			expiresAt: new Date(now + 10 * 86_400_000),
			approvalRequired: true,
		},
	]);
	await db.insert(schema.offerApproval).values([
		{
			id: createId(),
			organizationId: orgId,
			offerId: offer1Id,
			approverUserId: ownerUserId,
			sequence: 1,
			status: "approved",
			decidedAt: new Date(now - 6 * 86_400_000),
			comment: "Approved — within budget.",
		},
		{
			id: createId(),
			organizationId: orgId,
			offerId: offer2Id,
			approverUserId: ownerUserId,
			sequence: 1,
			status: "pending",
		},
	]);
	console.log("2 offers + 2 approvals inserted");

	// ───────── Candidate documents (resumes + 1 offer signed placeholder) ─────────
	const documentRows: (typeof schema.candidateDocument.$inferInsert)[] = [];
	for (let i = 0; i < candidateIds.length; i++) {
		documentRows.push({
			id: createId(),
			organizationId: orgId,
			candidateId: candidateIds[i]!,
			applicationId: null,
			documentType: "resume",
			fileUrl: PLACEHOLDER_RESUME_URL,
			fileName: `${candidateSeed[i]!.firstName}-${candidateSeed[i]!.lastName}-resume.pdf`,
			fileSizeBytes: 120_000 + i * 1024,
			mimeType: "application/pdf",
			uploadedByUserId: hrUserId,
		});
	}
	// Cheyenne's offer signed (her offer was accepted)
	documentRows.push({
		id: createId(),
		organizationId: orgId,
		candidateId: candidateIds[2]!,
		applicationId: applicationIds[2]!,
		documentType: "offer_signed",
		fileUrl: "placeholder://signed-offer.pdf (seeded)",
		fileName: "Cheyenne-Phillips-offer-signed.pdf",
		fileSizeBytes: 240_000,
		mimeType: "application/pdf",
		uploadedByUserId: hrUserId,
	});
	await db.insert(schema.candidateDocument).values(documentRows);
	console.log(`${documentRows.length} documents inserted`);

	// ───────── Recruitment notes ─────────
	await db.insert(schema.recruitmentNote).values([
		{
			id: createId(),
			organizationId: orgId,
			candidateId: candidateIds[0]!,
			applicationId: applicationIds[0]!,
			stage: "interview",
			authorUserId: hrUserId,
			body: "Strong yard-ops background. Bring to in-person interview at Berbice site.",
		},
		{
			id: createId(),
			organizationId: orgId,
			candidateId: candidateIds[5]!,
			applicationId: applicationIds[5]!,
			stage: "rejected",
			authorUserId: hrUserId,
			body: "Doesn't meet the heavy-equipment certification requirement. Politely declined.",
		},
		{
			id: createId(),
			organizationId: orgId,
			candidateId: candidateIds[6]!,
			applicationId: applicationIds[6]!,
			stage: "offer",
			authorUserId: ownerUserId,
			body: "Strong panel scores. Ready to extend offer at GYD 215k.",
		},
	]);
	console.log("3 recruitment notes inserted");

	console.log("\n---");
	console.log("Recruitment seed complete.");
	process.exit(0);
}

main().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
