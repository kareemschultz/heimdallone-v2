export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const LEAD_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
	new: { label: "New", tone: "info" },
	contacted: { label: "Contacted", tone: "info" },
	qualified: { label: "Qualified", tone: "success" },
	unqualified: { label: "Unqualified", tone: "neutral" },
	converted: { label: "Converted", tone: "success" },
};
export const leadStatusLabel = (s: string) => LEAD_STATUS[s]?.label ?? s;
export const leadStatusTone = (s: string): BadgeTone =>
	LEAD_STATUS[s]?.tone ?? "neutral";

const DEAL_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
	open: { label: "Open", tone: "info" },
	won: { label: "Won", tone: "success" },
	lost: { label: "Lost", tone: "danger" },
};
export const dealStatusLabel = (s: string) => DEAL_STATUS[s]?.label ?? s;
export const dealStatusTone = (s: string): BadgeTone =>
	DEAL_STATUS[s]?.tone ?? "neutral";

const CUSTOMER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
	prospect: { label: "Prospect", tone: "info" },
	active: { label: "Active", tone: "success" },
	inactive: { label: "Inactive", tone: "neutral" },
};
export const customerStatusLabel = (s: string) =>
	CUSTOMER_STATUS[s]?.label ?? s;
export const customerStatusTone = (s: string): BadgeTone =>
	CUSTOMER_STATUS[s]?.tone ?? "neutral";

const ACTIVITY_TYPE: Record<string, string> = {
	call: "Call",
	meeting: "Meeting",
	email: "Email",
	task: "Task",
	follow_up: "Follow-up",
};
export const activityTypeLabel = (t: string) => ACTIVITY_TYPE[t] ?? t;

const SOURCE: Record<string, string> = {
	web_form: "Web form",
	referral: "Referral",
	campaign: "Campaign",
	manual: "Manual",
	import: "Import",
	event: "Event",
	other: "Other",
};
export const sourceLabel = (s: string | null) => (s ? (SOURCE[s] ?? s) : "—");

const HANDOFF: Record<string, string> = {
	intended: "Intended",
	linked: "Linked to project",
	delivered: "Delivered",
	cancelled: "Cancelled",
};
export const handoffStatusLabel = (s: string) => HANDOFF[s] ?? s;

export function formatMoney(amount: number | null, currency: string): string {
	if (amount == null) {
		return "—";
	}
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
