/**
 * Server-authoritative leave-day counting (Phase 21G-D / H10).
 *
 * The number of leave days a request consumes is a function of the date range,
 * the half-day breakdowns, the TENANT's workweek (which weekdays are worked),
 * and the public-holiday calendar (when the leave type excludes holidays). It
 * must be computed on the SERVER — a client-supplied day count can't be trusted
 * for balance math (the H10 finding). This module is pure and DB-agnostic so it
 * can be unit-verified and reused at both request-create and approve time.
 */

export type LeaveBreakdown = "full_day" | "first_half" | "second_half";

/** A holiday occurrence; `endDate` null = single day; recurring = annual. */
export interface HolidayWindow {
	endDate: Date | null;
	isRecurring: boolean;
	startDate: Date;
}

/** ISO weekday (1 = Mon … 7 = Sun) for a date, using UTC components. */
function isoWeekday(d: Date): number {
	const dow = d.getUTCDay(); // 0 = Sun … 6 = Sat
	return dow === 0 ? 7 : dow;
}

/** Month/day key (ignores year) — for recurring-holiday matching. */
function monthDayKey(d: Date): number {
	return d.getUTCMonth() * 100 + d.getUTCDate();
}

/** Day key (YYYYMMDD as a number) — for exact, year-aware matching. */
function dayKey(d: Date): number {
	return d.getUTCFullYear() * 10_000 + d.getUTCMonth() * 100 + d.getUTCDate();
}

function isHoliday(day: Date, holidays: readonly HolidayWindow[]): boolean {
	const dk = dayKey(day);
	const mdk = monthDayKey(day);
	for (const h of holidays) {
		const end = h.endDate ?? h.startDate;
		if (h.isRecurring) {
			// Recurring: match month/day, ignoring the year, across the window.
			if (mdk >= monthDayKey(h.startDate) && mdk <= monthDayKey(end)) {
				return true;
			}
		} else if (dk >= dayKey(h.startDate) && dk <= dayKey(end)) {
			return true;
		}
	}
	return false;
}

function sameDay(a: Date, b: Date): boolean {
	return dayKey(a) === dayKey(b);
}

/**
 * Count the leave days consumed by a request. Returns a number that may carry a
 * .5 (half-day breakdowns). Non-working days (outside the tenant workweek) and,
 * when `excludeHolidays`, public holidays are not counted.
 */
export function countLeaveDays(opts: {
	startDate: Date;
	endDate: Date;
	startBreakdown: LeaveBreakdown;
	endBreakdown: LeaveBreakdown;
	/** Tenant working weekdays, ISO numbering (1 = Mon … 7 = Sun). */
	workDays: readonly number[];
	holidays: readonly HolidayWindow[];
	excludeHolidays: boolean;
}): number {
	const {
		startDate,
		endDate,
		startBreakdown,
		endBreakdown,
		workDays,
		holidays,
		excludeHolidays,
	} = opts;

	if (dayKey(endDate) < dayKey(startDate)) {
		return 0;
	}

	const workSet = new Set(workDays);
	let total = 0;

	// Iterate inclusive calendar days using UTC to avoid DST/tz drift.
	const cursor = new Date(
		Date.UTC(
			startDate.getUTCFullYear(),
			startDate.getUTCMonth(),
			startDate.getUTCDate()
		)
	);
	const lastKey = dayKey(endDate);

	while (dayKey(cursor) <= lastKey) {
		const working = workSet.has(isoWeekday(cursor));
		const excluded = excludeHolidays && isHoliday(cursor, holidays);
		if (working && !excluded) {
			const isStart = sameDay(cursor, startDate);
			const isEnd = sameDay(cursor, endDate);
			let value = 1;
			if (isStart && startBreakdown !== "full_day") {
				value = 0.5;
			} else if (isEnd && !isStart && endBreakdown !== "full_day") {
				value = 0.5;
			}
			total += value;
		}
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	return total;
}
