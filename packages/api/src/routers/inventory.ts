/**
 * Inventory router — Phase INV-C.
 *
 * Ledger-backed stock, ported from Netsurf StockHub and multi-tenantised. Owns
 * the catalogue (categories / product types / products), stock locations, the
 * append-only stock-movement ledger, and the derived balance cache.
 *
 * Two-layer authz: AC gate (authorizedProcedure("inventory_*", action)) + an
 * org fence in every handler. Reads filter by organizationId; writes re-verify
 * that referenced product/location ids belong to the caller's org (cross-tenant
 * IDOR guard). The balance cache mutates ONLY through approved movements via the
 * shared applyApprovedMovement path (StockHub ADR-0002).
 *
 * Separation of duties: an actor cannot approve a movement they created
 * (isSelfApproval), and driving a balance below zero requires the manager-only
 * negative-override capability (canOverrideNegativeStock).
 *
 * GUARDRAIL: writes target ONLY inventory_* tables (+ shared audit_event).
 */

import { db } from "@Heimdallone/db";
import {
	inventoryCategory,
	inventoryLocation,
	inventoryPriceHistory,
	inventoryProduct,
	inventoryProductType,
	inventoryStockBalance,
	inventoryStockMovement,
} from "@Heimdallone/db/schema/inventory";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import {
	aliasedTable,
	and,
	asc,
	desc,
	eq,
	ilike,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { isSelfApproval } from "../lib/inventory/approval";
import {
	applyApprovedMovement,
	type InventoryMovementType,
	recomputeBalances,
} from "../lib/inventory/balances";
import { createAuditEvent } from "../utils/audit";
import { canOverrideNegativeStock } from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const MOVEMENT_TYPES = [
	"in",
	"out",
	"transfer",
	"adjustment",
	"count_adjustment",
	"reserve",
	"release",
	"damaged",
	"returned",
	"issued",
	"sold",
] as const;

const idInput = z.object({ id: z.string().min(1) });

// ── slug helper (per-org uniqueness is enforced by the DB index) ──
const SLUG_NON_ALNUM = /[^a-z0-9]+/g;
const SLUG_TRIM = /^-+|-+$/g;
function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(SLUG_NON_ALNUM, "-")
		.replace(SLUG_TRIM, "");
}

// ── org-fenced existence checks (cross-tenant IDOR guard) ──
async function assertCategoryInOrg(
	org: string,
	categoryId: string
): Promise<void> {
	const [row] = await db
		.select({ id: inventoryCategory.id })
		.from(inventoryCategory)
		.where(
			and(
				eq(inventoryCategory.id, categoryId),
				eq(inventoryCategory.organizationId, org)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Category not found." });
	}
}

async function assertTypeInOrg(org: string, typeId: string): Promise<void> {
	const [row] = await db
		.select({ id: inventoryProductType.id })
		.from(inventoryProductType)
		.where(
			and(
				eq(inventoryProductType.id, typeId),
				eq(inventoryProductType.organizationId, org)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Product type not found." });
	}
}

async function assertProductInOrg(
	org: string,
	productId: string
): Promise<void> {
	const [row] = await db
		.select({ id: inventoryProduct.id })
		.from(inventoryProduct)
		.where(
			and(
				eq(inventoryProduct.id, productId),
				eq(inventoryProduct.organizationId, org)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Product not found." });
	}
}

async function assertLocationInOrg(
	org: string,
	locationId: string
): Promise<void> {
	const [row] = await db
		.select({ id: inventoryLocation.id })
		.from(inventoryLocation)
		.where(
			and(
				eq(inventoryLocation.id, locationId),
				eq(inventoryLocation.organizationId, org)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Location not found." });
	}
}

// ───────────────────────────────────────────────────────────────────
// Categories (catalogue — inventory_product resource)
// ───────────────────────────────────────────────────────────────────
const categories = {
	list: authorizedProcedure("inventory_product", "read").handler(
		({ context }) =>
			db
				.select()
				.from(inventoryCategory)
				.where(eq(inventoryCategory.organizationId, orgId(context)))
				.orderBy(asc(inventoryCategory.name))
	),

	create: authorizedProcedure("inventory_product", "create")
		.input(
			z.object({
				name: z.string().min(1),
				description: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			const id = createId();
			const [row] = await db
				.insert(inventoryCategory)
				.values({
					id,
					organizationId: org,
					name: input.name,
					slug: slugify(input.name) || id,
					description: input.description ?? null,
				})
				.returning();
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_category",
				entityId: id,
				action: "create",
				actorId: actorId(context),
				metadata: { name: input.name },
			});
			return row;
		}),

	update: authorizedProcedure("inventory_product", "update")
		.input(
			z.object({
				id: z.string().min(1),
				name: z.string().min(1).optional(),
				description: z.string().nullable().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			await assertCategoryInOrg(org, input.id);
			const [row] = await db
				.update(inventoryCategory)
				.set({
					...(input.name ? { name: input.name } : {}),
					...(input.description === undefined
						? {}
						: { description: input.description }),
				})
				.where(
					and(
						eq(inventoryCategory.id, input.id),
						eq(inventoryCategory.organizationId, org)
					)
				)
				.returning();
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_category",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
			});
			return row;
		}),

	archive: authorizedProcedure("inventory_product", "archive")
		.input(idInput)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			await assertCategoryInOrg(org, input.id);
			await db
				.update(inventoryCategory)
				.set({ isActive: false })
				.where(
					and(
						eq(inventoryCategory.id, input.id),
						eq(inventoryCategory.organizationId, org)
					)
				);
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_category",
				entityId: input.id,
				action: "archive",
				actorId: actorId(context),
			});
			return { ok: true };
		}),
};

