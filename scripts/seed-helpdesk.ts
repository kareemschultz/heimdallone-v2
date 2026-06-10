// Seed Helpdesk / Requests data for Atlas Shipping — Phase 13B.
//
// Idempotent: deletes existing helpdesk data for the org (comments → requests →
// categories, FK-safe order) then re-inserts. Links to REAL rows from other
// modules (asset/payslip/leave/attendance/offboarding) for context only — the
// helpdesk never mutates those modules (the guardrail).
//
// Run:  export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-helpdesk.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { createDb } from "../packages/db/src/index";
import { asset } from "../packages/db/src/schema/assets";
import { attendanceRecord } from "../packages/db/src/schema/attendance";
import { organization, user } from "../packages/db/src/schema/auth";
import {
	helpdeskCategory,
	helpdeskRequest,
	helpdeskRequestComment,
} from "../packages/db/src/schema/helpdesk";
import { employeeProfile } from "../packages/db/src/schema/hr-core";
import { leaveRequest } from "../packages/db/src/schema/leave";
import { offboardingCase } from "../packages/db/src/schema/offboarding";
import { payslip } from "../packages/db/src/schema/payroll";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const from = (ms: number) => new Date(Date.now() + ms);

type Priority = "low" | "normal" | "high" | "urgent";
type RequestStatus =
	| "new"
	| "open"
	| "in_progress"
	| "waiting_on_employee"
	| "waiting_on_approval"
	| "resolved"
	| "closed"
	| "cancelled";
type ApprovalStatus = "none" | "pending" | "approved" | "rejected";
type LinkedEntityType =
	| "document"
	| "project_task"
	| "expense"
	| "crm_case"
	| "other";

interface ReqSeed {
	approvalRequired?: boolean;
	approvalStatus?: ApprovalStatus;
	approvedBy?: string | null;
	assignedTo?: string | null;
	category: string;
	description: string;
	firstRespondedAt?: Date | null;
	firstResponseDueAt?: Date | null;
	key: string; // local handle
	linkedAssetId?: string | null;
	linkedAttendanceRecordId?: string | null;
	linkedEntityId?: string | null;
	linkedEntityType?: LinkedEntityType | null;
	linkedLeaveRequestId?: string | null;
	linkedOffboardingCaseId?: string | null;
	linkedPayslipId?: string | null;
	priority: Priority;
	requester: string;
	resolutionDueAt?: Date | null;
	resolutionNote?: string | null;
	resolvedAt?: Date | null;
	status: RequestStatus;
	title: string;
}

interface SeedContext {
	emp: string[];
	employeeUser: string | null;
	helpdeskUser: string | null;
	hrUser: string | null;
	links: {
		asset: string | null;
		payslip: string | null;
		leave: string | null;
		attendance: string | null;
		offboarding: string | null;
	};
	orgId: string;
}

async function firstId<T extends { id: string }>(
	rows: Promise<T[]>
): Promise<string | null> {
	return (await rows).at(0)?.id ?? null;
}

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

async function resolveEmployees(orgId: string): Promise<string[]> {
	const employees = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.organizationId, orgId),
				eq(employeeProfile.isActive, true)
			)
		)
		.limit(8);
	if (employees.length < 6) {
		process.stderr.write("Not enough active employees — run seed-dev.ts.\n");
		process.exit(1);
	}
	return employees.map((e) => e.id);
}

async function resolveLinks(orgId: string): Promise<SeedContext["links"]> {
	const [linkAsset, linkPayslip, linkLeave, linkAttendance, linkOffboarding] =
		await Promise.all([
			firstId(
				db
					.select({ id: asset.id })
					.from(asset)
					.where(eq(asset.organizationId, orgId))
					.limit(1)
			),
			firstId(
				db
					.select({ id: payslip.id })
					.from(payslip)
					.where(eq(payslip.organizationId, orgId))
					.limit(1)
			),
			firstId(
				db
					.select({ id: leaveRequest.id })
					.from(leaveRequest)
					.where(eq(leaveRequest.organizationId, orgId))
					.limit(1)
			),
			firstId(
				db
					.select({ id: attendanceRecord.id })
					.from(attendanceRecord)
					.where(eq(attendanceRecord.organizationId, orgId))
					.limit(1)
			),
			firstId(
				db
					.select({ id: offboardingCase.id })
					.from(offboardingCase)
					.where(eq(offboardingCase.organizationId, orgId))
					.limit(1)
			),
		]);
	return {
		asset: linkAsset,
		payslip: linkPayslip,
		leave: linkLeave,
		attendance: linkAttendance,
		offboarding: linkOffboarding,
	};
}

