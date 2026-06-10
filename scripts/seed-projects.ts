// Seed Projects + Tasks / Timelines data for Atlas Shipping — Phase 14B.
//
// Idempotent: deletes existing project data for the org (time entries → comments
// → tasks → milestones → members → projects, FK-safe order) then re-inserts.
//
// COORDINATION-LAYER GUARDRAIL: this seed only writes the project_* tables. It
// READS one real asset id + one real helpdesk_request id to populate the
// read-only context links on a task — it NEVER writes to Assets / Helpdesk /
// Payroll / Attendance. The CRM links are SOFT string placeholders (no crm_*
// tables exist yet). Time entries are reporting-only.
//
// Run:  export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-projects.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { createDb } from "../packages/db/src/index";
import { asset } from "../packages/db/src/schema/assets";
import { organization, user } from "../packages/db/src/schema/auth";
import { helpdeskRequest } from "../packages/db/src/schema/helpdesk";
import { employeeProfile } from "../packages/db/src/schema/hr-core";
import {
	project,
	projectMember,
	projectMilestone,
	projectTask,
	projectTaskComment,
	projectTimeEntry,
} from "../packages/db/src/schema/projects";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();
const DAY = 24 * 60 * 60 * 1000;
const dayOffset = (n: number) => new Date(Date.now() + n * DAY);

type ProjectStatus =
	| "planning"
	| "active"
	| "on_hold"
	| "completed"
	| "cancelled"
	| "archived";
type Priority = "low" | "normal" | "high" | "urgent";
type MilestoneStatus =
	| "planned"
	| "in_progress"
	| "at_risk"
	| "completed"
	| "missed"
	| "cancelled";
type TaskStatus =
	| "todo"
	| "in_progress"
	| "blocked"
	| "in_review"
	| "done"
	| "cancelled";
type TimeStatus = "draft" | "submitted" | "approved" | "rejected";

interface ProjectDef {
	completedOffset?: number;
	description: string;
	internalNote?: string;
	key: string;
	linkedCustomerId?: string;
	linkedDealId?: string;
	members: string[]; // employee full names (members, role=member)
	name: string;
	pm: string; // employee full name
	priority?: Priority;
	startOffset: number;
	status: ProjectStatus;
	targetOffset: number;
}

interface MilestoneDef {
	completedOffset?: number;
	dueOffset?: number;
	key: string;
	name: string;
	order: number;
	project: string;
	status: MilestoneStatus;
}

interface TaskDef {
	assignee?: string; // employee full name
	completedOffset?: number;
	dueOffset?: number;
	estimateMinutes?: number;
	key: string;
	linkAsset?: boolean;
	linkTicket?: boolean;
	milestone?: string;
	order: number;
	priority: Priority;
	project: string;
	status: TaskStatus;
	title: string;
}

interface CommentDef {
	author: string; // user email
	body: string;
	internal: boolean;
	task: string;
}

interface TimeDef {
	dateOffset: number;
	description: string;
	employee: string; // full name
	minutes: number;
	project: string;
	status: TimeStatus;
	task?: string;
}

interface Ctx {
	createdByUser: string | null;
	emp: string[];
	empByName: Map<string, string>;
	linkAssetId: string | null;
	linkTicketId: string | null;
	orgId: string;
	uid: (email: string) => string | null;
}

// ── Resolvers ────────────────────────────────────────────────────────────────

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

async function resolveEmployees(
	orgId: string
): Promise<{ byName: Map<string, string>; ids: string[] }> {
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
	if (rows.length < 6) {
		process.stderr.write("Not enough active employees — run seed-dev.ts.\n");
		process.exit(1);
	}
	const byName = new Map<string, string>();
	for (const r of rows) {
		byName.set(`${r.first}${r.last ? ` ${r.last}` : ""}`, r.id);
	}
	return { byName, ids: rows.map((r) => r.id) };
}

// ── Idempotent reset (FK-safe order) ─────────────────────────────────────────

