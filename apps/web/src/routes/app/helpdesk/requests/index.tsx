import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ChevronLeft,
	ChevronRight,
	LifeBuoy,
	Link2,
	Search,
} from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/helpdesk.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/helpdesk/badge";
import { HelpdeskTabs } from "@/features/helpdesk/helpdesk-tabs";
import {
	approvalLabel,
	approvalTone,
	fmtDate,
	priorityLabel,
	priorityTone,
	slaLabel,
	slaTone,
	statusLabel,
	statusTone,
} from "@/features/helpdesk/labels";
import {
	type HelpdeskRequestRow,
	hasLinkedContext,
} from "@/features/helpdesk/types";
import { canViewHelpdesk } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/helpdesk/requests/")({
	component: RequestQueuePage,
});

const PAGE_SIZE = 25;

type RequestStatus =
	| "new"
	| "open"
	| "in_progress"
	| "waiting_on_employee"
	| "waiting_on_approval"
	| "resolved"
	| "closed"
	| "cancelled";
type Priority = "low" | "normal" | "high" | "urgent";

const STATUS_OPTIONS: { value: RequestStatus; label: string }[] = [
	{ value: "new", label: "New" },
	{ value: "open", label: "Open" },
	{ value: "in_progress", label: "In progress" },
	{ value: "waiting_on_employee", label: "Waiting on employee" },
	{ value: "waiting_on_approval", label: "Waiting on approval" },
	{ value: "resolved", label: "Resolved" },
	{ value: "closed", label: "Closed" },
	{ value: "cancelled", label: "Cancelled" },
];
const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
	{ value: "urgent", label: "Urgent" },
	{ value: "high", label: "High" },
	{ value: "normal", label: "Normal" },
	{ value: "low", label: "Low" },
];
const SLA_OPTIONS = [
	{ value: "overdue", label: "Overdue" },
	{ value: "breached", label: "Breached" },
	{ value: "due_soon", label: "Due soon" },
	{ value: "on_track", label: "On track" },
	{ value: "not_applicable", label: "No SLA" },
];

function QueueRow({ r }: { r: HelpdeskRequestRow }) {
	return (
		<tr>
			<td>
				<span className="hd-mono">{r.reference}</span>
			</td>
			<td>
				<Link
					className="hd-name hd-name-link"
					params={{ id: r.id }}
					to="/app/helpdesk/requests/$id"
				>
					{r.title}
				</Link>
				<div className="hd-sub">{r.categoryName ?? "Uncategorised"}</div>
			</td>
			<td>{r.requesterName ?? "—"}</td>
			<td>
				<Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
			</td>
			<td>
				<Badge tone={priorityTone(r.priority)}>
					{priorityLabel(r.priority)}
				</Badge>
			</td>
			<td>
				<Badge tone={slaTone(r.slaState)}>{slaLabel(r.slaState)}</Badge>
			</td>
			<td>{r.assigneeName ?? "Unassigned"}</td>
			<td>
				{r.approvalRequired ? (
					<Badge tone={approvalTone(r.approvalStatus)}>
						{approvalLabel(r.approvalStatus)}
					</Badge>
				) : (
					"—"
				)}
			</td>
			<td>{fmtDate(r.updatedAt)}</td>
			<td>
				{hasLinkedContext(r) ? (
					<span className="hd-linkchip">
						<Link2 size={11} /> Linked
					</span>
				) : (
					"—"
				)}
			</td>
		</tr>
	);
}

