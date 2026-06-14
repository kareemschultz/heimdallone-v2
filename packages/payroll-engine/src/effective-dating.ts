/**
 * Effective-dating resolution — the pure core of Phase 21G.
 *
 * Statutory rules (country payroll profiles, leave policies, …) are modelled as
 * a series of half-open validity windows `[effectiveFrom, effectiveTo)`. The rule
 * in force for an event is the window that CONTAINS the event date — resolved by
 * the EVENT DATE (a payslip's pay date, a leave request's start), never by a
 * mutable "current rule" flag. This keeps historical computations reproducible:
 * a 2024 payslip resolves the 2024 window even after a 2026 window is added.
 *
 * This module is intentionally pure and DB-agnostic so it can be unit-tested in
 * isolation and reused by any caller (payroll profiles now; leave policies and
 * the workweek classifier in later 21G sub-phases).
 */

/** Minimal shape a row must expose to participate in date-window resolution. */
export interface EffectiveDated {
	/** Inclusive lower bound — the rule takes effect on this date. */
	effectiveFrom: Date;
	/** Exclusive upper bound — `null` means the window is open-ended/current. */
	effectiveTo: Date | null;
}

/**
 * Compare two dates at calendar-day granularity using their UTC components.
 *
 * Drizzle `date({ mode: "date" })` columns deserialize to UTC-midnight Date
 * objects, and our event dates (pay date, period end) are the same date-mode, so
 * a day-number comparison is exact AND robust to any stray time-of-day that a
 * caller might pass in. Returns the integer day index (days since epoch).
 */
function toDayNumber(d: Date): number {
	return Math.floor(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000
	);
}

/** True when `asOf` falls within the half-open window `[from, to)`. */
export function windowContains(row: EffectiveDated, asOf: Date): boolean {
	const day = toDayNumber(asOf);
	const from = toDayNumber(row.effectiveFrom);
	if (day < from) {
		return false;
	}
	if (row.effectiveTo === null) {
		return true;
	}
	return day < toDayNumber(row.effectiveTo);
}

/**
 * Resolve the single row in force on `asOf`.
 *
 * Of all rows whose window contains the date, the one with the LATEST
 * `effectiveFrom` wins (a later window supersedes an earlier overlapping one —
 * the no-overlap unique constraint makes true overlaps a data error, but this
 * tie-break is the safe deterministic choice regardless). Returns `null` when no
 * window covers the date so the caller can raise a domain-specific error.
 */
export function resolveAsOf<T extends EffectiveDated>(
	rows: readonly T[],
	asOf: Date
): T | null {
	let best: T | null = null;
	let bestFrom = Number.NEGATIVE_INFINITY;
	for (const row of rows) {
		if (!windowContains(row, asOf)) {
			continue;
		}
		const from = toDayNumber(row.effectiveFrom);
		if (from > bestFrom) {
			best = row;
			bestFrom = from;
		}
	}
	return best;
}