async function resetOrg(orgId: string) {
	await db
		.delete(projectTimeEntry)
		.where(eq(projectTimeEntry.organizationId, orgId));
	await db
		.delete(projectTaskComment)
		.where(eq(projectTaskComment.organizationId, orgId));
	await db.delete(projectTask).where(eq(projectTask.organizationId, orgId));
	await db
		.delete(projectMilestone)
		.where(eq(projectMilestone.organizationId, orgId));
	await db.delete(projectMember).where(eq(projectMember.organizationId, orgId));
	await db.delete(project).where(eq(project.organizationId, orgId));
}

// ── Definitions ──────────────────────────────────────────────────────────────

const PROJECT_DEFS: ProjectDef[] = [
	{
		key: "network",
		name: "Main Office Network Upgrade",
		description:
			"Replace ageing core switches and Wi-Fi at the Georgetown head office.",
		status: "active",
		priority: "high",
		pm: "Andre Sealey",
		members: ["Marcus James", "Rohan Gopaul"],
		startOffset: -20,
		targetOffset: 25,
		internalNote: "Vendor quote pending final sign-off from finance.",
	},
	{
		key: "wifi",
		name: "Vessel Crew WiFi Deployment",
		description:
			"Scope and plan crew-welfare Wi-Fi across the coastal fleet vessels.",
		status: "planning",
		priority: "normal",
		pm: "Marcus James",
		members: ["Dwayne Wilson"],
		startOffset: -8,
		targetOffset: 45,
	},
	{
		key: "payroll",
		name: "Payroll Rollout Project",
		description:
			"Roll out the new payroll workflow to all departments after parallel testing.",
		status: "on_hold",
		priority: "high",
		pm: "Andre Sealey",
		members: ["Rohan Gopaul", "Dwayne Wilson"],
		startOffset: -30,
		targetOffset: 10,
		internalNote: "On hold pending statutory-rate confirmation.",
	},
	{
		key: "docs",
		name: "HR Document Digitization",
		description:
			"Scan and index historical HR documents into the document store.",
		status: "completed",
		priority: "normal",
		pm: "Marcus James",
		members: ["Rohan Gopaul"],
		startOffset: -60,
		targetOffset: -10,
		completedOffset: -5,
	},
	{
		key: "cpe",
		name: "Customer CPE Installation Batch",
		description:
			"Install customer-premises equipment for the new corporate connectivity contract.",
		status: "active",
		priority: "normal",
		pm: "Andre Sealey",
		members: ["Marcus James", "Dwayne Wilson"],
		startOffset: -5,
		targetOffset: 30,
		// SOFT CRM handoff placeholders — NOT foreign keys (crm_* is Phase 17).
		linkedCustomerId: "CUST-2026-0007",
		linkedDealId: "DEAL-2026-0042",
	},
];

const MILESTONE_DEFS: MilestoneDef[] = [
	{
		key: "m-survey",
		project: "network",
		name: "Site survey complete",
		status: "completed",
		completedOffset: -14,
		order: 1,
	},
	{
		key: "m-core",
		project: "network",
		name: "Core switches installed",
		status: "in_progress",
		dueOffset: 7,
		order: 2,
	},
	{
		key: "m-cutover",
		project: "network",
		name: "Network cutover",
		status: "planned",
		dueOffset: 20,
		order: 3,
	},
	{
		key: "m-vendor",
		project: "wifi",
		name: "Vendor selection",
		status: "planned",
		dueOffset: 14,
		order: 1,
	},
	{
		key: "m-parallel",
		project: "payroll",
		name: "Parallel run sign-off",
		status: "at_risk",
		dueOffset: 5,
		order: 1,
	},
	{
		key: "m-golive",
		project: "payroll",
		name: "Go-live",
		status: "missed",
		dueOffset: -3,
		order: 2,
	},
	{
		key: "m-scanned",
		project: "docs",
		name: "All documents scanned",
		status: "completed",
		completedOffset: -8,
		order: 1,
	},
	{
		key: "m-batch1",
		project: "cpe",
		name: "First installation batch",
		status: "in_progress",
		dueOffset: 12,
		order: 1,
	},
];

