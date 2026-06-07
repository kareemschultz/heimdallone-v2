import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/crm.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/crm/badge";
import { CrmTabs } from "@/features/crm/crm-tabs";
import {
	dealStatusLabel,
	dealStatusTone,
	formatMoney,
} from "@/features/crm/labels";
import type { DealRow, NoteRow } from "@/features/crm/types";
import { canManageCrm, canReadPrivateCrmNotes, canViewCrm } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/crm/deals/$id")({
	component: CrmDealDetailPage,
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: many flat, independently-gated detail sections (summary + notes + add-note + private toggle) — splitting would scatter the page state.
function CrmDealDetailPage() {
	const { id } = Route.useParams();
	const org = useContext(OrgCtx);
	const canView = canViewCrm(org.memberRole);
	const canManage = canManageCrm(org.memberRole);
	const canPrivate = canReadPrivateCrmNotes(org.memberRole);
	const qc = useQueryClient();
	const [noteBody, setNoteBody] = useState("");
	const [notePrivate, setNotePrivate] = useState(false);

	const deal = useQuery(
		orpc.crm.deals.getById.queryOptions({ input: { id }, enabled: canView })
	);
	const notes = useQuery(
		orpc.crm.notes.list.queryOptions({
			input: { relatedType: "deal", relatedId: id },
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">CRM</h1>
				</div>
				<EmptyState
					description="No access."
					title="You don't have access to CRM"
				/>
			</div>
		);
	}
	if (deal.isError) {
		return (
			<div className="page">
				<CrmTabs />
				<EmptyState
					compact
					description="This deal is unavailable."
					title="Deal unavailable"
				/>
			</div>
		);
	}

	const d = deal.data as DealRow | undefined;
	const noteRows = (notes.data as NoteRow[] | undefined) ?? [];

	async function addNote() {
		if (!noteBody.trim()) {
			return;
		}
		try {
			await client.crm.notes.create({
				relatedType: "deal",
				relatedId: id,
				body: noteBody.trim(),
				visibility: notePrivate ? "private" : "team",
			});
			setNoteBody("");
			setNotePrivate(false);
			toast.success("Note added.");
			qc.invalidateQueries({
				predicate: (q) => String(q.queryKey[0] ?? "").includes("crm"),
			});
		} catch (e) {
			toast.error((e as { message?: string }).message ?? "Could not add note.");
		}
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Deals</span>
					</div>
					<h1 className="page-title">{d?.title ?? "Deal"}</h1>
				</div>
			</div>

			<CrmTabs />

			{deal.isLoading || !d ? (
				<div className="crm-skeleton" />
			) : (
				<>
					<div className="crm-cell-badges" style={{ marginBottom: 12 }}>
						<Badge tone={dealStatusTone(d.status)}>
							{dealStatusLabel(d.status)}
						</Badge>
						{d.isStalled ? (
							<span className="crm-badge tone-warning">Stalled</span>
						) : null}
					</div>
					<div className="crm-detail-grid">
						<div className="crm-field">
							<span className="crm-field-lbl">Customer</span>
							<span className="crm-field-val">{d.customerName ?? "—"}</span>
						</div>
						<div className="crm-field">
							<span className="crm-field-lbl">Stage</span>
							<span className="crm-field-val">{d.stageName ?? "—"}</span>
						</div>
						<div className="crm-field">
							<span className="crm-field-lbl">Value</span>
							<span className="crm-field-val">
								{formatMoney(d.value, d.currency)}
							</span>
						</div>
						<div className="crm-field">
							<span className="crm-field-lbl">Owner</span>
							<span className="crm-field-val">
								{d.ownerName ?? "Unassigned"}
							</span>
						</div>
						{d.status === "lost" && d.lostReason ? (
							<div className="crm-field">
								<span className="crm-field-lbl">Lost reason</span>
								<span className="crm-field-val">{d.lostReason}</span>
							</div>
						) : null}
					</div>

					<div className="crm-section">
						<div className="crm-section-title">Notes</div>
						{canManage ? (
							<div className="crm-form-field">
								<textarea
									aria-label="Add a note"
									onChange={(e) => setNoteBody(e.target.value)}
									placeholder="Add a note…"
									rows={2}
									value={noteBody}
								/>
								<div className="crm-cell-badges">
									{canPrivate ? (
										<label className="crm-sub">
											<input
												checked={notePrivate}
												onChange={(e) => setNotePrivate(e.target.checked)}
												type="checkbox"
											/>{" "}
											Private (sales team only)
										</label>
									) : null}
									<button className="crm-btn" onClick={addNote} type="button">
										Add note
									</button>
								</div>
							</div>
						) : null}
						{noteRows.length === 0 ? (
							<p className="crm-sub">No notes yet.</p>
						) : (
							noteRows.map((n) => (
								<div
									className={`crm-attention-row ${n.visibility === "private" ? "crm-note-private" : ""}`}
									key={n.id}
								>
									{n.visibility === "private" ? (
										<span className="crm-badge tone-warning">Private</span>
									) : null}
									<span>{n.body}</span>
								</div>
							))
						)}
					</div>
				</>
			)}
		</div>
	);
}
