import { db } from "@Heimdallone/db";
import {
	attendanceException,
	attendancePunch,
	geofenceCheckIn,
} from "@Heimdallone/db/schema/biometric";
import {
	attendanceCorrection,
	attendanceEvent,
	attendanceRecord,
	attendanceSetting,
	employeeProfile,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/index";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure, tenantProcedure } from "../index";
import {
	classifyDayType,
	getEmployeeShiftInfo,
	getShiftScheduleForDay,
	recalculateRecord,
} from "../utils/attendance-recalc";
import { createAuditEvent } from "../utils/audit";
import {
	canReadAllEmployees,
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

import { canManageHR, canManagePayroll } from "../utils/role-helpers";

async function scopedEmployeeIds(
	organizationId: string,
	userId: string,
	memberRole: string
): Promise<string[] | "all"> {
	if (canReadAllEmployees(memberRole)) {
		return "all";
	}

	const currentEmp = await resolveCurrentEmployee(organizationId, userId);
	if (!currentEmp) {
		return [];
	}

	if (memberRole === "manager") {
		const reportIds = await getDirectReportIds(currentEmp.id);
		return [currentEmp.id, ...reportIds];
	}

	return [currentEmp.id];
}

function assertNotLocked(record: { payrollStatus: string }): void {
	if (record.payrollStatus === "payroll_locked") {
		throw new ORPCError("PRECONDITION_FAILED", {
			message:
				"This attendance record is locked for payroll and cannot be modified.",
		});
	}
}

const clockCheckIn = tenantProcedure
	.input(z.object({ notes: z.string().optional() }))
	.handler(async ({ context, input }) => {
		const currentEmp = await resolveCurrentEmployee(
			orgId(context),
			actorId(context)
		);
		if (!currentEmp) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "You don't have an employee profile in this organization.",
			});
		}

		const today = new Date();
		const todayDate = new Date(
			today.getFullYear(),
			today.getMonth(),
			today.getDate()
		);

		const [openEvent] = await db
			.select({ id: attendanceEvent.id })
			.from(attendanceEvent)
			.where(
				and(
					eq(attendanceEvent.employeeId, currentEmp.id),
					eq(attendanceEvent.eventDate, todayDate),
					sql`${attendanceEvent.clockOut} IS NULL`
				)
			)
			.limit(1);

		if (openEvent) {
			throw new ORPCError("CONFLICT", {
				message:
					"You already have an open clock-in today. Clock out first before clocking in again.",
			});
		}

		const now = new Date();
		const eventId = createId();
		await db.insert(attendanceEvent).values({
			id: eventId,
			organizationId: orgId(context),
			employeeId: currentEmp.id,
			eventDate: todayDate,
			clockIn: now,
			source: "manual",
			notes: input.notes,
		});

		const [existing] = await db
			.select({ id: attendanceRecord.id })
			.from(attendanceRecord)
			.where(
				and(
					eq(attendanceRecord.employeeId, currentEmp.id),
					eq(attendanceRecord.date, todayDate)
				)
			)
			.limit(1);

		const empWorkInfo = await getEmployeeShiftInfo(currentEmp.id);
		const todayDow = today.getDay();
		const schedule = empWorkInfo?.shiftId
			? await getShiftScheduleForDay(empWorkInfo.shiftId, todayDow)
			: null;
		const minMinutes = schedule?.minimumWorkMinutes ?? 495;

		if (!existing) {
			const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
			const dayType = classifyDayType(todayDate, todayDow);
			await db.insert(attendanceRecord).values({
				id: createId(),
				organizationId: orgId(context),
				employeeId: currentEmp.id,
				date: todayDate,
				shiftId: empWorkInfo?.shiftId ?? null,
				firstClockIn: timeStr,
				minimumMinutes: minMinutes,
				dayType,
			});
		}

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_event",
			entityId: eventId,
			action: "create",
			actorId: actorId(context),
			metadata: { action: "check_in" },
		});

		return { eventId, clockIn: now.toISOString() };
	});