const TASK_DEFS: TaskDef[] = [
	// network
	{
		key: "t1",
		project: "network",
		milestone: "m-survey",
		title: "Survey Georgetown comms room",
		status: "done",
		priority: "normal",
		assignee: "Marcus James",
		completedOffset: -14,
		order: 1,
	},
	{
		key: "t2",
		project: "network",
		milestone: "m-core",
		title: "Rack and cable the new core switches",
		status: "in_progress",
		priority: "high",
		assignee: "Marcus James",
		dueOffset: 4,
		estimateMinutes: 480,
		linkAsset: true,
		order: 2,
	},
	{
		key: "t3",
		project: "network",
		milestone: "m-core",
		title: "Configure VLANs and routing",
		status: "todo",
		priority: "high",
		assignee: "Rohan Gopaul",
		dueOffset: 9,
		estimateMinutes: 240,
		order: 3,
	},
	{
		key: "t4",
		project: "network",
		milestone: "m-cutover",
		title: "Plan the cutover window with departments",
		status: "blocked",
		priority: "urgent",
		assignee: "Andre Sealey",
		dueOffset: 6,
		linkTicket: true,
		order: 4,
	},
	{
		key: "t5",
		project: "network",
		title: "Order spare SFP modules",
		status: "in_review",
		priority: "normal",
		assignee: "Rohan Gopaul",
		dueOffset: 2,
		order: 5,
	},
	// wifi (planning)
	{
		key: "t6",
		project: "wifi",
		milestone: "m-vendor",
		title: "Draft Wi-Fi coverage requirements per vessel",
		status: "in_progress",
		priority: "normal",
		assignee: "Marcus James",
		dueOffset: 5,
		order: 1,
	},
	{
		key: "t7",
		project: "wifi",
		milestone: "m-vendor",
		title: "Request quotes from 3 marine Wi-Fi vendors",
		status: "todo",
		priority: "normal",
		assignee: "Dwayne Wilson",
		dueOffset: 10,
		order: 2,
	},
	{
		key: "t8",
		project: "wifi",
		title: "Confirm crew-welfare budget envelope",
		status: "todo",
		priority: "low",
		dueOffset: 12,
		order: 3,
	},
	// payroll (on_hold)
	{
		key: "t9",
		project: "payroll",
		milestone: "m-parallel",
		title: "Reconcile parallel-run pay vs. legacy",
		status: "blocked",
		priority: "high",
		assignee: "Rohan Gopaul",
		dueOffset: 3,
		order: 1,
	},
	{
		key: "t10",
		project: "payroll",
		milestone: "m-parallel",
		title: "Sign off statutory deduction rates",
		status: "todo",
		priority: "urgent",
		assignee: "Andre Sealey",
		dueOffset: 4,
		order: 2,
	},
	{
		key: "t11",
		project: "payroll",
		milestone: "m-golive",
		title: "Department go-live comms",
		status: "todo",
		priority: "normal",
		assignee: "Dwayne Wilson",
		dueOffset: -3,
		order: 3,
	},
	{
		key: "t12",
		project: "payroll",
		title: "Cancelled: pilot a second payroll vendor",
		status: "cancelled",
		priority: "low",
		order: 4,
	},
	// docs (completed)
	{
		key: "t13",
		project: "docs",
		milestone: "m-scanned",
		title: "Scan personnel files A–M",
		status: "done",
		priority: "normal",
		assignee: "Rohan Gopaul",
		completedOffset: -12,
		order: 1,
	},
	{
		key: "t14",
		project: "docs",
		milestone: "m-scanned",
		title: "Scan personnel files N–Z",
		status: "done",
		priority: "normal",
		assignee: "Rohan Gopaul",
		completedOffset: -9,
		order: 2,
	},
	{
		key: "t15",
		project: "docs",
		title: "Index scanned documents in the document store",
		status: "done",
		priority: "normal",
		assignee: "Marcus James",
		completedOffset: -6,
		order: 3,
	},
	// cpe (active)
	{
		key: "t16",
		project: "cpe",
		milestone: "m-batch1",
		title: "Stage CPE units for the first batch",
		status: "in_progress",
		priority: "normal",
		assignee: "Dwayne Wilson",
		dueOffset: 3,
		estimateMinutes: 180,
		order: 1,
	},
	{
		key: "t17",
		project: "cpe",
		milestone: "m-batch1",
		title: "Schedule customer site visits",
		status: "todo",
		priority: "high",
		assignee: "Marcus James",
		dueOffset: 6,
		order: 2,
	},
	{
		key: "t18",
		project: "cpe",
		title: "Prepare customer handover documentation",
		status: "todo",
		priority: "normal",
		assignee: "Andre Sealey",
		dueOffset: 14,
		order: 3,
	},
	{
		key: "t19",
		project: "cpe",
		title: "Confirm installation toolkit inventory",
		status: "in_review",
		priority: "normal",
		assignee: "Dwayne Wilson",
		dueOffset: 1,
		order: 4,
	},
	// a few more spread tasks
	{
		key: "t20",
		project: "network",
		title: "Update the network diagram",
		status: "todo",
		priority: "low",
		assignee: "Rohan Gopaul",
		dueOffset: 18,
		order: 6,
	},
	{
		key: "t21",
		project: "network",
		title: "Decommission old switches",
		status: "todo",
		priority: "normal",
		dueOffset: 22,
		order: 7,
	},
	{
		key: "t22",
		project: "wifi",
		title: "Identify pilot vessel for first install",
		status: "todo",
		priority: "normal",
		assignee: "Marcus James",
		dueOffset: 20,
		order: 4,
	},
	{
		key: "t23",
		project: "cpe",
		title: "Collect customer access requirements",
		status: "blocked",
		priority: "high",
		assignee: "Marcus James",
		dueOffset: 2,
		order: 5,
	},
	{
		key: "t24",
		project: "cpe",
		title: "Draft installation runbook",
		status: "in_progress",
		priority: "normal",
		assignee: "Andre Sealey",
		dueOffset: 8,
		order: 6,
	},
	{
		key: "t25",
		project: "payroll",
		title: "Archive legacy payroll exports",
		status: "todo",
		priority: "low",
		assignee: "Rohan Gopaul",
		dueOffset: 15,
		order: 5,
	},
];

