/**
 * Shared attendance recalculation (Phase 11C extraction).
 *
 * Previously private to routers/attendance.ts. Extracted so the biometric punch
 * processor and the attendance router share ONE recalc implementation — there
 * must never be two divergent ways to compute a daily attendance_record.
 */
import { db } from "@Heimdallone/db";
import {
	attendanceBreak,
	attendanceEvent,
	attendanceRecord,
	employeeWorkInfo,
	holiday,
	payrollSetting,
	shiftSchedule,
} from "@Heimdallone/db/schema/index";
import { and, eq } from "drizzle-orm";
import { type HolidayWindow, isHolidayOn } from "./leave-days";
import { resolveScheduleConfig } from "./shift-rule-resolver";

const DEFAULT_MIN_MINUTES = 495;
const DEFAULT_WEEKEND_DAYS = [6, 7]; // ISO: Sat, Sun
const DEFAULT_SHIFT_START_HOUR = 8;

export async function getEmployeeShiftInfo(
	employeeId: string
): Promise<{ shiftId: string | null } | null> {
	const [info] = await db
		.select({ shiftId: employeeWorkInfo.shiftId })
		.from(employeeWorkInfo)
		.where(eq(employeeWorkInfo.employeeId, employeeId))
		.limit(1);
	return info ?? null;
}

export async function getShiftScheduleForDay(
	shiftId: string,
	dayOfWeek: number
): Promise<{
	endTime: string;
	minimumWorkMinutes: number;
	startTime: string;
} | null> {
	const [schedule] = await db
		.select({
			minimumWorkMinutes: shiftSchedule.minimumWorkMinutes,
			startTime: shiftSchedule.startTime,
			endTime: shiftSchedule.endTime,
		})
		.from(shiftSchedule)
		.where(
			and(
				eq(shiftSchedule.shiftId, shiftId),
				eq(shiftSchedule.dayOfWeek, dayOfWeek)
			)
		)
		.limit(1);
	return schedule ?? null;
}

/** Tenant config that drives day-type classification (21G-E). */
export interface DayTypeConfig {
	/** Public-holiday calendar; a holiday takes precedence over weekend. */
	holidays: HolidayWindow[];
	/** Rest days, ISO numbering (1 = Mon … 7 = Sun). Default Sat/Sun. */
	weekendDays: number[];
}

/**
 * Classify a work date into the OT-multiplier bucket using TENANT config (21G-E),
 * not a hardcoded Sat/Sun weekend. A public holiday wins; otherwise a day whose
 * ISO weekday is in `weekendDays` is a rest day — Sunday keeps the distinct
 * `sunday` bucket, every other rest day maps to the `saturday` (rest-day premium)
 * bucket since the schema carries exactly two named weekend multipliers. For the
 * default Sat/Sun tenant this is identical to the previous behaviour.
 */
export function classifyDayType(
	date: Date,
	dow: number,
	config: DayTypeConfig
): "weekday" | "saturday" | "sunday" | "holiday" {
	if (config.holidays.length > 0 && isHolidayOn(date, config.holidays)) {
		return "holiday";
	}
	const iso = dow === 0 ? 7 : dow; // JS getDay() 0 = Sun → ISO 7
	if (config.weekendDays.includes(iso)) {
		return iso === 7 ? "sunday" : "saturday";
	}
	return "weekday";
}

/**
 * Load the tenant's day-type config: `weekendDays` from payroll settings (the
 * single source of the workweek, shared with the OT multipliers) and the org
 * public-holiday calendar. Defaults to a Sat/Sun weekend when unset.
 */
export async function resolveDayTypeConfig(
	organizationId: string
): Promise<DayTypeConfig> {
	const [settings] = await db
		.select({ weekendDays: payrollSetting.weekendDays })
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, organizationId))
		.limit(1);
	const holidays = await db
		.select({
			startDate: holiday.startDate,
			endDate: holiday.endDate,
			isRecurring: holiday.isRecurring,
		})
		.from(holiday)
		.where(eq(holiday.organizationId, organizationId));
	return {
		weekendDays:
			(settings?.weekendDays as number[] | undefined) ?? DEFAULT_WEEKEND_DAYS,
		holidays,
	};
}

interface DayAggregate {
	firstIn: Date | null;
	lastOut: Date | null;
	totalWorked: number;
}

function aggregateEvents(
	events: {
		clockIn: Date;
		clockOut: Date | null;
		durationMinutes: number | null;
	}[]
): DayAggregate {
	let totalWorked = 0;
	let firstIn: Date | null = null;
	let lastOut: Date | null = null;
	for (const ev of events) {
		if (ev.durationMinutes) {
			totalWorked += ev.durationMinutes;
		}
		if (!firstIn || ev.clockIn < firstIn) {
			firstIn = ev.clockIn;
		}
		if (ev.clockOut && (!lastOut || ev.clockOut > lastOut)) {
			lastOut = ev.clockOut;
		}
	}
	return { totalWorked, firstIn, lastOut };
}

