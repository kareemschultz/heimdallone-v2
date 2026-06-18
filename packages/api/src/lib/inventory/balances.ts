/**
 * Inventory ledger → balance derivation (Phase INV-C).
 *
 * Ported from Netsurf StockHub (`packages/api/src/lib/balances.ts`, ADR-0002)
 * and multi-tenantised: the cache mutation (`applyApprovedMovement`) and the
 * deterministic rebuild (`recomputeBalances`) are now ORG-SCOPED so one tenant's
 * recompute never sums across or truncates another tenant's balances. The pure
 * delta/fold functions are tenant-agnostic and copied verbatim.
 *
 * Invariant (preserved): `inventory_stock_balance` is a DERIVED CACHE that
 * mutates ONLY through APPROVED movements. The cache always equals the fold of
 * the approved-movements ledger for that org.
 */

import type { db } from "@Heimdallone/db";
import {
	inventoryStockBalance,
	inventoryStockMovement,
} from "@Heimdallone/db/schema/inventory";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";

type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DatabaseOrTx = Database | Transaction;

export type InventoryMovementType =
	| "in"
	| "out"
	| "transfer"
	| "adjustment"
	| "count_adjustment"
	| "reserve"
	| "release"
	| "damaged"
	| "returned"
	| "issued"
	| "sold";

/** The shape of a movement needed to compute its effect on balances. */
export interface MovementForDelta {
	destinationLocationId?: string | null;
	qty: number;
	sourceLocationId?: string | null;
	type: InventoryMovementType;
}

/** One signed change to a single (product, location) balance bucket. */
export interface BalanceDelta {
	locationId: string;
	/** Signed change to on-hand qty. */
	qty: number;
	/** Signed change to reserved qty. */
	reserved: number;
}

/**
 * PURE: derive the signed balance deltas a single approved movement produces.
 *
 * Sign convention (ADR-0002 + inventory-domain-model.md):
 * - `in`, `returned`            -> +qty on-hand at destination
 * - `out`, `sold`, `issued`,
 *   `damaged`                   -> -qty on-hand at source
 * - `transfer`                  -> -qty at source AND +qty at destination
 * - `adjustment`,
 *   `count_adjustment`          -> signed qty on-hand at destination (qty may be
 *                                  negative to write a correction down)
 * - `reserve`                   -> +qty reserved at destination (no on-hand change)
 * - `release`                   -> -qty reserved at destination
 *
 * Throws on structurally invalid movements (missing required location, or a
 * transfer whose source and destination are the same).
 */
export function movementDeltas(movement: MovementForDelta): BalanceDelta[] {
	const { type, qty } = movement;
	const source = movement.sourceLocationId ?? null;
	const destination = movement.destinationLocationId ?? null;

	switch (type) {
		case "in":
		case "returned": {
			if (!destination) {
				throw new Error(`${type} movement requires a destination location.`);
			}
			return [{ locationId: destination, qty, reserved: 0 }];
		}
		case "out":
		case "sold":
		case "issued":
		case "damaged": {
			if (!source) {
				throw new Error(`${type} movement requires a source location.`);
			}
			return [{ locationId: source, qty: -qty, reserved: 0 }];
		}
		case "transfer": {
			if (!(source && destination)) {
				throw new Error(
					"transfer movement requires both source and destination locations."
				);
			}
			if (source === destination) {
				throw new Error(
					"transfer source and destination must be different locations."
				);
			}
			return [
				{ locationId: source, qty: -qty, reserved: 0 },
				{ locationId: destination, qty, reserved: 0 },
			];
		}
		case "adjustment":
		case "count_adjustment": {
			if (!destination) {
				throw new Error(
					`${type} movement requires a target (destination) location.`
				);
			}
			return [{ locationId: destination, qty, reserved: 0 }];
		}
		case "reserve": {
			if (!destination) {
				throw new Error(
					"reserve movement requires a target (destination) location."
				);
			}
			return [{ locationId: destination, qty: 0, reserved: qty }];
		}
		case "release": {
			if (!destination) {
				throw new Error(
					"release movement requires a target (destination) location."
				);
			}
			return [{ locationId: destination, qty: 0, reserved: -qty }];
		}
		default: {
			const exhaustive: never = type;
			throw new Error(`Unsupported movement type: ${String(exhaustive)}`);
		}
	}
}

