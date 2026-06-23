/**
 * Timezone-aware conversion helpers for attendance/biometric time handling.
 *
 * Background: biometric devices report NAIVE wall-clock timestamps (no offset),
 * e.g. "2026-06-22 11:39:00" meaning 11:39 in the device's local timezone. The
 * correct UTC instant for that punch depends on the device/tenant timezone, NOT
 * on the server process timezone. These helpers make that conversion explicit
 * (using the IANA zone) so correctness no longer depends on the container's TZ.
 *
 * Zero dependencies — uses the built-in Intl timezone database. Works for any
 * IANA zone (DST-aware), and is exact for fixed-offset zones like Guyana
 * (America/Guyana, UTC-4, no DST).
 */

const NAIVE_RE =
	/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

/** Wall-clock parts in a given zone, all numeric (month/day are 1-based). */
export interface ZonedParts {
	day: number;
	hour: number;
	minute: number;
	month: number;
	second: number;
	year: number;
}

/**
 * Offset (ms) of an IANA zone at a specific UTC instant: the value such that
 * `wallClockAsUtcMs - instant.getTime() === offset`. Positive east of UTC.
 */
function zoneOffsetMs(instant: Date, ianaTz: string): number {
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone: ianaTz,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const parts = dtf.formatToParts(instant);
	const get = (type: string): number =>
		Number(parts.find((p) => p.type === type)?.value ?? "0");
	// Build the wall-clock reading as if it were UTC, then diff against the
	// true instant — that difference is the zone's offset at this instant.
	const asUtc = Date.UTC(
		get("year"),
		get("month") - 1,
		get("day"),
		get("hour"),
		get("minute"),
		get("second")
	);
	return asUtc - instant.getTime();
}

/**
 * Interpret a NAIVE wall-clock timestamp as local time in `ianaTz` and return
 * the correct UTC instant. Accepts "YYYY-MM-DD HH:mm[:ss]" or the same with a
 * "T" separator. Throws on an unparseable string.
 */
export function wallClockToUtc(naive: string, ianaTz: string): Date {
	const m = NAIVE_RE.exec(naive.trim());
	if (!m) {
		throw new Error(`Unparseable naive timestamp: "${naive}"`);
	}
	const [, y, mo, d, h, mi, s] = m;
	const wallAsUtc = Date.UTC(
		Number(y),
		Number(mo) - 1,
		Number(d),
		Number(h),
		Number(mi),
		s ? Number(s) : 0
	);
	// First guess: subtract the offset computed at the wall-clock-as-UTC instant.
	const guess = new Date(wallAsUtc - zoneOffsetMs(new Date(wallAsUtc), ianaTz));
	// Refine once: around a DST transition the offset at the guess may differ
	// from the offset at the wall-clock instant. A single correction settles it
	// for all real zones (and is a no-op for fixed-offset zones like Guyana).
	const refined = new Date(wallAsUtc - zoneOffsetMs(guess, ianaTz));
	return refined;
}

/** The wall-clock parts of a UTC instant as seen in `ianaTz`. */
export function utcToZonedParts(instant: Date, ianaTz: string): ZonedParts {
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone: ianaTz,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const parts = dtf.formatToParts(instant);
	const get = (type: string): number =>
		Number(parts.find((p) => p.type === type)?.value ?? "0");
	return {
		year: get("year"),
		month: get("month"),
		day: get("day"),
		hour: get("hour"),
		minute: get("minute"),
		second: get("second"),
	};
}

/** "YYYY-MM-DD" calendar day of a UTC instant in `ianaTz` (for day-bucketing). */
export function zonedDateKey(instant: Date, ianaTz: string): string {
	const p = utcToZonedParts(instant, ianaTz);
	return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "HH:mm" wall-clock of a UTC instant in `ianaTz`. */
export function zonedHm(instant: Date, ianaTz: string): string {
	const p = utcToZonedParts(instant, ianaTz);
	return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