function fmtHm(d: Date | null): string | null {
	if (!d) {
		return null;
	}
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function computeLateMinutes(
	schedule: { startTime: string } | null,
	firstIn: Date | null,
	graceMin: number
): number {
	if (!(schedule && firstIn)) {
		return 0;
	}
	const [sh, sm] = schedule.startTime.split(":").map(Number);
	const schedStart =
		(sh ?? DEFAULT_SHIFT_START_HOUR) * 60 + (sm ?? 0) + graceMin;
	const actualStart = firstIn.getHours() * 60 + firstIn.getMinutes();
	return actualStart > schedStart ? actualStart - schedStart : 0;
}

/**
 * Sum the completed (started AND ended) explicit breaks for an employee on a
 * given day. Open breaks (breakOut IS NULL) are excluded. Scoped via the linked
 * attendance_event's eventDate so it covers every event on the day.
 */
async function sumManualBreakMinutes(
	employeeId: string,
	eventDate: Date,
	organizationId: string
): Promise<number> {
	const breaks = await db
		.select({
			breakIn: attendanceBreak.breakIn,
			breakOut: attendanceBreak.breakOut,
		})
		.from(attendanceBreak)
		.innerJoin(
			attendanceEvent,
			eq(attendanceBreak.attendanceEventId, attendanceEvent.id)
		)
		.where(
			and(
				eq(attendanceBreak.employeeId, employeeId),
				eq(attendanceBreak.organizationId, organizationId),
				eq(attendanceEvent.eventDate, eventDate)
			)
		);
	let total = 0;
	for (const b of breaks) {
		if (b.breakOut) {
			total += Math.max(
				0,
				Math.round((b.breakOut.getTime() - b.breakIn.getTime()) / 60_000)
			);
		}
	}
	return total;
}

/**
 * Recalculate the attendance_record for a given employee+date.
 *
 * Explicit employee breaks (recorded in attendance_break) are sourced HERE from
 * the table — never passed in — so every caller (check-out, end-break, manual
 * entry, the biometric processor) produces an identical, correct deduction and
 * no caller can "forget" to pass it. The summed manual-break minutes are ADDED
 * to any schedule-rule auto-deduction; both flow into the same
 * `breakDeductedMinutes` column and therefore the same payroll deduction. Days
 * with no explicit breaks sum to 0 and behave byte-identically to before.
 */
export async function recalculateRecord(
	employeeId: string,
	eventDate: Date,
	organizationId: string
): Promise<void> {
	const manualBreakMinutes = await sumManualBreakMinutes(
		employeeId,
		eventDate,
		organizationId
	);
	const events = await db
		.select({
			clockIn: attendanceEvent.clockIn,
			clockOut: attendanceEvent.clockOut,
			durationMinutes: attendanceEvent.durationMinutes,
		})
		.from(attendanceEvent)
		.where(
			and(
				eq(attendanceEvent.employeeId, employeeId),
				eq(attendanceEvent.eventDate, eventDate)
			)
		);

	const { totalWorked, firstIn, lastOut } = aggregateEvents(events);

	const empInfo = await getEmployeeShiftInfo(employeeId);
	const schedule = empInfo?.shiftId
		? await getShiftScheduleForDay(empInfo.shiftId, eventDate.getDay())
		: null;

	// Phase 21J: resolve the effective schedule rule for this shift + work date.
	// With NO shift_rule rows the resolver returns the org settings fallback, so
	// grace/break are byte-identical to the previous behaviour; a configured rule
	// overrides per-shift. standardDailyMinutes is rule-only (null otherwise) so the
	// shift_schedule minimum stays the source when no rule sets it.
	const rule = await resolveScheduleConfig(
		organizationId,
		empInfo?.shiftId ?? null,
		eventDate
	);

	const autoBreakDed =
		rule.autoDeductBreak && totalWorked > rule.minBreakDeductionMinutes
			? rule.breakMinutes
			: 0;
	// Manual breaks (explicitly started/ended by the employee) are additive with
	// the auto-deduction so both paths flow into the same payroll column.
	const breakDed = autoBreakDed + manualBreakMinutes;
	let netWorked = Math.max(0, totalWorked - breakDed);
	// A daily paid-minutes cap (rule-only) bounds the recorded worked minutes.
	if (rule.capDailyPaidMinutes !== null) {
		netWorked = Math.min(netWorked, rule.capDailyPaidMinutes);
	}

	const minMinutes =
		rule.standardDailyMinutes ??
		schedule?.minimumWorkMinutes ??
		DEFAULT_MIN_MINUTES;
	const lateMin = computeLateMinutes(schedule, firstIn, rule.graceMinutesLate);

	await db
		.update(attendanceRecord)
		.set({
			firstClockIn: fmtHm(firstIn),
			lastClockOut: fmtHm(lastOut),
			workedMinutes: netWorked,
			minimumMinutes: minMinutes,
			payableMinutes: Math.min(netWorked, minMinutes),
			overtimeMinutes: Math.max(0, netWorked - minMinutes),
			breakDeductedMinutes: breakDed,
			lateMinutes: lateMin,
		})
		.where(
			and(
				eq(attendanceRecord.employeeId, employeeId),
				eq(attendanceRecord.date, eventDate),
				eq(attendanceRecord.organizationId, organizationId)
			)
		);
}