// ───────────────────────────────────────────────────────────────────
// Product types (catalogue — inventory_product resource)
// ───────────────────────────────────────────────────────────────────
const productTypes = {
	list: authorizedProcedure("inventory_product", "read")
		.input(z.object({ categoryId: z.string().optional() }).optional())
		.handler(({ context, input }) => {
			const filters: SQL[] = [
				eq(inventoryProductType.organizationId, orgId(context)),
			];
			if (input?.categoryId) {
				filters.push(eq(inventoryProductType.categoryId, input.categoryId));
			}
			return db
				.select()
				.from(inventoryProductType)
				.where(and(...filters))
				.orderBy(asc(inventoryProductType.name));
		}),

	create: authorizedProcedure("inventory_product", "create")
		.input(
			z.object({
				categoryId: z.string().min(1),
				name: z.string().min(1),
				description: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			await assertCategoryInOrg(org, input.categoryId);
			const id = createId();
			const [row] = await db
				.insert(inventoryProductType)
				.values({
					id,
					organizationId: org,
					categoryId: input.categoryId,
					name: input.name,
					slug: slugify(input.name) || id,
					description: input.description ?? null,
				})
				.returning();
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_product_type",
				entityId: id,
				action: "create",
				actorId: actorId(context),
				metadata: { name: input.name },
			});
			return row;
		}),

	update: authorizedProcedure("inventory_product", "update")
		.input(
			z.object({
				id: z.string().min(1),
				name: z.string().min(1).optional(),
				description: z.string().nullable().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			await assertTypeInOrg(org, input.id);
			const [row] = await db
				.update(inventoryProductType)
				.set({
					...(input.name ? { name: input.name } : {}),
					...(input.description === undefined
						? {}
						: { description: input.description }),
				})
				.where(
					and(
						eq(inventoryProductType.id, input.id),
						eq(inventoryProductType.organizationId, org)
					)
				)
				.returning();
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_product_type",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
			});
			return row;
		}),

	archive: authorizedProcedure("inventory_product", "archive")
		.input(idInput)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			await assertTypeInOrg(org, input.id);
			await db
				.update(inventoryProductType)
				.set({ isActive: false })
				.where(
					and(
						eq(inventoryProductType.id, input.id),
						eq(inventoryProductType.organizationId, org)
					)
				);
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_product_type",
				entityId: input.id,
				action: "archive",
				actorId: actorId(context),
			});
			return { ok: true };
		}),
};