function RequestQueuePage() {
	const org = useContext(OrgCtx);
	const canView = canViewHelpdesk(org.memberRole);
	const [status, setStatus] = useState("");
	const [priority, setPriority] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [sla, setSla] = useState("");
	const [assignment, setAssignment] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);

	const categories = useQuery(
		orpc.helpdesk.categories.list.queryOptions({ input: {}, enabled: canView })
	);
	const list = useQuery(
		orpc.helpdesk.requests.list.queryOptions({
			input: {
				page,
				pageSize: PAGE_SIZE,
				status: status ? (status as RequestStatus) : undefined,
				priority: priority ? (priority as Priority) : undefined,
				categoryId: categoryId || undefined,
				search: search.trim() || undefined,
				assignedToMe: assignment === "me" || undefined,
				unassigned: assignment === "unassigned" || undefined,
			},
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Helpdesk</h1>
					</div>
				</div>
				<EmptyState
					action={{ label: "Back to helpdesk", href: "/app/helpdesk" }}
					description="The request queue is for HR, helpdesk agents, and managers. If you need help, your HR or helpdesk team can log a request for you."
					icon={<LifeBuoy size={28} />}
					title="You don't have access to the request queue"
				/>
			</div>
		);
	}

	const result = list.data as
		| { data: HelpdeskRequestRow[]; total: number; page: number }
		| undefined;
	const serverRows = result?.data ?? [];
	// SLA state is derived per-row (not a server filter), so this is a client-side
	// refinement of the current page. The pager reflects the server-filtered total.
	const rows = sla ? serverRows.filter((r) => r.slaState === sla) : serverRows;
	const total = result?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const cats = (categories.data ?? []) as { id: string; name: string }[];

	const resetPage = () => setPage(1);

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Helpdesk</span>
					</div>
					<h1 className="page-title">Requests</h1>
					<p className="page-sub">
						{total} request{total === 1 ? "" : "s"}
					</p>
				</div>
			</div>

			<HelpdeskTabs />

			<div className="hd-toolbar">
				<div className="hd-search">
					<Search size={14} />
					<input
						aria-label="Search requests by title or reference"
						onChange={(e) => {
							setSearch(e.target.value);
							resetPage();
						}}
						placeholder="Search title or reference…"
						value={search}
					/>
				</div>
				<select
					aria-label="Filter by status"
					onChange={(e) => {
						setStatus(e.target.value);
						resetPage();
					}}
					value={status}
				>
					<option value="">All statuses</option>
					{STATUS_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
				<select
					aria-label="Filter by priority"
					onChange={(e) => {
						setPriority(e.target.value);
						resetPage();
					}}
					value={priority}
				>
					<option value="">All priorities</option>
					{PRIORITY_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
				<select
					aria-label="Filter by category"
					onChange={(e) => {
						setCategoryId(e.target.value);
						resetPage();
					}}
					value={categoryId}
				>
					<option value="">All categories</option>
					{cats.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
				<select
					aria-label="Filter by SLA state"
					onChange={(e) => setSla(e.target.value)}
					value={sla}
				>
					<option value="">All SLA states</option>
					{SLA_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
				<select
					aria-label="Filter by assignment"
					onChange={(e) => {
						setAssignment(e.target.value);
						resetPage();
					}}
					value={assignment}
				>
					<option value="">All assignments</option>
					<option value="me">Assigned to me</option>
					<option value="unassigned">Unassigned</option>
				</select>
			</div>

			{list.isLoading ? <div className="hd-skeleton" /> : null}
			{list.isError ? (
				<EmptyState
					compact
					description="Could not load the request queue. Try again."
					title="Something went wrong"
				/>
			) : null}
			{!(list.isLoading || list.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="No requests match these filters."
					title="No requests yet"
				/>
			) : null}

			{rows.length > 0 ? (
				<table className="hd-table">
					<thead>
						<tr>
							<th>Reference</th>
							<th>Request</th>
							<th>Requester</th>
							<th>Status</th>
							<th>Priority</th>
							<th>SLA</th>
							<th>Assigned to</th>
							<th>Approval</th>
							<th>Updated</th>
							<th>Linked</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<QueueRow key={r.id} r={r} />
						))}
					</tbody>
				</table>
			) : null}

			{totalPages > 1 ? (
				<div className="hd-pager">
					<button
						className="btn btn-sm"
						disabled={page <= 1}
						onClick={() => setPage((p) => Math.max(1, p - 1))}
						type="button"
					>
						<ChevronLeft size={14} /> Prev
					</button>
					<span>
						Page {page} of {totalPages}
					</span>
					<button
						className="btn btn-sm"
						disabled={page >= totalPages}
						onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
						type="button"
					>
						Next <ChevronRight size={14} />
					</button>
				</div>
			) : null}
		</div>
	);
}
