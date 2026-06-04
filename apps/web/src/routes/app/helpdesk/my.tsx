import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LifeBuoy, Link2, Plus, X } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/helpdesk.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/helpdesk/badge";
import { HelpdeskTabs } from "@/features/helpdesk/helpdesk-tabs";
import {
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
import { canCreateHelpdeskRequest, canViewHelpdesk } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/helpdesk/my")({
	component: MyRequestsPage,
});

// Employees rarely accumulate many requests; one bounded fetch + client-side
// filtering keeps the page to a single query (the server already scopes the list
// to the caller's own requests — see helpdesk.requests.list).
const FETCH_SIZE = 100;

type Priority = "low" | "normal" | "high" | "urgent";

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
	{ value: "low", label: "Low — whenever you can" },
	{ value: "normal", label: "Normal" },
	{ value: "high", label: "High — soon please" },
	{ value: "urgent", label: "Urgent — blocking my work" },
];

// Plain-language buckets over the raw status enum. "Closed" intentionally folds in
// cancelled so a withdrawn request is still findable here.
const FILTERS: { key: string; label: string; match: (s: string) => boolean }[] =
	[
		{
			key: "open",
			label: "Open",
			match: (s) => s === "new" || s === "open" || s === "in_progress",
		},
		{
			key: "waiting_on_me",
			label: "Waiting on me",
			match: (s) => s === "waiting_on_employee",
		},
		{
			key: "waiting_on_approval",
			label: "Waiting on approval",
			match: (s) => s === "waiting_on_approval",
		},
		{
			key: "closed",
			label: "Resolved / closed",
			match: (s) => s === "resolved" || s === "closed" || s === "cancelled",
		},
		{ key: "all", label: "All", match: () => true },
	];