const clockCheckOut = tenantProcedure
	.input(z.object({ notes: z.string().optional() }))
	.handler(async ({ context, input }) => {
		const currentEmp = await resolveCurrentEmployee(
			orgId(context),
			actorId(context)
		);
		if (!currentEmp) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "You don't have an employee profile in this organization.",
			});
		}

		const today = new Date();
		const todayDate = new Date(
			today.getFullYear(),
			today.getMonth(),
			today.getDate()
		);

		const [openEvent] = await db
			.select({
				id: attendanceEvent.id,
				clockIn: attendanceEvent.clockIn,
			})
			.from(attendanceEvent)
			.where(
				and(
					eq(attendanceEvent.employeeId, currentEmp.id),
					eq(attendanceEvent.eventDate, todayDate),
					sql`${attendanceEvent.clockOut} IS NULL`
				)
			)
			.limit(1);

		if (!openEvent) {
			throw new ORPCError("NOT_FOUND", {
				message: "No open clock-in found for today. Clock in first.",
			});
		}

		const now = new Date();
		const duration = Math.round(
			(now.getTime() - openEvent.clockIn.getTime()) / 60_000
		);

		await db
			.update(attendanceEvent)
			.set({
				clockOut: now,
				durationMinutes: duration,
				notes: input.notes ?? undefined,
			})
			.where(eq(attendanceEvent.id, openEvent.id));

		await recalculateRecord(currentEmp.id, todayDate, orgId(context));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_event",
			entityId: openEvent.id,
			action: "update",
			actorId: actorId(context),
			metadata: { action: "check_out" },
		});

		return { eventId: openEvent.id, clockOut: now.toISOString(), duration };
	});

const clockCurrentStatus = tenantProcedure.handler(async ({ context }) => {
	const currentEmp = await resolveCurrentEmployee(
		orgId(context),
		actorId(context)
	);
	if (!currentEmp) {
		return { isClockedIn: false, employee: null };
	}

	const today = new Date();
	const todayDate = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate()
	);

	const [openEvent] = await db
		.select({
			id: attendanceEvent.id,
			clockIn: attendanceEvent.clockIn,
		})
		.from(attendanceEvent)
		.where(
			and(
				eq(attendanceEvent.employeeId, currentEmp.id),
				eq(attendanceEvent.eventDate, todayDate),
				sql`${attendanceEvent.clockOut} IS NULL`
			)
		)
		.limit(1);

	const [todayRecord] = await db
		.select({
			workedMinutes: attendanceRecord.workedMinutes,
			status: attendanceRecord.status,
		})
		.from(attendanceRecord)
		.where(
			and(
				eq(attendanceRecord.employeeId, currentEmp.id),
				eq(attendanceRecord.date, todayDate)
			)
		)
		.limit(1);

	return {
		isClockedIn: !!openEvent,
		clockInTime: openEvent?.clockIn.toISOString() ?? null,
		employee: {
			id: currentEmp.id,
			name: `${currentEmp.firstName} ${currentEmp.lastName ?? ""}`.trim(),
		},
		todayWorkedMinutes: todayRecord?.workedMinutes ?? 0,
		todayStatus: todayRecord?.status ?? null,
	};
});

// Phase 11G CP4: derive a record's attendance source (from its events) + a
// needs-review flag (from any open/in_review exception on that employee+date)
// for the attendance UI. Source is returned as a key the UI maps to a plain
// label (never a raw enum/ID shown as primary text). No raw GPS is exposed.
function toDateKey(d: Date | string): string {
	const date = typeof d === "string" ? new Date(d) : d;
	return date.toISOString().slice(0, 10);
}

function deriveSourceKey(sources: Set<string>): string {
	if (sources.size === 0) {
		return "none";
	}
	if (sources.size === 1) {
		return [...sources][0] ?? "none";
	}
	return "mixed";
}

interface RecordRow {
	date: Date | string;
	employeeId: string | null;
	id: string;
}

