/**
 * Branding router (Phase 22 / Settings Depth) — per-tenant identity & payslip
 * presentation.
 *
 * Two procedures on a single 1:1 satellite table (`tenant_branding`):
 *   - `get` (branding:read, every role): the tenant's branding row, or a defaults
 *     object derived from `organization.name` when no row exists yet. Self-tenant
 *     only (org scope). Broad read so the app-shell sidebar can show logo/name/
 *     accent without a 403.
 *   - `update` (branding:manage, owner/admin/hr_admin): a single UPSERT keyed by
 *     organizationId. Server-validates hex / email / logo MIME+size / template
 *     enum, then writes one audit_event (create or update + per-field diff).
 *
 * Two-layer authz: AC gate (authorizedProcedure("branding", …)) + handler org
 * scope (every read/write is constrained to ctx.organizationId — no cross-tenant
 * leakage). The router OWNS only `tenant_branding` — it never writes another
 * module's table.
 *
 * Logo is URL-first; `logoDataUri` is an optional inline fallback, capped + MIME-
 * validated here (v2 has no object storage yet). `payslipTemplate` + the three
 * display toggles are stored now and consumed when the payslip PDF generator
 * lands (forward config).
 */

import { db } from "@Heimdallone/db";
import { organization } from "@Heimdallone/db/schema/auth";
import { tenantBranding } from "@Heimdallone/db/schema/tenant-branding";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent, diffChanges } from "../utils/audit";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;

// `#rrggbb` only (server-validated). Empty/null clears to the theme default.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// Allowed inline-logo MIME types + size cap (v2 has no object storage yet).
const ALLOWED_LOGO_MIME = new Set([
	"image/png",
	"image/svg+xml",
	"image/jpeg",
	"image/webp",
]);
const MAX_LOGO_DATA_URI_BYTES = 256 * 1024; // 256 KB
const DATA_URI_RE = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i;

const optionalText = z.string().trim().max(500).nullable().optional();

function assertValidHex(hex: string | null | undefined): void {
	if (hex && !HEX_COLOR.test(hex)) {
		throw new Error("Brand colour must be a hex value like #1f3a5f.");
	}
}

function assertValidEmail(email: string | null | undefined): void {
	if (email && !z.string().email().safeParse(email).success) {
		throw new Error("Email is not a valid address.");
	}
}

// Validate an inline logo data-URI: correct shape, allowed MIME, within the size
// cap. Returns nothing; throws a friendly Error on violation.
function assertValidLogoDataUri(value: string | null | undefined): void {
	if (!value) {
		return;
	}
	const match = DATA_URI_RE.exec(value);
	const mime = match?.[1]?.toLowerCase();
	const base64 = match?.[2];
	if (!(mime && base64)) {
		throw new Error("Uploaded logo must be a base64 data URI.");
	}
	if (!ALLOWED_LOGO_MIME.has(mime)) {
		throw new Error("Logo must be a PNG, SVG, JPEG, or WebP image.");
	}
	// base64 decoded byte length ≈ length * 3/4 (minus padding).
	let padding = 0;
	if (base64.endsWith("==")) {
		padding = 2;
	} else if (base64.endsWith("=")) {
		padding = 1;
	}
	const byteLength = Math.floor((base64.length * 3) / 4) - padding;
	if (byteLength > MAX_LOGO_DATA_URI_BYTES) {
		throw new Error("Uploaded logo is too large (max 256 KB). Use a logo URL.");
	}
}

// Resolve the org display name (fallback source for branding defaults).
async function organizationName(organizationId: string): Promise<string> {
	const [row] = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, organizationId))
		.limit(1);
	return row?.name ?? "Workspace";
}

// The shape every consumer (sidebar, settings, future payslip renderer) reads.
function brandingDefaults(orgDisplayName: string) {
	return {
		displayName: null as string | null,
		addressLine1: null as string | null,
		addressLine2: null as string | null,
		addressLine3: null as string | null,
		phone: null as string | null,
		email: null as string | null,
		footerNote: null as string | null,
		logoUrl: null as string | null,
		logoDataUri: null as string | null,
		brandColorHex: null as string | null,
		payslipTemplate: "classic" as "classic" | "modern" | "compact",
		payslipShowAttendance: true,
		payslipShowHours: false,
		payslipShowNis: false,
		// Always-resolved name the UI can render without its own fallback logic.
		resolvedDisplayName: orgDisplayName,
		organizationName: orgDisplayName,
	};
}