function RequestHelpDialog({
	onClose,
	onCreated,
}: {
	onClose: () => void;
	onCreated: (id: string) => void;
}) {
	const [categoryId, setCategoryId] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<Priority>("normal");

	const categories = useQuery(
		orpc.helpdesk.categories.list.queryOptions({ input: {} })
	);
	const cats = (categories.data ?? []) as { id: string; name: string }[];

	const create = useMutation({
		mutationFn: () =>
			client.helpdesk.requests.createSelf({
				categoryId: categoryId || undefined,
				title: title.trim(),
				description: description.trim() || undefined,
				priority,
			}),
		onSuccess: (res: { id: string }) => {
			toast.success("Request sent — we'll route it to the right team.");
			onCreated(res.id);
		},
		onError: (e: { message?: string }) =>
			toast.error(
				e?.message ?? "Could not send your request. Please try again."
			),
	});

	const canSubmit = title.trim().length > 0 && !create.isPending;

	return (
		<div className="hd-sheet-overlay">
			<div aria-modal="true" className="hd-sheet" role="dialog">
				<div className="hd-sheet-head">
					<h2>Request help</h2>
					<button
						aria-label="Close"
						className="btn-icon"
						onClick={onClose}
						type="button"
					>
						<X size={16} />
					</button>
				</div>
				<div className="hd-sheet-body">
					<label className="hd-field" htmlFor="req-category">
						<span>What do you need help with?</span>
						<select
							id="req-category"
							onChange={(e) => setCategoryId(e.target.value)}
							value={categoryId}
						>
							<option value="">Not sure — pick the closest</option>
							{cats.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
						</select>
					</label>
					<label className="hd-field" htmlFor="req-title">
						<span>Summary</span>
						<input
							id="req-title"
							maxLength={200}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="e.g. I can't see my latest payslip"
							value={title}
						/>
					</label>
					<label className="hd-field" htmlFor="req-desc">
						<span>Tell us what happened</span>
						<textarea
							id="req-desc"
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Add any details that would help us help you — dates, names, what you expected."
							rows={4}
							value={description}
						/>
					</label>
					<label className="hd-field" htmlFor="req-priority">
						<span>How urgent is this?</span>
						<select
							id="req-priority"
							onChange={(e) => setPriority(e.target.value as Priority)}
							value={priority}
						>
							{PRIORITY_OPTIONS.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
					</label>
				</div>
				<div className="hd-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!canSubmit}
						onClick={() => create.mutate()}
						type="button"
					>
						Send request
					</button>
				</div>
			</div>
		</div>
	);
}

function MyRequestCard({ r }: { r: HelpdeskRequestRow }) {
	return (
		<Link
			className="hd-card"
			params={{ id: r.id }}
			to="/app/helpdesk/requests/$id"
		>
			<div className="hd-card-top">
				<span className="hd-card-title">{r.title}</span>
				<span className="hd-mono">{r.reference}</span>
			</div>
			<div className="hd-card-badges">
				<Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
				<Badge tone={priorityTone(r.priority)}>
					{priorityLabel(r.priority)}
				</Badge>
				{r.slaState === "not_applicable" ? null : (
					<Badge tone={slaTone(r.slaState)}>{slaLabel(r.slaState)}</Badge>
				)}
				{hasLinkedContext(r) ? (
					<span className="hd-linkchip">
						<Link2 size={11} /> Linked
					</span>
				) : null}
			</div>
			<div className="hd-card-meta">
				<span>{r.categoryName ?? "General"}</span>
				<span>·</span>
				<span>Updated {fmtDate(r.updatedAt)}</span>
			</div>
		</Link>
	);
}

function MyRequestsPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const navigate = useNavigate();
	const canCreate = canCreateHelpdeskRequest(org.memberRole);
	// Anyone who can view the desk or log a request can use this page. Recruiter
	// holds no `ticket` permission at all → no access (and we skip the doomed
	// list query rather than letting it 403 into a generic error).
	const canAccess = canViewHelpdesk(org.memberRole) || canCreate;
	const [filter, setFilter] = useState("open");
	const [showDialog, setShowDialog] = useState(false);

	// `mine: true` forces the server to return only the caller's OWN requests,
	// regardless of role — so a manager/HR/agent viewing this tab sees their own
	// requests here, never the team queue.
	const list = useQuery(
		orpc.helpdesk.requests.list.queryOptions({
			input: { mine: true, page: 1, pageSize: FETCH_SIZE },
			enabled: canAccess,
			retry: false,
		})
	);

	const result = list.data as
		| { data: HelpdeskRequestRow[]; total: number }
		| undefined;
	const allRows = result?.data ?? [];
	const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
	const rows = allRows.filter((r) => activeFilter.match(r.status));

	const invalidate = () =>
		qc.invalidateQueries({
			predicate: (q) => String(q.queryKey[0] ?? "").includes("helpdesk"),
		});

	const onCreated = (id: string) => {
		setShowDialog(false);
		invalidate();
		navigate({ to: "/app/helpdesk/requests/$id", params: { id } });
	};

	if (!canAccess) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Helpdesk</h1>
					</div>
				</div>
				<EmptyState
					description="The helpdesk isn't part of your workspace. If you need help, your HR or helpdesk team can assist you directly."
					icon={<LifeBuoy size={28} />}
					title="You don't have access to the helpdesk"
				/>
			</div>
		);
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>My requests</span>
					</div>
					<h1 className="page-title">My requests</h1>
					<p className="page-sub">
						Ask HR, payroll, IT, facilities, or admin for help and track the
						response here.
					</p>
				</div>
				{canCreate ? (
					<button
						className="btn btn-primary"
						onClick={() => setShowDialog(true)}
						type="button"
					>
						<Plus size={13} />
						Request help
					</button>
				) : null}
			</div>

			<HelpdeskTabs />

			<div className="hd-filter-pills">
				{FILTERS.map((f) => (
					<button
						className={`hd-pill ${filter === f.key ? "active" : ""}`}
						key={f.key}
						onClick={() => setFilter(f.key)}
						type="button"
					>
						{f.label}
					</button>
				))}
			</div>

			{list.isLoading ? <div className="hd-skeleton" /> : null}
			{list.isError ? (
				<EmptyState
					compact
					description="We couldn't load your requests. Please try again."
					title="Something went wrong"
				/>
			) : null}

			{!(list.isLoading || list.isError) && allRows.length === 0 ? (
				<EmptyState
					action={
						canCreate
							? { label: "Request help", onClick: () => setShowDialog(true) }
							: undefined
					}
					description="When you ask HR, IT, payroll, or facilities for help, your requests show up here so you can follow along."
					icon={<LifeBuoy size={28} />}
					title="You haven't made any requests yet"
				/>
			) : null}

			{!(list.isLoading || list.isError) &&
			allRows.length > 0 &&
			rows.length === 0 ? (
				<EmptyState
					compact
					description="Nothing in this view. Try another filter."
					title="No requests here"
				/>
			) : null}

			{rows.length > 0 ? (
				<div className="hd-cards">
					{rows.map((r) => (
						<MyRequestCard key={r.id} r={r} />
					))}
				</div>
			) : null}

			{showDialog ? (
				<RequestHelpDialog
					onClose={() => setShowDialog(false)}
					onCreated={onCreated}
				/>
			) : null}
		</div>
	);
}
