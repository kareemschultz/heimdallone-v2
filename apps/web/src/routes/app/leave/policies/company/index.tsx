import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileCheck, Plus, ShieldQuestion, X } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/leave.css";
import { EmptyState } from "@/components/empty-state";
import { LeavePolicyTabs } from "@/features/leave/leave-policy-tabs";
import {
	type BadgeTone,
	overrideModeLabel,
	policyStatusLabel,
	policyStatusTone,
} from "@/features/leave/policy-labels";
import { canManageLeavePolicy, canViewLeavePolicy } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/leave/policies/company/")({
	component: CompanyPoliciesPage,
});

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
	return <span className={`lp-badge tone-${tone}`}>{children}</span>;
}

interface PolicyRow {
	companyOverrideMode: string;
	countryCode: string;
	id: string;
	name: string;
	status: string;
}

function CreatePolicyDialog({
	onClose,
	onCreated,
}: {
	onClose: () => void;
	onCreated: (id: string) => void;
}) {
	const [name, setName] = useState("");
	const [countryCode, setCountryCode] = useState("GY");
	const create = useMutation({
		mutationFn: () =>
			client.leavePolicy.orgPolicies.createCustom({
				name: name.trim(),
				countryCode: countryCode.trim().toUpperCase(),
			}),
		onSuccess: (res) => {
			toast.success("Custom policy created");
			onCreated(res.id);
		},
		onError: () => toast.error("Could not create the policy"),
	});

	return (
		<div className="leave-sheet-overlay">
			<div
				aria-labelledby="cp-title"
				aria-modal="true"
				className="leave-sheet"
				role="dialog"
			>
				<div className="leave-sheet-head">
					<h2 id="cp-title">Create custom policy</h2>
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
					<label className="field" htmlFor="cp-name">
						<span>Policy name</span>
						<input
							id="cp-name"
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Annual leave 2026"
							value={name}
						/>
					</label>
					<label className="field" htmlFor="cp-country">
						<span>Country code</span>
						<input
							id="cp-country"
							maxLength={3}
							onChange={(e) => setCountryCode(e.target.value)}
							placeholder="GY"
							value={countryCode}
						/>
					</label>
					<p className="lp-hint">
						A custom policy starts empty. You can add rules, or copy from an
						existing policy or statutory template.
					</p>
				</div>
				<div className="leave-sheet-foot">
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={name.trim().length === 0 || create.isPending}
						onClick={() => create.mutate()}
						type="button"
					>
						Create
					</button>
				</div>
			</div>
		</div>
	);
}

function CompanyPoliciesPage() {
	const org = useContext(OrgCtx);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const canView = canViewLeavePolicy(org.memberRole);
	const canManage = canManageLeavePolicy(org.memberRole);
	const [showCreate, setShowCreate] = useState(false);

	const policies = useQuery(
		orpc.leavePolicy.orgPolicies.list.queryOptions({
			input: {},
			enabled: canView,
		})
	);
	const health = useQuery(
		orpc.leavePolicy.orgPolicies.health.queryOptions({
			input: {},
			enabled: canView,
		})
	);
	const healthMsg = (health.data as { message: string | null } | undefined)
		?.message;

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Company leave policies</h1>
					</div>
				</div>
				<EmptyState
					description="Leave policy management is available to HR and administrators."
					icon={<ShieldQuestion size={28} />}
					title="You don't have access to leave policies"
				/>
			</div>
		);
	}

	const rows = (policies.data ?? []) as PolicyRow[];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<Link to="/app/leave">Leave</Link>
						<span className="sep">/</span>
						<span>Policies</span>
					</div>
					<h1 className="page-title">Leave policies</h1>
					<p className="page-sub">
						Your company's adopted and custom policies.
					</p>
				</div>
				{canManage ? (
					<button
						className="btn btn-primary"
						onClick={() => setShowCreate(true)}
						type="button"
					>
						<Plus size={13} />
						Create custom policy
					</button>
				) : null}
			</div>

			<LeavePolicyTabs />

			{healthMsg ? (
				<div className="lp-notice warn" role="note">
					<FileCheck size={14} />
					<span>
						Your active leave policy still has rules that need official review
						before production use.
					</span>
				</div>
			) : null}

			{policies.isLoading ? (
				<div className="lp-grid">
					{[0, 1].map((i) => (
						<div className="lp-card lp-card-skeleton" key={i} />
					))}
				</div>
			) : null}

			{policies.isError ? (
				<EmptyState
					compact
					description="Could not load your leave policies. Try again."
					title="Something went wrong"
				/>
			) : null}

			{!(policies.isLoading || policies.isError) && rows.length === 0 ? (
				<EmptyState
					action={
						canManage
							? {
									label: "Browse statutory templates",
									href: "/app/leave/policies",
								}
							: undefined
					}
					compact
					description="Adopt a statutory template or create a custom policy to get started."
					title="No company policies yet"
				/>
			) : null}

			{rows.length > 0 ? (
				<div className="lp-grid">
					{rows.map((p) => (
						<Link
							className="lp-card"
							key={p.id}
							params={{ id: p.id }}
							to="/app/leave/policies/org/$id"
						>
							<div className="lp-card-head">
								<span className="lp-country">{p.countryCode}</span>
								<Badge tone={policyStatusTone(p.status)}>
									{policyStatusLabel(p.status)}
								</Badge>
							</div>
							<div className="lp-card-title">{p.name}</div>
							<div className="lp-card-meta">
								<span>{overrideModeLabel(p.companyOverrideMode)}</span>
							</div>
						</Link>
					))}
				</div>
			) : null}

			{showCreate ? (
				<CreatePolicyDialog
					onClose={() => setShowCreate(false)}
					onCreated={(id) => {
						setShowCreate(false);
						queryClient.invalidateQueries({
							predicate: (q) =>
								String(q.queryKey[0] ?? "").includes("leavePolicy"),
						});
						navigate({ to: "/app/leave/policies/org/$id", params: { id } });
					}}
				/>
			) : null}
		</div>
	);
}
