/**
 * Organization leave policy resolution by date (Phase 21G-D).
 *
 * Mirrors the payroll profile resolver: a thin DB shell around the pure
 * {@link resolveAsOf} core. The policy in force on a date is the PUBLISHED policy
 * (status active or archived — NOT draft, NOT soft-deleted) with the latest
 * `effectiveFrom` on or before that date. `status` is a publish guard, not a
 * "current rule" flag — so resolution stops relying on `status = 'active'` alone
 * and a backdated leave request resolves the policy that was in force then.
 *
 * No `effectiveTo` column is needed: archived policies are preserved with their
 * `effectiveFrom`, so the next policy's start IS the implicit upper bound — which
 * is exactly what "latest effectiveFrom on or before the date" selects. Legacy
 * undated policies fall back to `activatedAt ?? createdAt` for a deterministic,
 * always-comparable date (createdAt is NOT NULL).
 */

import { db } from "@Heimdallone/db";
import { organizationLeavePolicy } from "@Heimdallone/db/schema/leave-policy";
import { resolveAsOf } from "@Heimdallone/payroll-engine/effective-dating";
import { and, eq, inArray, isNull } from "drizzle-orm";

type OrgPolicyRow = typeof organizationLeavePolicy.$inferSelect;

// Active + archived are PUBLISHED (historical) and so participate in resolution;
// draft is unpublished and invisible.
const PUBLISHED_STATUSES = ["active", "archived"] as const;

/**
 * Resolve the leave policy in force on `asOf`. Optionally scoped to a country
 * (org policies are per (org, country)); omit to resolve among all the org's
 * published policies. Returns `null` when none was in force on the date.
 */
export async function resolveLeavePolicyAsOf(opts: {
	organizationId: string;
	countryCode?: string;
	asOf: Date;
}): Promise<OrgPolicyRow | null> {
	const conditions = [
		eq(organizationLeavePolicy.organizationId, opts.organizationId),
		isNull(organizationLeavePolicy.deletedAt),
		inArray(organizationLeavePolicy.status, [...PUBLISHED_STATUSES]),
	];
	if (opts.countryCode) {
		conditions.push(eq(organizationLeavePolicy.countryCode, opts.countryCode));
	}

	const rows = await db
		.select()
		.from(organizationLeavePolicy)
		.where(and(...conditions));

	// Map each policy to a date-window the pure resolver understands. effectiveTo
	// stays null (open) for every row, so resolveAsOf picks the latest
	// effectiveFrom on or before the date — the in-force policy.
	const windowed = rows.map((row) => ({
		row,
		effectiveFrom: row.effectiveFrom ?? row.activatedAt ?? row.createdAt,
		effectiveTo: null as Date | null,
	}));

	const picked = resolveAsOf(windowed, opts.asOf);
	return picked?.row ?? null;
}
