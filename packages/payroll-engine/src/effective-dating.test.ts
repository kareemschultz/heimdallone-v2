import { describe, expect, test } from "bun:test";
import { resolveAsOf, windowContains } from "./effective-dating";

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

// Three successive statutory windows for the same country, mirroring GRA's real
// personal-allowance history (2024 → 2025 restructure → 2026): each window is
// closed when the next opens, and the latest is open-ended.
const gy2024 = {
	label: "GY-2024",
	effectiveFrom: d("2024-01-01"),
	effectiveTo: d("2025-01-01"),
};
const gy2025 = {
	label: "GY-2025",
	effectiveFrom: d("2025-01-01"),
	effectiveTo: d("2026-01-01"),
};
const gy2026 = {
	label: "GY-2026",
	effectiveFrom: d("2026-01-01"),
	effectiveTo: null,
};
const profiles = [gy2024, gy2025, gy2026];

describe("windowContains", () => {
	test("includes the effectiveFrom day (inclusive lower bound)", () => {
		expect(windowContains(gy2025, d("2025-01-01"))).toBe(true);
	});

	test("excludes the effectiveTo day (exclusive upper bound)", () => {
		// 2025-01-01 belongs to GY-2025, NOT GY-2024 whose window ends there.
		expect(windowContains(gy2024, d("2025-01-01"))).toBe(false);
	});

	test("open-ended window has no upper bound", () => {
		expect(windowContains(gy2026, d("2099-12-31"))).toBe(true);
	});

	test("date before the window is excluded", () => {
		expect(windowContains(gy2024, d("2023-12-31"))).toBe(false);
	});
});

describe("resolveAsOf", () => {
	test("an older pay date resolves the older profile", () => {
		expect(resolveAsOf(profiles, d("2024-06-15"))?.label).toBe("GY-2024");
	});

	test("a newer pay date resolves the newer profile", () => {
		expect(resolveAsOf(profiles, d("2026-06-15"))?.label).toBe("GY-2026");
	});

	test("the mid window resolves the mid profile", () => {
		expect(resolveAsOf(profiles, d("2025-07-01"))?.label).toBe("GY-2025");
	});

	test("boundary day resolves the window it opens, not the one it closes", () => {
		expect(resolveAsOf(profiles, d("2026-01-01"))?.label).toBe("GY-2026");
	});

	test("a date before every window resolves nothing", () => {
		expect(resolveAsOf(profiles, d("2020-01-01"))).toBeNull();
	});

	test("ordering of the input does not change the result", () => {
		const shuffled = [gy2026, gy2024, gy2025];
		expect(resolveAsOf(shuffled, d("2024-06-15"))?.label).toBe("GY-2024");
	});

	test("overlapping windows pick the latest effectiveFrom", () => {
		const overlapping = [
			{ label: "old", effectiveFrom: d("2026-01-01"), effectiveTo: null },
			{ label: "new", effectiveFrom: d("2026-03-01"), effectiveTo: null },
		];
		expect(resolveAsOf(overlapping, d("2026-06-01"))?.label).toBe("new");
	});

	test("empty candidate set resolves nothing", () => {
		expect(resolveAsOf([], d("2026-06-15"))).toBeNull();
	});
});
