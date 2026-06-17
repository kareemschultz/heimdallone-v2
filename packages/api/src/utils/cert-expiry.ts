/**
 * Certification expiry — DERIVED at read time, never stored (Phase Dev).
 *
 * v1 stored an "expiring" flag updated by a scan that drifts from reality. v2
 * derives the state from `expiryDate` vs `now` + the resolved reminder threshold
 * list (per-type override, else the tenant default), exactly like Helpdesk SLA
 * state and Projects health. This is the ONE place the rule lives so the list
 * badge, the My-certs badge and the scanExpiring report can never disagree.
 *
 * Pure + db-free → unit-testable.
 */

export type CertExpiryState =
	| "no_expiry"
	| "valid"
	| "expiring_soon"
	| "expired";

export const DEFAULT_CERT_REMINDER_THRESHOLDS = [90, 60, 30, 7] as const;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface CertExpiry {
	/** Whole days until expiry (negative if expired); null when non-expiring. */
	daysUntilExpiry: number | null;
	state: CertExpiryState;
	/**
	 * The smallest configured threshold the cert currently falls within
	 * (e.g. 7 / 30 / 60 / 90), or null if it isn't inside any threshold.
	 */
	thresholdBucket: number | null;
}

/**
 * Resolve the effective reminder threshold list (sorted ascending, positive,
 * de-duplicated). Falls back to the tenant default, then the factory default.
 */
export function resolveReminderThresholds(
	typeThresholds: number[] | null | undefined,
	tenantThresholds: number[] | null | undefined
): number[] {
	const source =
		(typeThresholds && typeThresholds.length > 0 && typeThresholds) ||
		(tenantThresholds && tenantThresholds.length > 0 && tenantThresholds) ||
		DEFAULT_CERT_REMINDER_THRESHOLDS;
	const cleaned = [
		...new Set(source.filter((n) => Number.isFinite(n) && n > 0)),
	].sort((a, b) => a - b);
	return cleaned.length > 0 ? cleaned : [...DEFAULT_CERT_REMINDER_THRESHOLDS];
}

/** Whole days between now and a future date (negative if the date is past). */
function diffDays(expiry: Date, now: Date): number {
	const startOfDay = (d: Date) =>
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	return Math.round((startOfDay(expiry) - startOfDay(now)) / MS_PER_DAY);
}

/**
 * Derive the expiry state for a held credential.
 *
 * - `no_expiry`  — expiryDate is null (non-expiring credential).
 * - `expired`    — expiryDate is in the past (daysUntilExpiry < 0).
 * - `expiring_soon` — within the LARGEST configured threshold.
 * - `valid`      — otherwise.
 *
 * `thresholdBucket` is the smallest threshold the cert currently sits within, so
 * the UI can badge "≤7 days" vs "≤90 days" and the scan can group by bucket.
 */
export function deriveCertExpiry(
	expiryDate: Date | null | undefined,
	now: Date,
	thresholds: number[]
): CertExpiry {
	if (!expiryDate) {
		return { state: "no_expiry", daysUntilExpiry: null, thresholdBucket: null };
	}
	const daysUntilExpiry = diffDays(expiryDate, now);
	if (daysUntilExpiry < 0) {
		return { state: "expired", daysUntilExpiry, thresholdBucket: null };
	}
	const sorted = [...thresholds].sort((a, b) => a - b);
	const bucket = sorted.find((t) => daysUntilExpiry <= t) ?? null;
	const largest = sorted.at(-1) ?? 0;
	const state: CertExpiryState =
		daysUntilExpiry <= largest ? "expiring_soon" : "valid";
	return { state, daysUntilExpiry, thresholdBucket: bucket };
}
