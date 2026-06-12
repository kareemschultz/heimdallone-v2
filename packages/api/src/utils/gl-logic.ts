/**
 * Pure General-Ledger logic — Phase 21D-E.
 *
 * Database-free double-entry rules so they can be unit-verified anywhere. The GL
 * router imports these; verify-gl-api imports them directly. The schema carries
 * NO debit/credit/balance CHECK constraints by design (house style) — these are
 * the app-layer invariants that keep the ledger sound.
 */
import { ORPCError } from "@orpc/server";

export interface JournalLineInput {
	accountId: string;
	credit: string | number;
	debit: string | number;
	description?: string | null;
	linkedPayslipId?: string | null;
}

/** Parse a money value to integer cents; reject NaN / Infinity / negatives. */
export function parseAmountToCents(value: string | number): number {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) {
		throw new ORPCError("BAD_REQUEST", { message: `Invalid amount: ${value}` });
	}
	if (n < 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Amounts must be non-negative; use the opposite column.",
		});
	}
	return Math.round(n * 100);
}

/** Cents → fixed 2dp string for numeric storage. */
export function centsToAmount(cents: number): string {
	return (cents / 100).toFixed(2);
}

export interface JournalTotals {
	creditCents: number;
	debitCents: number;
}

/**
 * Validate a set of journal lines: ≥2 lines, each line has exactly one of
 * debit/credit non-zero and non-negative, and total debits == total credits.
 * Throws ORPCError BAD_REQUEST otherwise. Returns the balanced totals in cents.
 */
export function validateJournalLines(lines: JournalLineInput[]): JournalTotals {
	if (lines.length < 2) {
		throw new ORPCError("BAD_REQUEST", {
			message: "A journal entry needs at least two lines.",
		});
	}
	let debitCents = 0;
	let creditCents = 0;
	for (const line of lines) {
		const d = parseAmountToCents(line.debit);
		const c = parseAmountToCents(line.credit);
		if (d > 0 && c > 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: "A line cannot have both a debit and a credit.",
			});
		}
		if (d === 0 && c === 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Each line must have a non-zero debit or credit.",
			});
		}
		debitCents += d;
		creditCents += c;
	}
	if (debitCents !== creditCents) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Journal does not balance: debits ${centsToAmount(
				debitCents
			)} ≠ credits ${centsToAmount(creditCents)}.`,
		});
	}
	return { debitCents, creditCents };
}

/** A posted/reversed entry is immutable — only a reversal may change the books. */
export function assertEntryMutable(status: string): void {
	if (status !== "draft") {
		throw new ORPCError("CONFLICT", {
			message: `Entry is ${status} and immutable; reverse it instead of editing.`,
		});
	}
}
