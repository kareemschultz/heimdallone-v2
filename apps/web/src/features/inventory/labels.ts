// Inventory display labels + tone maps (Phase INV-D). Enum→human strings so the
// UI never shows a raw enum, plus money/quantity formatters. Mirrors the finance
// labels.ts shape.

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

// ── Movement status ──
const MOVEMENT_STATUS_LABELS: Record<string, string> = {
	draft: "Draft",
	pending: "Pending approval",
	approved: "Approved",
	rejected: "Rejected",
	cancelled: "Cancelled",
};

export function movementStatusLabel(status: string): string {
	return MOVEMENT_STATUS_LABELS[status] ?? status;
}

export function movementStatusTone(status: string): BadgeTone {
	switch (status) {
		case "approved":
			return "success";
		case "pending":
			return "warning";
		case "rejected":
			return "danger";
		default:
			return "neutral";
	}
}

// ── Movement type ──
const MOVEMENT_TYPE_LABELS: Record<string, string> = {
	in: "Stock in",
	out: "Stock out",
	transfer: "Transfer",
	adjustment: "Adjustment",
	count_adjustment: "Count adjustment",
	reserve: "Reserve",
	release: "Release",
	damaged: "Damaged",
	returned: "Returned",
	issued: "Issued",
	sold: "Sold",
};

export function movementTypeLabel(type: string): string {
	return MOVEMENT_TYPE_LABELS[type] ?? type;
}

/** Whether a movement adds to (in), removes from (out), or moves (transfer)
 *  on-hand stock — drives the +/- direction glyph in the ledger. */
export function movementDirection(type: string): "in" | "out" | "move" {
	if (type === "transfer") {
		return "move";
	}
	if (
		type === "in" ||
		type === "returned" ||
		type === "reserve" ||
		type === "adjustment" ||
		type === "count_adjustment"
	) {
		return "in";
	}
	return "out";
}

// ── Location kind ──
const LOCATION_KIND_LABELS: Record<string, string> = {
	office: "Office",
	bond: "Customs bond",
};

export function locationKindLabel(kind: string): string {
	return LOCATION_KIND_LABELS[kind] ?? kind;
}

// ── Formatters ──
export function formatMoneyCents(
	cents: number | null | undefined,
	currency = "GYD"
): string {
	if (cents == null) {
		return "—";
	}
	const amount = cents / 100;
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(amount);
	} catch {
		return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
	}
}

export function formatQty(qty: number): string {
	return qty.toLocaleString("en-US");
}
