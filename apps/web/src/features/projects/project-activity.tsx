import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/empty-state";
import { orpc } from "@/utils/orpc";

interface AuditRow {
	action: string;
	actorName: string | null;
	createdAt: string | Date | null;
	entityType: string;
	id: string;
	metadata: Record<string, unknown> | null;
}

function fmtWhen(value: string | Date | null): string {
	if (!value) {
		return "";
	}
	const d = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(d.getTime())) {
		return "";
	}
	return d.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

interface Ctx {
	action: string;
	internal: boolean;
	status: string;
	transition: string;
}

const humanizeStatus = (s: string) => s.replace(/_/g, " ");

function describeProject(c: Ctx): string {
	if (c.action === "create") {
		return "Project created";
	}
	if (c.action === "archive") {
		return "Project archived";
	}
	if (c.transition === "unarchive") {
		return "Project unarchived";
	}
	if (c.status) {
		return `Project status changed to ${humanizeStatus(c.status)}`;
	}
	return "Project updated";
}

const TASK_TRANSITIONS: Record<string, string> = {
	assign: "Task assigned",
	unassign: "Task unassigned",
	complete: "Task completed",
};
function describeTask(c: Ctx): string {
	if (c.action === "create") {
		return "Task created";
	}
	if (TASK_TRANSITIONS[c.transition]) {
		return TASK_TRANSITIONS[c.transition];
	}
	if (c.status) {
		return `Task moved to ${humanizeStatus(c.status)}`;
	}
	return "Task updated";
}

const TIME_TRANSITIONS: Record<string, string> = {
	submit: "Time submitted for approval",
	approve: "Time approved",
	reject: "Time rejected",
};
function describeTime(c: Ctx): string {
	if (c.action === "create") {
		return "Time logged";
	}
	return TIME_TRANSITIONS[c.transition] ?? "Time updated";
}

// Human, plain-language label for an audit event — no raw entity types or enum
// strings. Derived from entityType + action + the metadata we stamp on write.
function describe(e: AuditRow): string {
	const meta = e.metadata ?? {};
	const c: Ctx = {
		action: e.action,
		transition: typeof meta.transition === "string" ? meta.transition : "",
		status: typeof meta.status === "string" ? meta.status : "",
		internal: Boolean(meta.internal),
	};
	switch (e.entityType) {
		case "project":
			return describeProject(c);
		case "project_task":
			return describeTask(c);
		case "project_milestone":
			if (c.action === "create") {
				return "Milestone added";
			}
			return c.transition === "complete"
				? "Milestone completed"
				: "Milestone updated";
		case "project_member":
			return c.action === "delete" ? "Member removed" : "Member added";
		case "project_task_comment":
			return c.internal ? "Internal note added" : "Comment added";
		case "project_time_entry":
			return describeTime(c);
		default:
			return "Activity";
	}
}

export function ProjectActivity({ projectId }: { projectId: string }) {
	const activity = useQuery(
		orpc.projects.activity.list.queryOptions({
			input: { projectId, limit: 100 },
		})
	);
	const rows = (activity.data as AuditRow[] | undefined) ?? [];

	return (
		<div className="pj-panel">
			<div className="pj-panel-head">
				<span className="pj-section-title">Activity</span>
			</div>

			{activity.isLoading ? <div className="pj-skeleton" /> : null}
			{!activity.isLoading && rows.length === 0 ? (
				<EmptyState
					compact
					description="Activity will appear here as work happens on this project."
					title="No activity yet"
				/>
			) : null}

			{rows.length > 0 ? (
				<div className="pj-activity">
					{rows.map((e) => (
						<div className="pj-activity-item" key={e.id}>
							<div className="pj-activity-dot" />
							<div className="pj-activity-body">
								<span className="pj-activity-text">{describe(e)}</span>
								<span className="pj-activity-meta">
									{e.actorName ?? "Someone"} · {fmtWhen(e.createdAt)}
								</span>
							</div>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