async function enrichRecordsSourceReview<T extends RecordRow>(
	organizationId: string,
	records: T[]
): Promise<Array<T & { source: string; needsReview: boolean }>> {
	const empIds = [
		...new Set(
			records.map((r) => r.employeeId).filter((id): id is string => !!id)
		),
	];
	if (empIds.length === 0) {
		return records.map((r) => ({ ...r, source: "none", needsReview: false }));
	}
	const dateObjs = [
		...new Map(
			records.map((r) => [
				toDateKey(r.date),
				r.date instanceof Date ? r.date : new Date(r.date),
			])
		).values(),
	];

	const events = await db
		.select({
			employeeId: attendanceEvent.employeeId,
			eventDate: attendanceEvent.eventDate,
			source: attendanceEvent.source,
		})
		.from(attendanceEvent)
		.where(
			and(
				eq(attendanceEvent.organizationId, organizationId),
				inArray(attendanceEvent.employeeId, empIds),
				inArray(attendanceEvent.eventDate, dateObjs)
			)
		);
	const srcMap = new Map<string, Set<string>>();
	for (const e of events) {
		if (!e.employeeId) {
			continue;
		}
		const key = `${e.employeeId}|${toDateKey(e.eventDate)}`;
		let set = srcMap.get(key);
		if (!set) {
			set = new Set<string>();
			srcMap.set(key, set);
		}
		set.add(e.source);
	}

	const excs = await db
		.select({
			employeeId: attendanceException.employeeId,
			recordId: attendanceException.attendanceRecordId,
			punchTime: attendancePunch.punchTime,
			eventDate: attendanceEvent.eventDate,
			capturedAt: geofenceCheckIn.capturedAt,
			createdAt: attendanceException.createdAt,
		})
		.from(attendanceException)
		.leftJoin(
			attendancePunch,
			eq(attendanceException.attendancePunchId, attendancePunch.id)
		)
		.leftJoin(
			attendanceEvent,
			eq(attendanceException.attendanceEventId, attendanceEvent.id)
		)
		.leftJoin(
			geofenceCheckIn,
			eq(attendanceException.geofenceCheckInId, geofenceCheckIn.id)
		)
		.where(
			and(
				eq(attendanceException.organizationId, organizationId),
				inArray(attendanceException.employeeId, empIds),
				inArray(attendanceException.status, ["open", "in_review"])
			)
		);
	const reviewByRecordId = new Set<string>();
	const reviewByEmpDate = new Set<string>();
	for (const x of excs) {
		if (x.recordId) {
			reviewByRecordId.add(x.recordId);
		}
		if (!x.employeeId) {
			continue;
		}
		const when = x.punchTime ?? x.eventDate ?? x.capturedAt ?? x.createdAt;
		if (when) {
			reviewByEmpDate.add(`${x.employeeId}|${toDateKey(when)}`);
		}
	}

	return records.map((r) => {
		const key = r.employeeId ? `${r.employeeId}|${toDateKey(r.date)}` : "";
		return {
			...r,
			source: deriveSourceKey(srcMap.get(key) ?? new Set<string>()),
			needsReview:
				reviewByRecordId.has(r.id) || (key !== "" && reviewByEmpDate.has(key)),
		};
	});
}

const recordsList = authorizedProcedure("attendance", "read")
	.input(
		z.object({
			startDate: z.string().optional(),
			endDate: z.string().optional(),
			employeeId: z.string().optional(),
			departmentId: z.string().optional(),
			isValidated: z.boolean().optional(),
			payrollStatus: z
				.enum(["pending", "approved", "payroll_locked"])
				.optional(),
			status: z
				.enum(["present", "half_day", "absent", "holiday", "conflict"])
				.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);

		const conditions = [eq(attendanceRecord.organizationId, orgId(context))];

		if (input.startDate) {
			conditions.push(gte(attendanceRecord.date, new Date(input.startDate)));
		}
		if (input.endDate) {
			conditions.push(lte(attendanceRecord.date, new Date(input.endDate)));
		}
		if (input.employeeId) {
			conditions.push(eq(attendanceRecord.employeeId, input.employeeId));
		}
		if (input.isValidated !== undefined) {
			conditions.push(eq(attendanceRecord.isValidated, input.isValidated));
		}
		if (input.payrollStatus) {
			conditions.push(eq(attendanceRecord.payrollStatus, input.payrollStatus));
		}
		if (input.status) {
			conditions.push(eq(attendanceRecord.status, input.status));
		}

		if (scope !== "all") {
			if (scope.length === 0) {
				return { data: [], total: 0 };
			}
			conditions.push(
				sql`${attendanceRecord.employeeId} IN (${sql.join(
					scope.map((id) => sql`${id}`),
					sql`, `
				)})`
			);
		}

		if (input.departmentId) {
			conditions.push(
				sql`${attendanceRecord.employeeId} IN (
					SELECT ${employeeWorkInfo.employeeId} FROM ${employeeWorkInfo}
					WHERE ${employeeWorkInfo.departmentId} = ${input.departmentId}
				)`
			);
		}

		const where = and(...conditions);

		const [totalResult] = await db
			.select({ total: count() })
			.from(attendanceRecord)
			.where(where);

		const offset = (input.page - 1) * input.pageSize;

		const data = await db
			.select({
				id: attendanceRecord.id,
				employeeId: attendanceRecord.employeeId,
				employeeFirstName: employeeProfile.firstName,
				employeeLastName: employeeProfile.lastName,
				date: attendanceRecord.date,
				firstClockIn: attendanceRecord.firstClockIn,
				lastClockOut: attendanceRecord.lastClockOut,
				workedMinutes: attendanceRecord.workedMinutes,
				minimumMinutes: attendanceRecord.minimumMinutes,
				payableMinutes: attendanceRecord.payableMinutes,
				overtimeMinutes: attendanceRecord.overtimeMinutes,
				approvedOvertimeMinutes: attendanceRecord.approvedOvertimeMinutes,
				lateMinutes: attendanceRecord.lateMinutes,
				earlyLeaveMinutes: attendanceRecord.earlyLeaveMinutes,
				breakDeductedMinutes: attendanceRecord.breakDeductedMinutes,
				status: attendanceRecord.status,
				dayType: attendanceRecord.dayType,
				isValidated: attendanceRecord.isValidated,
				isOvertimeApproved: attendanceRecord.isOvertimeApproved,
				isHoliday: attendanceRecord.isHoliday,
				payrollStatus: attendanceRecord.payrollStatus,
				notes: attendanceRecord.notes,
			})
			.from(attendanceRecord)
			.leftJoin(
				employeeProfile,
				eq(attendanceRecord.employeeId, employeeProfile.id)
			)
			.where(where)
			.orderBy(desc(attendanceRecord.date))
			.limit(input.pageSize)
			.offset(offset);

		const enriched = await enrichRecordsSourceReview(orgId(context), data);
		return { data: enriched, total: totalResult?.total ?? 0 };
	});