const get = authorizedProcedure("branding", "read").handler(
	async ({ context }) => {
		const oid = orgId(context);
		const orgDisplayName = await organizationName(oid);
		const [row] = await db
			.select()
			.from(tenantBranding)
			.where(eq(tenantBranding.organizationId, oid))
			.limit(1);
		if (!row) {
			return brandingDefaults(orgDisplayName);
		}
		return {
			displayName: row.displayName,
			addressLine1: row.addressLine1,
			addressLine2: row.addressLine2,
			addressLine3: row.addressLine3,
			phone: row.phone,
			email: row.email,
			footerNote: row.footerNote,
			logoUrl: row.logoUrl,
			logoDataUri: row.logoDataUri,
			brandColorHex: row.brandColorHex,
			payslipTemplate: row.payslipTemplate,
			payslipShowAttendance: row.payslipShowAttendance,
			payslipShowHours: row.payslipShowHours,
			payslipShowNis: row.payslipShowNis,
			resolvedDisplayName: row.displayName ?? orgDisplayName,
			organizationName: orgDisplayName,
		};
	}
);

const updateInput = z
	.object({
		displayName: optionalText,
		addressLine1: optionalText,
		addressLine2: optionalText,
		addressLine3: optionalText,
		phone: z.string().trim().max(60).nullable().optional(),
		email: z.string().trim().max(255).nullable().optional(),
		footerNote: z.string().trim().max(1000).nullable().optional(),
		logoUrl: z.string().trim().max(2048).url().nullable().optional(),
		logoDataUri: z.string().max(400_000).nullable().optional(),
		brandColorHex: z.string().trim().max(7).nullable().optional(),
		payslipTemplate: z.enum(["classic", "modern", "compact"]).optional(),
		payslipShowAttendance: z.boolean().optional(),
		payslipShowHours: z.boolean().optional(),
		payslipShowNis: z.boolean().optional(),
	})
	.strict();

type UpdateInput = z.infer<typeof updateInput>;

// Build the partial column patch from supplied fields only (undefined = leave
// untouched; null = clear). Validation runs before this.
function patchFromInput(
	input: UpdateInput
): Partial<typeof tenantBranding.$inferInsert> {
	const patch: Partial<typeof tenantBranding.$inferInsert> = {};
	if (input.displayName !== undefined) {
		patch.displayName = input.displayName;
	}
	if (input.addressLine1 !== undefined) {
		patch.addressLine1 = input.addressLine1;
	}
	if (input.addressLine2 !== undefined) {
		patch.addressLine2 = input.addressLine2;
	}
	if (input.addressLine3 !== undefined) {
		patch.addressLine3 = input.addressLine3;
	}
	if (input.phone !== undefined) {
		patch.phone = input.phone;
	}
	if (input.email !== undefined) {
		patch.email = input.email;
	}
	if (input.footerNote !== undefined) {
		patch.footerNote = input.footerNote;
	}
	if (input.logoUrl !== undefined) {
		patch.logoUrl = input.logoUrl;
	}
	if (input.logoDataUri !== undefined) {
		patch.logoDataUri = input.logoDataUri;
	}
	if (input.brandColorHex !== undefined) {
		patch.brandColorHex = input.brandColorHex || null;
	}
	if (input.payslipTemplate !== undefined) {
		patch.payslipTemplate = input.payslipTemplate;
	}
	if (input.payslipShowAttendance !== undefined) {
		patch.payslipShowAttendance = input.payslipShowAttendance;
	}
	if (input.payslipShowHours !== undefined) {
		patch.payslipShowHours = input.payslipShowHours;
	}
	if (input.payslipShowNis !== undefined) {
		patch.payslipShowNis = input.payslipShowNis;
	}
	return patch;
}

const update = authorizedProcedure("branding", "manage")
	.input(updateInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		assertValidHex(input.brandColorHex);
		assertValidEmail(input.email);
		assertValidLogoDataUri(input.logoDataUri);

		const patch = patchFromInput(input);
		const [existing] = await db
			.select()
			.from(tenantBranding)
			.where(eq(tenantBranding.organizationId, oid))
			.limit(1);

		if (existing) {
			await db
				.update(tenantBranding)
				.set(patch)
				.where(
					and(
						eq(tenantBranding.id, existing.id),
						eq(tenantBranding.organizationId, oid)
					)
				);
			await createAuditEvent(db, {
				organizationId: oid,
				entityType: "tenant_branding",
				entityId: existing.id,
				action: "update",
				actorId: actorId(context),
				changes: diffChanges(
					existing as unknown as Record<string, unknown>,
					patch as Record<string, unknown>
				),
			});
			return { id: existing.id };
		}

		const [created] = await db
			.insert(tenantBranding)
			.values({ organizationId: oid, ...patch })
			.returning({ id: tenantBranding.id });
		if (!created) {
			throw new Error("Failed to save branding.");
		}
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "tenant_branding",
			entityId: created.id,
			action: "create",
			actorId: actorId(context),
		});
		return { id: created.id };
	});

export const brandingRouter = {
	branding: {
		get,
		update,
	},
};
