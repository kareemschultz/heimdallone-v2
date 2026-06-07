/**
 * Finance — Phase 16B schema.
 *
 * Scope (per docs/architecture/finance-implementation-plan.md):
 *   finance_budget  — the ONLY table Finance owns.
 *
 * CENTRAL GUARDRAIL: Finance is a costing + budgeting COORDINATION layer — it
 * LINKS read-only to Payroll (payslip actuals), Projects (approved time entries)
 * and HR Core (contract rates, departments) and NEVER owns or mutates their
 * business rules. The finance router (16C) does NOT write to payroll / attendance
 * / project / contract / employee — cost reports are READ MODELS computed at read
 * time, not a second ledger.
 *
 *   - `finance_budget.scopeId` is a SOFT text ref (NOT a foreign key) to a
 *     department.id or project.id. A budget is a historical financial record:
 *     archiving/deleting a department or project must never cascade-delete or
 *     block it. The id is tenant-verified on write (SELECT in this org) but
 *     stored as plain text — mirrors the Projects CRM soft-ref decision.
 *   - There is NO finance_cost_snapshot / finance_ledger table — all cost
 *     reporting (summary, by-department, project costing, variance) is pure
 *     aggregation. A materialized snapshot is a documented future optimization.
 *   - Activity reuses the shared audit_event log (no finance_activity table).
 *   - journal / account AC resources exist but stay UNCONSUMED — accounting/GL
 *     integration is a deferred future phase, NOT Phase 16.
 */

import { relations } from "drizzle-orm";
import {
	date,
	index,
	numeric,
	pgEnum,
	pgTable,
	text,
	unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { cuid, orgRef, timestamps } from "./hr-core";

export const financeBudgetScopeEnum = pgEnum("finance_budget_scope", [
	"organization",
	"department",
	"project",
]);

export const financeBudgetCategoryEnum = pgEnum("finance_budget_category", [
	"labour",
	"total",
]);

export const financeBudget = pgTable(
	"finance_budget",
	{
		id: cuid(),
		organizationId: orgRef(),
		scope: financeBudgetScopeEnum("scope").notNull(),
		// Soft ref (NOT a FK): department.id or project.id; NULL when
		// scope = organization. Tenant-verified on write, stored as text so
		// archiving the dept/project never cascades into financial history.
		scopeId: text("scope_id"),
		label: text("label").notNull(),
		category: financeBudgetCategoryEnum("category").default("labour").notNull(),
		periodStart: date("period_start", { mode: "date" }).notNull(),
		periodEnd: date("period_end", { mode: "date" }).notNull(),
		currency: text("currency").notNull(),
		budgetedAmount: numeric("budgeted_amount", {
			precision: 14,
			scale: 2,
		}).notNull(),
		notes: text("notes"),
		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(t) => [
		unique("finance_budget_scope_period_uq").on(
			t.organizationId,
			t.scope,
			t.scopeId,
			t.category,
			t.periodStart,
			t.periodEnd
		),
		index("finance_budget_org_scope_idx").on(t.organizationId, t.scope),
		index("finance_budget_org_period_idx").on(t.organizationId, t.periodStart),
	]
);

export const financeBudgetRelations = relations(financeBudget, ({ one }) => ({
	creator: one(user, {
		fields: [financeBudget.createdBy],
		references: [user.id],
	}),
}));
