import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileCheck, FileStack } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/leave.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import {
	accrualLabel,
	type BadgeTone,
	categoryLabel,
	entitlementSummary,
	isCautioned,
	payrollTreatmentLabel,
	VERIFY_NOTICE,
	verificationLabel,
	verificationTone,
} from "@/features/leave/policy-labels";
import { canManageLeavePolicy, canViewLeavePolicy } from "@/lib/rbac";
import { safeHttpUrl } from "@/lib/safe-url";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/leave/policies/template/$id")({
	component: TemplateDetailPage,
});

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
	return <span className={`lp-badge tone-${tone}`}>{children}</span>;
}

interface RuleRow {
	accrualMethod: string;
	carryForwardAllowed: boolean;
	encashmentAllowed: boolean;
	entitlementAmount: string | null;
	entitlementUnit: string;
	id: string;
	isPaid: boolean;
	leaveCategory: string;
	leaveTypeName: string;
	notes: string | null;
	payrollTreatment: string | null;
	probationEligible: boolean;
	tenureMinMonths: number | null;
	verificationStatus: string;
}

function AdoptDialog({
	templateName,
	onClose,
	onConfirm,
	pending,
}: {
	templateName: string;
	onClose: () => void;
	onConfirm: (name: string) => void;
	pending: boolean;
}) {
	const [name, setName] = useState(templateName);
	return (
		<Modal
			footer={
				<>
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={name.trim().length === 0 || pending}
						onClick={() => onConfirm(name.trim())}
						type="button"
					>
						Copy into a company policy
					</button>
				</>
			}
			icon={<FileStack size={18} />}
			intro="This copies the rules into your company policy. Later changes to the statutory template will not automatically modify your adopted policy — you stay in control. The new policy starts as a draft; review and activate it when ready."
			onClose={onClose}
			title="Use this statutory template"
		>
			<label className="field" htmlFor="adopt-name">
				<span>Your policy name</span>
				<input
					id="adopt-name"
					onChange={(e) => setName(e.target.value)}
					value={name}
				/>
			</label>
			<p className="lp-hint">{VERIFY_NOTICE}</p>
		</Modal>
	);
}

function RuleTable({
	rules,
	showTreatment,
}: {
	rules: RuleRow[];
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
					<th>Encashment</th>
					{showTreatment ? <th>Payroll treatment</th> : null}
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{rules.map((r) => (
					<tr key={r.id}>
						<td>
							<div className="lp-rule-name">{r.leaveTypeName}</div>
							<div className="lp-rule-cat">
								{categoryLabel(r.leaveCategory)}
							</div>
							{r.notes ? <div className="lp-rule-note">{r.notes}</div> : null}
						</td>
						<td>
							{entitlementSummary(r.entitlementAmount, r.entitlementUnit)}
							{r.tenureMinMonths ? (
								<div className="lp-rule-sub">
									after {r.tenureMinMonths} mo service
								</div>
							) : null}
							{r.probationEligible ? (
								<div className="lp-rule-sub">available during probation</div>
							) : null}
						</td>
						<td>{accrualLabel(r.accrualMethod)}</td>
						<td>{r.isPaid ? "Paid" : "Unpaid"}</td>
						<td>{r.carryForwardAllowed ? "Allowed" : "No"}</td>
						<td>{r.encashmentAllowed ? "Allowed" : "No"}</td>
						{showTreatment ? (
							<td>{payrollTreatmentLabel(r.payrollTreatment)}</td>
						) : null}
						<td>
							<Badge tone={verificationTone(r.verificationStatus)}>
								{verificationLabel(r.verificationStatus)}
							</Badge>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

interface TemplateData {
	countryCode: string;
	description: string | null;
	isSystemTemplate: boolean;
	jurisdictionName: string | null;
	name: string;
	rules: RuleRow[];
	sourceName: string | null;
	sourceUrl: string | null;
	verificationStatus: string;
}

function TemplateBody({
	t,
	canManage,
	onUse,
}: {
	canManage: boolean;
	onUse: () => void;
	t: TemplateData;
}) {
	const showTreatment =
		t.rules.some((r) => r.payrollTreatment != null) || canManage;
	const sourceUrl = t.sourceUrl ? safeHttpUrl(t.sourceUrl) : null;
	return (
		<>
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{t.jurisdictionName ?? t.countryCode}</span>
					</div>
					<h1 className="page-title">{t.name}</h1>
					{t.description ? <p className="page-sub">{t.description}</p> : null}
					<div className="lp-detail-badges">
						<Badge tone={verificationTone(t.verificationStatus)}>
							{verificationLabel(t.verificationStatus)}
						</Badge>
						{t.isSystemTemplate ? (
							<span className="lp-tag">System template</span>
						) : null}
					</div>
				</div>
				{canManage ? (
					<button className="btn btn-primary" onClick={onUse} type="button">
						Use this template
					</button>
				) : null}
			</div>

			{isCautioned(t.verificationStatus) ? (
				<div className="lp-notice warn" role="note">
					<FileCheck size={14} />
					<span>{VERIFY_NOTICE}</span>
				</div>
			) : null}

			{t.sourceName ? (
				<div className="lp-source-box">
					<div className="lp-source-row">
						<span className="lp-source-k">Source</span>
						<span>{t.sourceName}</span>
					</div>
					{sourceUrl ? (
						<div className="lp-source-row">
							<span className="lp-source-k">Link</span>
							<a href={sourceUrl} rel="noopener noreferrer" target="_blank">
								Official source
							</a>
						</div>
					) : null}
				</div>
			) : null}

			<RuleTable rules={t.rules} showTreatment={showTreatment} />
		</>
	);
}

function TemplateDetailPage() {
	const org = useContext(OrgCtx);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const canView = canViewLeavePolicy(org.memberRole);
	const canManage = canManageLeavePolicy(org.memberRole);
	const { id } = Route.useParams();
	const [showAdopt, setShowAdopt] = useState(false);

	const template = useQuery(
		orpc.leavePolicy.templates.getById.queryOptions({
			input: { id },
			enabled: canView,
			retry: false,
		})
	);

	const adopt = useMutation({
		mutationFn: (name: string) =>
			client.leavePolicy.orgPolicies.adoptTemplate({ templateId: id, name }),
		onSuccess: (res) => {
			toast.success("Policy created from template (draft)");
			queryClient.invalidateQueries({
				predicate: (q) => String(q.queryKey[0] ?? "").includes("leavePolicy"),
			});
			navigate({ to: "/app/leave/policies/org/$id", params: { id: res.id } });
		},
		onError: () => toast.error("Could not adopt the template"),
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

	if (template.isError) {
		return (
			<div className="page">
				<Link className="lp-back" to="/app/leave/policies">
					<ArrowLeft size={14} /> Back to policies
				</Link>
				<EmptyState
					compact
					description="This template is not available."
					title="Template not found"
				/>
			</div>
		);
	}

	const t = template.data as TemplateData | undefined;

	return (
		<div className="page">
			<Link className="lp-back" to="/app/leave/policies">
				<ArrowLeft size={14} /> Back to policies
			</Link>

			{template.isLoading || !t ? (
				<div className="lp-card lp-card-skeleton" style={{ height: 120 }} />
			) : (
				<TemplateBody
					canManage={canManage}
					onUse={() => setShowAdopt(true)}
					t={t}
				/>
			)}

			{showAdopt && t ? (
				<AdoptDialog
					onClose={() => setShowAdopt(false)}
					onConfirm={(name) => adopt.mutate(name)}
					pending={adopt.isPending}
					templateName={t.name}
				/>
			) : null}
		</div>
	);
}
