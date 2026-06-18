import { relations, sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { cuid, orgRef, timestamps } from "./hr-core";

// ───────────────────────────────────────────────────────────────────
// Inventory (Phase INV — ported from Netsurf StockHub, multi-tenantised)
//
// Ledger model (StockHub ADR-0002, preserved): `inventory_stock_movement`
// is an APPEND-ONLY ledger and the source of truth for stock. Rows are
// immutable except for status transitions. `inventory_stock_balance` is a
// DERIVED CACHE that mutates ONLY through APPROVED movements, recomputable
// deterministically from the ledger. Money is integer cents.
//
// Multi-tenancy: org-scope is carried on every root table (category,
// product_type, product, location, stock_movement, stock_balance);
// child tables inherit org through their parent FK and are tenant-verified
// on write. Slugs/SKUs are unique PER ORG, not globally.
// ───────────────────────────────────────────────────────────────────

const DEFAULT_CURRENCY = "GYD";
const DEFAULT_REORDER_LEVEL = 0;
const DEFAULT_QTY = 0;

// Image-match confidence for product photos extracted from import workbooks.
export const inventoryImageMatchEnum = pgEnum("inventory_image_match", [
	"matched",
	"none",
	"multiple",
	"needs_review",
]);

// Location kind — office (sellable/working stock) vs bond (customs-bonded).
export const inventoryLocationKindEnum = pgEnum("inventory_location_kind", [
	"office",
	"bond",
]);

// Direction/effect is derived from the type; qty is a positive magnitude
// (except adjustment / count_adjustment, which may be signed).
export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", [
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
]);

export const inventoryMovementStatusEnum = pgEnum("inventory_movement_status", [
	"draft",
	"pending",
	"approved",
	"rejected",
	"cancelled",
]);

// ───────────────────────────────────────────────────────────────────
// 1. inventory_category — top of the Category → Type → Product taxonomy
// ───────────────────────────────────────────────────────────────────
export const inventoryCategory = pgTable(
	"inventory_category",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
	},
	(t) => [
		index("inventory_category_org_idx").on(t.organizationId),
		uniqueIndex("inventory_category_org_slug_uq").on(t.organizationId, t.slug),
	]
);

