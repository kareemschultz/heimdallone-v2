import { describe, expect, test } from "bun:test";
import {
	utcToZonedParts,
	wallClockToUtc,
	zonedDateKey,
	zonedHm,
} from "./timezone";

const GY = "America/Guyana"; // UTC-4, no DST
const NY = "America/New_York"; // UTC-5 / UTC-4 with DST

describe("wallClockToUtc — Guyana (fixed UTC-4)", () => {
	test("naive 11:39 GYT → 15:39 UTC", () => {
		const utc = wallClockToUtc("2026-06-22 11:39:00", GY);
		expect(utc.toISOString()).toBe("2026-06-22T15:39:00.000Z");
	});

	test("accepts the 'T' separator and missing seconds", () => {
		expect(wallClockToUtc("2026-06-22T11:39", GY).toISOString()).toBe(
			"2026-06-22T15:39:00.000Z"
		);
	});

	test("late-evening GYT punch keeps the correct calendar day", () => {
		// 23:00 GYT on the 22nd = 03:00 UTC on the 23rd — the instant crosses the
		// UTC date line, which is exactly why naive-as-UTC parsing was wrong.
		const utc = wallClockToUtc("2026-06-22 23:00:00", GY);
		expect(utc.toISOString()).toBe("2026-06-23T03:00:00.000Z");
		// ...but read back IN ZONE it is still the 22nd.
		expect(zonedDateKey(utc, GY)).toBe("2026-06-22");
	});

	test("throws on garbage input", () => {
		expect(() => wallClockToUtc("not-a-date", GY)).toThrow();
	});
});

describe("regression: staff clock-in shows the right hour, not +4 (#181)", () => {
	test("in-app clock-in at 08:00 GYT (stored 12:00 UTC) renders 08:00, not 12:00", () => {
		// The web clock-in stores `new Date()` = the true UTC instant. A staff
		// member clocking in at 08:00 in Guyana is 12:00 UTC. The old recalc used
		// server-local (UTC) getters → "12:00" (the reported bug). Rendering in the
		// tenant zone via zonedHm restores the correct local hour.
		const storedInstant = new Date("2026-06-24T12:00:00Z");
		expect(zonedHm(storedInstant, GY)).toBe("08:00");
	});

	test("device naive '08:00' (GYT) → true 12:00 UTC, round-trips to 08:00", () => {
		const trueInstant = wallClockToUtc("2026-06-24 08:00:00", GY);
		expect(trueInstant.toISOString()).toBe("2026-06-24T12:00:00.000Z");
		expect(zonedHm(trueInstant, GY)).toBe("08:00");
	});
});

describe("wallClockToUtc — New York (DST-aware, proves the algorithm)", () => {
	test("winter (EST, UTC-5): 09:00 → 14:00 UTC", () => {
		expect(wallClockToUtc("2026-01-15 09:00:00", NY).toISOString()).toBe(
			"2026-01-15T14:00:00.000Z"
		);
	});

	test("summer (EDT, UTC-4): 09:00 → 13:00 UTC", () => {
		expect(wallClockToUtc("2026-07-15 09:00:00", NY).toISOString()).toBe(
			"2026-07-15T13:00:00.000Z"
		);
	});
});

describe("round-trip: wall clock → UTC → zoned parts", () => {
	test("Guyana wall clock survives the round trip", () => {
		const utc = wallClockToUtc("2026-06-22 11:39:00", GY);
		const parts = utcToZonedParts(utc, GY);
		expect(parts).toMatchObject({
			year: 2026,
			month: 6,
			day: 22,
			hour: 11,
			minute: 39,
		});
		expect(zonedHm(utc, GY)).toBe("11:39");
	});
});
