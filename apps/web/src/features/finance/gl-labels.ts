// General Ledger display labels + tones (Phase Finance-depth / GL UI).
// GL money amounts arrive from the gl router as STRING decimals (e.g. "1234.56")
// — never cents. glMoney() renders them with 2 decimals (accounting precision).

import type { BadgeTone } from "./labels";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
	asset: "Asset",
	liability: "Liability",
	equity: "Equity",
	income: "Income",
	expense: "Expense",
};

export function accountTypeLabel(type: string): string {
	return ACCOUNT_TYPE_LABELS[type] ?? type;
}

export function accountTypeTone(type: string): BadgeTone {
	switch (type) {
		case "asset":
			return "info";
		case "income":
			return "success";
		case "expense":
			return "danger";
		case "liability":
			return "warning";
		default:
			return "neutral";
	}
}

const JOURNAL_STATUS_LABELS: Record<string, string> = {
	draft: "Draft",
	posted: "Posted",
	reversed: "Reversed",
};

export function journalStatusLabel(status: string): string {
	return JOURNAL_STATUS_LABELS[status] ?? status;
}

export function journalStatusTone(status: string): BadgeTone {
	switch (status) {
		case "posted":
			return "success";
		case "reversed":
			return "warning";
		default:
			return "neutral";
	}
}

const JOURNAL_SOURCE_LABELS: Record<string, string> = {
	payroll: "Payroll",
	manual: "Manual",
	opening_balance: "Opening balance",
	adjustment: "Adjustment",
};

export function journalSourceLabel(source: string): string {
	return JOURNAL_SOURCE_LABELS[source] ?? source;
}

// GL amounts are string decimals — display with 2 decimal places.
export function glMoney(
	amount: string | number | null | undefined,
	currency = "GYD"
): string {
	if (amount == null) {
		return "—";
	}
	const n = typeof amount === "number" ? amount : Number(amount);
	if (!Number.isFinite(n)) {
		return "—";
	}
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(n);
	} catch {
		return `${currency} ${n.toFixed(2)}`;
	}
}