export interface ApprovedMovementForBalance {
	destinationLocationId?: string | null;
	organizationId: string;
	productId: string;
	qty: number;
	sourceLocationId?: string | null;
	type: InventoryMovementType;
}

/**
 * Apply ONE approved movement's deltas to `inventory_stock_balance` inside a
 * transaction: lock each (product, location) bucket FOR UPDATE, reject any
 * change that would drive a balance below zero unless `mayOverride`, then upsert.
 * This is the SINGLE place balances mutate on approval, so the
 * rebuild-from-ledger invariant holds. Org-scoped: inserts stamp organizationId.
 */
export async function applyApprovedMovement(
	tx: Transaction,
	movement: ApprovedMovementForBalance,
	mayOverride: boolean
): Promise<void> {
	const deltas = movementDeltas(movement);
	for (const delta of deltas) {
		const [existing] = await tx
			.select()
			.from(inventoryStockBalance)
			.where(
				and(
					eq(inventoryStockBalance.productId, movement.productId),
					eq(inventoryStockBalance.locationId, delta.locationId)
				)
			)
			.limit(1)
			.for("update");

		const nextQty = (existing?.qty ?? 0) + delta.qty;
		const nextReserved = (existing?.reserved ?? 0) + delta.reserved;

		if ((nextQty < 0 || nextReserved < 0) && !mayOverride) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Approval would drive a balance below zero. A manager override is required.",
			});
		}

		if (existing) {
			await tx
				.update(inventoryStockBalance)
				.set({ qty: nextQty, reserved: nextReserved })
				.where(eq(inventoryStockBalance.id, existing.id));
		} else {
			await tx.insert(inventoryStockBalance).values({
				id: createId(),
				organizationId: movement.organizationId,
				productId: movement.productId,
				locationId: delta.locationId,
				qty: nextQty,
				reserved: nextReserved,
			});
		}
	}
}

interface BalanceBucket {
	locationId: string;
	productId: string;
	qty: number;
	reserved: number;
}

/**
 * PURE: fold an ordered list of approved movements into the full set of
 * (product, location) balance buckets. Deterministic — same input, same output.
 */
export function foldMovements(
	movements: (MovementForDelta & { productId: string })[]
): BalanceBucket[] {
	const buckets = new Map<string, BalanceBucket>();
	for (const movement of movements) {
		for (const delta of movementDeltas(movement)) {
			const key = `${movement.productId}::${delta.locationId}`;
			const existing = buckets.get(key);
			if (existing) {
				existing.qty += delta.qty;
				existing.reserved += delta.reserved;
			} else {
				buckets.set(key, {
					productId: movement.productId,
					locationId: delta.locationId,
					qty: delta.qty,
					reserved: delta.reserved,
				});
			}
		}
	}
	return Array.from(buckets.values());
}

/**
 * Deterministically rebuild the `inventory_stock_balance` cache for ONE ORG from
 * all of that org's approved movements. Deletes only the org's balance rows and
 * re-inserts the folded buckets stamped with organizationId. Intended to run
 * inside a transaction (callers wrap it). ADR-0002 rebuild-from-ledger.
 */
export async function recomputeBalances(
	database: DatabaseOrTx,
	organizationId: string
): Promise<void> {
	const approved = await database
		.select({
			productId: inventoryStockMovement.productId,
			type: inventoryStockMovement.type,
			qty: inventoryStockMovement.qty,
			sourceLocationId: inventoryStockMovement.sourceLocationId,
			destinationLocationId: inventoryStockMovement.destinationLocationId,
		})
		.from(inventoryStockMovement)
		.where(
			and(
				eq(inventoryStockMovement.organizationId, organizationId),
				eq(inventoryStockMovement.status, "approved")
			)
		);

	const buckets = foldMovements(approved);

	await database
		.delete(inventoryStockBalance)
		.where(eq(inventoryStockBalance.organizationId, organizationId));

	if (buckets.length === 0) {
		return;
	}

	await database.insert(inventoryStockBalance).values(
		buckets.map((bucket) => ({
			id: createId(),
			organizationId,
			productId: bucket.productId,
			locationId: bucket.locationId,
			qty: bucket.qty,
			reserved: bucket.reserved,
		}))
	);
}
