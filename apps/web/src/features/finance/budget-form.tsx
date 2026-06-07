import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/utils/orpc";
import type { BudgetCategory, BudgetRow, BudgetScope } from "./types";

interface BudgetFormProps {
	existing: BudgetRow | null;
	onCancel: () => void;
	onSubmit: (input: {
		scope: BudgetScope;
		scopeId: string | null;
		label: string;
		category: BudgetCategory;
		periodStart: string;
		periodEnd: string;
		currency: string;
		budgetedAmount: number;
		notes: string | null;
	}) => Promise<void>;
}

interface NamedRow {
	id: string;
	name: string;
}

export function BudgetForm({ existing, onCancel, onSubmit }: BudgetFormProps) {
	const year = new Date().getFullYear();
	const [scope, setScope] = useState<BudgetScope>(
		existing?.scope ?? "organization"
	);
	const [scopeId, setScopeId] = useState<string | null>(
		existing?.scopeId ?? null
	);
	const [label, setLabel] = useState(existing?.label ?? "");
	const [periodStart, setPeriodStart] = useState(
		existing?.periodStart ?? `${year}-01-01`
	);
	const [periodEnd, setPeriodEnd] = useState(
		existing?.periodEnd ?? `${year}-12-31`
	);
	const [currency, setCurrency] = useState(existing?.currency ?? "GYD");
	const [amount, setAmount] = useState(String(existing?.budgetedAmount ?? ""));
	const [notes, setNotes] = useState(existing?.notes ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const departments = useQuery(
		orpc.hrCore.departments.list.queryOptions({
			input: {},
			enabled: scope === "department",
		})
	);
	const projects = useQuery(
		orpc.projects.list.queryOptions({
			input: {},
			enabled: scope === "project",
		})
	);

	const deptRows = (departments.data as NamedRow[] | undefined) ?? [];
	const projectRows = (projects.data as NamedRow[] | undefined) ?? [];

	async function handleSave() {
		setError(null);
		const amt = Number(amount);
		if (!label.trim()) {
			setError("A label is required.");
			return;
		}
		if (Number.isNaN(amt) || amt < 0) {
			setError("Enter a valid budget amount.");
			return;
		}
		if (scope !== "organization" && !scopeId) {
			setError(`Select a ${scope}.`);
			return;
		}
		setBusy(true);
		try {
			await onSubmit({
				scope,
				scopeId: scope === "organization" ? null : scopeId,
				label: label.trim(),
				category: existing?.category ?? "labour",
				periodStart,
				periodEnd,
				currency: currency.trim() || "GYD",
				budgetedAmount: amt,
				notes: notes.trim() || null,
			});
		} catch (e) {
			setError(
				(e as { message?: string }).message ?? "Could not save the budget."
			);
			setBusy(false);
		}
	}

	return (
		<div className="fn-dialog-backdrop">
			<div
				aria-labelledby="fn-budget-title"
				aria-modal="true"
				className="fn-dialog"
				role="dialog"
			>
				<h2 id="fn-budget-title">{existing ? "Edit budget" : "New budget"}</h2>
				<p className="fn-sub">
					A budget is a target you compare actual labour cost against.
				</p>

				<div className="fn-field">
					<label htmlFor="fn-b-scope">Scope</label>
					<select
						id="fn-b-scope"
						onChange={(e) => {
							setScope(e.target.value as BudgetScope);
							setScopeId(null);
						}}
						value={scope}
					>
						<option value="organization">Organization (whole company)</option>
						<option value="department">Department</option>
						<option value="project">Project</option>
					</select>
				</div>

				{scope === "department" ? (
					<div className="fn-field">
						<label htmlFor="fn-b-dept">Department</label>
						<select
							id="fn-b-dept"
							onChange={(e) => setScopeId(e.target.value || null)}
							value={scopeId ?? ""}
						>
							<option value="">Select a department…</option>
							{deptRows.map((d) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>
					</div>
				) : null}

				{scope === "project" ? (
					<div className="fn-field">
						<label htmlFor="fn-b-proj">Project</label>
						<select
							id="fn-b-proj"
							onChange={(e) => setScopeId(e.target.value || null)}
							value={scopeId ?? ""}
						>
							<option value="">Select a project…</option>
							{projectRows.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
						</select>
					</div>
				) : null}

				<div className="fn-field">
					<label htmlFor="fn-b-label">Label</label>
					<input
						id="fn-b-label"
						onChange={(e) => setLabel(e.target.value)}
						placeholder="FY26 Engineering labour"
						value={label}
					/>
				</div>

				<div className="fn-field">
					<label htmlFor="fn-b-start">Period start</label>
					<input
						id="fn-b-start"
						onChange={(e) => setPeriodStart(e.target.value)}
						type="date"
						value={periodStart}
					/>
				</div>
				<div className="fn-field">
					<label htmlFor="fn-b-end">Period end</label>
					<input
						id="fn-b-end"
						onChange={(e) => setPeriodEnd(e.target.value)}
						type="date"
						value={periodEnd}
					/>
				</div>

				<div className="fn-field">
					<label htmlFor="fn-b-cur">Currency</label>
					<input
						id="fn-b-cur"
						onChange={(e) => setCurrency(e.target.value)}
						value={currency}
					/>
				</div>
				<div className="fn-field">
					<label htmlFor="fn-b-amt">Budgeted amount</label>
					<input
						id="fn-b-amt"
						inputMode="decimal"
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0.00"
						value={amount}
					/>
				</div>
				<div className="fn-field">
					<label htmlFor="fn-b-notes">Notes (optional)</label>
					<textarea
						id="fn-b-notes"
						onChange={(e) => setNotes(e.target.value)}
						rows={2}
						value={notes}
					/>
				</div>

				{error ? (
					<p className="fn-sub" style={{ color: "var(--danger)" }}>
						{error}
					</p>
				) : null}

				<div className="fn-dialog-actions">
					<button
						className="fn-btn"
						disabled={busy}
						onClick={onCancel}
						type="button"
					>
						Cancel
					</button>
					<button
						className="fn-btn primary"
						disabled={busy}
						onClick={handleSave}
						type="button"
					>
						{busy ? "Saving…" : "Save budget"}
					</button>
				</div>
			</div>
		</div>
	);
}