const recordsGetById = authorizedProcedure("attendance", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [record] = await db
			.select()
			.from(attendanceRecord)
			.where(
				and(
					eq(attendanceRecord.id, input.id),
					eq(attendanceRecord.organizationId, orgId(context))
				)
			)
			.limit(1);

		if (!record) {
			throw new ORPCError("NOT_FOUND", {
				message: "Attendance record not found.",
			});
		}

		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);
		if (scope !== "all" && !scope.includes(record.employeeId)) {
			throw new ORPCError("FORBIDDEN", {
				message: "You don't have access to this employee's records.",
			});
		}

		const events = await db
			.select()
			.from(attendanceEvent)
			.where(
				and(
					eq(attendanceEvent.employeeId, record.employeeId),
					eq(attendanceEvent.eventDate, record.date)
				)
			)
			.orderBy(attendanceEvent.clockIn);

		return { ...record, events };
	});

const recordsValidate = authorizedProcedure("attendance", "correct")
	.input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
	.handler(async ({ context, input }) => {
		let validated = 0;

		for (const id of input.ids) {
			const [record] = await db
				.select({
					id: attendanceRecord.id,
					payrollStatus: attendanceRecord.payrollStatus,
					employeeId: attendanceRecord.employeeId,
					organizationId: attendanceRecord.organizationId,
				})
				.from(attendanceRecord)
				.where(
					and(
						eq(attendanceRecord.id, id),
						eq(attendanceRecord.organizationId, orgId(context))
					)
				)
				.limit(1);

			if (!record) {
				continue;
			}
			assertNotLocked(record);

			await checkScopeForMutation(context, record.employeeId);

			await db
				.update(attendanceRecord)
				.set({
					isValidated: true,
					validatedBy: actorId(context),
					validatedAt: new Date(),
				})
				.where(eq(attendanceRecord.id, id));

			await createAuditEvent(db as never, {
				organizationId: orgId(context),
				entityType: "attendance_record",
				entityId: id,
				action: "update",
				actorId: actorId(context),
				changes: [{ field: "isValidated", oldValue: false, newValue: true }],
				metadata: { action: "validate" },
			});

			validated++;
		}

		return { validated };
	});

const recordsApproveOvertime = authorizedProcedure("attendance", "correct")
	.input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
	.handler(async ({ context, input }) => {
		let approved = 0;

		for (const id of input.ids) {
			const [record] = await db
				.select({
					id: attendanceRecord.id,
					payrollStatus: attendanceRecord.payrollStatus,
					overtimeMinutes: attendanceRecord.overtimeMinutes,
					employeeId: attendanceRecord.employeeId,
					organizationId: attendanceRecord.organizationId,
				})
				.from(attendanceRecord)
				.where(
					and(
						eq(attendanceRecord.id, id),
						eq(attendanceRecord.organizationId, orgId(context))
					)
				)
				.limit(1);

			if (!record || record.overtimeMinutes === 0) {
				continue;
			}
			assertNotLocked(record);

			await checkScopeForMutation(context, record.employeeId);

			await db
				.update(attendanceRecord)
				.set({
					isOvertimeApproved: true,
					overtimeApprovedBy: actorId(context),
					approvedOvertimeMinutes: record.overtimeMinutes,
				})
				.where(eq(attendanceRecord.id, id));

			await createAuditEvent(db as never, {
				organizationId: orgId(context),
				entityType: "attendance_record",
				entityId: id,
				action: "update",
				actorId: actorId(context),
				changes: [
					{
						field: "isOvertimeApproved",
						oldValue: false,
						newValue: true,
					},
					{
						field: "approvedOvertimeMinutes",
						oldValue: 0,
						newValue: record.overtimeMinutes,
					},
				],
				metadata: { action: "approve_overtime" },
			});

			approved++;
		}

		return { approved };
	});