const COMMENT_DEFS: CommentDef[] = [
	{
		task: "t2",
		author: "helpdesk@atlas-shipping.com",
		body: "Cabling started this morning — first rack is done.",
		internal: false,
	},
	{
		task: "t2",
		author: "manager@atlas-shipping.com",
		body: "Internal: vendor invoice not yet approved — hold the final two switches until finance signs off.",
		internal: true,
	},
	{
		task: "t4",
		author: "manager@atlas-shipping.com",
		body: "Blocked until the cutover window is confirmed with the warehouse team.",
		internal: false,
	},
	{
		task: "t9",
		author: "employee@atlas-shipping.com",
		body: "Found a mismatch on overtime rounding — need the statutory rate confirmed first.",
		internal: false,
	},
	{
		task: "t9",
		author: "manager@atlas-shipping.com",
		body: "Internal: escalate to payroll_admin; do not change pay — this is reconciliation only.",
		internal: true,
	},
	{
		task: "t16",
		author: "helpdesk@atlas-shipping.com",
		body: "Units staged; awaiting customer site confirmations.",
		internal: false,
	},
];

const TIME_DEFS: TimeDef[] = [
	{
		project: "network",
		task: "t1",
		employee: "Marcus James",
		dateOffset: -14,
		minutes: 300,
		description: "Comms-room survey + photos",
		status: "approved",
	},
	{
		project: "network",
		task: "t2",
		employee: "Marcus James",
		dateOffset: -1,
		minutes: 420,
		description: "Racking + cabling core switches",
		status: "submitted",
	},
	{
		project: "network",
		task: "t3",
		employee: "Rohan Gopaul",
		dateOffset: -1,
		minutes: 120,
		description: "Initial VLAN plan draft",
		status: "draft",
	},
	{
		project: "docs",
		task: "t13",
		employee: "Rohan Gopaul",
		dateOffset: -12,
		minutes: 360,
		description: "Scanning batch A–M",
		status: "approved",
	},
	{
		project: "docs",
		task: "t14",
		employee: "Rohan Gopaul",
		dateOffset: -9,
		minutes: 360,
		description: "Scanning batch N–Z",
		status: "approved",
	},
	{
		project: "payroll",
		task: "t9",
		employee: "Rohan Gopaul",
		dateOffset: -2,
		minutes: 180,
		description: "Parallel-run reconciliation pass",
		status: "rejected",
	},
	{
		project: "cpe",
		task: "t16",
		employee: "Dwayne Wilson",
		dateOffset: -1,
		minutes: 240,
		description: "Staging CPE units",
		status: "submitted",
	},
	{
		project: "cpe",
		task: "t24",
		employee: "Andre Sealey",
		dateOffset: 0,
		minutes: 90,
		description: "Runbook drafting",
		status: "draft",
	},
];

