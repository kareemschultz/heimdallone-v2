// Plain-language labels for the Leave Policy Engine UI (Phase 7I-D). No raw enum
// strings or IDs surface as primary text. Tones map to the shared badge classes.

export type BadgeTone = "success" | "warning" | "neutral" | "danger" | "info";

const VERIFICATION_LABEL: Record<string, string> = {
	verified: "Verified",
	needs_review: "Needs official review",
	draft: "Draft",
	deprecated: "Deprecated",
};
const VERIFICATION_TONE: Record<string, BadgeTone> = {
	verified: "success",
	needs_review: "warning",
	draft: "neutral",
	deprecated: "danger",
};

export function verificationLabel(status: string): string {
	return VERIFICATION_LABEL[status] ?? status;
}
export function verificationTone(status: string): BadgeTone {
	return VERIFICATION_TONE[status] ?? "neutral";
}
// A rule/policy is "cautioned" (must show the verify-before-production notice)
// whenever it is not fully verified.
export function isCautioned(status: string): boolean {
	return status !== "verified";
}

const CATEGORY_LABEL: Record<string, string> = {
	annual: "Annual leave",
	sick: "Sick leave",
	maternity: "Maternity leave",
	paternity: "Paternity leave",
	compassionate: "Compassionate / bereavement",
	study: "Study leave",
	unpaid: "Unpaid leave",
	special: "Special leave",
	custom: "Custom",
};
export function categoryLabel(category: string): string {
	return CATEGORY_LABEL[category] ?? category;
}

const ACCRUAL_LABEL: Record<string, string> = {
	upfront: "Granted upfront",
	monthly: "Accrues monthly",
	yearly: "Accrues yearly",
	per_days_worked: "Per days worked",
	manual: "Manual / case-by-case",
};
export function accrualLabel(method: string): string {
	return ACCRUAL_LABEL[method] ?? method;
}

const PAYROLL_TREATMENT_LABEL: Record<string, string> = {
	paid_preserve: "Paid — pay preserved",
	unpaid_deduct: "Unpaid — reduces pay",
	nis_funded: "NIS-funded benefit",
	partial: "Partially paid",
};
export function payrollTreatmentLabel(treatment: string | null): string {
	if (!treatment) {
		return "—";
	}
	return PAYROLL_TREATMENT_LABEL[treatment] ?? treatment;
}

const POLICY_STATUS_LABEL: Record<string, string> = {
	draft: "Draft",
	active: "Active",
	archived: "Archived",
};
const POLICY_STATUS_TONE: Record<string, BadgeTone> = {
	draft: "neutral",
	active: "success",
	archived: "info",
};
export function policyStatusLabel(status: string): string {
	return POLICY_STATUS_LABEL[status] ?? status;
}
export function policyStatusTone(status: string): BadgeTone {
	return POLICY_STATUS_TONE[status] ?? "neutral";
}

const OVERRIDE_MODE_LABEL: Record<string, string> = {
	statutory_only: "Statutory baseline only",
	statutory_plus_company: "Statutory + company enhancements",
	custom: "Custom company policy",
};
export function overrideModeLabel(mode: string): string {
	return OVERRIDE_MODE_LABEL[mode] ?? mode;
}

export function entitlementSummary(
	amount: string | null,
	unit: string
): string {
	if (amount === null || amount === undefined) {
		return "Not specified";
	}
	const n = Number(amount);
	const rounded = Number.isInteger(n) ? String(n) : n.toFixed(2);
	return `${rounded} ${unit}`;
}

// Shown beside any non-verified statutory value. Kept identical everywhere so the
// caution wording is consistent and unmissable.
export const VERIFY_NOTICE =
	"Verify with official guidance or a legal advisor before production use. Statutory values here are not legal advice.";