// Idempotent reset — FK-safe order: comments → requests → categories.
async function resetOrg(orgId: string) {
	const existingRequests = await db
		.select({ id: helpdeskRequest.id })
		.from(helpdeskRequest)
		.where(eq(helpdeskRequest.organizationId, orgId));
	if (existingRequests.length > 0) {
		await db.delete(helpdeskRequestComment).where(
			inArray(
				helpdeskRequestComment.requestId,
				existingRequests.map((r) => r.id)
			)
		);
	}
	await db
		.delete(helpdeskRequest)
		.where(eq(helpdeskRequest.organizationId, orgId));
	await db
		.delete(helpdeskCategory)
		.where(eq(helpdeskCategory.organizationId, orgId));
}

const CAT_DEFS = [
	{ key: "hr", name: "HR", priority: "normal", sla: 48, approval: false },
	{
		key: "payroll",
		name: "Payroll",
		priority: "high",
		sla: 24,
		approval: false,
	},
	{
		key: "attendance",
		name: "Attendance",
		priority: "normal",
		sla: 48,
		approval: false,
	},
	{ key: "leave", name: "Leave", priority: "normal", sla: 48, approval: false },
	{
		key: "documents",
		name: "Documents",
		priority: "normal",
		sla: 72,
		approval: false,
	},
	{
		key: "assets",
		name: "Assets",
		priority: "normal",
		sla: 48,
		approval: false,
	},
	{ key: "it", name: "IT", priority: "high", sla: 8, approval: false },
	{
		key: "facilities",
		name: "Facilities",
		priority: "normal",
		sla: 48,
		approval: false,
	},
	{
		key: "finance",
		name: "Finance",
		priority: "high",
		sla: 24,
		approval: true,
	},
	{
		key: "general",
		name: "General",
		priority: "low",
		sla: 96,
		approval: false,
	},
] as const;

const AGENT_QUEUE_CATEGORIES = new Set(["it", "facilities", "general"]);

async function seedCategories(
	orgId: string,
	helpdeskUser: string | null
): Promise<Record<string, string>> {
	const catId: Record<string, string> = {};
	for (const c of CAT_DEFS) {
		const id = createId();
		catId[c.key] = id;
		await db.insert(helpdeskCategory).values({
			id,
			organizationId: orgId,
			key: c.key,
			name: c.name,
			defaultPriority: c.priority,
			defaultSlaHours: c.sla,
			requiresApproval: c.approval,
			defaultAssigneeUserId: AGENT_QUEUE_CATEGORIES.has(c.key)
				? helpdeskUser
				: null,
		});
	}
	return catId;
}