// ───────────────────────────────────────────────────────────────────
// Products (catalogue — inventory_product resource)
// ───────────────────────────────────────────────────────────────────
const products = {
	list: authorizedProcedure("inventory_product", "read")
		.input(
			z
				.object({
					search: z.string().optional(),
					categoryId: z.string().optional(),
					typeId: z.string().optional(),
					activeOnly: z.boolean().optional(),
				})
				.optional()
		)
		.handler(({ context, input }) => {
			const filters: SQL[] = [
				eq(inventoryProduct.organizationId, orgId(context)),
			];
			if (input?.categoryId) {
				filters.push(eq(inventoryProduct.categoryId, input.categoryId));
			}
			if (input?.typeId) {
				filters.push(eq(inventoryProduct.typeId, input.typeId));
			}
			if (input?.activeOnly) {
				filters.push(eq(inventoryProduct.isActive, true));
			}
			if (input?.search) {
				filters.push(ilike(inventoryProduct.name, `%${input.search}%`));
			}
			return db
				.select({
					id: inventoryProduct.id,
					sku: inventoryProduct.sku,
					name: inventoryProduct.name,
					modelName: inventoryProduct.modelName,
					brand: inventoryProduct.brand,
					categoryId: inventoryProduct.categoryId,
					categoryName: inventoryCategory.name,
					typeId: inventoryProduct.typeId,
					typeName: inventoryProductType.name,
					unitPriceCents: inventoryProduct.unitPriceCents,
					currencyCode: inventoryProduct.currencyCode,
					reorderLevel: inventoryProduct.reorderLevel,
					isActive: inventoryProduct.isActive,
					updatedAt: inventoryProduct.updatedAt,
				})
				.from(inventoryProduct)
				.leftJoin(
					inventoryCategory,
					eq(inventoryCategory.id, inventoryProduct.categoryId)
				)
				.leftJoin(
					inventoryProductType,
					eq(inventoryProductType.id, inventoryProduct.typeId)
				)
				.where(and(...filters))
				.orderBy(asc(inventoryProduct.name));
		}),

	getById: authorizedProcedure("inventory_product", "read")
		.input(idInput)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			const [product] = await db
				.select()
				.from(inventoryProduct)
				.where(
					and(
						eq(inventoryProduct.id, input.id),
						eq(inventoryProduct.organizationId, org)
					)
				)
				.limit(1);
			if (!product) {
				throw new ORPCError("NOT_FOUND", { message: "Product not found." });
			}
			const balances = await db
				.select({
					locationId: inventoryStockBalance.locationId,
					locationName: inventoryLocation.name,
					locationKind: inventoryLocation.kind,
					qty: inventoryStockBalance.qty,
					reserved: inventoryStockBalance.reserved,
				})
				.from(inventoryStockBalance)
				.leftJoin(
					inventoryLocation,
					eq(inventoryLocation.id, inventoryStockBalance.locationId)
				)
				.where(eq(inventoryStockBalance.productId, input.id));
			const priceHistory = await db
				.select()
				.from(inventoryPriceHistory)
				.where(eq(inventoryPriceHistory.productId, input.id))
				.orderBy(desc(inventoryPriceHistory.effectiveDate))
				.limit(20);
			const onHand = balances.reduce((sum, b) => sum + b.qty, 0);
			return { ...product, balances, priceHistory, onHand };
		}),

	create: authorizedProcedure("inventory_product", "create")
		.input(
			z.object({
				name: z.string().min(1),
				sku: z.string().optional(),
				modelName: z.string().optional(),
				categoryId: z.string().min(1),
				typeId: z.string().min(1),
				brand: z.string().optional(),
				description: z.string().optional(),
				unitPriceCents: z.number().int().nonnegative().optional(),
				reorderLevel: z.number().int().nonnegative().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			await assertCategoryInOrg(org, input.categoryId);
			await assertTypeInOrg(org, input.typeId);
			const id = createId();
			const [row] = await db
				.insert(inventoryProduct)
				.values({
					id,
					organizationId: org,
					name: input.name,
					sku: input.sku ?? null,
					modelName: input.modelName ?? null,
					categoryId: input.categoryId,
					typeId: input.typeId,
					brand: input.brand ?? null,
					description: input.description ?? null,
					unitPriceCents: input.unitPriceCents ?? null,
					reorderLevel: input.reorderLevel ?? 0,
				})
				.returning();
			if (input.unitPriceCents != null) {
				await db.insert(inventoryPriceHistory).values({
					id: createId(),
					productId: id,
					newPriceCents: input.unitPriceCents,
					effectiveDate: new Date(),
					reason: "Initial price",
					source: "manual",
					createdBy: actorId(context),
				});
			}
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_product",
				entityId: id,
				action: "create",
				actorId: actorId(context),
				metadata: { name: input.name, sku: input.sku ?? null },
			});
			return row;
		}),

	update: authorizedProcedure("inventory_product", "update")
		.input(
			z.object({
				id: z.string().min(1),
				name: z.string().min(1).optional(),
				sku: z.string().nullable().optional(),
				modelName: z.string().nullable().optional(),
				brand: z.string().nullable().optional(),
				description: z.string().nullable().optional(),
				unitPriceCents: z.number().int().nonnegative().nullable().optional(),
				reorderLevel: z.number().int().nonnegative().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			const [existing] = await db
				.select()
				.from(inventoryProduct)
				.where(
					and(
						eq(inventoryProduct.id, input.id),
						eq(inventoryProduct.organizationId, org)
					)
				)
				.limit(1);
			if (!existing) {
				throw new ORPCError("NOT_FOUND", { message: "Product not found." });
			}
			// Append a price-history row when the price changes.
			const priceChanged =
				input.unitPriceCents !== undefined &&
				input.unitPriceCents !== existing.unitPriceCents;
			const [row] = await db
				.update(inventoryProduct)
				.set({
					...(input.name ? { name: input.name } : {}),
					...(input.sku === undefined ? {} : { sku: input.sku }),
					...(input.modelName === undefined
						? {}
						: { modelName: input.modelName }),
					...(input.brand === undefined ? {} : { brand: input.brand }),
					...(input.description === undefined
						? {}
						: { description: input.description }),
					...(input.unitPriceCents === undefined
						? {}
						: { unitPriceCents: input.unitPriceCents }),
					...(input.reorderLevel === undefined
						? {}
						: { reorderLevel: input.reorderLevel }),
				})
				.where(
					and(
						eq(inventoryProduct.id, input.id),
						eq(inventoryProduct.organizationId, org)
					)
				)
				.returning();
			if (priceChanged && input.unitPriceCents != null) {
				await db.insert(inventoryPriceHistory).values({
					id: createId(),
					productId: input.id,
					oldPriceCents: existing.unitPriceCents,
					newPriceCents: input.unitPriceCents,
					effectiveDate: new Date(),
					reason: "Price update",
					source: "manual",
					createdBy: actorId(context),
				});
			}
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_product",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
			});
			return row;
		}),

	archive: authorizedProcedure("inventory_product", "archive")
		.input(idInput)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			await assertProductInOrg(org, input.id);
			await db
				.update(inventoryProduct)
				.set({ isActive: false })
				.where(
					and(
						eq(inventoryProduct.id, input.id),
						eq(inventoryProduct.organizationId, org)
					)
				);
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_product",
				entityId: input.id,
				action: "archive",
				actorId: actorId(context),
			});
			return { ok: true };
		}),
};

