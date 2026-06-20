import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/lifecycle.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import {
	Badge,
	disciplinaryStatusTone,
	resignationStatusTone,
} from "@/features/lifecycle/badge";
import {
	DISCIPLINARY_STATUS_LABELS,
	formatDate,
	labelFor,
	RESIGNATION_REASON_LABELS,
	RESIGNATION_STATUS_LABELS,
} from "@/features/lifecycle/labels";
import { LifecycleTabs } from "@/features/lifecycle/lifecycle-tabs";
import type {
	DisciplinaryRecordRow,
	ResignationRow,
} from "@/features/lifecycle/types";
import { canRequestResignation, canViewDisciplinary } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/lifecycle/my")({
	component: MyLifecyclePage,
});

const REASONS = [
	"resignation",
	"retirement",
	"end_of_contract",
	"mutual",
	"other",
] as const;

const WITHDRAWABLE = new Set([
	"draft",
	"submitted",
	"manager_approved",
	"hr_approved",
]);

function MyLifecyclePage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const qc = useQueryClient();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const allowed = canRequestResignation(role);

	// Own disciplinary records (the disciplinary:read grant + handler self-scope
	// returns the caller's records). Own resignation via mine:true (forces
	// self-scope for any role). Hooks run unconditionally; queries are gated by
	// `enabled` so the no-access branch fires no requests (rules-of-hooks safe).
	const myCasesQuery = useQuery({
		...orpc.lifecycle.disciplinary.records.list.queryOptions({ input: {} }),
		enabled: allowed && (canViewDisciplinary(role) || role === "employee"),
	});
	const myResignationsQuery = useQuery({
		...orpc.lifecycle.resignations.list.queryOptions({ input: { mine: true } }),
		enabled: allowed,
	});

	if (!allowed) {
		return (
			<div className="page">
				<EmptyState
					description="This area is for your own disciplinary records and resignation."
					title="No access"
				/>
			</div>
		);
	}

	const cases = (myCasesQuery.data ?? []) as DisciplinaryRecordRow[];
	const resignations = (myResignationsQuery.data ?? []) as ResignationRow[];

	const withdraw = async (id: string) => {
		setBusy(true);
		try {
			await client.lifecycle.resignations.withdraw({ id });
			toast.success("Resignation withdrawn.");
			qc.invalidateQueries();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Lifecycle</span>
						<span className="sep">/</span>
						<span>My lifecycle</span>
					</div>
					<h1 className="page-title">My lifecycle</h1>
					<p className="page-sub">Your disciplinary records and resignation.</p>
				</div>
				<button
					className="lc-btn primary"
					onClick={() => setDialogOpen(true)}
					type="button"
				>
					Resign
				</button>
			</div>

			<LifecycleTabs />

			<div className="lc-section">
				<div className="lc-section-title">My disciplinary records</div>
				{myCasesQuery.isLoading && <p className="lc-muted">Loading…</p>}
				{myCasesQuery.isError && (
					<p className="lc-error">Could not load your records.</p>
				)}
				{!(myCasesQuery.isLoading || myCasesQuery.isError) &&
					cases.length === 0 && (
						<EmptyState
							compact
							description="You have no disciplinary records."
							title="Nothing here"
						/>
					)}
				{cases.length > 0 && (
					<table className="lc-table">
						<thead>
							<tr>
								<th>Reference</th>
								<th>Incident date</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{cases.map((c) => (
								<tr key={c.id}>
									<td>
										<Link
											className="lc-name-link"
											params={{ id: c.id }}
											to="/app/lifecycle/disciplinary/$id"
										>
											{c.reference}
										</Link>
									</td>
									<td>{formatDate(c.incidentDate)}</td>
									<td>
										<Badge tone={disciplinaryStatusTone(c.status)}>
											{labelFor(DISCIPLINARY_STATUS_LABELS, c.status)}
										</Badge>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			<div className="lc-section">
				<div className="lc-section-title">My resignation</div>
				{myResignationsQuery.isLoading && <p className="lc-muted">Loading…</p>}
				{myResignationsQuery.isError && (
					<p className="lc-error">Could not load your resignations.</p>
				)}
				{!(myResignationsQuery.isLoading || myResignationsQuery.isError) &&
					resignations.length === 0 && (
						<EmptyState
							compact
							description="You have not filed a resignation."
							title="Nothing here"
						/>
					)}
				{resignations.map((r) => (
					<div className="lc-attention" key={r.id}>
						<div className="lc-attention-title">
							{r.reference}{" "}
							<Badge tone={resignationStatusTone(r.status)}>
								{labelFor(RESIGNATION_STATUS_LABELS, r.status)}
							</Badge>
						</div>
						<div className="lc-attention-row">
							{labelFor(RESIGNATION_REASON_LABELS, r.reasonCategory)} · last day{" "}
							{formatDate(r.requestedLastWorkingDate)}
						</div>
						{WITHDRAWABLE.has(r.status) && (
							<div className="lc-actions">
								<button
									className="lc-btn"
									disabled={busy}
									onClick={() => withdraw(r.id)}
									type="button"
								>
									Withdraw
								</button>
							</div>
						)}
						{r.status === "handed_off" && (
							<p className="lc-muted">
								Your exit is now with Offboarding — to reverse it, contact HR.
							</p>
						)}
					</div>
				))}
			</div>

			{dialogOpen && (
				<ResignDialog
					onClose={() => setDialogOpen(false)}
					onSaved={() => {
						setDialogOpen(false);
						qc.invalidateQueries();
					}}
				/>
			)}
		</div>
	);
}

function ResignDialog({
	onClose,
	onSaved,
}: {
	onClose: () => void;
	onSaved: () => void;
}) {
	const [reasonCategory, setReasonCategory] =
		useState<(typeof REASONS)[number]>("resignation");
	const [requestedLastWorkingDate, setRequestedLastWorkingDate] = useState("");
	const [reasonNotes, setReasonNotes] = useState("");
	const [saving, setSaving] = useState(false);

	const save = async () => {
		if (!requestedLastWorkingDate) {
			toast.error("Your last working date is required.");
			return;
		}
		setSaving(true);
		try {
			await client.lifecycle.resignations.create({
				reasonCategory,
				requestedLastWorkingDate,
				reasonNotes: reasonNotes.trim() || null,
				submit: true,
			});
			toast.success("Resignation submitted.");
			onSaved();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to submit.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			footer={
				<>
					<button className="lc-btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="lc-btn primary"
						disabled={saving}
						onClick={save}
						type="button"
					>
						{saving ? "Submitting…" : "Submit resignation"}
					</button>
				</>
			}
			icon={<LogOut size={18} />}
			intro="This files your intent to leave. HR reviews it before any offboarding starts."
			onClose={onClose}
			title="Resign"
		>
			<div className="lc-form-field">
				<label htmlFor="res-reason">Reason</label>
				<select
					id="res-reason"
					onChange={(e) =>
						setReasonCategory(e.target.value as (typeof REASONS)[number])
					}
					value={reasonCategory}
				>
					{REASONS.map((r) => (
						<option key={r} value={r}>
							{labelFor(RESIGNATION_REASON_LABELS, r)}
						</option>
					))}
				</select>
			</div>
			<div className="lc-form-field">
				<label htmlFor="res-date">Requested last working date</label>
				<input
					id="res-date"
					onChange={(e) => setRequestedLastWorkingDate(e.target.value)}
					type="date"
					value={requestedLastWorkingDate}
				/>
			</div>
			<div className="lc-form-field">
				<label htmlFor="res-notes">Notes (optional)</label>
				<textarea
					id="res-notes"
					onChange={(e) => setReasonNotes(e.target.value)}
					value={reasonNotes}
				/>
			</div>
		</Modal>
	);
}