// ── Insert helpers ───────────────────────────────────────────────────────────

function pad(n: number): string {
	return String(n).padStart(6, "0");
}

async function seedProjects(ctx: Ctx): Promise<Record<string, string>> {
	const projId: Record<string, string> = {};
	let seq = 0;
	for (const p of PROJECT_DEFS) {
		const id = createId();
		projId[p.key] = id;
		await db.insert(project).values({
			id,
			organizationId: ctx.orgId,
			reference: `PRJ-${pad(++seq)}`,
			name: p.name,
			description: p.description,
			status: p.status,
			priority: p.priority ?? null,
			projectManagerEmployeeId: ctx.empByName.get(p.pm) ?? ctx.emp[0],
			startDate: dayOffset(p.startOffset),
			targetEndDate: dayOffset(p.targetOffset),
			completedAt:
				p.completedOffset === undefined ? null : dayOffset(p.completedOffset),
			linkedCustomerId: p.linkedCustomerId ?? null,
			linkedDealId: p.linkedDealId ?? null,
			internalNote: p.internalNote ?? null,
			createdByUserId: ctx.createdByUser,
			isArchived: false,
		});
	}
	return projId;
}

async function seedMembers(
	ctx: Ctx,
	projId: Record<string, string>
): Promise<number> {
	let count = 0;
	for (const p of PROJECT_DEFS) {
		const seen = new Set<string>();
		const lead = ctx.empByName.get(p.pm) ?? ctx.emp[0];
		const rows: { employeeId: string; role: "lead" | "member" }[] = [
			{ employeeId: lead, role: "lead" },
		];
		seen.add(lead);
		for (const name of p.members) {
			const empId = ctx.empByName.get(name);
			if (empId && !seen.has(empId)) {
				seen.add(empId);
				rows.push({ employeeId: empId, role: "member" });
			}
		}
		for (const m of rows) {
			await db.insert(projectMember).values({
				id: createId(),
				organizationId: ctx.orgId,
				projectId: projId[p.key],
				employeeId: m.employeeId,
				role: m.role,
				startDate: dayOffset(p.startOffset),
			});
			count++;
		}
	}
	return count;
}

async function seedMilestones(
	ctx: Ctx,
	projId: Record<string, string>
): Promise<Record<string, string>> {
	const msId: Record<string, string> = {};
	for (const m of MILESTONE_DEFS) {
		const id = createId();
		msId[m.key] = id;
		await db.insert(projectMilestone).values({
			id,
			organizationId: ctx.orgId,
			projectId: projId[m.project],
			name: m.name,
			status: m.status,
			dueDate: m.dueOffset === undefined ? null : dayOffset(m.dueOffset),
			completedAt:
				m.completedOffset === undefined ? null : dayOffset(m.completedOffset),
			displayOrder: m.order,
		});
	}
	return msId;
}

async function seedTasks(
	ctx: Ctx,
	projId: Record<string, string>,
	msId: Record<string, string>
): Promise<Record<string, string>> {
	const taskId: Record<string, string> = {};
	let seq = 0;
	for (const t of TASK_DEFS) {
		const id = createId();
		taskId[t.key] = id;
		await db.insert(projectTask).values({
			id,
			organizationId: ctx.orgId,
			projectId: projId[t.project],
			reference: `TSK-${pad(++seq)}`,
			milestoneId: t.milestone ? (msId[t.milestone] ?? null) : null,
			title: t.title,
			status: t.status,
			priority: t.priority,
			assigneeEmployeeId: t.assignee
				? (ctx.empByName.get(t.assignee) ?? null)
				: null,
			createdByUserId: ctx.createdByUser,
			dueDate: t.dueOffset === undefined ? null : dayOffset(t.dueOffset),
			completedAt:
				t.completedOffset === undefined ? null : dayOffset(t.completedOffset),
			estimateMinutes: t.estimateMinutes ?? null,
			linkedAssetId: t.linkAsset ? ctx.linkAssetId : null,
			linkedHelpdeskRequestId: t.linkTicket ? ctx.linkTicketId : null,
			displayOrder: t.order,
		});
	}
	return taskId;
}

