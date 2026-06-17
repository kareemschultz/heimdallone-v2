import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/lifecycle.css";
import { EmptyState } from "@/components/empty-state";
import { Badge, disciplinaryStatusTone } from "@/features/lifecycle/badge";
import {
	DISCIPLINARY_STATUS_LABELS,
	formatDate,
	labelFor,
} from "@/features/lifecycle/labels";
import type { ActionOption } from "@/features/lifecycle/types";
import { canManageDisciplinary } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/lifecycle/disciplinary/$id")({
	component: DisciplinaryDetailPage,
});

interface RecordDetail {
	appealOutcome: string | null;
	appealText: string | null;
	canViewInternalNote: boolean;
	description: string;
	employeeExplanation: string | null;
	employeeName: string;
	finalActionNotes: string | null;
	id: string;
	incidentDate: string | Date;
	internalNote: string | null;
	reference: string;
	status: string;
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="lc-field">
			<span className="lc-field-lbl">{label}</span>
			<span className="lc-field-val">{value}</span>
		</div>
	);
}

function DisciplinaryDetailPage() {
	const { id } = Route.useParams();
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const canManage = canManageDisciplinary(role);
	const qc = useQueryClient();
	const [busy, setBusy] = useState(false);

	const recordQuery = useQuery(
		orpc.lifecycle.disciplinary.records.getById.queryOptions({ input: { id } })
	);
	const actionsQuery = useQuery({
		...orpc.lifecycle.disciplinary.actions.list.queryOptions({}),
		enabled: canManage,
	});
	const actions = (actionsQuery.data ?? []) as ActionOption[];

	const record = recordQuery.data as RecordDetail | undefined;

	const run = async (fn: () => Promise<unknown>, ok: string) => {
		setBusy(true);
		try {
			await fn();
			toast.success(ok);
			qc.invalidateQueries();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed.");
		} finally {
			setBusy(false);
		}
	};

	if (recordQuery.isLoading) {
		return (
			<div className="page">
				<p className="lc-muted">Loading…</p>
			</div>
		);
	}
	if (recordQuery.isError || !record) {
		return (
			<div className="page">
				<EmptyState
					description="This record is unavailable or you do not have access."
					title="Record unavailable"
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
						<span>Lifecycle</span>
						<span className="sep">/</span>
						<span>Disciplinary</span>
						<span className="sep">/</span>
						<span>{record.reference}</span>
					</div>
					<h1 className="page-title">
						{record.reference}{" "}
						<Badge tone={disciplinaryStatusTone(record.status)}>
							{labelFor(DISCIPLINARY_STATUS_LABELS, record.status)}
						</Badge>
					</h1>
				</div>
			</div>

			<div className="lc-detail-grid">
				<Field label="Employee" value={record.employeeName} />
				<Field label="Incident date" value={formatDate(record.incidentDate)} />
				<Field
					label="Status"
					value={labelFor(DISCIPLINARY_STATUS_LABELS, record.status)}
				/>
			</div>

			<div className="lc-section">
				<div className="lc-section-title">Incident</div>
				<p className="lc-field-val">{record.description}</p>
			</div>

			{record.employeeExplanation && (
				<div className="lc-section">
					<div className="lc-section-title">Employee explanation</div>
					<p className="lc-field-val">{record.employeeExplanation}</p>
				</div>
			)}

			{record.finalActionNotes && (
				<div className="lc-section">
					<div className="lc-section-title">Final action</div>
					<p className="lc-field-val">{record.finalActionNotes}</p>
				</div>
			)}

			{record.appealText && (
				<div className="lc-section">
					<div className="lc-section-title">Appeal</div>
					<p className="lc-field-val">{record.appealText}</p>
					{record.appealOutcome && (
						<p className="lc-muted">Outcome: {record.appealOutcome}</p>
					)}
				</div>
			)}

			{/* SERVER-REDACTED internal note — shown ONLY when the server sends it. */}
			{record.canViewInternalNote && record.internalNote && (
				<div className="lc-section">
					<div className="lc-section-title">Internal note (HR only)</div>
					<p className="lc-field-val lc-internal-note">{record.internalNote}</p>
				</div>
			)}

			<DisciplinaryActions
				actions={actions}
				busy={busy}
				canManage={canManage}
				id={id}
				record={record}
				run={run}
			/>
		</div>
	);
}

function DisciplinaryActions({
	id,
	record,
	canManage,
	busy,
	actions,
	run,
}: {
	actions: ActionOption[];
	busy: boolean;
	canManage: boolean;
	id: string;
	record: RecordDetail;
	run: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
	const [explanation, setExplanation] = useState("");
	const [appealText, setAppealText] = useState("");
	const [actionId, setActionId] = useState("");

	const status = record.status;

	return (
		<div className="lc-section">
			<div className="lc-section-title">Actions</div>

			{/* HR: request explanation from the subject. */}
			{canManage && status === "draft" && (
				<div className="lc-actions">
					<button
						className="lc-btn"
						disabled={busy}
						onClick={() =>
							run(
								() =>
									client.lifecycle.disciplinary.records.requestExplanation({
										id,
									}),
								"Explanation requested."
							)
						}
						type="button"
					>
						Request explanation
					</button>
				</div>
			)}

			{/* Submit explanation — employee (own) or HR. */}
			{(status === "draft" || status === "explanation_requested") && (
				<div className="lc-form-field">
					<label htmlFor="disc-expl">Submit explanation</label>
					<textarea
						id="disc-expl"
						onChange={(e) => setExplanation(e.target.value)}
						value={explanation}
					/>
					<button
						className="lc-btn primary"
						disabled={busy || !explanation.trim()}
						onClick={() =>
							run(async () => {
								await client.lifecycle.disciplinary.records.submitExplanation({
									id,
									explanation: explanation.trim(),
								});
								setExplanation("");
							}, "Explanation submitted.")
						}
						type="button"
					>
						Submit explanation
					</button>
				</div>
			)}

			{/* HR: take final action. */}
			{canManage &&
				(status === "explained" || status === "explanation_requested") && (
					<div className="lc-form-field">
						<label htmlFor="disc-action">Take action</label>
						<select
							id="disc-action"
							onChange={(e) => setActionId(e.target.value)}
							value={actionId}
						>
							<option value="">No catalogue action</option>
							{actions.map((a) => (
								<option key={a.id} value={a.id}>
									{a.name} (severity {a.severityLevel})
								</option>
							))}
						</select>
						<button
							className="lc-btn primary"
							disabled={busy}
							onClick={() =>
								run(
									() =>
										client.lifecycle.disciplinary.records.takeAction({
											id,
											finalActionId: actionId || null,
										}),
									"Action recorded."
								)
							}
							type="button"
						>
							Record action
						</button>
					</div>
				)}

			{/* Employee (own) or HR: appeal an action. */}
			{status === "action_taken" && (
				<div className="lc-form-field">
					<label htmlFor="disc-appeal">Appeal</label>
					<textarea
						id="disc-appeal"
						onChange={(e) => setAppealText(e.target.value)}
						value={appealText}
					/>
					<button
						className="lc-btn"
						disabled={busy || !appealText.trim()}
						onClick={() =>
							run(async () => {
								await client.lifecycle.disciplinary.records.appeal({
									id,
									appealText: appealText.trim(),
								});
								setAppealText("");
							}, "Appeal submitted.")
						}
						type="button"
					>
						Submit appeal
					</button>
				</div>
			)}

			{/* HR: close directly (no appeal) or resolve an appeal. */}
			{canManage && status === "action_taken" && (
				<div className="lc-actions">
					<button
						className="lc-btn"
						disabled={busy}
						onClick={() =>
							run(
								() => client.lifecycle.disciplinary.records.close({ id }),
								"Case closed."
							)
						}
						type="button"
					>
						Close case
					</button>
				</div>
			)}
			{canManage && status === "appealed" && (
				<div className="lc-actions">
					<button
						className="lc-btn"
						disabled={busy}
						onClick={() =>
							run(
								() =>
									client.lifecycle.disciplinary.records.resolveAppeal({
										id,
										uphold: true,
									}),
								"Appeal resolved — action upheld."
							)
						}
						type="button"
					>
						Uphold action (close)
					</button>
					<button
						className="lc-btn"
						disabled={busy}
						onClick={() =>
							run(
								() =>
									client.lifecycle.disciplinary.records.resolveAppeal({
										id,
										uphold: false,
									}),
								"Appeal upheld — action overturned."
							)
						}
						type="button"
					>
						Overturn action
					</button>
				</div>
			)}
		</div>
	);
}
