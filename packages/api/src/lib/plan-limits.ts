/**
 * Subscription plan tiers + limits (ported from v1, adapted to v2 schema).
 *
 * Plan tiers:
 *   • trial      — 30-day evaluation; same limits as Starter
 *   • starter    — 50 employees, 1 entity ($125/mo or $100/mo yearly)
 *   • business   — 200 employees, 3 entities ($249/mo or $199/mo yearly)
 *   • enterprise — unlimited (custom contract)
 *
 * Plan is stored on `organization.metadata.plan` (Better Auth org metadata,
 * a JSON string). Tenants without a plan default to "trial".
 *
 * IMPORTANT (v2): this module is DISPLAY-ONLY. The v1 `assertEmployeeCapacity`
 * write-path enforcement is intentionally NOT ported — existing live tenants
 * (Netsurf, Foreign Links) have no plan set and must not be blocked.
 */

export type Plan = "trial" | "starter" | "business" | "enterprise";

export interface PlanLimits {
	employeeLimit: number;
	entityLimit: number;
	label: string;
	upgradable: boolean;
	upgradeTarget: Plan | null;
}

const UNLIMITED = Number.POSITIVE_INFINITY;

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
	trial: {
		employeeLimit: 50,
		entityLimit: 1,
		upgradable: true,
		upgradeTarget: "starter",
		label: "Trial",
	},
	starter: {
		employeeLimit: 50,
		entityLimit: 1,
		upgradable: true,
		upgradeTarget: "business",
		label: "Starter",
	},
	business: {
		employeeLimit: 200,
		entityLimit: 3,
		upgradable: true,
		upgradeTarget: "enterprise",
		label: "Business",
	},
	enterprise: {
		employeeLimit: UNLIMITED,
		entityLimit: UNLIMITED,
		upgradable: false,
		upgradeTarget: null,
		label: "Enterprise",
	},
};

/** Trial length in days. Starts at organization.createdAt. */
export const TRIAL_DAYS = 30;

/**
 * Parse a plan from the raw `organization.metadata` JSON string.
 * Falls back to "trial" when missing / invalid.
 */
export function getPlanFromMetadata(rawMetadata: string | null): Plan {
	if (!rawMetadata) {
		return "trial";
	}
	try {
		const parsed = JSON.parse(rawMetadata) as { plan?: unknown };
		if (
			parsed.plan === "trial" ||
			parsed.plan === "starter" ||
			parsed.plan === "business" ||
			parsed.plan === "enterprise"
		) {
			return parsed.plan;
		}
	} catch {
		// Fall through to default.
	}
	return "trial";
}