async function seedComments(
	ctx: Ctx,
	taskId: Record<string, string>
): Promise<number> {
	let internal = 0;
	for (const c of COMMENT_DEFS) {
		await db.insert(projectTaskComment).values({
			id: createId(),
			organizationId: ctx.orgId,
			taskId: taskId[c.task],
			authorUserId: ctx.uid(c.author),
			body: c.body,
			isInternal: c.internal,
		});
		if (c.internal) {
			internal++;
		}
	}
	return internal;
}

async function seedTimeEntries(
	ctx: Ctx,
	projId: Record<string, string>,
	taskId: Record<string, string>
): Promise<number> {
	let count = 0;
	for (const e of TIME_DEFS) {
		const isApproved = e.status === "approved";
		const isRejected = e.status === "rejected";
		const isSubmitted = e.status === "submitted" || isApproved || isRejected;
		await db.insert(projectTimeEntry).values({
			id: createId(),
			organizationId: ctx.orgId,
			projectId: projId[e.project],
			taskId: e.task ? (taskId[e.task] ?? null) : null,
			employeeId: ctx.empByName.get(e.employee) ?? ctx.emp[0],
			entryDate: dayOffset(e.dateOffset),
			minutes: e.minutes,
			description: e.description,
			status: e.status,
			submittedAt: isSubmitted ? dayOffset(e.dateOffset) : null,
			approvedAt: isApproved ? dayOffset(e.dateOffset + 1) : null,
			approvedByUserId: isApproved
				? ctx.uid("manager@atlas-shipping.com")
				: null,
			rejectedAt: isRejected ? dayOffset(e.dateOffset + 1) : null,
			rejectionReason: isRejected
				? "Please split this across the correct tasks and resubmit."
				: null,
		});
		count++;
	}
	return count;
}

async function main() {
	const orgId = await resolveOrgId();
	const { byName, ids } = await resolveEmployees(orgId);
	const userRows = await db
		.select({ id: user.id, email: user.email })
		.from(user);
	const userByEmail = new Map(userRows.map((u) => [u.email, u.id]));
	const uid = (email: string) => userByEmail.get(email) ?? null;

	const linkAssetId =
		(
			await db
				.select({ id: asset.id })
				.from(asset)
				.where(eq(asset.organizationId, orgId))
				.limit(1)
		).at(0)?.id ?? null;
	const linkTicketId =
		(
			await db
				.select({ id: helpdeskRequest.id })
				.from(helpdeskRequest)
				.where(eq(helpdeskRequest.organizationId, orgId))
				.limit(1)
		).at(0)?.id ?? null;

	const ctx: Ctx = {
		orgId,
		empByName: byName,
		emp: ids,
		uid,
		createdByUser: uid("admin@atlas-shipping.com"),
		linkAssetId,
		linkTicketId,
	};

	await resetOrg(orgId);
	const projId = await seedProjects(ctx);
	const memberCount = await seedMembers(ctx, projId);
	const msId = await seedMilestones(ctx, projId);
	const taskId = await seedTasks(ctx, projId, msId);
	const internalComments = await seedComments(ctx, taskId);
	const timeCount = await seedTimeEntries(ctx, projId, taskId);

	const projCount = await db.$count(project, eq(project.organizationId, orgId));
	const msCount = await db.$count(
		projectMilestone,
		eq(projectMilestone.organizationId, orgId)
	);
	const taskCount = await db.$count(
		projectTask,
		eq(projectTask.organizationId, orgId)
	);
	const comCount = await db.$count(
		projectTaskComment,
		eq(projectTaskComment.organizationId, orgId)
	);

	process.stdout.write(
		`Projects seed complete: ${projCount} projects, ${memberCount} members, ${msCount} milestones, ` +
			`${taskCount} tasks, ${comCount} comments (${internalComments} internal), ${timeCount} time entries. ` +
			`Context links: asset=${Boolean(linkAssetId)} ticket=${Boolean(linkTicketId)} ` +
			"(read-only; CRM links are soft string placeholders).\n"
	);
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`seed failed: ${err}\n`);
	process.exit(1);
});
