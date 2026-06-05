import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ChevronLeft, Lock } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";

import "@/styles/performance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/performance/badge";
import {
	fmtDateTime,
	oneOnOneStatusLabel,
	oneOnOneStatusTone,
} from "@/features/performance/one-on-one-labels";
import type { OneOnOneDetail } from "@/features/performance/one-on-one-types";
import { canRecordOneOnOne } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/performance/one-on-ones/$id")({
	component: OneOnOneDetailPage,
});

const STATUS_OPTIONS = [
	{ value: "scheduled", label: "Scheduled" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
];

function invalidatePerformance(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("performance"),
	});
}

// The edit panel is shown to managers/HR (canRecordOneOnOne); the SERVER further
// restricts writes to the owning manager or HR. The private-notes field is only
// pre-filled when the server returned the value (canViewPrivateNotes) — an
// employee never receives it, so it can never be edited or leaked here.
function EditPanel({ meeting }: { meeting: OneOnOneDetail }) {
	const qc = useQueryClient();
	const [shared, setShared] = useState(meeting.sharedNotes ?? "");
	const [priv, setPriv] = useState(meeting.privateManagerNotes ?? "");
	const [status, setStatus] = useState(meeting.status);

	useEffect(() => {
		setShared(meeting.sharedNotes ?? "");
		setPriv(meeting.privateManagerNotes ?? "");
		setStatus(meeting.status);
	}, [meeting]);

	const save = useMutation({
		mutationFn: () =>
			client.performance.oneOnOnes.update({
				id: meeting.id,
				status: status as never,
				sharedNotes: shared.trim() || null,
				privateManagerNotes: priv.trim() || null,
			}),
		onSuccess: () => {
			toast.success("1-on-1 updated");
			invalidatePerformance(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not update the 1-on-1"),
	});

	return (
		<div className="pf-panel">
			<div className="pf-panel-head">
				<span className="pf-section-title">Edit</span>
			</div>
			<label className="pf-field" htmlFor="pf-1on1-edit-status">
				<span>Status</span>
				<select
					id="pf-1on1-edit-status"
					onChange={(e) => setStatus(e.target.value)}
					value={status}
				>
					{STATUS_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			</label>
			<label className="pf-field" htmlFor="pf-1on1-edit-shared">
				<span>Shared notes (visible to you both)</span>
				<textarea
					id="pf-1on1-edit-shared"
					onChange={(e) => setShared(e.target.value)}
					rows={3}
					value={shared}
				/>
			</label>
			<label className="pf-field" htmlFor="pf-1on1-edit-private">
				<span>Private notes (only you and HR)</span>
				<textarea
					id="pf-1on1-edit-private"
					onChange={(e) => setPriv(e.target.value)}
					rows={3}
					value={priv}
				/>
			</label>
			<div className="pf-sheet-foot">
				<button
					className="btn btn-primary"
					disabled={save.isPending}
					onClick={() => save.mutate()}
					type="button"
				>
					Save changes
				</button>
			</div>
		</div>
	);
}

function OneOnOneDetailPage() {
	const { id } = useParams({ from: "/app/performance/one-on-ones/$id" });
	const org = useContext(OrgCtx);
	const canRecord = canRecordOneOnOne(org.memberRole);

	const query = useQuery(
		orpc.performance.oneOnOnes.getById.queryOptions({ input: { id } })
	);

	const backLink = (
		<Link className="pf-back" to="/app/performance/one-on-ones">
			<ChevronLeft size={15} /> 1-on-1s
		</Link>
	);

	if (query.isLoading) {
		return (
			<div className="page">
				{backLink}
				<div className="pf-skeleton" />
			</div>
		);
	}

	if (query.isError || !query.data) {
		return (
			<div className="page">
				{backLink}
				<EmptyState
					compact
					description="This 1-on-1 could not be loaded, or you do not have access to it."
					title="1-on-1 unavailable"
				/>
			</div>
		);
	}

	const m = query.data as OneOnOneDetail;

	return (
		<div className="page">
			{backLink}
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<Link to="/app/performance/one-on-ones">1-on-1s</Link>
					</div>
					<h1 className="page-title">
						{m.managerName ?? "—"} & {m.employeeName ?? "—"}
					</h1>
					<div className="pf-detail-badges">
						<Badge tone={oneOnOneStatusTone(m.status)}>
							{oneOnOneStatusLabel(m.status)}
						</Badge>
						<span className="pf-sub">{fmtDateTime(m.scheduledAt)}</span>
					</div>
				</div>
			</div>

			<div className="pf-panel">
				<div className="pf-panel-head">
					<span className="pf-section-title">Shared notes</span>
				</div>
				<p className="pf-desc">
					{m.sharedNotes ?? "No shared notes recorded yet."}
				</p>
			</div>

			{m.canViewPrivateNotes ? (
				<div className="pf-panel">
					<div className="pf-panel-head">
						<span className="pf-section-title">
							<Lock size={14} /> Private notes
						</span>
					</div>
					<p className="pf-not-pay">
						Only you and HR can see these. They are never shown to the employee.
					</p>
					<p className="pf-desc">
						{m.privateManagerNotes ?? "No private notes recorded."}
					</p>
				</div>
			) : null}

			{canRecord ? <EditPanel meeting={m} /> : null}
		</div>
	);
}