const recordsApprovePayroll = authorizedProcedure("attendance", "correct")
	.input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR and payroll admins can approve records for payroll.",
			});
		}

		let approved = 0;
		for (const id of input.ids) {
			const [record] = await db
				.select({
					id: attendanceRecord.id,
					payrollStatus: attendanceRecord.payrollStatus,
					organizationId: attendanceRecord.organizationId,
				})
				.from(attendanceRecord)
				.where(
					and(
						eq(attendanceRecord.id, id),
						eq(attendanceRecord.organizationId, orgId(context))
					)
				)
				.limit(1);

			if (!record || record.payrollStatus !== "pending") {
				continue;
			}

			await db
				.update(attendanceRecord)
				.set({ payrollStatus: "approved" })
				.where(eq(attendanceRecord.id, id));

			await createAuditEvent(db as never, {
				organizationId: orgId(context),
				entityType: "attendance_record",
				entityId: id,
				action: "update",
				actorId: actorId(context),
				changes: [
					{
						field: "payrollStatus",
						oldValue: "pending",
						newValue: "approved",
					},
				],
				metadata: { action: "approve_payroll" },
			});

			approved++;
		}

		return { approved };
	});

const recordsLockForPayroll = authorizedProcedure("attendance", "correct")
	.input(
		z.object({
			startDate: z.string(),
			endDate: z.string(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManagePayroll(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR and payroll admins can lock records for payroll.",
			});
		}

		const result = await db
			.update(attendanceRecord)
			.set({ payrollStatus: "payroll_locked" })
			.where(
				and(
					eq(attendanceRecord.organizationId, orgId(context)),
					eq(attendanceRecord.payrollStatus, "approved"),
					gte(attendanceRecord.date, new Date(input.startDate)),
					lte(attendanceRecord.date, new Date(input.endDate))
				)
			)
			.returning({ id: attendanceRecord.id });

		for (const row of result) {
			await createAuditEvent(db as never, {
				organizationId: orgId(context),
				entityType: "attendance_record",
				entityId: row.id,
				action: "update",
				actorId: actorId(context),
				changes: [
					{
						field: "payrollStatus",
						oldValue: "approved",
						newValue: "payroll_locked",
					},
				],
				metadata: { action: "payroll_lock" },
			});
		}

		return { locked: result.length };
	});

const eventsList = authorizedProcedure("attendance", "read")
	.input(
		z.object({
			employeeId: z.string(),
			startDate: z.string(),
			endDate: z.string(),
		})
	)
	.handler(async ({ context, input }) => {
		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);
		if (scope !== "all" && !scope.includes(input.employeeId)) {
			throw new ORPCError("FORBIDDEN", {
				message: "You don't have access to this employee's events.",
			});
		}

		return db
			.select()
			.from(attendanceEvent)
			.where(
				and(
					eq(attendanceEvent.organizationId, orgId(context)),
					eq(attendanceEvent.employeeId, input.employeeId),
					gte(attendanceEvent.eventDate, new Date(input.startDate)),
					lte(attendanceEvent.eventDate, new Date(input.endDate))
				)
			)
			.orderBy(attendanceEvent.clockIn);
	});

const eventsCreateManual = authorizedProcedure("attendance", "create")
	.input(
		z.object({
			employeeId: z.string(),
			date: z.string(),
			clockIn: z.string(),
			clockOut: z.string().optional(),
			notes: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		await checkScopeForMutation(context, input.employeeId);

		const eventId = createId();
		const eventDate = new Date(input.date);
		const clockInTs = new Date(`${input.date}T${input.clockIn}:00`);
		const clockOutTs = input.clockOut
			? new Date(`${input.date}T${input.clockOut}:00`)
			: null;
		const dur = clockOutTs
			? Math.round((clockOutTs.getTime() - clockInTs.getTime()) / 60_000)
			: null;

		await db.insert(attendanceEvent).values({
			id: eventId,
			organizationId: orgId(context),
			employeeId: input.employeeId,
			eventDate,
			clockIn: clockInTs,
			clockOut: clockOutTs,
			durationMinutes: dur,
			source: "admin",
			notes: input.notes,
		});

		await recalculateRecord(input.employeeId, eventDate, orgId(context));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_event",
			entityId: eventId,
			action: "create",
			actorId: actorId(context),
			metadata: { action: "create_manual" },
		});

		return { eventId };
	});

