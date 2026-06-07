/**
 * CRM — Phase 17B schema.
 *
 * Scope (per docs/architecture/crm-implementation-plan.md §3): the 8-table
 * Lead → Customer → Deal spine + activity/note loop + the ONE link point to
 * Projects.
 *   crm_customer / crm_contact / crm_lead / crm_deal / crm_pipeline_stage /
 *   crm_activity / crm_note / crm_customer_project_link
 *
 * GUARDRAILS / design rationale:
 *   - Money columns (crm_deal.value, crm_lead.estimated_value) are finance data
 *     — redacted server-side in 17C for roles without canSeeCrmMoney (mirrors
 *     Assets purchaseCost / recruitment offer comp).
 *   - crm_note.visibility = 'private' rows are stripped at the API boundary for
 *     finance/auditor/manager (redaction; the privacy surface).
 *   - crm_customer_project_link.projectId is a SOFT text ref (NOT a FK) reserved
 *     for the Projects module — the row can exist as a "handoff intent" before a
 *     real project is created; Projects (14) back-fills it later.
 *   - Activities + notes are polymorphic (related_type + related_id) over
 *     lead/customer/contact/deal — related_id is plain text (no FK).
 *   - Single default pipeline in MVP (no crm_pipeline parent table); source is an
 *     enum column (no crm_source table). Audit reuses the shared audit_event log.
 *   - Soft-delete via deleted_at on every table; partial-unique invariants on
 *     contact email + stage name (deleted_at IS NULL).
 */

