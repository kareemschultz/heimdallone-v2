import { Badge } from "@/features/helpdesk/badge";
import { fmtDateTime, slaLabel, slaTone } from "@/features/helpdesk/labels";

// Plain-language explanation of the derived SLA state. The state itself is
// computed server-side at read time (never stored); this only narrates it.
const SLA_MESSAGE: Record<string, string> = {
	not_applicable: "No service-level target applies to this request.",
	on_track: "On track to meet the resolution target.",
	due_soon: "Due soon — this should be resolved shortly.",
	overdue: "Overdue — the resolution target has passed. Needs attention.",
	breached: "This was resolved after its target time.",
};

/**
 * Human-readable SLA panel: the derived state badge, a one-line explanation, and
 * the first-response / resolution due times. The MVP SLA clock does NOT pause
 * while waiting on the employee — that's surfaced here as an honest note rather
 * than silently mis-stating the targets (a status-history-based pause is future
 * work; see the implementation plan).
 */
export function RequestSla({
	slaState,
	status,
	firstResponseDueAt,
	resolutionDueAt,
}: {
	firstResponseDueAt: string | Date | null;
	resolutionDueAt: string | Date | null;
	slaState: string;
	status: string;
}) {
	if (slaState === "not_applicable") {
		return null;
	}

	const isWaitingOnEmployee = status === "waiting_on_employee";

	return (
		<div className="hd-sla">
			<div className="hd-sla-head">
				<span className="hd-section-title">Service level</span>
				<Badge tone={slaTone(slaState)}>{slaLabel(slaState)}</Badge>
			</div>
			<p className="hd-sla-msg">{SLA_MESSAGE[slaState] ?? ""}</p>
			<div className="hd-sla-grid">
				<div>
					<span className="hd-k">First response due</span>
					<span>{fmtDateTime(firstResponseDueAt)}</span>
				</div>
				<div>
					<span className="hd-k">Resolution due</span>
					<span>{fmtDateTime(resolutionDueAt)}</span>
				</div>
			</div>
			{isWaitingOnEmployee ? (
				<p className="hd-sla-note">
					Waiting on the employee — follow-up is paused until they reply. (Time
					spent waiting is not yet subtracted from the targets above.)
				</p>
			) : null}
		</div>
	);
}
