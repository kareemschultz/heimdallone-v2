import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileCheck, ShieldQuestion } from "lucide-react";
import { useContext } from "react";

import "@/styles/leave.css";
import { EmptyState } from "@/components/empty-state";
import { LeavePolicyTabs } from "@/features/leave/leave-policy-tabs";
import {
	type BadgeTone,
	VERIFY_NOTICE,
	verificationLabel,
	verificationTone,
} from "@/features/leave/policy-labels";
import { canViewLeavePolicy } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/leave/policies/")({
	component: LeavePoliciesPage,
});

function fmtDate(value: string | Date | null): string {
	if (!value) {
		return "—";
	}
	const d = typeof value === "string" ? new Date(value) : value;
	return Number.isNaN(d.getTime())
		? "—"
		: d.toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
}

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
	return <span className={`lp-badge tone-${tone}`}>{children}</span>;
}

interface TemplateRow {
	countryCode: string;
	effectiveFrom: string | Date | null;
	id: string;
	jurisdictionName: string | null;
	lastReviewedAt: string | Date | null;
	name: string;
	ruleCount: number;
	sourceName: string | null;
	verificationStatus: string;
}

function TemplateCard({ t }: { t: TemplateRow }) {
	return (
		<Link
			className="lp-card"
			params={{ id: t.id }}
			to="/app/leave/policies/template/$id"
		>
			<div className="lp-card-head">
				<span className="lp-country">
					{t.jurisdictionName ?? t.countryCode}
				</span>
				<Badge tone={verificationTone(t.verificationStatus)}>
					{verificationLabel(t.verificationStatus)}
				</Badge>
			</div>
			<div className="lp-card-title">{t.name}</div>
			<div className="lp-card-meta">
				<span>
					{t.ruleCount} leave type{t.ruleCount === 1 ? "" : "s"}
				</span>
				<span className="sep">·</span>
				<span>Effective {fmtDate(t.effectiveFrom)}</span>
			</div>
			<div className="lp-card-source">
				{t.sourceName ? (
					<span title={t.sourceName}>
						Source on file · reviewed {fmtDate(t.lastReviewedAt)}
					</span>
				) : (
					<span>No official source yet</span>
				)}
			</div>
		</Link>
	);
}

function LeavePoliciesPage() {
	const org = useContext(OrgCtx);
	const canView = canViewLeavePolicy(org.memberRole);

	const templates = useQuery(
		orpc.leavePolicy.templates.list.queryOptions({
			input: {},
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<div className="crumbs">
							<span>{org.orgName}</span>
							<span className="sep">/</span>
							<span>Leave</span>
							<span className="sep">/</span>
							<span>Policies</span>
						</div>
						<h1 className="page-title">Leave policies</h1>
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

	const rows = (templates.data ?? []) as TemplateRow[];

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
						Statutory baselines you can adopt, and your company's own policies.
					</p>
				</div>
			</div>

			<LeavePolicyTabs />

			<div className="lp-notice" role="note">
				<FileCheck size={14} />
				<span>{VERIFY_NOTICE}</span>
			</div>

			{templates.isLoading ? (
				<div className="lp-grid">
					{[0, 1, 2].map((i) => (
						<div className="lp-card lp-card-skeleton" key={i} />
					))}
				</div>
			) : null}

			{templates.isError ? (
				<EmptyState
					compact
					description="Could not load leave policy templates. Try again."
					title="Something went wrong"
				/>
			) : null}

			{!(templates.isLoading || templates.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="No statutory templates are available for your region yet."
					title="No templates"
				/>
			) : null}

			{rows.length > 0 ? (
				<div className="lp-grid">
					{rows.map((t) => (
						<TemplateCard key={t.id} t={t} />
					))}
				</div>
			) : null}
		</div>
	);
}