function buildRequests(ctx: SeedContext): ReqSeed[] {
	const { emp, helpdeskUser, hrUser, links } = ctx;
	return [
		{
			key: "doc",
			category: "documents",
			requester: emp[0],
			title: "Request: employment confirmation letter",
			description:
				"I need a confirmation-of-employment letter for a visa application.",
			priority: "normal",
			status: "new",
			resolutionDueAt: from(3 * DAY),
			firstResponseDueAt: from(1 * DAY),
		},
		{
			key: "payroll",
			category: "payroll",
			requester: emp[1],
			title: "Payroll question: deduction on my last payslip",
			description:
				"There's a deduction I don't recognise on my latest payslip — can someone explain it? (No change to pay expected; just need an explanation.)",
			priority: "high",
			status: "open",
			assignedTo: hrUser,
			firstRespondedAt: from(-2 * HOUR),
			firstResponseDueAt: from(-1 * DAY),
			resolutionDueAt: from(1 * DAY),
			linkedPayslipId: links.payslip,
		},
		{
			key: "laptop",
			category: "it",
			requester: emp[2],
			title: "Laptop won't power on",
			description:
				"My company laptop won't turn on this morning — no lights, no fan.",
			priority: "high",
			status: "in_progress",
			assignedTo: helpdeskUser,
			firstRespondedAt: from(-3 * HOUR),
			firstResponseDueAt: from(-2 * HOUR),
			resolutionDueAt: from(1 * DAY),
			linkedAssetId: links.asset,
		},
		{
			key: "accesscard",
			category: "facilities",
			requester: emp[3],
			title: "Access card not working at the warehouse door",
			description:
				"My access card stopped working at the Berbice warehouse entrance.",
			priority: "normal",
			status: "new",
			resolutionDueAt: from(2 * DAY),
			firstResponseDueAt: from(1 * DAY),
		},
		{
			key: "attendance",
			category: "attendance",
			requester: emp[4],
			title: "Attendance correction: missed clock-out",
			description:
				"I forgot to clock out on my last shift. Could you correct it? (Correction happens in Attendance; this just tracks the request.)",
			priority: "normal",
			status: "waiting_on_employee",
			assignedTo: hrUser,
			firstRespondedAt: from(-1 * DAY),
			firstResponseDueAt: from(-1 * DAY),
			resolutionDueAt: from(2 * DAY),
			linkedAttendanceRecordId: links.attendance,
		},
		{
			key: "leave",
			category: "leave",
			requester: emp[5],
			title: "Leave question: why is my balance lower than expected?",
			description:
				"My annual-leave balance looks lower than I expected — can you check?",
			priority: "low",
			status: "open",
			assignedTo: hrUser,
			firstRespondedAt: from(-4 * HOUR),
			firstResponseDueAt: from(4 * HOUR),
			resolutionDueAt: from(4 * DAY),
			linkedLeaveRequestId: links.leave,
		},
		{
			key: "reimbursement",
			category: "finance",
			requester: emp[0],
			title: "Reimbursement: client-site travel expenses",
			description:
				"Requesting reimbursement for travel to a client site (GYD 18,500). Receipts attached offline.",
			priority: "normal",
			status: "waiting_on_approval",
			assignedTo: helpdeskUser,
			approvalRequired: true,
			approvalStatus: "pending",
			firstRespondedAt: from(-6 * HOUR),
			firstResponseDueAt: from(-6 * HOUR),
			resolutionDueAt: from(2 * DAY),
			linkedEntityType: "expense",
			linkedEntityId: "EXP-2026-0042",
		},
		{
			key: "approval",
			category: "hr",
			requester: emp[1],
			title: "Approval needed: external training course",
			description:
				"Requesting manager approval to attend a 2-day forklift-safety course.",
			priority: "normal",
			status: "waiting_on_approval",
			approvalRequired: true,
			approvalStatus: "pending",
			firstResponseDueAt: from(1 * DAY),
			resolutionDueAt: from(3 * DAY),
		},
		{
			key: "resolvedit",
			category: "it",
			requester: emp[2],
			title: "Can't log into the HR portal",
			description: "I was locked out of the portal after too many attempts.",
			priority: "normal",
			status: "resolved",
			assignedTo: helpdeskUser,
			firstRespondedAt: from(-2 * DAY),
			firstResponseDueAt: from(-1 * DAY),
			resolutionDueAt: from(-1 * DAY + 4 * HOUR),
			resolvedAt: from(-1 * DAY),
			resolutionNote: "Reset the account lockout and confirmed sign-in works.",
		},
		{
			key: "overdue",
			category: "facilities",
			requester: emp[3],
			title: "Air conditioning failure in the main office",
			description:
				"The A/C in the Georgetown office has been down since yesterday — it's getting very hot.",
			priority: "urgent",
			status: "in_progress",
			assignedTo: helpdeskUser,
			firstRespondedAt: from(-1 * DAY),
			firstResponseDueAt: from(-1 * DAY),
			resolutionDueAt: from(-2 * DAY), // overdue
		},
	];
}

