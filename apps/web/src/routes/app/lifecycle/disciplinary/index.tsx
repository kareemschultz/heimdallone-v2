import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { LifecycleTabs } from "@/features/lifecycle/lifecycle-tabs";
import type {
	CategoryOption,
	DisciplinaryRecordRow,
	EmployeeOption,
} from "@/features/lifecycle/types";
import { canManageDisciplinary, canViewDisciplinary } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/lifecycle/disciplinary/")({
	component: DisciplinaryListPage,
});

const STATUS_FILTERS = [
	"draft",
	"explanation_requested",
	"explained",
	"action_taken",
	"appealed",
	"closed",
	"overturned",
	"withdrawn",
] as const;

function DisciplinaryListPage() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const canManage = canManageDisciplinary(role);
	const qc = useQueryClient();
	const [status, setStatus] = useState("");
	const [dialogOpen, setDialogOpen] = useState(false);

	const recordsQuery = useQuery(
		orpc.lifecycle.disciplinary.records.list.queryOptions({
			input: status
				? { status: status as (typeof STATUS_FILTERS)[number] }
				: {},
		})
	);
	const records = (recordsQuery.data ?? []) as DisciplinaryRecordRow[];

	if (!canViewDisciplinary(role)) {
		return (
			<div className="page">
				<EmptyState
					description="You do not have access to disciplinary records."
					title="No access"
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
					</div>
					<h1 className="page-title">Disciplinary cases</h1>
					<p className="page-sub">Incident, explanation, action, and appeal.</p>
				</div>
				{canManage && (
					<button
						className="lc-btn primary"
						onClick={() => setDialogOpen(true)}
						type="button"
					>
						New case
					</button>
				)}
			</div>

			<LifecycleTabs />

			<div className="lc-toolbar">
				<label className="lc-muted" htmlFor="disc-status">
					Status
				</label>
				<select
					id="disc-status"
					onChange={(e) => setStatus(e.target.value)}
					value={status}
				>
					<option value="">All</option>
					{STATUS_FILTERS.map((s) => (
						<option key={s} value={s}>
							{labelFor(DISCIPLINARY_STATUS_LABELS, s)}
						</option>
					))}
				</select>
			</div>

			{recordsQuery.isLoading && <p className="lc-muted">Loading…</p>}
			{recordsQuery.isError && (
				<p className="lc-error">Could not load disciplinary records.</p>
			)}
			{!(recordsQuery.isLoading || recordsQuery.isError) &&
				records.length === 0 && (
					<EmptyState
						description="No disciplinary cases match this filter."
						title="Nothing to show"
					/>
				)}
			{records.length > 0 && (
				<table className="lc-table">
					<thead>
						<tr>
							<th>Reference</th>
							<th>Employee</th>
							<th>Incident date</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{records.map((r) => (
							<tr key={r.id}>
								<td>
									<Link
										className="lc-name-link"
										params={{ id: r.id }}
										to="/app/lifecycle/disciplinary/$id"
									>
										{r.reference}
									</Link>
								</td>
								<td>{r.employeeName}</td>
								<td>{formatDate(r.incidentDate)}</td>
								<td>
									<Badge tone={disciplinaryStatusTone(r.status)}>
										{labelFor(DISCIPLINARY_STATUS_LABELS, r.status)}
									</Badge>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{dialogOpen && (
				<NewCaseDialog
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

function NewCaseDialog({
	onClose,
	onSaved,
}: {
	onClose: () => void;
	onSaved: () => void;
}) {
	const [employeeId, setEmployeeId] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [incidentDate, setIncidentDate] = useState("");
	const [description, setDescription] = useState("");
	const [internalNote, setInternalNote] = useState("");
	const [saving, setSaving] = useState(false);

	const employeesQuery = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 100 },
		})
	);
	const employees = (employeesQuery.data?.data ?? []) as EmployeeOption[];
	const categoriesQuery = useQuery(
		orpc.lifecycle.disciplinary.categories.list.queryOptions({})
	);
	const categories = (categoriesQuery.data ?? []) as CategoryOption[];

	const save = async () => {
		if (!(employeeId && incidentDate && description.trim())) {
			toast.error("Employee, incident date, and description are required.");
			return;
		}
		setSaving(true);
		try {
			await client.lifecycle.disciplinary.records.create({
				employeeId,
				categoryId: categoryId || null,
				incidentDate,
				description: description.trim(),
				internalNote: internalNote.trim() || null,
			});
			toast.success("Case created.");
			onSaved();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="lc-dialog-backdrop">
			<div
				aria-labelledby="disc-dialog-title"
				className="lc-dialog"
				role="dialog"
			>
				<h2 id="disc-dialog-title">New disciplinary case</h2>
				<div className="lc-form-field">
					<label htmlFor="disc-emp">Employee</label>
					<select
						id="disc-emp"
						onChange={(e) => setEmployeeId(e.target.value)}
						value={employeeId}
					>
						<option value="">Select…</option>
						{employees.map((emp) => (
							<option key={emp.id} value={emp.id}>
								{[emp.firstName, emp.lastName].filter(Boolean).join(" ")}
							</option>
						))}
					</select>
				</div>
				<div className="lc-form-field">
					<label htmlFor="disc-cat">Category</label>
					<select
						id="disc-cat"
						onChange={(e) => setCategoryId(e.target.value)}
						value={categoryId}
					>
						<option value="">None</option>
						{categories.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</select>
				</div>
				<div className="lc-form-field">
					<label htmlFor="disc-date">Incident date</label>
					<input
						id="disc-date"
						onChange={(e) => setIncidentDate(e.target.value)}
						type="date"
						value={incidentDate}
					/>
				</div>
				<div className="lc-form-field">
					<label htmlFor="disc-desc">What happened</label>
					<textarea
						id="disc-desc"
						onChange={(e) => setDescription(e.target.value)}
						value={description}
					/>
				</div>
				<div className="lc-form-field">
					<label htmlFor="disc-note">Internal note (HR only)</label>
					<textarea
						id="disc-note"
						onChange={(e) => setInternalNote(e.target.value)}
						value={internalNote}
					/>
				</div>
				<div className="lc-dialog-actions">
					<button className="lc-btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="lc-btn primary"
						disabled={saving}
						onClick={save}
						type="button"
					>
						{saving ? "Saving…" : "Create case"}
					</button>
				</div>
			</div>
		</div>
	);
}
