import type { Confidence, ConfidenceLabel, PayrollInput } from "./types";

// Single source of truth for projection/preview confidence (Phase 11G CP3).
// Pure: derives from the assembled PayrollInput + the blocker count produced by
// the calculation. Both calculatePayroll() and calculateProjectedPay() use this
// so the two surfaces can never disagree.
//
// Levels (internal 4-value enum, mapped to 3 plain-language labels):
//   high           → "High confidence"     — approved/validated, no open issues
//   medium / low   → "Needs review"        — warnings / pending review items
//   cannot_estimate→ "Cannot finalize yet" — blockers / unresolved critical data
export const deriveConfidence = (
	input: PayrollInput,
	blockerCount: number
): Confidence => {
	if (blockerCount > 0) {
		return "cannot_estimate";
	}

	const exceptionWarnings = input.attendance.openExceptionWarnings ?? 0;
	const unprocessedPunches = input.attendance.unprocessedPunches ?? 0;
	const reviewItems =
		exceptionWarnings +
		unprocessedPunches +
		input.attendance.pendingItems +
		input.leave.pendingLeaveDays;

	// Open attendance exceptions / unprocessed punches / pending validation or
	// leave all mean the estimate could still move — never silently "high".
	if (reviewItems > 0) {
		return "low";
	}
	if (!input.attendance.isComplete) {
		return "medium";
	}
	return "high";
};

export const confidenceLabel = (confidence: Confidence): ConfidenceLabel => {
	if (confidence === "high") {
		return "High confidence";
	}
	if (confidence === "cannot_estimate") {
		return "Cannot finalize yet";
	}
	return "Needs review";
};

// Plain-language reasons that explain the confidence level to a non-technical
// reader. Derived from structured signals (not raw enum codes) so the copy is
// always human-readable. Empty result is replaced by a positive default by the
// caller when confidence is high.
export const buildConfidenceReasons = (
	input: PayrollInput,
	blockerCount: number
): string[] => {
	const reasons: string[] = [];
	const a = input.attendance;
	const exceptionBlockers = a.openExceptionBlockers ?? 0;
	const exceptionWarnings = a.openExceptionWarnings ?? 0;
	const unprocessedPunches = a.unprocessedPunches ?? 0;

	if (blockerCount > 0) {
		if (exceptionBlockers > 0) {
			reasons.push(
				`${exceptionBlockers} unresolved attendance exception(s) must be cleared`
			);
		}
		reasons.push("Payroll cannot be finalized until blockers are resolved");
	}
	if (unprocessedPunches > 0) {
		reasons.push(
			`${unprocessedPunches} device punch(es) not yet processed into attendance`
		);
	}
	if (exceptionWarnings > 0) {
		reasons.push(`${exceptionWarnings} attendance exception(s) need review`);
	}
	if (a.pendingItems > 0) {
		reasons.push(`${a.pendingItems} attendance day(s) not yet validated`);
	}
	if (input.leave.pendingLeaveDays > 0) {
		reasons.push(
			`${input.leave.pendingLeaveDays} leave day(s) pending approval`
		);
	}
	if (reasons.length === 0 && !a.isComplete) {
		reasons.push("No attendance records found for this period yet");
	}

	return reasons;
};
