const NUMBER_FMT = new Intl.NumberFormat("en-US");

export function formatNumber(value: number): string {
	return NUMBER_FMT.format(value);
}

export function formatMoney(value: number, currency: string): string {
	const formatted = new Intl.NumberFormat("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
	return `${currency} ${formatted}`;
}

/** Compact money for tile headlines, e.g. GYD 24.6M. */
export function formatMoneyCompact(value: number, currency: string): string {
	const compact = new Intl.NumberFormat("en-US", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
	return `${currency} ${compact}`;
}
