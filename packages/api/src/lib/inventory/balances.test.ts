/**
 * Unit tests for the PURE inventory ledger primitives (Phase INV-C).
 * The DB-touching paths (applyApprovedMovement / recomputeBalances) are exercised
 * by scripts/verify-inventory-api.ts against a live transaction; here we lock the
 * deterministic delta + fold maths that those paths depend on.
 */

import { describe, expect, it } from "bun:test";
import { type BalanceDelta, foldMovements, movementDeltas } from "./balances";

const OFFICE = "loc_office";
const BOND = "loc_bond";

function byLocation(deltas: BalanceDelta[]): Record<string, BalanceDelta> {
	return Object.fromEntries(deltas.map((d) => [d.locationId, d]));
}

describe("movementDeltas — on-hand sign conventions", () => {
	it("credits the destination for inbound types", () => {
		for (const type of ["in", "returned"] as const) {
			const [delta] = movementDeltas({
				type,
				qty: 10,
				destinationLocationId: BOND,
			});
			expect(delta).toEqual({ locationId: BOND, qty: 10, reserved: 0 });
		}
	});

	it("debits the source for outbound types", () => {
		for (const type of ["out", "sold", "issued", "damaged"] as const) {
			const [delta] = movementDeltas({
				type,
				qty: 4,
				sourceLocationId: OFFICE,
			});
			expect(delta).toEqual({ locationId: OFFICE, qty: -4, reserved: 0 });
		}
	});

	it("debits source and credits destination for a transfer", () => {
		const map = byLocation(
			movementDeltas({
				type: "transfer",
				qty: 7,
				sourceLocationId: BOND,
				destinationLocationId: OFFICE,
			})
		);
		expect(map[BOND].qty).toBe(-7);
		expect(map[OFFICE].qty).toBe(7);
	});

	it("applies a signed adjustment (write-down allowed)", () => {
		const [up] = movementDeltas({
			type: "adjustment",
			qty: 3,
			destinationLocationId: BOND,
		});
		const [down] = movementDeltas({
			type: "count_adjustment",
			qty: -2,
			destinationLocationId: BOND,
		});
		expect(up.qty).toBe(3);
		expect(down.qty).toBe(-2);
	});
});

describe("movementDeltas — reserved vs on-hand", () => {
	it("reserve moves reserved only, leaving on-hand untouched", () => {
		const [delta] = movementDeltas({
			type: "reserve",
			qty: 5,
			destinationLocationId: OFFICE,
		});
		expect(delta).toEqual({ locationId: OFFICE, qty: 0, reserved: 5 });
	});

	it("release reverses a reservation", () => {
		const [delta] = movementDeltas({
			type: "release",
			qty: 5,
			destinationLocationId: OFFICE,
		});
		expect(delta).toEqual({ locationId: OFFICE, qty: 0, reserved: -5 });
	});
});

describe("movementDeltas — structural guards", () => {
	it("rejects inbound without a destination", () => {
		expect(() => movementDeltas({ type: "in", qty: 1 })).toThrow();
	});

	it("rejects outbound without a source", () => {
		expect(() => movementDeltas({ type: "sold", qty: 1 })).toThrow();
	});

	it("rejects a transfer missing a location", () => {
		expect(() =>
			movementDeltas({ type: "transfer", qty: 1, sourceLocationId: BOND })
		).toThrow();
	});

	it("rejects a transfer whose source equals its destination", () => {
		expect(() =>
			movementDeltas({
				type: "transfer",
				qty: 1,
				sourceLocationId: BOND,
				destinationLocationId: BOND,
			})
		).toThrow();
	});
});

describe("foldMovements — deterministic accumulation", () => {
	it("matches the seed ledger maths (Core Router: bond 70 / office 20)", () => {
		const buckets = foldMovements([
			// 100 in -> bond
			{
				productId: "p_router",
				type: "in",
				qty: 100,
				destinationLocationId: BOND,
			},
			// transfer 30 bond -> office
			{
				productId: "p_router",
				type: "transfer",
				qty: 30,
				sourceLocationId: BOND,
				destinationLocationId: OFFICE,
			},
			// sell 10 from office
			{
				productId: "p_router",
				type: "sold",
				qty: 10,
				sourceLocationId: OFFICE,
			},
		]);
		const map = Object.fromEntries(
			buckets.map((b) => [`${b.productId}::${b.locationId}`, b])
		);
		expect(map[`p_router::${BOND}`].qty).toBe(70);
		expect(map[`p_router::${OFFICE}`].qty).toBe(20);
	});

	it("keeps separate products in separate buckets", () => {
		const buckets = foldMovements([
			{ productId: "p_a", type: "in", qty: 5, destinationLocationId: BOND },
			{ productId: "p_b", type: "in", qty: 8, destinationLocationId: BOND },
		]);
		expect(buckets).toHaveLength(2);
	});

	it("is order-independent for commutative deltas", () => {
		const a = foldMovements([
			{ productId: "p", type: "in", qty: 10, destinationLocationId: BOND },
			{ productId: "p", type: "sold", qty: 4, sourceLocationId: BOND },
		]);
		const b = foldMovements([
			{ productId: "p", type: "sold", qty: 4, sourceLocationId: BOND },
			{ productId: "p", type: "in", qty: 10, destinationLocationId: BOND },
		]);
		expect(a[0].qty).toBe(b[0].qty);
		expect(a[0].qty).toBe(6);
	});
});