// ───────────────────────────────────────────────────────────────────
// Locations (inventory_location resource)
// ───────────────────────────────────────────────────────────────────
const locations = {
	list: authorizedProcedure("inventory_location", "read").handler(
		({ context }) =>
			db
				.select()
				.from(inventoryLocation)
				.where(eq(inventoryLocation.organizationId, orgId(context)))
				.orderBy(asc(inventoryLocation.name))
	),

	create: authorizedProcedure("inventory_location", "create")
		.input(
			z.object({
				name: z.string().min(1),
				kind: z.enum(["office", "bond"]),
				code: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			const id = createId();
			const [row] = await db
				.insert(inventoryLocation)
				.values({
					id,
					organizationId: org,
					name: input.name,
					slug: slugify(input.name) || id,
					kind: input.kind,
					code: input.code ?? null,
				})
				.returning();
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_location",
				entityId: id,
				action: "create",
				actorId: actorId(context),
				metadata: { name: input.name, kind: input.kind },
			});
			return row;
		}),

	update: authorizedProcedure("inventory_location", "update")
		.input(
			z.object({
				id: z.string().min(1),
				name: z.string().min(1).optional(),
				code: z.string().nullable().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			await assertLocationInOrg(org, input.id);
			const [row] = await db
				.update(inventoryLocation)
				.set({
					...(input.name ? { name: input.name } : {}),
					...(input.code === undefined ? {} : { code: input.code }),
				})
				.where(
					and(
						eq(inventoryLocation.id, input.id),
						eq(inventoryLocation.organizationId, org)
					)
				)
				.returning();
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_location",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
			});
			return row;
		}),

	archive: authorizedProcedure("inventory_location", "archive")
		.input(idInput)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			await assertLocationInOrg(org, input.id);
			await db
				.update(inventoryLocation)
				.set({ isActive: false })
				.where(
					and(
						eq(inventoryLocation.id, input.id),
						eq(inventoryLocation.organizationId, org)
					)
				);
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_location",
				entityId: input.id,
				action: "archive",
				actorId: actorId(context),
			});
			return { ok: true };
		}),
};

