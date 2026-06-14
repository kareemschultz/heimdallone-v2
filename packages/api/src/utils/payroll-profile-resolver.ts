/**
 * Country payroll profile resolution (Phase 21G-C).
 *
 * The DB/imperative shell around the pure {@link resolveAsOf} core. Three jobs:
 *   1. resolve the statutory profile in force on a PAY DATE (resolve-by-date),
 *   2. fetch a profile PINNED on a payroll run by id (honor the pin),
 *   3. map a profile row into the engine's {@link CountryPayrollProfileInput}.
 *
 * Resolution = `isPublished` AND date-window. `isPublished` is a publish guard
 * (an unpublished future row is invisible), NOT a "current rule" flag — the date
 * window decides which published rule applies. See
 * docs/architecture/effective-dating-implementation-plan.md.
 */

import { db } from "@Heimdallone/db";
import { countryPayrollProfile } from "@Heimdallone/db/schema/payroll";
import { resolveAsOf } from "@Heimdallone/payroll-engine/effective-dating";
import { toCents } from "@Heimdallone/payroll-engine/money";
import type { CountryPayrollProfileInput } from "@Heimdallone/payroll-engine/types";
import { and, eq } from "drizzle-orm";

type ProfileRow = typeof countryPayrollProfile.$inferSelect;

/**
 * Inert profile handed to the engine when an org has no published statutory
 * rule. The calc then surfaces a blocker rather than silently computing on
 * zeros (preserves the prior no-profile behaviour of buildCountryProfile).
 */
export const NONE_COUNTRY_PROFILE: CountryPayrollProfileInput = {
	countryCode: "NONE",
	effectiveYear: 0,
	taxBrackets: [],
	personalAllowanceFormula: "",
	personalAllowanceThreshold: 0,
	childAllowancePerChild: 0,
	overtimeAllowanceCap: 0,
	insurancePremiumCapAmount: 0,
	employeeNISRate: 0,
	employerNISRate: 0,
	nisMaxEarnings: 0,
};

function formatIsoDate(d: Date): string {
	return d.toISOString().split("T")[0] ?? "";
}

/**
 * Human-readable provenance of a resolved rule, pinned on payroll_run for audit
 * and display — e.g. "GY 2026 (from 2026-01-01)".
 */
export function ruleVersionLabelFor(profile: ProfileRow): string {
	return `${profile.countryCode} ${profile.effectiveYear} (from ${formatIsoDate(profile.effectiveFrom)})`;
}

/** Map a stored profile row into the engine's typed, cents-denominated input. */
export function mapCountryPayrollProfile(
	profile: ProfileRow
): CountryPayrollProfileInput {
	const brackets = profile.taxBrackets as Array<{
		min: number;
		max: number | null;
		rate: number;
		fixedAmount: number;
	}>;

	return {
		countryCode: profile.countryCode,
		effectiveYear: profile.effectiveYear,
		taxBrackets: brackets.map((b) => ({
			min: toCents(b.min),
			max: b.max === null ? null : toCents(b.max),
			rate: b.rate,
			fixedAmount: toCents(b.fixedAmount),
		})),
		personalAllowanceFormula: profile.personalAllowanceFormula,
		personalAllowanceThreshold: toCents(
			Number(profile.personalAllowanceThreshold ?? 0)
		),
		childAllowancePerChild: toCents(
			Number(profile.childAllowancePerChild ?? 0)
		),
		overtimeAllowanceCap: toCents(Number(profile.overtimeAllowanceCap ?? 0)),
		insurancePremiumCapAmount: toCents(
			Number(profile.insurancePremiumCapAmount ?? 0)
		),
		// DB stores NIS rates as percent (e.g. "5.60"); the engine multiplies by a
		// decimal, so divide by 100. Without this NIS lands at ~560% of base.
		employeeNISRate: Number(profile.employeeNISRate) / 100,
		employerNISRate: Number(profile.employerNISRate) / 100,
		nisMaxEarnings: toCents(Number(profile.nisMaxEarnings ?? 0)),
	};
}

/**
 * Spec primitive: resolve THE published statutory profile for a country that is
 * in force on `asOf`. Throws a clear domain error when none covers the date.
 */
export async function resolveCountryPayrollProfileAsOf(opts: {
	organizationId: string;
	countryCode: string;
	asOf: Date;
}): Promise<ProfileRow> {
	const rows = await db
		.select()
		.from(countryPayrollProfile)
		.where(
			and(
				eq(countryPayrollProfile.organizationId, opts.organizationId),
				eq(countryPayrollProfile.countryCode, opts.countryCode),
				eq(countryPayrollProfile.isPublished, true)
			)
		);
	const picked = resolveAsOf(rows, opts.asOf);
	if (!picked) {
		throw new Error(
			`No published payroll profile for ${opts.countryCode} effective on ${formatIsoDate(opts.asOf)}.`
		);
	}
	return picked;
}

/**
 * Org-level resolve-by-date used when no country is known up front (ad-hoc
 * previews, projections, and the run-create pin). Resolves among ALL the org's
 * published profiles by date window — correct for the single-country reality and
 * forward-compatible (a multi-country org would add a country filter upstream).
 * Returns `null` when none covers the date so the caller decides how to degrade.
 */
export async function resolvePublishedProfileForOrgAsOf(opts: {
	organizationId: string;
	asOf: Date;
}): Promise<ProfileRow | null> {
	const rows = await db
		.select()
		.from(countryPayrollProfile)
		.where(
			and(
				eq(countryPayrollProfile.organizationId, opts.organizationId),
				eq(countryPayrollProfile.isPublished, true)
			)
		);
	return resolveAsOf(rows, opts.asOf);
}

/** Fetch a profile pinned by id, tenant-scoped. `null` if absent/foreign. */
export async function resolveProfileById(
	organizationId: string,
	profileId: string
): Promise<ProfileRow | null> {
	const [row] = await db
		.select()
		.from(countryPayrollProfile)
		.where(
			and(
				eq(countryPayrollProfile.id, profileId),
				eq(countryPayrollProfile.organizationId, organizationId)
			)
		)
		.limit(1);
	return row ?? null;
}
