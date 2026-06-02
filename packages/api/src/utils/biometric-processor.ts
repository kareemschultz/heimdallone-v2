/**
 * Biometric/geofence punch processor (Phase 11C).
 *
 * Source-agnostic: turns staged attendance_punch rows into attendance_event +
 * recalculated attendance_record, regardless of whether the punch came from
 * ZKTeco, NGTeco, a CSV/USB export, an API ingest, or a mobile GPS check-in.
 *
 * Hard invariants:
 *  - Raw punches are NEVER paid. Payroll reads approved attendance_record only.
 *  - Idempotent: re-running never creates duplicate attendance_event rows
 *    (processed punches carry createdAttendanceEventId and are skipped).
 *  - Unmapped/duplicate/missing-out/drift become attendance_exception rows.
 */
import { db } from "@Heimdallone/db";
import {
	attendanceDevice,
	attendanceDeviceEmployeeMap,
	attendanceEvent,
	attendanceException,
	attendancePunch,
	attendanceRecord,
	attendanceSetting,
} from "@Heimdallone/db/schema/index";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
	classifyDayType,
	getEmployeeShiftInfo,
	getShiftScheduleForDay,
	recalculateRecord,
} from "./attendance-recalc";

const DEFAULT_MIN_MINUTES = 495;
const DEFAULT_DRIFT_THRESHOLD_SECONDS = 300;

type ExceptionType =
	| "unmapped_punch"
	| "duplicate_punch"
	| "missing_clock_out"
	| "outside_geofence"
	| "low_gps_accuracy"
	| "clock_drift"
	| "spoofing_suspected"
	| "device_error"
	| "out_of_window";

type ExceptionSeverity = "info" | "warning" | "blocker";

interface ExceptionLinks {
	attendanceEventId?: string | null;
	attendancePunchId?: string | null;
	deviceId?: string | null;
	employeeId?: string | null;
}

export interface ProcessSummary {
	devicesWithDrift: number;
	errors: number;
	exceptionsCreated: number;
	processed: number;
	skipped: number;
	unmapped: number;
}

