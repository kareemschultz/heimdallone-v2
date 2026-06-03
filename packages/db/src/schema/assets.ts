import { relations, sql } from "drizzle-orm";
import {
	date,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { cuid, employeeProfile, orgRef, timestamps } from "./hr-core";

// ───────────────────────────────────────────────────────────────────
// Enums — Phase 12 Assets (company property / custody)
// ───────────────────────────────────────────────────────────────────

// Asset lifecycle. available → in_use (assigned) → available (returned);
// available|in_use → retired (write-off / end-of-life; no open assignment).
export const assetStatusEnum = pgEnum("asset_status", [
	"available",
	"in_use",
	"retired",
]);

// Condition assessment captured when custody is returned.
export const assetReturnConditionEnum = pgEnum("asset_return_condition", [
	"healthy",
	"minor_damage",
	"major_damage",
]);

// Employee asset-request lifecycle.
export const assetRequestStatusEnum = pgEnum("asset_request_status", [
	"requested",
	"approved",
	"rejected",
	"cancelled",
]);

// ───────────────────────────────────────────────────────────────────
// 1. asset_category — groups assets (Laptop, Mobile Phone, …)
// ───────────────────────────────────────────────────────────────────

export const assetCategory = pgTable(
	"asset_category",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		description: text("description"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("asset_category_org_idx").on(t.organizationId),
		// One category name per org among non-deleted rows.
		uniqueIndex("asset_category_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ───────────────────────────────────────────────────────────────────
// 2. asset — a tracked company item
//    currentAssigneeId is a denormalised cache of the open assignment's
//    holder, kept in sync by the assign/return procedures (Phase 12C).
//    The authoritative custody record is asset_assignment.
// ───────────────────────────────────────────────────────────────────

export const asset = pgTable(
	"asset",
	{
		id: cuid(),
		organizationId: orgRef(),
		// Category may be archived/deleted → asset orphans to "Uncategorised".
		categoryId: text("category_id").references(() => assetCategory.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		// Asset tag / serial — unique per org among non-deleted rows.
		trackingId: text("tracking_id").notNull(),
		description: text("description"),
		purchaseDate: date("purchase_date", { mode: "date" }),
		// Finance data — API redacts for non-finance/non-admin roles (Phase 12C).
		purchaseCost: numeric("purchase_cost", { precision: 12, scale: 2 }),
		status: assetStatusEnum("status").default("available").notNull(),
		currentAssigneeId: text("current_assignee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		expiryDate: date("expiry_date", { mode: "date" }),
		notifyBeforeDays: integer("notify_before_days"),
		lotNumber: text("lot_number"),
		// Reserved for a future assign/return photo — no upload UI in v1.
		imageUrl: text("image_url"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		uniqueIndex("asset_org_tracking_uq")
			.on(t.organizationId, t.trackingId)
			.where(sql`${t.deletedAt} is null`),
		index("asset_org_status_idx").on(t.organizationId, t.status),
		index("asset_org_assignee_idx").on(t.organizationId, t.currentAssigneeId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 3. asset_assignment — custody record (assign → return)
//    Partial unique enforces at most ONE open assignment per asset.
// ───────────────────────────────────────────────────────────────────

export const assetAssignment = pgTable(
	"asset_assignment",
	{
		id: cuid(),
		organizationId: orgRef(),
		assetId: text("asset_id")
			.notNull()
			.references(() => asset.id, { onDelete: "cascade" }),
		// Employees are soft-deactivated, not hard-deleted → restrict preserves history.
		assignedToId: text("assigned_to_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		assignedByUserId: text("assigned_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		assignedAt: timestamp("assigned_at").defaultNow().notNull(),
		returnDueDate: date("return_due_date", { mode: "date" }),
		// null = open custody.
		returnedAt: timestamp("returned_at"),
		returnCondition: assetReturnConditionEnum("return_condition"),
		returnReceivedByUserId: text("return_received_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		notes: text("notes"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		// Core invariant: at most one OPEN assignment per asset.
		uniqueIndex("asset_assignment_open_uq")
			.on(t.assetId)
			.where(sql`${t.returnedAt} is null and ${t.deletedAt} is null`),
		index("asset_assignment_org_assignee_idx").on(
			t.organizationId,
			t.assignedToId
		),
		index("asset_assignment_asset_idx").on(t.assetId),
	]
);

// ───────────────────────────────────────────────────────────────────
// 4. asset_request — employee self-service request for an asset
// ───────────────────────────────────────────────────────────────────

export const assetRequest = pgTable(
	"asset_request",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		categoryId: text("category_id").references(() => assetCategory.id, {
			onDelete: "set null",
		}),
		description: text("description"),
		status: assetRequestStatusEnum("status").default("requested").notNull(),
		resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		resolvedAt: timestamp("resolved_at"),
		resolutionNote: text("resolution_note"),
		// Set when an approval immediately fulfils the request with a specific asset.
		fulfilledAssetId: text("fulfilled_asset_id").references(() => asset.id, {
			onDelete: "set null",
		}),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("asset_request_org_employee_idx").on(t.organizationId, t.employeeId),
		index("asset_request_org_status_idx").on(t.organizationId, t.status),
	]
);

// ───────────────────────────────────────────────────────────────────
// Relations
// ───────────────────────────────────────────────────────────────────

export const assetCategoryRelations = relations(assetCategory, ({ many }) => ({
	assets: many(asset),
}));

export const assetRelations = relations(asset, ({ one, many }) => ({
	category: one(assetCategory, {
		fields: [asset.categoryId],
		references: [assetCategory.id],
	}),
	currentAssignee: one(employeeProfile, {
		fields: [asset.currentAssigneeId],
		references: [employeeProfile.id],
	}),
	assignments: many(assetAssignment),
}));

export const assetAssignmentRelations = relations(
	assetAssignment,
	({ one }) => ({
		asset: one(asset, {
			fields: [assetAssignment.assetId],
			references: [asset.id],
		}),
		assignedTo: one(employeeProfile, {
			fields: [assetAssignment.assignedToId],
			references: [employeeProfile.id],
		}),
	})
);

export const assetRequestRelations = relations(assetRequest, ({ one }) => ({
	employee: one(employeeProfile, {
		fields: [assetRequest.employeeId],
		references: [employeeProfile.id],
	}),
	category: one(assetCategory, {
		fields: [assetRequest.categoryId],
		references: [assetCategory.id],
	}),
	fulfilledAsset: one(asset, {
		fields: [assetRequest.fulfilledAssetId],
		references: [asset.id],
	}),
}));
