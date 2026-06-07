import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Handshake } from "lucide-react";
import { useContext } from "react";

import "@/styles/crm.css";
import { EmptyState } from "@/components/empty-state";
import { CrmTabs } from "@/features/crm/crm-tabs";
import { formatMoney } from "@/features/crm/labels";
import type { ActivityRow, DealRow, LeadRow } from "@/features/crm/types";
import { canViewCrm } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/crm/")({
	component: CrmDashboardPage,
});

const ATTENTION_LIMIT = 6;

function CrmDashboardPage() {
	const org = useContext(OrgCtx);
	const canView = canViewCrm(org.memberRole);

	const deals = useQuery(
		orpc.crm.deals.list.queryOptions({ input: {}, enabled: canView })
	);
	const leads = useQuery(
		orpc.crm.leads.list.queryOptions({ input: {}, enabled: canView })
	);
	const activities = useQuery(
		orpc.crm.activities.list.queryOptions({
			input: { openOnly: true },
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
					description="CRM is available to the sales team, managers, and finance."
					icon={<Handshake size={28} />}
					title="You don't have access to CRM"
				/>
			</div>
		);
	}

	const dealRows = (deals.data as DealRow[] | undefined) ?? [];
	const leadRows = (leads.data as LeadRow[] | undefined) ?? [];
	const actRows = (activities.data as ActivityRow[] | undefined) ?? [];

	const openDeals = dealRows.filter((d) => d.status === "open");
	const wonDeals = dealRows.filter((d) => d.status === "won");
	const stalled = openDeals.filter((d) => d.isStalled);
	const openValue = openDeals.reduce((s, d) => s + (d.value ?? 0), 0);
	const currency = dealRows[0]?.currency ?? "GYD";
	const openLeads = leadRows.filter(
		(l) => l.status !== "converted" && l.status !== "unqualified"
	);
	const unassignedLeads = openLeads.filter((l) => !l.ownerEmployeeId);
	const overdue = actRows.filter((a) => a.isOverdue);

	const tiles = [
		{ label: "Open deals", value: String(openDeals.length), alert: false },
		{
			label: "Open value",
			value: formatMoney(openValue, currency),
			alert: false,
		},
		{ label: "Leads to work", value: String(openLeads.length), alert: false },
		{ label: "Won deals", value: String(wonDeals.length), alert: false },
		{
			label: "Stalled deals",
			value: String(stalled.length),
			alert: stalled.length > 0,
		},
		{
			label: "Overdue follow-ups",
			value: String(overdue.length),
			alert: overdue.length > 0,
		},
	];

	const loading = deals.isLoading || leads.isLoading || activities.isLoading;
	const errored = deals.isError || leads.isError || activities.isError;

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>CRM</span>
					</div>
					<h1 className="page-title">CRM</h1>
					<p className="page-sub">
						Your sales pipeline — leads, customers, and deals.
					</p>
				</div>
			</div>

			<CrmTabs />

			{loading ? <div className="crm-skeleton" /> : null}
			{errored ? (
				<EmptyState
					compact
					description="Could not load the CRM dashboard. Please try again."
					title="Something went wrong"
				/>
			) : null}

			{loading || errored ? null : (
				<>
					<div className="crm-tiles">
						{tiles.map((t) => (
							<div
								className={`crm-tile ${t.alert ? "alert" : ""}`}
								key={t.label}
							>
								<span className="crm-tile-val">{t.value}</span>
								<span className="crm-tile-lbl">{t.label}</span>
							</div>
						))}
					</div>

					<div className="crm-attention">
						<div className="crm-attention-title">What needs attention</div>
						{overdue.length === 0 &&
						stalled.length === 0 &&
						unassignedLeads.length === 0 ? (
							<div className="crm-sub">Nothing needs attention right now.</div>
						) : null}
						{overdue.slice(0, ATTENTION_LIMIT).map((a) => (
							<div className="crm-attention-row" key={a.id}>
								<span className="crm-badge tone-danger">Overdue</span>
								<span>{a.subject}</span>
							</div>
						))}
						{stalled.slice(0, ATTENTION_LIMIT).map((d) => (
							<div className="crm-attention-row" key={d.id}>
								<span className="crm-badge tone-warning">Stalled</span>
								<Link
									className="crm-name-link"
									params={{ id: d.id }}
									to="/app/crm/deals/$id"
								>
									{d.title}
								</Link>
							</div>
						))}
						{unassignedLeads.slice(0, ATTENTION_LIMIT).map((l) => (
							<div className="crm-attention-row" key={l.id}>
								<span className="crm-badge tone-info">Unassigned lead</span>
								<Link
									className="crm-name-link"
									params={{ id: l.id }}
									to="/app/crm/leads/$id"
								>
									{l.name}
								</Link>
							</div>
						))}
					</div>

					<div className="crm-quicklinks">
						<Link className="crm-quicklink" to="/app/crm/deals">
							<span className="crm-ql-title">Pipeline</span>
							<span className="crm-ql-sub">Work your deals by stage</span>
						</Link>
						<Link className="crm-quicklink" to="/app/crm/leads">
							<span className="crm-ql-title">Leads</span>
							<span className="crm-ql-sub">Qualify and convert new leads</span>
						</Link>
						<Link className="crm-quicklink" to="/app/crm/activities">
							<span className="crm-ql-title">Activities</span>
							<span className="crm-ql-sub">Your follow-ups and tasks</span>
						</Link>
					</div>
				</>
			)}
		</div>
	);
}
