/**
 * Audit-log viewer router (Phase 22 / Settings Depth) — read-only oversight over
 * the SHARED `audit_event` table. This router OWNS NO TABLE and performs ZERO
 * writes (the same guardrail as the analytics router): viewing the log is not
 * itself a logged mutation. It is the FIRST consumer of the already-defined,
 * already-granted `audit_log:read` resource (owner/admin/hr_admin/payroll_admin/
 * auditor) — so it adds +1 router and consumes one existing pair, no new pair.
 *
 * Two procedures:
 *   - `list` (audit_log:read): tenant-scoped, newest-first, paginated query with
 *     entityType / action / actorId / date-range filters. Resolves actor ids to
 *     {name,email} and returns humanized entity/action labels (never raw enums
 *     or raw ids as the primary display).
 *   - `getById` (audit_log:read): one tenant-scoped row with full changes +
 *     metadata for the drawer. IDOR-guarded (org match or NOT_FOUND).
 *
 * Two-layer authz: AC gate (authorizedProcedure("audit_log", "read")) + handler
 * org scope (organizationId = ctx org on every path).
 */

import { db } from "@Heimdallone/db";
import { user } from "@Heimdallone/db/schema/auth";
import { auditEvent } from "@Heimdallone/db/schema/hr-core";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;

const AUDIT_ACTIONS = [
	"create",
	"update",
	"delete",
	"archive",
	"restore",
] as const;

const ACTION_LABELS: Record<string, string> = {
	create: "Created",
	update: "Updated",
	delete: "Deleted",
	archive: "Archived",
	restore: "Restored",
};

// Friendly nouns for the entity types audit_event actually carries today. Unknown
// types fall back to a title-cased, underscore-stripped form — never a raw enum.
const ENTITY_LABELS: Record<string, string> = {
	tenant_branding: "Branding",
	geofence_location: "Work location",
	geofence_assignment: "Work-location assignment",
	announcement: "Announcement",
	employee_profile: "Employee",
	employee: "Employee",
	contract: "Contract",
	payslip: "Payslip",
	payslip_correction: "Payslip correction",
	payroll_run: "Payroll run",
	leave_request: "Leave request",
	attendance_record: "Attendance record",
	holiday: "Holiday",
	department: "Department",
	job_position: "Position",
	job_role: "Role",
	asset: "Asset",
	helpdesk_request: "Helpdesk request",
	project: "Project",
	project_task: "Task",
	project_time_entry: "Time entry",
	performance_objective: "Goal",
	recognition_point: "Recognition",
	finance_budget: "Budget",
	crm_customer: "Customer",
	crm_lead: "Lead",
	crm_deal: "Deal",
	one_on_one: "1-on-1",
};

function humanizeEntityType(entityType: string): string {
	if (ENTITY_LABELS[entityType]) {
		return ENTITY_LABELS[entityType];
	}
	const spaced = entityType.replace(/_/g, " ").trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function humanizeAction(action: string): string {
	return ACTION_LABELS[action] ?? action;
}

const listInput = z
	.object({
		entityType: z.string().trim().min(1).max(100).optional(),
		action: z.enum(AUDIT_ACTIONS).optional(),
		actorId: z.string().trim().min(1).optional(),
		dateFrom: z.string().datetime().optional(),
		dateTo: z.string().datetime().optional(),
		page: z.number().int().min(1).default(1),
		pageSize: z.number().int().min(1).max(100).default(25),
	})
	.optional();

// Resolve a set of actor ids to {name,email} for display (system actor = null).
async function actorMap(
	actorIds: string[]
): Promise<Map<string, { name: string; email: string }>> {
	const ids = [...new Set(actorIds.filter((id): id is string => Boolean(id)))];
	const map = new Map<string, { name: string; email: string }>();
	if (ids.length === 0) {
		return map;
	}
	const rows = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(inArray(user.id, ids));
	for (const row of rows) {
		map.set(row.id, { name: row.name, email: row.email });
	}
	return map;
}

const list = authorizedProcedure("audit_log", "read")
	.input(listInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const page = input?.page ?? 1;
		const pageSize = input?.pageSize ?? 25;

		const conditions = [eq(auditEvent.organizationId, oid)];
		if (input?.entityType) {
			conditions.push(eq(auditEvent.entityType, input.entityType));
		}
		if (input?.action) {
			conditions.push(eq(auditEvent.action, input.action));
		}
		if (input?.actorId) {
			conditions.push(eq(auditEvent.actorId, input.actorId));
		}
		if (input?.dateFrom) {
			conditions.push(gte(auditEvent.createdAt, new Date(input.dateFrom)));
		}
		if (input?.dateTo) {
			conditions.push(lte(auditEvent.createdAt, new Date(input.dateTo)));
		}
		const where = and(...conditions);

		const [totalRow] = await db
			.select({ total: count() })
			.from(auditEvent)
			.where(where);
		const total = totalRow?.total ?? 0;

		const rows = await db
			.select({
				id: auditEvent.id,
				entityType: auditEvent.entityType,
				entityId: auditEvent.entityId,
				action: auditEvent.action,
				actorId: auditEvent.actorId,
				createdAt: auditEvent.createdAt,
			})
			.from(auditEvent)
			.where(where)
			.orderBy(desc(auditEvent.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize);

		const actors = await actorMap(rows.map((r) => r.actorId ?? ""));

		return {
			total,
			page,
			pageSize,
			rows: rows.map((r) => ({
				id: r.id,
				entityType: r.entityType,
				entityLabel: humanizeEntityType(r.entityType),
				entityId: r.entityId,
				action: r.action,
				actionLabel: humanizeAction(r.action),
				actorId: r.actorId,
				actor: r.actorId ? (actors.get(r.actorId) ?? null) : null,
				createdAt: r.createdAt,
			})),
		};
	});

const getById = authorizedProcedure("audit_log", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [row] = await db
			.select()
			.from(auditEvent)
			.where(
				and(eq(auditEvent.id, input.id), eq(auditEvent.organizationId, oid))
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", {
				message: "Audit entry not found.",
			});
		}
		const actors = await actorMap([row.actorId ?? ""]);
		return {
			id: row.id,
			entityType: row.entityType,
			entityLabel: humanizeEntityType(row.entityType),
			entityId: row.entityId,
			action: row.action,
			actionLabel: humanizeAction(row.action),
			actorId: row.actorId,
			actor: row.actorId ? (actors.get(row.actorId) ?? null) : null,
			changes: row.changes,
			metadata: row.metadata,
			createdAt: row.createdAt,
		};
	});

export const auditRouter = {
	audit: {
		list,
		getById,
	},
};