// ───────────────────────────────────────────────────────────────────
// Movements (ledger — inventory_stock resource)
// ───────────────────────────────────────────────────────────────────
const sourceLocation = aliasedTable(inventoryLocation, "inv_source_location");
const destinationLocation = aliasedTable(
	inventoryLocation,
	"inv_destination_location"
);

const movements = {
	list: authorizedProcedure("inventory_stock", "read")
		.input(
			z
				.object({
					status: z
						.enum(["draft", "pending", "approved", "rejected", "cancelled"])
						.optional(),
					type: z.enum(MOVEMENT_TYPES).optional(),
					productId: z.string().optional(),
					limit: z.number().int().min(1).max(200).optional(),
				})
				.optional()
		)
		.handler(({ context, input }) => {
			const filters: SQL[] = [
				eq(inventoryStockMovement.organizationId, orgId(context)),
			];
			if (input?.status) {
				filters.push(eq(inventoryStockMovement.status, input.status));
			}
			if (input?.type) {
				filters.push(eq(inventoryStockMovement.type, input.type));
			}
			if (input?.productId) {
				filters.push(eq(inventoryStockMovement.productId, input.productId));
			}
			return db
				.select({
					id: inventoryStockMovement.id,
					productId: inventoryStockMovement.productId,
					productName: inventoryProduct.name,
					productSku: inventoryProduct.sku,
					type: inventoryStockMovement.type,
					qty: inventoryStockMovement.qty,
					status: inventoryStockMovement.status,
					sourceLocationId: inventoryStockMovement.sourceLocationId,
					sourceLocationName: sourceLocation.name,
					destinationLocationId: inventoryStockMovement.destinationLocationId,
					destinationLocationName: destinationLocation.name,
					reason: inventoryStockMovement.reason,
					reference: inventoryStockMovement.reference,
					notes: inventoryStockMovement.notes,
					createdBy: inventoryStockMovement.createdBy,
					approvedBy: inventoryStockMovement.approvedBy,
					createdAt: inventoryStockMovement.createdAt,
					approvedAt: inventoryStockMovement.approvedAt,
				})
				.from(inventoryStockMovement)
				.leftJoin(
					inventoryProduct,
					eq(inventoryProduct.id, inventoryStockMovement.productId)
				)
				.leftJoin(
					sourceLocation,
					eq(sourceLocation.id, inventoryStockMovement.sourceLocationId)
				)
				.leftJoin(
					destinationLocation,
					eq(
						destinationLocation.id,
						inventoryStockMovement.destinationLocationId
					)
				)
				.where(and(...filters))
				.orderBy(desc(inventoryStockMovement.createdAt))
				.limit(input?.limit ?? 100);
		}),

	getById: authorizedProcedure("inventory_stock", "read")
		.input(idInput)
		.handler(async ({ context, input }) => {
			const [row] = await db
				.select()
				.from(inventoryStockMovement)
				.where(
					and(
						eq(inventoryStockMovement.id, input.id),
						eq(inventoryStockMovement.organizationId, orgId(context))
					)
				)
				.limit(1);
			return row ?? null;
		}),

	create: authorizedProcedure("inventory_stock", "create")
		.input(
			z
				.object({
					productId: z.string().min(1),
					type: z.enum(MOVEMENT_TYPES),
					qty: z.number().int().positive(),
					sourceLocationId: z.string().min(1).optional(),
					destinationLocationId: z.string().min(1).optional(),
					reason: z.string().optional(),
					reference: z.string().optional(),
					notes: z.string().optional(),
				})
				.refine(
					(v) =>
						v.type !== "transfer" ||
						v.sourceLocationId !== v.destinationLocationId,
					{ message: "Transfer source and destination must differ." }
				)
		)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			await assertProductInOrg(org, input.productId);
			if (input.sourceLocationId) {
				await assertLocationInOrg(org, input.sourceLocationId);
			}
			if (input.destinationLocationId) {
				await assertLocationInOrg(org, input.destinationLocationId);
			}
			const id = createId();
			const [row] = await db
				.insert(inventoryStockMovement)
				.values({
					id,
					organizationId: org,
					productId: input.productId,
					type: input.type,
					qty: input.qty,
					sourceLocationId: input.sourceLocationId ?? null,
					destinationLocationId: input.destinationLocationId ?? null,
					reason: input.reason ?? null,
					reference: input.reference ?? null,
					notes: input.notes ?? null,
					status: "pending",
					createdBy: actorId(context),
				})
				.returning();
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_stock_movement",
				entityId: id,
				action: "create",
				actorId: actorId(context),
				metadata: { type: input.type, qty: input.qty, status: "pending" },
			});
			return row;
		}),

	approve: authorizedProcedure("inventory_stock", "approve")
		.input(idInput)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			const actor = actorId(context);
			const mayOverride = canOverrideNegativeStock(role(context));

			const result = await db.transaction(async (tx) => {
				const [movement] = await tx
					.select()
					.from(inventoryStockMovement)
					.where(
						and(
							eq(inventoryStockMovement.id, input.id),
							eq(inventoryStockMovement.organizationId, org)
						)
					)
					.limit(1);
				if (!movement) {
					throw new ORPCError("NOT_FOUND", { message: "Movement not found." });
				}
				if (movement.status !== "pending" && movement.status !== "draft") {
					throw new ORPCError("BAD_REQUEST", {
						message: `Only pending or draft movements can be approved (current: ${movement.status}).`,
					});
				}
				if (isSelfApproval(actor, movement.createdBy)) {
					throw new ORPCError("FORBIDDEN", {
						message:
							"You cannot approve your own stock movement. A different approver is required.",
					});
				}

				await applyApprovedMovement(
					tx,
					{
						organizationId: org,
						productId: movement.productId,
						type: movement.type as InventoryMovementType,
						qty: movement.qty,
						sourceLocationId: movement.sourceLocationId,
						destinationLocationId: movement.destinationLocationId,
					},
					mayOverride
				);

				const [updated] = await tx
					.update(inventoryStockMovement)
					.set({
						status: "approved",
						approvedBy: actor,
						approvedAt: new Date(),
					})
					.where(eq(inventoryStockMovement.id, movement.id))
					.returning();
				return updated;
			});

			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_stock_movement",
				entityId: input.id,
				action: "update",
				actorId: actor,
				metadata: { status: "approved", override: mayOverride },
			});
			return result;
		}),

	reject: authorizedProcedure("inventory_stock", "approve")
		.input(idInput)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			const [movement] = await db
				.select()
				.from(inventoryStockMovement)
				.where(
					and(
						eq(inventoryStockMovement.id, input.id),
						eq(inventoryStockMovement.organizationId, org)
					)
				)
				.limit(1);
			if (!movement) {
				throw new ORPCError("NOT_FOUND", { message: "Movement not found." });
			}
			if (movement.status !== "pending" && movement.status !== "draft") {
				throw new ORPCError("BAD_REQUEST", {
					message: `Only pending or draft movements can be rejected (current: ${movement.status}).`,
				});
			}
			const [updated] = await db
				.update(inventoryStockMovement)
				.set({ status: "rejected" })
				.where(eq(inventoryStockMovement.id, movement.id))
				.returning();
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_stock_movement",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
				metadata: { status: "rejected" },
			});
			return updated;
		}),

	cancel: authorizedProcedure("inventory_stock", "create")
		.input(idInput)
		.handler(async ({ context, input }) => {
			const org = orgId(context);
			const [movement] = await db
				.select()
				.from(inventoryStockMovement)
				.where(
					and(
						eq(inventoryStockMovement.id, input.id),
						eq(inventoryStockMovement.organizationId, org)
					)
				)
				.limit(1);
			if (!movement) {
				throw new ORPCError("NOT_FOUND", { message: "Movement not found." });
			}
			if (movement.status === "approved") {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Approved movements cannot be cancelled; post a correction instead.",
				});
			}
			const [updated] = await db
				.update(inventoryStockMovement)
				.set({ status: "cancelled" })
				.where(eq(inventoryStockMovement.id, movement.id))
				.returning();
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_stock_movement",
				entityId: input.id,
				action: "update",
				actorId: actorId(context),
				metadata: { status: "cancelled" },
			});
			return updated;
		}),

	/** Deterministically rebuild this org's balance cache from its ledger. */
	recompute: authorizedProcedure("inventory_stock", "approve").handler(
		async ({ context }) => {
			const org = orgId(context);
			await db.transaction((tx) => recomputeBalances(tx, org));
			await createAuditEvent(db, {
				organizationId: org,
				entityType: "inventory_stock_balance",
				entityId: org,
				action: "update",
				actorId: actorId(context),
				metadata: { event: "balances.recomputed" },
			});
			return { ok: true };
		}
	),
};