const correctionsCreate = tenantProcedure
	.input(
		z.object({
			attendanceRecordId: z.string().optional(),
			category: z.enum([
				"forgot_clock_in",
				"forgot_clock_out",
				"wrong_time",
				"system_error",
				"other",
			]),
			requestedChanges: z.record(z.string(), z.unknown()),
			reason: z.string().min(1),
		})
	)
	.handler(async ({ context, input }) => {
		const currentEmp = await resolveCurrentEmployee(
			orgId(context),
			actorId(context)
		);
		if (!currentEmp) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "You don't have an employee profile in this organization.",
			});
		}

		if (input.attendanceRecordId) {
			const [record] = await db
				.select({ id: attendanceRecord.id })
				.from(attendanceRecord)
				.where(
					and(
						eq(attendanceRecord.id, input.attendanceRecordId),
						eq(attendanceRecord.organizationId, orgId(context))
					)
				)
				.limit(1);
			if (!record) {
				throw new ORPCError("NOT_FOUND", {
					message: "Attendance record not found.",
				});
			}
		}

		const correctionId = createId();
		await db.insert(attendanceCorrection).values({
			id: correctionId,
			organizationId: orgId(context),
			attendanceRecordId: input.attendanceRecordId ?? null,
			employeeId: currentEmp.id,
			category: input.category,
			requestedChanges: input.requestedChanges,
			reason: input.reason,
			status: "pending",
		});

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_correction",
			entityId: correctionId,
			action: "create",
			actorId: actorId(context),
			metadata: { category: input.category },
		});

		return { id: correctionId };
	});

const correctionsList = authorizedProcedure("attendance", "read")
	.input(
		z.object({
			status: z.enum(["pending", "approved", "rejected"]).optional(),
			employeeId: z.string().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);

		const conditions = [
			eq(attendanceCorrection.organizationId, orgId(context)),
		];

		if (input.status) {
			conditions.push(eq(attendanceCorrection.status, input.status));
		}
		if (input.employeeId) {
			conditions.push(eq(attendanceCorrection.employeeId, input.employeeId));
		}

		if (scope !== "all") {
			if (scope.length === 0) {
				return { data: [], total: 0 };
			}
			conditions.push(
				sql`${attendanceCorrection.employeeId} IN (${sql.join(
					scope.map((id) => sql`${id}`),
					sql`, `
				)})`
			);
		}

		const where = and(...conditions);

		const [totalResult] = await db
			.select({ total: count() })
			.from(attendanceCorrection)
			.where(where);

		const offset = (input.page - 1) * input.pageSize;

		const data = await db
			.select({
				id: attendanceCorrection.id,
				employeeId: attendanceCorrection.employeeId,
				employeeFirstName: employeeProfile.firstName,
				employeeLastName: employeeProfile.lastName,
				attendanceRecordId: attendanceCorrection.attendanceRecordId,
				category: attendanceCorrection.category,
				requestedChanges: attendanceCorrection.requestedChanges,
				reason: attendanceCorrection.reason,
				status: attendanceCorrection.status,
				reviewNote: attendanceCorrection.reviewNote,
				createdAt: attendanceCorrection.createdAt,
			})
			.from(attendanceCorrection)
			.leftJoin(
				employeeProfile,
				eq(attendanceCorrection.employeeId, employeeProfile.id)
			)
			.where(where)
			.orderBy(desc(attendanceCorrection.createdAt))
			.limit(input.pageSize)
			.offset(offset);

		return { data, total: totalResult?.total ?? 0 };
	});