// ───────────────────────────────────────────────────────────────────
// 2. inventory_product_type — always belongs to a category
// ───────────────────────────────────────────────────────────────────
export const inventoryProductType = pgTable(
	"inventory_product_type",
	{
		id: cuid(),
		organizationId: orgRef(),
		categoryId: text("category_id")
			.notNull()
			.references(() => inventoryCategory.id, { onDelete: "restrict" }),
		name: text("name").notNull(),
		slug: text("slug"),
		description: text("description"),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
	},
	(t) => [
		index("inventory_product_type_org_idx").on(t.organizationId),
		index("inventory_product_type_category_idx").on(t.categoryId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 3. inventory_product — the catalog leaf. Money is integer cents.
// ───────────────────────────────────────────────────────────────────
export const inventoryProduct = pgTable(
	"inventory_product",
	{
		id: cuid(),
		organizationId: orgRef(),
		// SKU is nullable; unique per org only when present (partial unique below).
		sku: text("sku"),
		modelName: text("model_name"),
		name: text("name").notNull(),
		categoryId: text("category_id")
			.notNull()
			.references(() => inventoryCategory.id, { onDelete: "restrict" }),
		typeId: text("type_id")
			.notNull()
			.references(() => inventoryProductType.id, { onDelete: "restrict" }),
		brand: text("brand"),
		description: text("description"),
		features: text("features"),
		unitPriceCents: bigint("unit_price_cents", { mode: "number" }),
		currencyCode: text("currency_code").default(DEFAULT_CURRENCY).notNull(),
		// Denormalised fast-match copy of inventory_product_alias.
		aliases: jsonb("aliases").$type<string[]>(),
		// Flexible spec bag; inventory_product_attribute holds normalised rows.
		attributesJson: jsonb("attributes_json").$type<Record<string, unknown>>(),
		reorderLevel: integer("reorder_level")
			.default(DEFAULT_REORDER_LEVEL)
			.notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		notes: text("notes"),
		...timestamps,
	},
	(t) => [
		index("inventory_product_org_idx").on(t.organizationId),
		index("inventory_product_category_type_idx").on(t.categoryId, t.typeId),
		index("inventory_product_model_name_idx").on(t.modelName),
		uniqueIndex("inventory_product_org_sku_uq")
			.on(t.organizationId, t.sku)
			.where(sql`${t.sku} is not null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// 4. inventory_product_alias — authoritative alias store
// ───────────────────────────────────────────────────────────────────
export const inventoryProductAlias = pgTable(
	"inventory_product_alias",
	{
		id: cuid(),
		productId: text("product_id")
			.notNull()
			.references(() => inventoryProduct.id, { onDelete: "cascade" }),
		alias: text("alias").notNull(),
		normalizedAlias: text("normalized_alias"),
		source: text("source"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		index("inventory_product_alias_normalized_idx").on(t.normalizedAlias),
		index("inventory_product_alias_product_idx").on(t.productId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 5. inventory_product_attribute — normalised key/value spec rows
// ───────────────────────────────────────────────────────────────────
export const inventoryProductAttribute = pgTable(
	"inventory_product_attribute",
	{
		id: cuid(),
		productId: text("product_id")
			.notNull()
			.references(() => inventoryProduct.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		value: text("value").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [index("inventory_product_attribute_product_idx").on(t.productId)]
);

// ───────────────────────────────────────────────────────────────────
// 6. inventory_product_image — photo metadata (URL via StorageProvider,
//    the net-new file layer deferred to INV-I; this table is metadata-only)
// ───────────────────────────────────────────────────────────────────
export const inventoryProductImage = pgTable(
	"inventory_product_image",
	{
		id: cuid(),
		productId: text("product_id")
			.notNull()
			.references(() => inventoryProduct.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		source: text("source"),
		isPrimary: boolean("is_primary").default(false).notNull(),
		matchConfidence: inventoryImageMatchEnum("match_confidence"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [index("inventory_product_image_product_idx").on(t.productId)]
);

// ───────────────────────────────────────────────────────────────────
// 7. inventory_price_history — append-on-change pricing audit
// ───────────────────────────────────────────────────────────────────
export const inventoryPriceHistory = pgTable(
	"inventory_price_history",
	{
		id: cuid(),
		productId: text("product_id")
			.notNull()
			.references(() => inventoryProduct.id, { onDelete: "cascade" }),
		oldPriceCents: bigint("old_price_cents", { mode: "number" }),
		newPriceCents: bigint("new_price_cents", { mode: "number" }).notNull(),
		currencyCode: text("currency_code").default(DEFAULT_CURRENCY).notNull(),
		effectiveDate: timestamp("effective_date").notNull(),
		reason: text("reason"),
		source: text("source"),
		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		index("inventory_price_history_product_effective_idx").on(
			t.productId,
			t.effectiveDate
		),
	]
);

// ───────────────────────────────────────────────────────────────────
// 8. inventory_location — office / customs-bond stock locations
// ───────────────────────────────────────────────────────────────────
export const inventoryLocation = pgTable(
	"inventory_location",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		kind: inventoryLocationKindEnum("kind").notNull(),
		code: text("code"),
		isActive: boolean("is_active").default(true).notNull(),
		...timestamps,
	},
	(t) => [
		index("inventory_location_org_idx").on(t.organizationId),
		index("inventory_location_kind_idx").on(t.kind),
		uniqueIndex("inventory_location_org_slug_uq").on(t.organizationId, t.slug),
	]
);

// ───────────────────────────────────────────────────────────────────
// 9. inventory_stock_balance — DERIVED CACHE, never authoritative.
//    Rebuilt from the approved-movements ledger via recomputeBalances().
// ───────────────────────────────────────────────────────────────────
export const inventoryStockBalance = pgTable(
	"inventory_stock_balance",
	{
		id: cuid(),
		organizationId: orgRef(),
		productId: text("product_id")
			.notNull()
			.references(() => inventoryProduct.id, { onDelete: "cascade" }),
		locationId: text("location_id")
			.notNull()
			.references(() => inventoryLocation.id, { onDelete: "cascade" }),
		qty: integer("qty").default(DEFAULT_QTY).notNull(),
		reserved: integer("reserved").default(DEFAULT_QTY).notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		index("inventory_stock_balance_org_idx").on(t.organizationId),
		uniqueIndex("inventory_stock_balance_product_location_uq").on(
			t.productId,
			t.locationId
		),
		index("inventory_stock_balance_location_idx").on(t.locationId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 10. inventory_stock_movement — APPEND-ONLY LEDGER, source of truth
// ───────────────────────────────────────────────────────────────────
export const inventoryStockMovement = pgTable(
	"inventory_stock_movement",
	{
		id: cuid(),
		organizationId: orgRef(),
		productId: text("product_id")
			.notNull()
			.references(() => inventoryProduct.id, { onDelete: "restrict" }),
		type: inventoryMovementTypeEnum("type").notNull(),
		qty: integer("qty").notNull(),
		sourceLocationId: text("source_location_id").references(
			() => inventoryLocation.id,
			{ onDelete: "restrict" }
		),
		destinationLocationId: text("destination_location_id").references(
			() => inventoryLocation.id,
			{ onDelete: "restrict" }
		),
		reason: text("reason"),
		reference: text("reference"),
		notes: text("notes"),
		status: inventoryMovementStatusEnum("status").default("pending").notNull(),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		approvedBy: text("approved_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		approvedAt: timestamp("approved_at"),
	},
	(t) => [
		index("inventory_stock_movement_org_idx").on(t.organizationId),
		index("inventory_stock_movement_product_idx").on(t.productId),
		index("inventory_stock_movement_status_idx").on(t.status),
		index("inventory_stock_movement_created_at_idx").on(t.createdAt),
		index("inventory_stock_movement_reference_idx").on(t.reference),
	]
);

// ───────────────────────────────────────────────────────────────────
// Relations
// ───────────────────────────────────────────────────────────────────
export const inventoryCategoryRelations = relations(
	inventoryCategory,
	({ many }) => ({
		productTypes: many(inventoryProductType),
		products: many(inventoryProduct),
	})
);

export const inventoryProductTypeRelations = relations(
	inventoryProductType,
	({ one, many }) => ({
		category: one(inventoryCategory, {
			fields: [inventoryProductType.categoryId],
			references: [inventoryCategory.id],
		}),
		products: many(inventoryProduct),
	})
);

export const inventoryProductRelations = relations(
	inventoryProduct,
	({ one, many }) => ({
		category: one(inventoryCategory, {
			fields: [inventoryProduct.categoryId],
			references: [inventoryCategory.id],
		}),
		type: one(inventoryProductType, {
			fields: [inventoryProduct.typeId],
			references: [inventoryProductType.id],
		}),
		aliasRows: many(inventoryProductAlias),
		attributeRows: many(inventoryProductAttribute),
		images: many(inventoryProductImage),
		prices: many(inventoryPriceHistory),
		balances: many(inventoryStockBalance),
	})
);

export const inventoryProductAliasRelations = relations(
	inventoryProductAlias,
	({ one }) => ({
		product: one(inventoryProduct, {
			fields: [inventoryProductAlias.productId],
			references: [inventoryProduct.id],
		}),
	})
);

export const inventoryProductAttributeRelations = relations(
	inventoryProductAttribute,
	({ one }) => ({
		product: one(inventoryProduct, {
			fields: [inventoryProductAttribute.productId],
			references: [inventoryProduct.id],
		}),
	})
);

export const inventoryProductImageRelations = relations(
	inventoryProductImage,
	({ one }) => ({
		product: one(inventoryProduct, {
			fields: [inventoryProductImage.productId],
			references: [inventoryProduct.id],
		}),
	})
);

export const inventoryPriceHistoryRelations = relations(
	inventoryPriceHistory,
	({ one }) => ({
		product: one(inventoryProduct, {
			fields: [inventoryPriceHistory.productId],
			references: [inventoryProduct.id],
		}),
	})
);

export const inventoryLocationRelations = relations(
	inventoryLocation,
	({ many }) => ({
		balances: many(inventoryStockBalance),
	})
);

export const inventoryStockBalanceRelations = relations(
	inventoryStockBalance,
	({ one }) => ({
		product: one(inventoryProduct, {
			fields: [inventoryStockBalance.productId],
			references: [inventoryProduct.id],
		}),
		location: one(inventoryLocation, {
			fields: [inventoryStockBalance.locationId],
			references: [inventoryLocation.id],
		}),
	})
);

export const inventoryStockMovementRelations = relations(
	inventoryStockMovement,
	({ one }) => ({
		product: one(inventoryProduct, {
			fields: [inventoryStockMovement.productId],
			references: [inventoryProduct.id],
		}),
		sourceLocation: one(inventoryLocation, {
			fields: [inventoryStockMovement.sourceLocationId],
			references: [inventoryLocation.id],
		}),
		destinationLocation: one(inventoryLocation, {
			fields: [inventoryStockMovement.destinationLocationId],
			references: [inventoryLocation.id],
		}),
		createdByUser: one(user, {
			fields: [inventoryStockMovement.createdBy],
			references: [user.id],
		}),
		approvedByUser: one(user, {
			fields: [inventoryStockMovement.approvedBy],
			references: [user.id],
		}),
	})
);
