/**
 * Pure roster scheduling logic — Phase 21D-D.
 *
 * Database-free so it can be unit-verified anywhere (no env/db import). The
 * roster router imports these; verify-roster-api imports them directly.
 */
import { ORPCError } from "@orpc/server";

export const MINUTES_IN_DAY = 24 * 60;
const MS_PER_DAY = 86_400_000;

export type RosterOverrideType = "none" | "custom_hours" | "day_off" | "swap";

/**
 * Every date in [start, end] (UTC, inclusive) whose weekday is in `weekdaySet`
 * (0=Sun … 6=Sat); a null set means every day. The recurring-pattern primitive
 * behind bulkAssign.
 */
export function enumerateRosterDates(
	start: Date,
	end: Date,
	weekdaySet: Set<number> | null
): Date[] {
	const out: Date[] = [];
	for (
		let d = new Date(start);
		d <= end;
		d = new Date(d.getTime() + MS_PER_DAY)
	) {
		if (weekdaySet && !weekdaySet.has(d.getUTCDay())) {
			continue;
		}
		out.push(new Date(d));
	}
	return out;
}

/**
 * Validate per-day override coherence. custom_hours requires a valid in-day
 * start<end window; every other override clears the custom minutes. Throws
 * ORPCError BAD_REQUEST on incoherent input.
 */
export function validateOverride(input: {
	overrideType: RosterOverrideType;
	customStartMinutes?: number | null;
	customEndMinutes?: number | null;
}): { customStartMinutes: number | null; customEndMinutes: number | null } {
	if (input.overrideType === "custom_hours") {
		const start = input.customStartMinutes;
		const end = input.customEndMinutes;
		if (start == null || end == null) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"custom_hours requires customStartMinutes and customEndMinutes.",
			});
		}
		if (start < 0 || end > MINUTES_IN_DAY || start >= end) {
			throw new ORPCError("BAD_REQUEST", {
				message: "custom hours must be within the day and start before end.",
			});
		}
		return { customStartMinutes: start, customEndMinutes: end };
	}
	return { customStartMinutes: null, customEndMinutes: null };
}