const correctionsApprove = authorizedProcedure("attendance", "correct")
	.input(
		z.object({
			id: z.string(),
			reviewNote: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const [correction] = await db
			.select()
			.from(attendanceCorrection)
			.where(
				and(
					eq(attendanceCorrection.id, input.id),
					eq(attendanceCorrection.organizationId, orgId(context))
				)
			)
			.limit(1);

		if (!correction) {
			throw new ORPCError("NOT_FOUND", {
				message: "Correction request not found.",
			});
		}
		if (correction.status !== "pending") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This correction has already been reviewed.",
			});
		}

		await checkScopeForMutation(context, correction.employeeId);

		await db
			.update(attendanceCorrection)
			.set({
				status: "approved",
				reviewedBy: actorId(context),
				reviewNote: input.reviewNote ?? null,
				reviewedAt: new Date(),
			})
			.where(eq(attendanceCorrection.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_correction",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "status", oldValue: "pending", newValue: "approved" }],
			metadata: { action: "correction_approve" },
		});

		return { id: input.id, status: "approved" as const };
	});

const correctionsReject = authorizedProcedure("attendance", "correct")
	.input(
		z.object({
			id: z.string(),
			reviewNote: z.string().min(1),
		})
	)
	.handler(async ({ context, input }) => {
		const [correction] = await db
			.select()
			.from(attendanceCorrection)
			.where(
				and(
					eq(attendanceCorrection.id, input.id),
					eq(attendanceCorrection.organizationId, orgId(context))
				)
			)
			.limit(1);

		if (!correction) {
			throw new ORPCError("NOT_FOUND", {
				message: "Correction request not found.",
			});
		}
		if (correction.status !== "pending") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "This correction has already been reviewed.",
			});
		}

		await checkScopeForMutation(context, correction.employeeId);

		await db
			.update(attendanceCorrection)
			.set({
				status: "rejected",
				reviewedBy: actorId(context),
				reviewNote: input.reviewNote,
				reviewedAt: new Date(),
			})
			.where(eq(attendanceCorrection.id, input.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_correction",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: [{ field: "status", oldValue: "pending", newValue: "rejected" }],
			metadata: { action: "correction_reject", reviewNote: input.reviewNote },
		});

		return { id: input.id, status: "rejected" as const };
	});

const settingsGet = authorizedProcedure("attendance", "read").handler(
	async ({ context }) => {
		const [settings] = await db
			.select()
			.from(attendanceSetting)
			.where(eq(attendanceSetting.organizationId, orgId(context)))
			.limit(1);

		return settings ?? null;
	}
);

const settingsUpdate = authorizedProcedure("attendance", "correct")
	.input(
		z.object({
			graceTimeMinutes: z.number().int().min(0).max(120).optional(),
			overtimeCutoffMinutes: z.number().int().min(0).nullable().optional(),
			autoApproveOvertimeThresholdMinutes: z
				.number()
				.int()
				.min(0)
				.nullable()
				.optional(),
			breakDeductionMinutes: z.number().int().min(0).max(120).optional(),
			breakDeductionThresholdMinutes: z.number().int().min(0).optional(),
			enableCheckIn: z.boolean().optional(),
			enableAutoCheckout: z.boolean().optional(),
			autoCheckoutAfterMinutes: z.number().int().min(0).nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageHR(role(context))) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only HR admins can update attendance settings.",
			});
		}

		const [existing] = await db
			.select()
			.from(attendanceSetting)
			.where(eq(attendanceSetting.organizationId, orgId(context)))
			.limit(1);

		if (!existing) {
			const newId = createId();
			await db.insert(attendanceSetting).values({
				id: newId,
				organizationId: orgId(context),
				...input,
			});
			return { id: newId };
		}

		await db
			.update(attendanceSetting)
			.set(input)
			.where(eq(attendanceSetting.id, existing.id));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_setting",
			entityId: existing.id,
			action: "update",
			actorId: actorId(context),
			metadata: { changes: input },
		});

		return { id: existing.id };
	});

