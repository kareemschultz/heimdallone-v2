import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, GitCompare, X } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/leave.css";
import { EmptyState } from "@/components/empty-state";
import {
	accrualLabel,
	type BadgeTone,
	categoryLabel,
	entitlementSummary,
	overrideModeLabel,
	payrollTreatmentLabel,
	policyStatusLabel,
	policyStatusTone,
	verificationLabel,
	verificationTone,
} from "@/features/leave/policy-labels";
import { canManageLeavePolicy, canViewLeavePolicy } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/leave/policies/org/$id")({
	component: OrgPolicyDetailPage,
});

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
	return <span className={`lp-badge tone-${tone}`}>{children}</span>;
}

interface OrgRuleRow {
	accrualMethod: string;
	carryForwardAllowed: boolean;
	customOverrideNote: string | null;
	encashmentAllowed: boolean;
	entitlementAmount: string | null;
	entitlementUnit: string;
	id: string;
	isCustomized: boolean;
	isPaid: boolean;
	leaveCategory: string;
	leaveTypeName: string;
	payrollTreatment: string | null;
	verificationStatus: string;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("leavePolicy"),
	});
}

function RuleEditDialog({
	rule,
	onClose,
	onSaved,
}: {
	rule: OrgRuleRow;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [amount, setAmount] = useState(rule.entitlementAmount ?? "");
	const [isPaid, setIsPaid] = useState(rule.isPaid);
	const [carry, setCarry] = useState(rule.carryForwardAllowed);
	const [note, setNote] = useState(rule.customOverrideNote ?? "");
	const save = useMutation({
		mutationFn: () =>
			client.leavePolicy.orgPolicies.updateRule({
				ruleId: rule.id,
				patch: {
					entitlementAmount: amount.trim() === "" ? null : amount.trim(),
					isPaid,
					carryForwardAllowed: carry,
					customOverrideNote: note.trim() === "" ? null : note.trim(),
				},
			}),
		onSuccess: () => {
			toast.success("Rule updated");
			onSaved();
		},
		onError: () => toast.error("Could not update the rule"),
	});

	return (
		<div className="leave-sheet-overlay">
			<div
				aria-labelledby="rule-title"
				aria-modal="true"
				className="leave-sheet"
				role="dialog"
			>
				<div className="leave-sheet-head">
					<h2 id="rule-title">Edit “{rule.leaveTypeName}”</h2>
					<button
						aria-label="Close"
						className="btn-icon"
						onClick={onClose}
						type="button"
					>
						<X size={16} />
					</button>
				</div>
				<div className="leave-sheet-body">
					<label className="field" htmlFor="rule-amount">
						<span>Entitlement ({rule.entitlementUnit})</span>
						<input
							id="rule-amount"
							inputMode="decimal"
							onChange={(e) => setAmount(e.target.value)}
							placeholder="e.g. 14"
							value={amount}
						/>
					</label>
					<label className="lp-check" htmlFor="rule-paid">
						<input
							checked={isPaid}
							id="rule-paid"
							onChange={(e) => setIsPaid(e.target.checked)}
							type="checkbox"
						/>
						<span>Paid leave (pay preserved)</span>
					</label>
					<label className="lp-check" htmlFor="rule-carry">
						<input
							checked={carry}
							id="rule-carry"
							onChange={(e) => setCarry(e.target.checked)}
							type="checkbox"
						/>
						<span>Carry-forward allowed</span>
					</label>
					<label className="field" htmlFor="rule-note">
						<span>Override note (why you changed this)</span>
						<textarea
							id="rule-note"
							onChange={(e) => setNote(e.target.value)}
							rows={2}
							value={note}
						/>
					</label>
				</div>
				<div className="leave-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
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
		</div>
	);
}

interface CompareRow {
	differences: { baseline: unknown; current: unknown; field: string }[];
	hasBaseline: boolean;
	isCustomized: boolean;
	leaveTypeName: string;
	ruleId: string;
}

function CompareView({ id }: { id: string }) {
	const cmp = useQuery(
		orpc.leavePolicy.orgPolicies.compareToBaseline.queryOptions({
			input: { id },
		})
	);
	if (cmp.isLoading) {
		return <div className="lp-card lp-card-skeleton" style={{ height: 80 }} />;
	}
	const rows = (cmp.data ?? []) as CompareRow[];
	const changed = rows.filter((r) => r.differences.length > 0);
	if (changed.length === 0) {
		return (
			<p className="lp-hint">
				No differences from the statutory baseline — this policy matches its
				source.
			</p>
		);
	}
	return (
		<div className="lp-compare">
			{changed.map((r) => (
				<div className="lp-compare-row" key={r.ruleId}>
					<div className="lp-compare-name">{r.leaveTypeName}</div>
					{r.differences.map((d) => (
						<div className="lp-compare-diff" key={d.field}>
							<span className="lp-compare-field">{d.field}</span>
							<span className="lp-compare-base">
								{String(d.baseline ?? "—")}
							</span>
							<span className="lp-compare-arrow">→</span>
							<span className="lp-compare-cur">{String(d.current ?? "—")}</span>
						</div>
					))}
				</div>
			))}
		</div>
	);
}

function OrgRulesTable({
	rules,
	showTreatment,
	canManage,
	onEdit,
}: {
	canManage: boolean;
	onEdit: (r: OrgRuleRow) => void;
	rules: OrgRuleRow[];
	showTreatment: boolean;
}) {
	return (
		<table className="lp-table">
			<thead>
				<tr>
					<th>Leave type</th>
					<th>Entitlement</th>
					<th>Accrual</th>
					<th>Paid</th>
					<th>Carry-forward</th>
					{showTreatment ? <th>Payroll treatment</th> : null}
					<th>Status</th>
					{canManage ? <th /> : null}
				</tr>
			</thead>
			<tbody>
				{rules.map((r) => (
					<tr key={r.id}>
						<td>
							<div className="lp-rule-name">
								{r.leaveTypeName}
								{r.isCustomized ? (
									<span className="lp-tag sm">Customized</span>
								) : null}
							</div>
							<div className="lp-rule-cat">
								{categoryLabel(r.leaveCategory)}
							</div>
							{r.customOverrideNote ? (
								<div className="lp-rule-note">{r.customOverrideNote}</div>
							) : null}
						</td>
						<td>
							{entitlementSummary(r.entitlementAmount, r.entitlementUnit)}
						</td>
						<td>{accrualLabel(r.accrualMethod)}</td>
						<td>{r.isPaid ? "Paid" : "Unpaid"}</td>
						<td>{r.carryForwardAllowed ? "Allowed" : "No"}</td>
						{showTreatment ? (
							<td>{payrollTreatmentLabel(r.payrollTreatment)}</td>
						) : null}
						<td>
							<Badge tone={verificationTone(r.verificationStatus)}>
								{verificationLabel(r.verificationStatus)}
							</Badge>
						</td>
						{canManage ? (
							<td>
								<button
									className="btn btn-sm"
									onClick={() => onEdit(r)}
									type="button"
								>
									Edit
								</button>
							</td>
						) : null}
					</tr>
				))}
			</tbody>
		</table>
	);
}

function OrgPolicyDetailPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canView = canViewLeavePolicy(org.memberRole);
	const canManage = canManageLeavePolicy(org.memberRole);
	const { id } = Route.useParams();
	const [editRule, setEditRule] = useState<OrgRuleRow | null>(null);
	const [showCompare, setShowCompare] = useState(false);

	const policy = useQuery(
		orpc.leavePolicy.orgPolicies.getById.queryOptions({
			input: { id },
			enabled: canView,
			retry: false,
		})
	);

	const activate = useMutation({
		mutationFn: () => client.leavePolicy.orgPolicies.activate({ id }),
		onSuccess: () => {
			toast.success("Policy activated");
			invalidate(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not activate"),
	});
	const archive = useMutation({
		mutationFn: () => client.leavePolicy.orgPolicies.archive({ id }),
		onSuccess: () => {
			toast.success("Policy archived");
			invalidate(qc);
		},
		onError: () => toast.error("Could not archive"),
	});

	if (!canView) {
		return (
			<div className="page">
				<EmptyState
					description="Leave policy management is available to HR and administrators."
					title="You don't have access to leave policies"
				/>
			</div>
		);
	}
	if (policy.isError) {
		return (
			<div className="page">
				<Link className="lp-back" to="/app/leave/policies/company">
					<ArrowLeft size={14} /> Back to company policies
				</Link>
				<EmptyState
					compact
					description="This policy is not available."
					title="Policy not found"
				/>
			</div>
		);
	}

	const p = policy.data;
	const showTreatment = (p?.rules ?? []).some(
		(r) => (r as OrgRuleRow).payrollTreatment != null
	);

	return (
		<div className="page">
			<Link className="lp-back" to="/app/leave/policies/company">
				<ArrowLeft size={14} /> Back to company policies
			</Link>

			{policy.isLoading || !p ? (
				<div className="lp-card lp-card-skeleton" style={{ height: 120 }} />
			) : (
				<>
					<div className="page-header">
						<div>
							<div className="crumbs">
								<span>{p.countryCode}</span>
								<span className="sep">·</span>
								<span>{overrideModeLabel(p.companyOverrideMode)}</span>
							</div>
							<h1 className="page-title">{p.name}</h1>
							<div className="lp-detail-badges">
								<Badge tone={policyStatusTone(p.status)}>
									{policyStatusLabel(p.status)}
								</Badge>
							</div>
						</div>
						{canManage ? (
							<div className="lp-actions">
								{p.status === "draft" ? (
									<button
										className="btn btn-primary"
										disabled={activate.isPending}
										onClick={() => activate.mutate()}
										type="button"
									>
										Activate
									</button>
								) : null}
								{p.status === "archived" ? null : (
									<button
										className="btn"
										disabled={archive.isPending}
										onClick={() => archive.mutate()}
										type="button"
									>
										Archive
									</button>
								)}
							</div>
						) : null}
					</div>

					<div className="lp-toolbar-row">
						<button
							className="btn btn-ghost"
							onClick={() => setShowCompare((v) => !v)}
							type="button"
						>
							<GitCompare size={13} />
							{showCompare
								? "Hide comparison"
								: "Compare with statutory baseline"}
						</button>
					</div>
					{showCompare ? <CompareView id={id} /> : null}

					<OrgRulesTable
						canManage={canManage}
						onEdit={setEditRule}
						rules={(p.rules ?? []) as OrgRuleRow[]}
						showTreatment={showTreatment}
					/>
				</>
			)}

			{editRule ? (
				<RuleEditDialog
					onClose={() => setEditRule(null)}
					onSaved={() => {
						setEditRule(null);
						invalidate(qc);
					}}
					rule={editRule}
				/>
			) : null}
		</div>
	);
}
