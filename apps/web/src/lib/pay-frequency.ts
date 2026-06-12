// Web access to the canonical pay-frequency metadata so UI dropdowns and labels
// stay in lockstep with the DB enum / API / payroll engine. Add a new frequency
// once in @Heimdallone/payroll-engine/pay-frequency and it appears here.
//
// Concrete re-exports (not `export … from`) keep this off the barrel-file list.

import type {
	PayFrequency as EnginePayFrequency,
	PayFrequencyMeta as EnginePayFrequencyMeta,
} from "@Heimdallone/payroll-engine/pay-frequency";
import {
	PAY_FREQUENCIES as ENGINE_FREQUENCIES,
	PAY_FREQUENCY_OPTIONS as ENGINE_OPTIONS,
	PAY_FREQUENCY_META,
} from "@Heimdallone/payroll-engine/pay-frequency";

export type PayFrequency = EnginePayFrequency;
export type PayFrequencyMeta = EnginePayFrequencyMeta;
export const PAY_FREQUENCIES = ENGINE_FREQUENCIES;
export const PAY_FREQUENCY_OPTIONS = ENGINE_OPTIONS;

/** Human label for a stored pay_frequency value (falls back to the raw value). */
export function payFrequencyLabel(value: string): string {
	return (
		(PAY_FREQUENCY_META as Record<string, { label: string }>)[value]?.label ??
		value
	);
}