const summaryMonthly = authorizedProcedure("attendance", "read")
	.input(
		z.object({
			month: z.number().int().min(1).max(12),
			year: z.number().int().min(2020).max(2100),
			employeeId: z.string().optional(),
			departmentId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);

		const startDate = new Date(input.year, input.month - 1, 1);
		const endDate = new Date(input.year, input.month, 0);

		const conditions = [
			eq(attendanceRecord.organizationId, orgId(context)),
			gte(attendanceRecord.date, startDate),
			lte(attendanceRecord.date, endDate),
		];

		if (input.employeeId) {
			conditions.push(eq(attendanceRecord.employeeId, input.employeeId));
		}

		if (scope !== "all") {
			if (scope.length === 0) {
				return [];
			}
			conditions.push(
				sql`${attendanceRecord.employeeId} IN (${sql.join(
					scope.map((id) => sql`${id}`),
					sql`, `
				)})`
			);
		}

		if (input.departmentId) {
			conditions.push(
				sql`${attendanceRecord.employeeId} IN (
					SELECT ${employeeWorkInfo.employeeId} FROM ${employeeWorkInfo}
					WHERE ${employeeWorkInfo.departmentId} = ${input.departmentId}
				)`
			);
		}

		return db
			.select({
				employeeId: attendanceRecord.employeeId,
				employeeFirstName: employeeProfile.firstName,
				employeeLastName: employeeProfile.lastName,
				totalWorkedMinutes: sql<number>`COALESCE(SUM(${attendanceRecord.workedMinutes}), 0)`,
				totalOvertimeMinutes: sql<number>`COALESCE(SUM(${attendanceRecord.overtimeMinutes}), 0)`,
				totalApprovedOtMinutes: sql<number>`COALESCE(SUM(${attendanceRecord.approvedOvertimeMinutes}), 0)`,
				totalPayableMinutes: sql<number>`COALESCE(SUM(${attendanceRecord.payableMinutes}), 0)`,
				daysPresent: sql<number>`COUNT(*) FILTER (WHERE ${attendanceRecord.status} = 'present')`,
				daysHalfDay: sql<number>`COUNT(*) FILTER (WHERE ${attendanceRecord.status} = 'half_day')`,
				daysAbsent: sql<number>`COUNT(*) FILTER (WHERE ${attendanceRecord.status} = 'absent')`,
				daysHoliday: sql<number>`COUNT(*) FILTER (WHERE ${attendanceRecord.status} = 'holiday')`,
				totalLateMinutes: sql<number>`COALESCE(SUM(${attendanceRecord.lateMinutes}), 0)`,
				lateCount: sql<number>`COUNT(*) FILTER (WHERE ${attendanceRecord.lateMinutes} > 0)`,
				pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${attendanceRecord.payrollStatus} = 'pending')`,
				approvedCount: sql<number>`COUNT(*) FILTER (WHERE ${attendanceRecord.payrollStatus} = 'approved')`,
				lockedCount: sql<number>`COUNT(*) FILTER (WHERE ${attendanceRecord.payrollStatus} = 'payroll_locked')`,
				unvalidatedCount: sql<number>`COUNT(*) FILTER (WHERE ${attendanceRecord.isValidated} = false)`,
			})
			.from(attendanceRecord)
			.leftJoin(
				employeeProfile,
				eq(attendanceRecord.employeeId, employeeProfile.id)
			)
			.where(and(...conditions))
			.groupBy(
				attendanceRecord.employeeId,
				employeeProfile.firstName,
				employeeProfile.lastName
			);
	});

async function checkScopeForMutation(
	context: {
		organizationId: string;
		session: { user: { id: string } };
		memberRole?: string;
	},
	targetEmployeeId: string
): Promise<void> {
	const r = (context as { memberRole: string }).memberRole;

	const [targetEmp] = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.id, targetEmployeeId),
				eq(employeeProfile.organizationId, context.organizationId)
			)
		)
		.limit(1);
	if (!targetEmp) {
		throw new ORPCError("NOT_FOUND", {
			message: "Employee not found in this organization.",
		});
	}

	if (canManageHR(r)) {
		return;
	}

	if (r === "manager") {
		const currentEmp = await resolveCurrentEmployee(
			context.organizationId,
			context.session.user.id
		);
		if (!currentEmp) {
			throw new ORPCError("FORBIDDEN", {
				message: "You don't have an employee profile in this organization.",
			});
		}
		const reportIds = await getDirectReportIds(currentEmp.id);
		if (
			targetEmployeeId !== currentEmp.id &&
			!reportIds.includes(targetEmployeeId)
		) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only manage attendance for your direct reports.",
			});
		}
		return;
	}

	throw new ORPCError("FORBIDDEN", {
		message: "Insufficient permission to perform this action.",
	});
}

export const attendanceRouter = {
	clock: {
		checkIn: clockCheckIn,
		checkOut: clockCheckOut,
		currentStatus: clockCurrentStatus,
	},
	records: {
		list: recordsList,
		getById: recordsGetById,
		validate: recordsValidate,
		approveOvertime: recordsApproveOvertime,
		approvePayroll: recordsApprovePayroll,
		lockForPayroll: recordsLockForPayroll,
	},
	events: {
		list: eventsList,
		createManual: eventsCreateManual,
	},
	corrections: {
		create: correctionsCreate,
		list: correctionsList,
		approve: correctionsApprove,
		reject: correctionsReject,
	},
	settings: {
		get: settingsGet,
		update: settingsUpdate,
	},
	summary: {
		monthly: summaryMonthly,
	},
};