function localDate(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Create an open exception only if an equivalent open one does not exist. */
async function ensureOpenException(params: {
	detail: string;
	links: ExceptionLinks;
	organizationId: string;
	severity: ExceptionSeverity;
	type: ExceptionType;
}): Promise<boolean> {
	const { organizationId, type, severity, detail, links } = params;
	const conds = [
		eq(attendanceException.organizationId, organizationId),
		eq(attendanceException.type, type),
		eq(attendanceException.status, "open"),
	];
	if (links.attendancePunchId) {
		conds.push(
			eq(attendanceException.attendancePunchId, links.attendancePunchId)
		);
	} else if (links.attendanceEventId) {
		conds.push(
			eq(attendanceException.attendanceEventId, links.attendanceEventId)
		);
	} else if (links.deviceId) {
		conds.push(eq(attendanceException.deviceId, links.deviceId));
	} else if (links.employeeId) {
		conds.push(eq(attendanceException.employeeId, links.employeeId));
	}

	const [existing] = await db
		.select({ id: attendanceException.id })
		.from(attendanceException)
		.where(and(...conds))
		.limit(1);
	if (existing) {
		return false;
	}

	await db.insert(attendanceException).values({
		id: createId(),
		organizationId,
		type,
		severity,
		status: "open",
		detail,
		employeeId: links.employeeId ?? null,
		attendancePunchId: links.attendancePunchId ?? null,
		attendanceEventId: links.attendanceEventId ?? null,
		deviceId: links.deviceId ?? null,
	});
	return true;
}

async function resolvePunchEmployee(punch: {
	deviceId: string | null;
	deviceUserId: string | null;
	employeeId: string | null;
}): Promise<string | null> {
	if (punch.employeeId) {
		return punch.employeeId;
	}
	if (!(punch.deviceId && punch.deviceUserId)) {
		return null;
	}
	const [map] = await db
		.select({ employeeId: attendanceDeviceEmployeeMap.employeeId })
		.from(attendanceDeviceEmployeeMap)
		.where(
			and(
				eq(attendanceDeviceEmployeeMap.deviceId, punch.deviceId),
				eq(attendanceDeviceEmployeeMap.deviceUserId, punch.deviceUserId),
				isNull(attendanceDeviceEmployeeMap.deletedAt)
			)
		)
		.limit(1);
	return map?.employeeId ?? null;
}

async function ensureRecordStub(
	organizationId: string,
	employeeId: string,
	eventDate: Date
): Promise<void> {
	const [existing] = await db
		.select({ id: attendanceRecord.id })
		.from(attendanceRecord)
		.where(
			and(
				eq(attendanceRecord.employeeId, employeeId),
				eq(attendanceRecord.date, eventDate)
			)
		)
		.limit(1);
	if (existing) {
		return;
	}
	const empInfo = await getEmployeeShiftInfo(employeeId);
	const dow = eventDate.getDay();
	const schedule = empInfo?.shiftId
		? await getShiftScheduleForDay(empInfo.shiftId, dow)
		: null;
	await db.insert(attendanceRecord).values({
		id: createId(),
		organizationId,
		employeeId,
		date: eventDate,
		shiftId: empInfo?.shiftId ?? null,
		minimumMinutes: schedule?.minimumWorkMinutes ?? DEFAULT_MIN_MINUTES,
		dayType: classifyDayType(eventDate, dow),
	});
}

type PunchRow = typeof attendancePunch.$inferSelect;

/** Apply an IN/unknown punch: create a new open attendance_event. */
async function applyInPunch(
	punch: PunchRow,
	employeeId: string,
	eventDate: Date
): Promise<void> {
	const eventId = createId();
	await db.insert(attendanceEvent).values({
		id: eventId,
		organizationId: punch.organizationId,
		employeeId,
		eventDate,
		clockIn: punch.punchTime,
		source: punch.source,
		deviceId: punch.deviceId,
	});
	await db
		.update(attendancePunch)
		.set({
			processingStatus: "processed",
			employeeId,
			createdAttendanceEventId: eventId,
		})
		.where(eq(attendancePunch.id, punch.id));
}

/** Apply an OUT punch: close the latest open event for the day, or flag it. */
async function applyOutPunch(
	punch: PunchRow,
	employeeId: string,
	eventDate: Date
): Promise<boolean> {
	const [openEvent] = await db
		.select({ id: attendanceEvent.id, clockIn: attendanceEvent.clockIn })
		.from(attendanceEvent)
		.where(
			and(
				eq(attendanceEvent.employeeId, employeeId),
				eq(attendanceEvent.eventDate, eventDate),
				isNull(attendanceEvent.clockOut)
			)
		)
		.limit(1);

	if (!openEvent) {
		// An OUT with no matching open IN — record it for review, don't fabricate.
		await db
			.update(attendancePunch)
			.set({ processingStatus: "processed", employeeId })
			.where(eq(attendancePunch.id, punch.id));
		await ensureOpenException({
			organizationId: punch.organizationId,
			type: "out_of_window",
			severity: "warning",
			detail: "A clock-out punch had no matching open clock-in for the day.",
			links: { employeeId, attendancePunchId: punch.id },
		});
		return true;
	}

	const durationMinutes = Math.max(
		0,
		Math.round(
			(punch.punchTime.getTime() - openEvent.clockIn.getTime()) / 60_000
		)
	);
	await db
		.update(attendanceEvent)
		.set({ clockOut: punch.punchTime, durationMinutes })
		.where(eq(attendanceEvent.id, openEvent.id));
	await db
		.update(attendancePunch)
		.set({
			processingStatus: "processed",
			employeeId,
			createdAttendanceEventId: openEvent.id,
		})
		.where(eq(attendancePunch.id, punch.id));
	return false;
}

async function flagMissingClockOuts(
	organizationId: string,
	touched: Map<string, { eventDate: Date; employeeId: string }>
): Promise<number> {
	let created = 0;
	const todayLocal = localDate(new Date());
	for (const { employeeId, eventDate } of touched.values()) {
		if (eventDate >= todayLocal) {
			continue; // today's open shift is normal, not yet missing
		}
		const [openEvent] = await db
			.select({ id: attendanceEvent.id })
			.from(attendanceEvent)
			.where(
				and(
					eq(attendanceEvent.employeeId, employeeId),
					eq(attendanceEvent.eventDate, eventDate),
					isNull(attendanceEvent.clockOut)
				)
			)
			.limit(1);
		if (
			openEvent &&
			(await ensureOpenException({
				organizationId,
				type: "missing_clock_out",
				severity: "blocker",
				detail: "Clock-in with no clock-out for the day.",
				links: { employeeId, attendanceEventId: openEvent.id },
			}))
		) {
			created += 1;
		}
	}
	return created;
}

async function flagClockDrift(organizationId: string): Promise<number> {
	const [settings] = await db
		.select({
			threshold: attendanceSetting.clockDriftThresholdSeconds,
		})
		.from(attendanceSetting)
		.where(eq(attendanceSetting.organizationId, organizationId))
		.limit(1);
	const threshold = settings?.threshold ?? DEFAULT_DRIFT_THRESHOLD_SECONDS;

	const drifted = await db
		.select({
			id: attendanceDevice.id,
			name: attendanceDevice.name,
			offset: attendanceDevice.clockOffsetSeconds,
		})
		.from(attendanceDevice)
		.where(
			and(
				eq(attendanceDevice.organizationId, organizationId),
				isNull(attendanceDevice.deletedAt),
				sql`${attendanceDevice.clockOffsetSeconds} > ${threshold}`
			)
		);

	let created = 0;
	for (const dev of drifted) {
		if (
			await ensureOpenException({
				organizationId,
				type: "clock_drift",
				severity: "info",
				detail: `Device "${dev.name}" clock drifted ${dev.offset}s from server time (threshold ${threshold}s).`,
				links: { deviceId: dev.id },
			})
		) {
			created += 1;
		}
	}
	return created;
}

/**
 * Process all pending punches for an organization. Returns a summary. Safe to
 * re-run: only `pending` punches without a created event are touched.
 */
export async function processPendingPunches(
	organizationId: string
): Promise<ProcessSummary> {
	const pending = await db
		.select()
		.from(attendancePunch)
		.where(
			and(
				eq(attendancePunch.organizationId, organizationId),
				// 'unmapped' punches are re-examined so a later mapping resolves them.
				inArray(attendancePunch.processingStatus, ["pending", "unmapped"]),
				isNull(attendancePunch.deletedAt)
			)
		)
		.orderBy(asc(attendancePunch.punchTime));

	const summary: ProcessSummary = {
		processed: 0,
		unmapped: 0,
		errors: 0,
		skipped: 0,
		exceptionsCreated: 0,
		devicesWithDrift: 0,
	};
	const touched = new Map<string, { eventDate: Date; employeeId: string }>();

	for (const punch of pending) {
		if (punch.createdAttendanceEventId) {
			summary.skipped += 1;
			continue;
		}
		const employeeId = await resolvePunchEmployee(punch);
		if (!employeeId) {
			await db
				.update(attendancePunch)
				.set({ processingStatus: "unmapped" })
				.where(eq(attendancePunch.id, punch.id));
			if (
				await ensureOpenException({
					organizationId,
					type: "unmapped_punch",
					severity: "blocker",
					detail: `Device user "${punch.deviceUserId ?? "unknown"}" has no employee mapping. Punch quarantined.`,
					links: { attendancePunchId: punch.id, deviceId: punch.deviceId },
				})
			) {
				summary.exceptionsCreated += 1;
			}
			summary.unmapped += 1;
			continue;
		}

		const eventDate = localDate(punch.punchTime);
		await ensureRecordStub(organizationId, employeeId, eventDate);

		if (punch.direction === "out") {
			const flagged = await applyOutPunch(punch, employeeId, eventDate);
			if (flagged) {
				summary.exceptionsCreated += 1;
			}
		} else {
			await applyInPunch(punch, employeeId, eventDate);
		}

		await recalculateRecord(employeeId, eventDate, organizationId);
		touched.set(`${employeeId}:${eventDate.toISOString()}`, {
			employeeId,
			eventDate,
		});
		summary.processed += 1;
	}

	summary.exceptionsCreated += await flagMissingClockOuts(
		organizationId,
		touched
	);
	const driftCreated = await flagClockDrift(organizationId);
	summary.devicesWithDrift = driftCreated;
	summary.exceptionsCreated += driftCreated;

	return summary;
}