// ───────────────────────────────────────────────────────────────────
// Balances + dashboard (inventory_stock resource)
// ───────────────────────────────────────────────────────────────────
const balances = {
	list: authorizedProcedure("inventory_stock", "read")
		.input(
			z
				.object({
					locationId: z.string().optional(),
					productId: z.string().optional(),
				})
				.optional()
		)
		.handler(({ context, input }) => {
			const filters: SQL[] = [
				eq(inventoryStockBalance.organizationId, orgId(context)),
			];
			if (input?.locationId) {
				filters.push(eq(inventoryStockBalance.locationId, input.locationId));
			}
			if (input?.productId) {
				filters.push(eq(inventoryStockBalance.productId, input.productId));
			}
			return db
				.select({
					productId: inventoryStockBalance.productId,
					productName: inventoryProduct.name,
					productSku: inventoryProduct.sku,
					reorderLevel: inventoryProduct.reorderLevel,
					unitPriceCents: inventoryProduct.unitPriceCents,
					locationId: inventoryStockBalance.locationId,
					locationName: inventoryLocation.name,
					locationKind: inventoryLocation.kind,
					qty: inventoryStockBalance.qty,
					reserved: inventoryStockBalance.reserved,
				})
				.from(inventoryStockBalance)
				.leftJoin(
					inventoryProduct,
					eq(inventoryProduct.id, inventoryStockBalance.productId)
				)
				.leftJoin(
					inventoryLocation,
					eq(inventoryLocation.id, inventoryStockBalance.locationId)
				)
				.where(and(...filters))
				.orderBy(asc(inventoryProduct.name));
		}),

	/** Dashboard tiles: product count, on-hand units, stock value, low-stock,
	 *  pending-movement count — all derived, org-scoped. */
	summary: authorizedProcedure("inventory_stock", "read").handler(
		async ({ context }) => {
			const org = orgId(context);

			const [productAgg] = await db
				.select({
					productCount: sql<number>`count(*)`.mapWith(Number),
				})
				.from(inventoryProduct)
				.where(
					and(
						eq(inventoryProduct.organizationId, org),
						eq(inventoryProduct.isActive, true)
					)
				);

			const balanceRows = await db
				.select({
					productId: inventoryStockBalance.productId,
					qty: inventoryStockBalance.qty,
					unitPriceCents: inventoryProduct.unitPriceCents,
					reorderLevel: inventoryProduct.reorderLevel,
				})
				.from(inventoryStockBalance)
				.leftJoin(
					inventoryProduct,
					eq(inventoryProduct.id, inventoryStockBalance.productId)
				)
				.where(eq(inventoryStockBalance.organizationId, org));

			let onHandUnits = 0;
			let stockValueCents = 0;
			const perProductQty = new Map<string, number>();
			const reorderByProduct = new Map<string, number>();
			for (const b of balanceRows) {
				onHandUnits += b.qty;
				stockValueCents += b.qty * (b.unitPriceCents ?? 0);
				perProductQty.set(
					b.productId,
					(perProductQty.get(b.productId) ?? 0) + b.qty
				);
				reorderByProduct.set(b.productId, b.reorderLevel ?? 0);
			}
			let lowStockCount = 0;
			for (const [productId, qty] of perProductQty) {
				const reorder = reorderByProduct.get(productId) ?? 0;
				if (reorder > 0 && qty <= reorder) {
					lowStockCount += 1;
				}
			}

			const [pendingAgg] = await db
				.select({ count: sql<number>`count(*)`.mapWith(Number) })
				.from(inventoryStockMovement)
				.where(
					and(
						eq(inventoryStockMovement.organizationId, org),
						eq(inventoryStockMovement.status, "pending")
					)
				);

			return {
				productCount: productAgg?.productCount ?? 0,
				onHandUnits,
				stockValueCents,
				lowStockCount,
				pendingMovements: pendingAgg?.count ?? 0,
			};
		}
	),
};

export const inventoryRouter = {
	categories,
	productTypes,
	products,
	locations,
	movements,
	balances,
};
