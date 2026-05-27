const SCALE = 100;

export const toCents = (value: number | string): number =>
	Math.round(Number(value) * SCALE);

export const fromCents = (cents: number): number => Math.round(cents) / SCALE;

export const addCents = (a: number, b: number): number => a + b;

export const subtractCents = (a: number, b: number): number => a - b;

export const multiplyCents = (cents: number, factor: number): number =>
	Math.round(cents * factor);

export const percentOfCents = (cents: number, rate: number): number =>
	Math.round(cents * rate);

export const minCents = (a: number, b: number): number => Math.min(a, b);

export const maxCents = (a: number, b: number): number => Math.max(a, b);

export const sumCents = (values: number[]): number => {
	let total = 0;
	for (const v of values) {
		total += v;
	}
	return total;
};

export const divideCents = (cents: number, divisor: number): number => {
	if (divisor === 0) {
		return 0;
	}
	return Math.round(cents / divisor);
};