import { relations, sql } from "drizzle-orm";
import {
	boolean,
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

// ── enums ────────────────────────────────────────────────────────────────
export const crmCustomerTypeEnum = pgEnum("crm_customer_type", [
	"company",
	"individual",
]);
export const crmCustomerStatusEnum = pgEnum("crm_customer_status", [
	"prospect",
	"active",
	"inactive",
]);
export const crmLeadStatusEnum = pgEnum("crm_lead_status", [
	"new",
	"contacted",
	"qualified",
	"unqualified",
	"converted",
]);
export const crmDealStatusEnum = pgEnum("crm_deal_status", [
	"open",
	"won",
	"lost",
]);
export const crmNoteVisibilityEnum = pgEnum("crm_note_visibility", [
	"team",
	"private",
]);
export const crmActivityTypeEnum = pgEnum("crm_activity_type", [
	"call",
	"meeting",
	"email",
	"task",
	"follow_up",
]);
export const crmSourceEnum = pgEnum("crm_source", [
	"web_form",
	"referral",
	"campaign",
	"manual",
	"import",
	"event",
	"other",
]);
export const crmHandoffStatusEnum = pgEnum("crm_handoff_status", [
	"intended",
	"linked",
	"delivered",
	"cancelled",
]);
export const crmRelatedTypeEnum = pgEnum("crm_related_type", [
	"lead",
	"customer",
	"contact",
	"deal",
]);

// ── crm_customer ─────────────────────────────────────────────────────────
export const crmCustomer = pgTable(
	"crm_customer",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		type: crmCustomerTypeEnum("type").default("company").notNull(),
		status: crmCustomerStatusEnum("status").default("prospect").notNull(),
		website: text("website"),
		phone: text("phone"),
		email: text("email"),
		industry: text("industry"),
		ownerEmployeeId: text("owner_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		addressLine: text("address_line"),
		city: text("city"),
		country: text("country"),
		sourceKey: crmSourceEnum("source_key"),
		notesSummary: text("notes_summary"),
		// Denormalised cache for the list view (recomputed on deal mutations).
		openDealCount: integer("open_deal_count").default(0).notNull(),
		openDealValue: numeric("open_deal_value", { precision: 14, scale: 2 })
			.default("0")
			.notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("crm_customer_org_idx").on(t.organizationId),
		index("crm_customer_org_status_idx").on(t.organizationId, t.status),
		index("crm_customer_org_owner_idx").on(t.organizationId, t.ownerEmployeeId),
	]
);

// ── crm_contact ──────────────────────────────────────────────────────────
export const crmContact = pgTable(
	"crm_contact",
	{
		id: cuid(),
		organizationId: orgRef(),
		customerId: text("customer_id").references(() => crmCustomer.id, {
			onDelete: "set null",
		}),
		firstName: text("first_name").notNull(),
		lastName: text("last_name"),
		email: text("email"),
		phone: text("phone"),
		jobTitle: text("job_title"),
		isPrimary: boolean("is_primary").default(false).notNull(),
		ownerEmployeeId: text("owner_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("crm_contact_org_idx").on(t.organizationId),
		index("crm_contact_customer_idx").on(t.customerId),
		// Partial-unique email per org (active rows only) — mirrors recruitment.
		uniqueIndex("crm_contact_org_email_uq")
			.on(t.organizationId, t.email)
			.where(sql`${t.email} is not null and ${t.deletedAt} is null`),
	]
);

// ── crm_pipeline_stage ───────────────────────────────────────────────────
export const crmPipelineStage = pgTable(
	"crm_pipeline_stage",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		position: integer("position").default(0).notNull(),
		defaultProbabilityPct: integer("default_probability_pct"),
		isWon: boolean("is_won").default(false).notNull(),
		isLost: boolean("is_lost").default(false).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("crm_stage_org_pos_idx").on(t.organizationId, t.position),
		uniqueIndex("crm_stage_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ── crm_deal ─────────────────────────────────────────────────────────────
export const crmDeal = pgTable(
	"crm_deal",
	{
		id: cuid(),
		organizationId: orgRef(),
		customerId: text("customer_id")
			.notNull()
			.references(() => crmCustomer.id, { onDelete: "restrict" }),
		primaryContactId: text("primary_contact_id").references(
			() => crmContact.id,
			{ onDelete: "set null" }
		),
		title: text("title").notNull(),
		stageId: text("stage_id")
			.notNull()
			.references(() => crmPipelineStage.id, { onDelete: "restrict" }),
		value: numeric("value", { precision: 12, scale: 2 }),
		currency: text("currency").notNull(),
		probabilityPct: integer("probability_pct"),
		expectedCloseDate: date("expected_close_date", { mode: "date" }),
		status: crmDealStatusEnum("status").default("open").notNull(),
		lostReason: text("lost_reason"),
		ownerEmployeeId: text("owner_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		lastActivityAt: timestamp("last_activity_at"),
		// Set when a won deal is handed off (soft ref to the link row below).
		handedOffProjectLinkId: text("handed_off_project_link_id"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("crm_deal_org_stage_idx").on(t.organizationId, t.stageId),
		index("crm_deal_org_owner_idx").on(t.organizationId, t.ownerEmployeeId),
		index("crm_deal_org_status_idx").on(t.organizationId, t.status),
		index("crm_deal_customer_idx").on(t.customerId),
	]
);

// ── crm_lead ─────────────────────────────────────────────────────────────
export const crmLead = pgTable(
	"crm_lead",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		contactEmail: text("contact_email"),
		contactPhone: text("contact_phone"),
		companyName: text("company_name"),
		status: crmLeadStatusEnum("status").default("new").notNull(),
		sourceKey: crmSourceEnum("source_key"),
		ownerEmployeeId: text("owner_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
		description: text("description"),
		convertedCustomerId: text("converted_customer_id").references(
			() => crmCustomer.id,
			{ onDelete: "set null" }
		),
		convertedContactId: text("converted_contact_id").references(
			() => crmContact.id,
			{ onDelete: "set null" }
		),
		convertedDealId: text("converted_deal_id").references(() => crmDeal.id, {
			onDelete: "set null",
		}),
		convertedAt: timestamp("converted_at"),
		convertedByUserId: text("converted_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("crm_lead_org_status_idx").on(t.organizationId, t.status),
		index("crm_lead_org_owner_idx").on(t.organizationId, t.ownerEmployeeId),
	]
);

// ── crm_activity (polymorphic touchpoint log) ────────────────────────────
export const crmActivity = pgTable(
	"crm_activity",
	{
		id: cuid(),
		organizationId: orgRef(),
		type: crmActivityTypeEnum("type").notNull(),
		subject: text("subject").notNull(),
		body: text("body"),
		dueAt: timestamp("due_at"),
		completedAt: timestamp("completed_at"),
		relatedType: crmRelatedTypeEnum("related_type").notNull(),
		relatedId: text("related_id").notNull(),
		assignedToEmployeeId: text("assigned_to_employee_id").references(
			() => employeeProfile.id,
			{ onDelete: "set null" }
		),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("crm_activity_related_idx").on(
			t.organizationId,
			t.relatedType,
			t.relatedId
		),
		index("crm_activity_org_due_idx").on(t.organizationId, t.dueAt),
		index("crm_activity_assignee_idx").on(t.assignedToEmployeeId),
	]
);

// ── crm_note (polymorphic; carries privacy visibility) ───────────────────
export const crmNote = pgTable(
	"crm_note",
	{
		id: cuid(),
		organizationId: orgRef(),
		relatedType: crmRelatedTypeEnum("related_type").notNull(),
		relatedId: text("related_id").notNull(),
		body: text("body").notNull(),
		visibility: crmNoteVisibilityEnum("visibility").default("team").notNull(),
		authorUserId: text("author_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("crm_note_related_idx").on(
			t.organizationId,
			t.relatedType,
			t.relatedId
		),
	]
);

// ── crm_customer_project_link (the thesis link point) ────────────────────
export const crmCustomerProjectLink = pgTable(
	"crm_customer_project_link",
	{
		id: cuid(),
		organizationId: orgRef(),
		customerId: text("customer_id")
			.notNull()
			.references(() => crmCustomer.id, { onDelete: "cascade" }),
		dealId: text("deal_id").references(() => crmDeal.id, {
			onDelete: "set null",
		}),
		// SOFT ref (NOT a FK) to the future/real Projects module — nullable so the
		// row can exist as a handoff intent before a project is created.
		projectId: text("project_id"),
		handoffStatus: crmHandoffStatusEnum("handoff_status")
			.default("intended")
			.notNull(),
		handoffNote: text("handoff_note"),
		handedOffByUserId: text("handed_off_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		handedOffAt: timestamp("handed_off_at"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("crm_cpl_org_idx").on(t.organizationId),
		index("crm_cpl_customer_idx").on(t.customerId),
		index("crm_cpl_deal_idx").on(t.dealId),
	]
);

// ── relations ────────────────────────────────────────────────────────────
export const crmCustomerRelations = relations(crmCustomer, ({ many, one }) => ({
	contacts: many(crmContact),
	deals: many(crmDeal),
	owner: one(employeeProfile, {
		fields: [crmCustomer.ownerEmployeeId],
		references: [employeeProfile.id],
	}),
}));

export const crmContactRelations = relations(crmContact, ({ one }) => ({
	customer: one(crmCustomer, {
		fields: [crmContact.customerId],
		references: [crmCustomer.id],
	}),
}));

export const crmDealRelations = relations(crmDeal, ({ one }) => ({
	customer: one(crmCustomer, {
		fields: [crmDeal.customerId],
		references: [crmCustomer.id],
	}),
	stage: one(crmPipelineStage, {
		fields: [crmDeal.stageId],
		references: [crmPipelineStage.id],
	}),
	primaryContact: one(crmContact, {
		fields: [crmDeal.primaryContactId],
		references: [crmContact.id],
	}),
}));

export const crmPipelineStageRelations = relations(
	crmPipelineStage,
	({ many }) => ({
		deals: many(crmDeal),
	})
);

export const crmCustomerProjectLinkRelations = relations(
	crmCustomerProjectLink,
	({ one }) => ({
		customer: one(crmCustomer, {
			fields: [crmCustomerProjectLink.customerId],
			references: [crmCustomer.id],
		}),
		deal: one(crmDeal, {
			fields: [crmCustomerProjectLink.dealId],
			references: [crmDeal.id],
		}),
	})
);