async function seedRequests(
	ctx: SeedContext,
	catId: Record<string, string>
): Promise<Record<string, string>> {
	let seq = 0;
	const ref = () => `HD-${String(++seq).padStart(6, "0")}`;
	const reqId: Record<string, string> = {};
	for (const r of buildRequests(ctx)) {
		const id = createId();
		reqId[r.key] = id;
		await db.insert(helpdeskRequest).values({
			id,
			organizationId: ctx.orgId,
			reference: ref(),
			categoryId: catId[r.category],
			requesterEmployeeId: r.requester,
			createdByUserId: ctx.employeeUser,
			title: r.title,
			description: r.description,
			priority: r.priority,
			status: r.status,
			assignedToUserId: r.assignedTo ?? null,
			firstResponseDueAt: r.firstResponseDueAt ?? null,
			resolutionDueAt: r.resolutionDueAt ?? null,
			firstRespondedAt: r.firstRespondedAt ?? null,
			resolvedAt: r.resolvedAt ?? null,
			resolutionNote: r.resolutionNote ?? null,
			approvalRequired: r.approvalRequired ?? false,
			approvalStatus: r.approvalStatus ?? "none",
			approvedByUserId: r.approvedBy ?? null,
			linkedAssetId: r.linkedAssetId ?? null,
			linkedPayslipId: r.linkedPayslipId ?? null,
			linkedLeaveRequestId: r.linkedLeaveRequestId ?? null,
			linkedAttendanceRecordId: r.linkedAttendanceRecordId ?? null,
			linkedOffboardingCaseId: r.linkedOffboardingCaseId ?? null,
			linkedEntityType: r.linkedEntityType ?? null,
			linkedEntityId: r.linkedEntityId ?? null,
		});
	}
	return reqId;
}

function buildComments(ctx: SeedContext) {
	const { helpdeskUser, employeeUser, hrUser } = ctx;
	return [
		{
			req: "laptop",
			author: employeeUser,
			body: "It was working fine when I left yesterday. Nothing spilled on it.",
			internal: false,
		},
		{
			req: "laptop",
			author: helpdeskUser,
			body: "Internal: bench-tested — power supply is dead. Ordering a replacement PSU; ETA 2 days.",
			internal: true,
		},
		{
			req: "payroll",
			author: hrUser,
			body: "Thanks for flagging — looking into the deduction line now.",
			internal: false,
		},
		{
			req: "reimbursement",
			author: helpdeskUser,
			body: "Internal: routed to manager for approval; receipts pending upload.",
			internal: true,
		},
		{
			req: "resolvedit",
			author: helpdeskUser,
			body: "Your account lockout has been cleared — please try signing in again.",
			internal: false,
		},
		{
			req: "attendance",
			author: hrUser,
			body: "Could you confirm the exact shift date so I can raise the correction in Attendance?",
			internal: false,
		},
	];
}

async function seedComments(
	ctx: SeedContext,
	reqId: Record<string, string>
): Promise<number> {
	const comments = buildComments(ctx);
	for (const c of comments) {
		await db.insert(helpdeskRequestComment).values({
			id: createId(),
			organizationId: ctx.orgId,
			requestId: reqId[c.req],
			authorUserId: c.author,
			body: c.body,
			isInternal: c.internal,
		});
	}
	return comments.filter((c) => c.internal).length;
}

async function main() {
	const orgId = await resolveOrgId();
	const emp = await resolveEmployees(orgId);

	const userRows = await db
		.select({ id: user.id, email: user.email })
		.from(user);
	const userByEmail = new Map(userRows.map((u) => [u.email, u.id]));
	const uid = (email: string) => userByEmail.get(email) ?? null;

	const ctx: SeedContext = {
		orgId,
		emp,
		helpdeskUser: uid("helpdesk@atlas-shipping.com"),
		employeeUser: uid("employee@atlas-shipping.com"),
		hrUser: uid("hr@atlas-shipping.com"),
		links: await resolveLinks(orgId),
	};

	await resetOrg(orgId);
	const catId = await seedCategories(orgId, ctx.helpdeskUser);
	const reqId = await seedRequests(ctx, catId);
	const internalCount = await seedComments(ctx, reqId);

	const catCount = await db.$count(
		helpdeskCategory,
		eq(helpdeskCategory.organizationId, orgId)
	);
	const reqCount = await db.$count(
		helpdeskRequest,
		eq(helpdeskRequest.organizationId, orgId)
	);
	const comCount = await db.$count(
		helpdeskRequestComment,
		eq(helpdeskRequestComment.organizationId, orgId)
	);
	const { links } = ctx;
	process.stdout.write(
		`Helpdesk seed complete: ${catCount} categories, ${reqCount} requests, ${comCount} comments (${internalCount} internal). ` +
			`Links: asset=${Boolean(links.asset)} payslip=${Boolean(links.payslip)} leave=${Boolean(links.leave)} attendance=${Boolean(links.attendance)} offboarding=${Boolean(links.offboarding)}.\n`
	);
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`seed failed: ${err}\n`);
	process.exit(1);
});
