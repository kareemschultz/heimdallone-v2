/**
 * Roster router — Phase 21D-D.
 *
 * Per-date shift scheduling. A roster_entry assigns a shift to ONE employee on
 * ONE date, with optional per-day overrides (custom hours / day off / swap) and
 * an approval step. Attendance + payroll READ the rostered, approved day; this
 * router OWNS roster_entry and writes nothing else (besides the shared
 * audit_event). It never mutates attendance, payslips or payroll status.
 *
 * SaaS-general, NOT Netsurf-shaped:
 *   - tenant-scoped on every query (organizationId),
 *   - employee scope enforced in the handler (seesAll → org, manager → own +
 *     direct reports, employee → self only),
 *   - bulkAssign generates a recurring weekday pattern across a date range
 *     (reusable rostering, not a one-off import),
 *   - editing a schedule-affecting field re-opens approval (payroll integrity).
 *
 * Two-layer authz: AC gate (authorizedProcedure("roster", …)) + handler scope.
 */

import { db } from "@Heimdallone/db";
import {
	employeeProfile,
	employeeWorkInfo,
	shift,
} from "@Heimdallone/db/schema/hr-core";
import { rosterEntry, shiftRule } from "@Heimdallone/db/schema/roster";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import {
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";
import { canManageScheduleRules, seesAllRoster } from "../utils/role-helpers";
import {
	enumerateRosterDates,
	MINUTES_IN_DAY,
	validateOverride,
} from "../utils/roster-logic";
import { resolveScheduleConfig } from "../utils/shift-rule-resolver";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const overrideTypeEnum = z.enum(["none", "custom_hours", "day_off", "swap"]);

const dateStr = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

function toDate(s: string): Date {
	return new Date(`${s}T00:00:00.000Z`);
}

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

// ── employee scope: null = whole org, [] = none, [ids] = own + reports / self ──
async function rosterEmployeeScope(context: unknown): Promise<string[] | null> {
	if (seesAllRoster(role(context))) {
		return null;
	}
	const me = await resolveCurrentEmployee(
		orgId(context as never),
		actorId(context as never)
	);
	if (!me) {
		return [];
	}
	if (role(context) === "manager") {
		const reports = await getDirectReportIds(me.id, orgId(context as never));
		return [me.id, ...reports];
	}
	return [me.id];
}

function assertEmployeeInScope(
	scope: string[] | null,
	employeeId: string
): void {
	if (scope === null) {
		return;
	}
	if (!scope.includes(employeeId)) {
		throw new ORPCError("FORBIDDEN", {
			message: "This employee is outside your roster scope.",
		});
	}
}

// Tenant-verify a shift id belongs to the caller's org (SELECT-only).
async function assertShiftInOrg(oid: string, shiftId: string): Promise<void> {
	const [row] = await db
		.select({ id: shift.id })
		.from(shift)
		.where(and(eq(shift.id, shiftId), eq(shift.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Shift not found in org." });
	}
}

// Load a roster entry, tenant + scope checked.
async function loadEntryScoped(
	oid: string,
	scope: string[] | null,
	id: string
) {
	const [row] = await db
		.select()
		.from(rosterEntry)
		.where(and(eq(rosterEntry.id, id), eq(rosterEntry.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Roster entry not found." });
	}
	assertEmployeeInScope(scope, row.employeeId);
	return row;
}

// ── read: list entries in a date range, employee-scoped ──
const rosterList = authorizedProcedure("roster", "read")
	.input(
		z.object({
			from: dateStr,
			to: dateStr,
			employeeId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await rosterEmployeeScope(context);
		if (scope !== null && scope.length === 0) {
			return [];
		}
		const conditions = [
			eq(rosterEntry.organizationId, oid),
			gte(rosterEntry.date, toDate(input.from)),
			lte(rosterEntry.date, toDate(input.to)),
		];
		if (input.employeeId) {
			assertEmployeeInScope(scope, input.employeeId);
			conditions.push(eq(rosterEntry.employeeId, input.employeeId));
		} else if (scope !== null) {
			conditions.push(inArray(rosterEntry.employeeId, scope));
		}
		const rows = await db
			.select({
				id: rosterEntry.id,
				employeeId: rosterEntry.employeeId,
				employeeFirstName: employeeProfile.firstName,
				employeeLastName: employeeProfile.lastName,
				date: rosterEntry.date,
				shiftId: rosterEntry.shiftId,
				shiftName: shift.name,
				overrideType: rosterEntry.overrideType,
				customStartMinutes: rosterEntry.customStartMinutes,
				customEndMinutes: rosterEntry.customEndMinutes,
				note: rosterEntry.note,
				isApproved: rosterEntry.isApproved,
				approvedAt: rosterEntry.approvedAt,
			})
			.from(rosterEntry)
			.innerJoin(
				employeeProfile,
				eq(rosterEntry.employeeId, employeeProfile.id)
			)
			.leftJoin(shift, eq(rosterEntry.shiftId, shift.id))
			.where(and(...conditions))
			.orderBy(asc(rosterEntry.date), asc(employeeProfile.firstName));
		return rows;
	});

// ── read: the caller's OWN roster (employee self-service) ──
const rosterListMine = authorizedProcedure("roster", "read")
	.input(z.object({ from: dateStr, to: dateStr }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			return [];
		}
		const rows = await db
			.select({
				id: rosterEntry.id,
				date: rosterEntry.date,
				shiftId: rosterEntry.shiftId,
				shiftName: shift.name,
				overrideType: rosterEntry.overrideType,
				customStartMinutes: rosterEntry.customStartMinutes,
				customEndMinutes: rosterEntry.customEndMinutes,
				note: rosterEntry.note,
				isApproved: rosterEntry.isApproved,
				approvedAt: rosterEntry.approvedAt,
			})
			.from(rosterEntry)
			.leftJoin(shift, eq(rosterEntry.shiftId, shift.id))
			.where(
				and(
					eq(rosterEntry.organizationId, oid),
					eq(rosterEntry.employeeId, me.id),
					gte(rosterEntry.date, toDate(input.from)),
					lte(rosterEntry.date, toDate(input.to))
				)
			)
			.orderBy(asc(rosterEntry.date));
		return rows;
	});

// ── read: active shifts for assignment pickers ──
const rosterShifts = authorizedProcedure("roster", "read").handler(
	async ({ context }) =>
		await db
			.select({ id: shift.id, name: shift.name, isActive: shift.isActive })
			.from(shift)
			.where(
				and(eq(shift.organizationId, orgId(context)), eq(shift.isActive, true))
			)
			.orderBy(asc(shift.name))
);

// ── read: a single entry ──
const rosterGetById = authorizedProcedure("roster", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const scope = await rosterEmployeeScope(context);
		return await loadEntryScoped(orgId(context), scope, input.id);
	});

const entryFields = z.object({
	shiftId: z.string().nullable().optional(),
	overrideType: overrideTypeEnum.default("none"),
	customStartMinutes: z
		.number()
		.int()
		.min(0)
		.max(MINUTES_IN_DAY)
		.nullable()
		.optional(),
	customEndMinutes: z
		.number()
		.int()
		.min(0)
		.max(MINUTES_IN_DAY)
		.nullable()
		.optional(),
	note: z.string().max(500).nullable().optional(),
});

// ── manage: create one entry ──
const rosterCreate = authorizedProcedure("roster", "manage")
	.input(
		entryFields.extend({
			employeeId: z.string(),
			date: dateStr,
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await rosterEmployeeScope(context);
		assertEmployeeInScope(scope, input.employeeId);
		const custom = validateOverride(input);
		if (input.shiftId) {
			await assertShiftInOrg(oid, input.shiftId);
		}
		// Unique(employee, date) — surface a clear conflict instead of a raw 23505.
		const [existing] = await db
			.select({ id: rosterEntry.id })
			.from(rosterEntry)
			.where(
				and(
					eq(rosterEntry.organizationId, oid),
					eq(rosterEntry.employeeId, input.employeeId),
					eq(rosterEntry.date, toDate(input.date))
				)
			)
			.limit(1);
		if (existing) {
			throw new ORPCError("CONFLICT", {
				message: "A roster entry already exists for this employee and date.",
			});
		}
		const id = createId();
		await db.insert(rosterEntry).values({
			id,
			organizationId: oid,
			employeeId: input.employeeId,
			date: toDate(input.date),
			shiftId: input.shiftId ?? null,
			overrideType: input.overrideType,
			customStartMinutes: custom.customStartMinutes,
			customEndMinutes: custom.customEndMinutes,
			note: input.note ?? null,
			isApproved: false,
		});
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "roster_entry",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { employeeId: input.employeeId, date: input.date },
		});
		return { id };
	});

// ── manage: update an entry (schedule change re-opens approval) ──
const rosterUpdate = authorizedProcedure("roster", "manage")
	.input(entryFields.extend({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await rosterEmployeeScope(context);
		const current = await loadEntryScoped(oid, scope, input.id);
		const custom = validateOverride(input);
		if (input.shiftId) {
			await assertShiftInOrg(oid, input.shiftId);
		}
		await db
			.update(rosterEntry)
			.set({
				shiftId: input.shiftId ?? null,
				overrideType: input.overrideType,
				customStartMinutes: custom.customStartMinutes,
				customEndMinutes: custom.customEndMinutes,
				note: input.note ?? null,
				// Editing the schedule re-opens approval — payroll must not consume a
				// changed day on a stale approval.
				isApproved: false,
				approvedByUserId: null,
				approvedAt: null,
			})
			.where(
				and(eq(rosterEntry.id, input.id), eq(rosterEntry.organizationId, oid))
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "roster_entry",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { employeeId: current.employeeId },
		});
		return { id: input.id };
	});

// ── manage: remove an entry (non-destructive: deletes one schedule row only) ──
const rosterRemove = authorizedProcedure("roster", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await rosterEmployeeScope(context);
		const current = await loadEntryScoped(oid, scope, input.id);
		await db
			.delete(rosterEntry)
			.where(
				and(eq(rosterEntry.id, input.id), eq(rosterEntry.organizationId, oid))
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "roster_entry",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
			metadata: { employeeId: current.employeeId },
		});
		return { id: input.id };
	});

// ── manage: bulk-assign a shift across a date range (recurring weekday pattern) ──
const MAX_BULK_DAYS = 366;
const rosterBulkAssign = authorizedProcedure("roster", "manage")
	.input(
		z.object({
			employeeId: z.string(),
			shiftId: z.string(),
			from: dateStr,
			to: dateStr,
			// 0=Sun … 6=Sat. Empty/omitted = every day in the range.
			weekdays: z.array(z.number().int().min(0).max(6)).optional(),
			skipExisting: z.boolean().default(true),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await rosterEmployeeScope(context);
		assertEmployeeInScope(scope, input.employeeId);
		await assertShiftInOrg(oid, input.shiftId);
		const start = toDate(input.from);
		const end = toDate(input.to);
		if (start > end) {
			throw new ORPCError("BAD_REQUEST", { message: "from must be ≤ to." });
		}
		const dayCount =
			Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
		if (dayCount > MAX_BULK_DAYS) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Range too large (max ${MAX_BULK_DAYS} days).`,
			});
		}
		const weekdaySet =
			input.weekdays && input.weekdays.length > 0
				? new Set(input.weekdays)
				: null;

		// Existing dates for this employee in range (avoid unique-constraint clashes).
		const existingRows = await db
			.select({ date: rosterEntry.date })
			.from(rosterEntry)
			.where(
				and(
					eq(rosterEntry.organizationId, oid),
					eq(rosterEntry.employeeId, input.employeeId),
					gte(rosterEntry.date, start),
					lte(rosterEntry.date, end)
				)
			);
		const existing = new Set(existingRows.map((r) => isoDate(r.date)));

		const values: (typeof rosterEntry.$inferInsert)[] = [];
		let skipped = 0;
		for (const d of enumerateRosterDates(start, end, weekdaySet)) {
			if (existing.has(isoDate(d))) {
				if (input.skipExisting) {
					skipped += 1;
					continue;
				}
				throw new ORPCError("CONFLICT", {
					message: `Roster entry already exists on ${isoDate(d)}.`,
				});
			}
			values.push({
				id: createId(),
				organizationId: oid,
				employeeId: input.employeeId,
				date: new Date(d),
				shiftId: input.shiftId,
				overrideType: "none",
				isApproved: false,
			});
		}
		if (values.length > 0) {
			await db.insert(rosterEntry).values(values);
			await createAuditEvent(db, {
				organizationId: oid,
				entityType: "roster_entry",
				entityId: input.employeeId,
				action: "create",
				actorId: actorId(context),
				metadata: {
					bulk: true,
					employeeId: input.employeeId,
					shiftId: input.shiftId,
					created: values.length,
					skipped,
					from: input.from,
					to: input.to,
				},
			});
		}
		return { created: values.length, skipped };
	});

// ── approve: set/clear approval on one entry ──
const rosterSetApproval = authorizedProcedure("roster", "approve")
	.input(z.object({ id: z.string(), approve: z.boolean() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await rosterEmployeeScope(context);
		await loadEntryScoped(oid, scope, input.id);
		await db
			.update(rosterEntry)
			.set({
				isApproved: input.approve,
				approvedByUserId: input.approve ? actorId(context) : null,
				approvedAt: input.approve ? new Date() : null,
			})
			.where(
				and(eq(rosterEntry.id, input.id), eq(rosterEntry.organizationId, oid))
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "roster_entry",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { approval: input.approve },
		});
		return { id: input.id, isApproved: input.approve };
	});

// ── approve: bulk-approve an employee's entries in a range ──
const rosterApproveRange = authorizedProcedure("roster", "approve")
	.input(z.object({ employeeId: z.string(), from: dateStr, to: dateStr }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await rosterEmployeeScope(context);
		assertEmployeeInScope(scope, input.employeeId);
		const updated = await db
			.update(rosterEntry)
			.set({
				isApproved: true,
				approvedByUserId: actorId(context),
				approvedAt: new Date(),
			})
			.where(
				and(
					eq(rosterEntry.organizationId, oid),
					eq(rosterEntry.employeeId, input.employeeId),
					gte(rosterEntry.date, toDate(input.from)),
					lte(rosterEntry.date, toDate(input.to)),
					eq(rosterEntry.isApproved, false)
				)
			)
			.returning({ id: rosterEntry.id });
		if (updated.length > 0) {
			await createAuditEvent(db, {
				organizationId: oid,
				entityType: "roster_entry",
				entityId: input.employeeId,
				action: "update",
				actorId: actorId(context),
				metadata: {
					bulkApprove: true,
					employeeId: input.employeeId,
					approved: updated.length,
				},
			});
		}
		return { approved: updated.length };
	});

// ─── Schedule rules (Phase 21J) — tenant-configurable, effective-dated pay policy ───
//
// Reuses the `roster` AC resource (read/manage) so audit stays 161/21. Two-layer
// authz: AC gate + a handler narrowing for mutations (admin/HR/payroll only — NOT
// managers; pay policy is least-privilege). All reads/writes are org-scoped.

// Mutation guard: managers hold roster:manage (for assignments) but may not edit
// pay policy. Throw for anyone outside admin/HR/payroll.
function assertCanManageScheduleRules(context: unknown): void {
	if (!canManageScheduleRules(role(context))) {
		throw new ORPCError("FORBIDDEN", {
			message:
				"Only HR and payroll administrators can manage work-schedule rules.",
		});
	}
}

const minutesInDay = z.number().int().min(0).max(MINUTES_IN_DAY);
const isoWeekdays = z.array(z.number().int().min(1).max(7));
const multiplier = z
	.number()
	.min(0)
	.max(99.99)
	.transform((n) => n.toFixed(2));

const scheduleRuleWrite = z.object({
	name: z.string().min(1).max(200),
	shiftId: z.string().nullable().optional(),
	effectiveFrom: dateStr,
	effectiveTo: dateStr.nullable().optional(),
	isPublished: z.boolean().optional(),
	standardDailyMinutes: minutesInDay.nullable().optional(),
	standardWeeklyMinutes: z.number().int().min(0).nullable().optional(),
	workDays: isoWeekdays.nullable().optional(),
	overtimeThresholdDailyMinutes: minutesInDay.nullable().optional(),
	overtimeThresholdWeeklyMinutes: z.number().int().min(0).nullable().optional(),
	graceMinutesLate: z.number().int().min(0).nullable().optional(),
	graceMinutesEarlyOut: z.number().int().min(0).nullable().optional(),
	autoDeductBreak: z.boolean().optional(),
	breakMinutes: z.number().int().min(0).nullable().optional(),
	minBreakDeductionMinutes: z.number().int().min(0).nullable().optional(),
	isSplitShift: z.boolean().optional(),
	splitBreakStartMinutes: minutesInDay.nullable().optional(),
	splitBreakEndMinutes: minutesInDay.nullable().optional(),
	hasNightDifferential: z.boolean().optional(),
	nightDiffStartMinutes: minutesInDay.nullable().optional(),
	nightDiffEndMinutes: minutesInDay.nullable().optional(),
	nightDiffMultiplier: multiplier.nullable().optional(),
	weekdayOvertimeMultiplier: multiplier.nullable().optional(),
	saturdayMultiplier: multiplier.nullable().optional(),
	sundayMultiplier: multiplier.nullable().optional(),
	publicHolidayMultiplier: multiplier.nullable().optional(),
	saturdayShiftStartMinutes: minutesInDay.nullable().optional(),
	saturdayShiftEndMinutes: minutesInDay.nullable().optional(),
	isFlexiTime: z.boolean().optional(),
	capDailyPaidMinutes: z.number().int().min(0).nullable().optional(),
});

// Load a shift_rule row, tenant-checked.
async function loadScheduleRule(oid: string, id: string) {
	const [row] = await db
		.select()
		.from(shiftRule)
		.where(and(eq(shiftRule.id, id), eq(shiftRule.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Schedule rule not found." });
	}
	return row;
}

// ── read: list schedule rules (org-scoped; published-only unless a payroll/HR/
//    auditor caller asks to include unpublished drafts) ──
const scheduleRulesList = authorizedProcedure("roster", "read")
	.input(
		z.object({
			shiftId: z.string().nullable().optional(),
			includeUnpublished: z.boolean().optional().default(false),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const conditions = [eq(shiftRule.organizationId, oid)];
		// Only org-wide roster viewers may see unpublished drafts.
		if (!(input.includeUnpublished && seesAllRoster(role(context)))) {
			conditions.push(eq(shiftRule.isPublished, true));
		}
		if (input.shiftId === null) {
			conditions.push(isNull(shiftRule.shiftId));
		} else if (input.shiftId) {
			conditions.push(eq(shiftRule.shiftId, input.shiftId));
		}
		return await db
			.select()
			.from(shiftRule)
			.where(and(...conditions))
			.orderBy(asc(shiftRule.shiftId), desc(shiftRule.effectiveFrom));
	});

const scheduleRulesGetById = authorizedProcedure("roster", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) =>
		loadScheduleRule(orgId(context), input.id)
	);

// ── read: resolve the effective rule for a (shift|employee, date) ──
// Employees resolve their OWN shift; managers their reports'; org-wide viewers any.
const scheduleRulesResolve = authorizedProcedure("roster", "read")
	.input(
		z.object({
			date: dateStr,
			shiftId: z.string().nullable().optional(),
			employeeId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await rosterEmployeeScope(context);
		let targetShiftId: string | null = null;
		if (input.shiftId === undefined) {
			// Resolve via an employee's assigned shift. Default to the caller.
			let employeeId = input.employeeId;
			if (!employeeId) {
				const me = await resolveCurrentEmployee(oid, actorId(context));
				employeeId = me?.id;
			}
			if (employeeId) {
				assertEmployeeInScope(scope, employeeId);
				const [wi] = await db
					.select({ shiftId: employeeWorkInfo.shiftId })
					.from(employeeWorkInfo)
					.innerJoin(
						employeeProfile,
						eq(employeeWorkInfo.employeeId, employeeProfile.id)
					)
					.where(
						and(
							eq(employeeWorkInfo.employeeId, employeeId),
							eq(employeeProfile.organizationId, oid)
						)
					)
					.limit(1);
				targetShiftId = wi?.shiftId ?? null;
			}
		} else {
			if (input.shiftId) {
				await assertShiftInOrg(oid, input.shiftId);
			}
			targetShiftId = input.shiftId;
		}
		const resolved = await resolveScheduleConfig(
			oid,
			targetShiftId,
			toDate(input.date)
		);
		return { shiftId: targetShiftId, date: input.date, ...resolved };
	});

// ── manage: create / update / archive (admin/HR/payroll only) ──
const scheduleRulesCreate = authorizedProcedure("roster", "manage")
	.input(scheduleRuleWrite)
	.handler(async ({ context, input }) => {
		assertCanManageScheduleRules(context);
		const oid = orgId(context);
		if (input.shiftId) {
			await assertShiftInOrg(oid, input.shiftId);
		}
		const id = createId();
		// The Zod input keys match the column names 1:1; absent optional fields are
		// undefined → Drizzle uses NULL / the column default. Only the dates and
		// shiftId need transforming. (Spread keeps this flat — no per-field `??`.)
		const { effectiveFrom, effectiveTo, ...rest } = input;
		const [row] = await db
			.insert(shiftRule)
			.values({
				...rest,
				id,
				organizationId: oid,
				shiftId: input.shiftId ?? null,
				effectiveFrom: toDate(effectiveFrom),
				effectiveTo: effectiveTo ? toDate(effectiveTo) : null,
			})
			.returning();
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "shift_rule",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return row;
	});

const scheduleRulesUpdate = authorizedProcedure("roster", "manage")
	.input(scheduleRuleWrite.partial().extend({ id: z.string() }))
	.handler(async ({ context, input }) => {
		assertCanManageScheduleRules(context);
		const oid = orgId(context);
		await loadScheduleRule(oid, input.id); // tenant check
		const { id, shiftId, effectiveFrom, effectiveTo, ...rest } = input;
		if (shiftId) {
			await assertShiftInOrg(oid, shiftId);
		}
		const updates: Record<string, unknown> = { ...rest };
		if (shiftId !== undefined) {
			updates.shiftId = shiftId ?? null;
		}
		if (effectiveFrom !== undefined) {
			updates.effectiveFrom = toDate(effectiveFrom);
		}
		if (effectiveTo !== undefined) {
			updates.effectiveTo = effectiveTo ? toDate(effectiveTo) : null;
		}
		const [row] = await db
			.update(shiftRule)
			.set(updates)
			.where(and(eq(shiftRule.id, id), eq(shiftRule.organizationId, oid)))
			.returning();
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "shift_rule",
			entityId: id,
			action: "update",
			actorId: actorId(context),
		});
		return row;
	});

// Archive = unpublish (removes from resolution but preserves the row for history).
const scheduleRulesArchive = authorizedProcedure("roster", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		assertCanManageScheduleRules(context);
		const oid = orgId(context);
		await loadScheduleRule(oid, input.id);
		const [row] = await db
			.update(shiftRule)
			.set({ isPublished: false })
			.where(and(eq(shiftRule.id, input.id), eq(shiftRule.organizationId, oid)))
			.returning();
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "shift_rule",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return row;
	});

export const rosterRouter = {
	list: rosterList,
	listMine: rosterListMine,
	shifts: rosterShifts,
	getById: rosterGetById,
	create: rosterCreate,
	update: rosterUpdate,
	remove: rosterRemove,
	bulkAssign: rosterBulkAssign,
	setApproval: rosterSetApproval,
	approveRange: rosterApproveRange,
	scheduleRules: {
		list: scheduleRulesList,
		getById: scheduleRulesGetById,
		resolve: scheduleRulesResolve,
		create: scheduleRulesCreate,
		update: scheduleRulesUpdate,
		archive: scheduleRulesArchive,
	},
};
