/**
 * Tenant branding — per-tenant identity & payslip presentation (Phase 22B).
 *
 * The v2 home for v1's `organization.updateBranding`. v1 piggy-backed branding
 * onto the Better-Auth-owned org row (ad-hoc columns / metadata). v2 keeps that
 * table clean and models branding as a dedicated 1:1 satellite keyed to
 * `organization` (FK, cascade), so branding can evolve without touching auth
 * schema.
 *
 * Logo is URL-FIRST: `logoUrl` is the canonical, preferred source. `logoDataUri`
 * is an OPTIONAL inline fallback, server-capped in size + MIME-validated by the
 * router (v2 has no object-storage subsystem yet — that swap is a flagged
 * follow-up; `logoUrl` stays canonical so it is transparent). Brand colour is a
 * server-validated `#rrggbb` hex mapped to the `--primary` token at runtime via
 * color-mix (consistent with the navy Corporate theme), never raw inline colour.
 *
 * Payslip template + display toggles are stored NOW and consumed LATER (no PDF
 * payslip generator exists in v2 yet) — honest forward config, clearly labelled
 * "applies when payslips are generated" in the UI. Every change is audited
 * (entityType `tenant_branding`), so branding history is reconstructable from
 * `audit_event` — no effective-dating columns needed (branding = current state).
 */

import { relations } from "drizzle-orm";
import {
	boolean,
	pgEnum,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { cuid, orgRef, timestamps } from "./hr-core";

// Tenant-safe payslip layout choice (enum, not free text). Stored now; consumed
// when the payslip PDF generator lands.
export const payslipTemplateEnum = pgEnum("payslip_template", [
	"classic",
	"modern",
	"compact",
]);

export const tenantBranding = pgTable(
	"tenant_branding",
	{
		id: cuid(),
		// 1:1 with organization — the unique index enforces a single row per tenant.
		organizationId: orgRef(),
		// Falls back to organization.name when null (resolved in the router).
		displayName: text("display_name"),
		addressLine1: text("address_line_1"),
		addressLine2: text("address_line_2"),
		addressLine3: text("address_line_3"),
		phone: text("phone"),
		// Server-validated email when present.
		email: text("email"),
		// Printed on payslip PDFs (forward config).
		footerNote: text("footer_note"),
		// Preferred logo source.
		logoUrl: text("logo_url"),
		// Optional inline fallback — server-capped size + MIME-validated by the router.
		logoDataUri: text("logo_data_uri"),
		// `#rrggbb`, server-validated; null → theme default.
		brandColorHex: text("brand_color_hex"),
		payslipTemplate: payslipTemplateEnum("payslip_template")
			.notNull()
			.default("classic"),
		payslipShowAttendance: boolean("payslip_show_attendance")
			.notNull()
			.default(true),
		payslipShowHours: boolean("payslip_show_hours").notNull().default(false),
		// NIS is shown MASKED by the renderer — never plaintext.
		payslipShowNis: boolean("payslip_show_nis").notNull().default(false),
		...timestamps,
	},
	(t) => [uniqueIndex("tenant_branding_org_uq").on(t.organizationId)]
);

export const tenantBrandingRelations = relations(tenantBranding, ({ one }) => ({
	organization: one(organization, {
		fields: [tenantBranding.organizationId],
		references: [organization.id],
	}),
}));
