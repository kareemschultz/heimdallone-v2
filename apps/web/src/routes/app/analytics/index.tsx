import { StatTile, StatTileGrid } from "@Heimdallone/ui/components/stat-tile";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Banknote,
	BarChart3,
	Briefcase,
	Download,
	FolderKanban,
	Handshake,
	LifeBuoy,
	PiggyBank,
	TrendingUp,
	Users,
} from "lucide-react";
import { useContext } from "react";

import "@/styles/analytics.css";
import { EmptyState } from "@/components/empty-state";
import { BarList, type BarListItem } from "@/features/analytics/bar-list";
import { formatMoneyCompact, formatNumber } from "@/features/analytics/labels";
import type {
	AttentionItem,
	ExecutiveSummary,
	PayrollTrendBucket,
	PipelineStageRow,
	TrendBucket,
	WorkforceMixRow,
} from "@/features/analytics/types";
import { canExportAnalytics, canViewAnalytics } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/analytics/")({
	component: AnalyticsDashboardPage,
});

function currentYearRange(): { from: string; to: string } {
	const year = new Date().getFullYear();
	return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function downloadCsv(filename: string, csv: string) {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function AttentionFeed({
	items,
	isError,
}: {
	items: AttentionItem[];
	isError: boolean;
}) {
	if (isError) {
		return (
			<p className="an-empty">Couldn't load the attention feed — try again.</p>
		);
	}
	if (items.length === 0) {
		return <p className="an-empty">Nothing needs attention right now. 🎉</p>;
	}
	return (
		<div className="an-attention">
			{items.map((item) => (
				<div className="an-attention-row" key={`${item.source}-${item.label}`}>
					<span className="an-attention-count">{formatNumber(item.count)}</span>
					<span className="an-attention-label">{item.label}</span>
					<span className="an-attention-source">{item.source}</span>
				</div>
			))}
		</div>
	);
}

function NoAccess() {
	return (
		<div className="page">
			<div className="page-header">
				<h1 className="page-title">Analytics</h1>
			</div>
			<EmptyState
				description="The executive dashboard is available to administrators, payroll, auditors, and team managers."
				icon={<BarChart3 size={28} />}
				title="You don't have access to Analytics"
			/>
		</div>
	);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a dashboard composes many independently-gated read widgets; splitting would scatter its six queries.
function AnalyticsDashboardPage() {
	const org = useContext(OrgCtx);
	const canView = canViewAnalytics(org.memberRole);
	const canExport = canExportAnalytics(org.memberRole);
	const range = currentYearRange();

	const summary = useQuery(
		orpc.analytics.executive.summary.queryOptions({
			input: range,
			enabled: canView,
		})
	);
	const pipeline = useQuery(
		orpc.analytics.executive.pipelineByStage.queryOptions({
			input: {},
			enabled: canView,
		})
	);
	const workforce = useQuery(
		orpc.analytics.executive.workforceMix.queryOptions({
			input: {},
			enabled: canView,
		})
	);
	const headcountTrend = useQuery(
		orpc.analytics.executive.headcountTrend.queryOptions({
			input: { months: 12 },
			enabled: canView,
		})
	);
	const payrollTrend = useQuery(
		orpc.analytics.executive.payrollCostTrend.queryOptions({
			input: range,
			enabled: canView,
		})
	);
	const attention = useQuery(
		orpc.analytics.executive.attentionFeed.queryOptions({
			input: {},
			enabled: canView,
		})
	);

	if (!canView) {
		return <NoAccess />;
	}

	const data = summary.data as ExecutiveSummary | undefined;
	const currency = data?.currency ?? "GYD";
	const pipelineRows = (pipeline.data as PipelineStageRow[] | undefined) ?? [];
	const workforceRows = (workforce.data as WorkforceMixRow[] | undefined) ?? [];
	const hcRows = (headcountTrend.data as TrendBucket[] | undefined) ?? [];
	const payRows = (payrollTrend.data as PayrollTrendBucket[] | undefined) ?? [];

	const pipelineBars: BarListItem[] = pipelineRows.map((r) => ({
		key: r.stage,
		label: r.stage,
		value: r.value,
		display: `${formatMoneyCompact(r.value, currency)} · ${r.count}`,
	}));
	const workforceBars: BarListItem[] = workforceRows.map((r) => ({
		key: r.department,
		label: r.department,
		value: r.count,
		display: formatNumber(r.count),
	}));
	const headcountBars: BarListItem[] = hcRows.map((r) => ({
		key: r.period,
		label: r.period,
		value: r.count,
		display: formatNumber(r.count),
	}));
	const payrollBars: BarListItem[] = payRows.map((r) => ({
		key: r.period,
		label: r.period,
		value: r.total,
		display: formatMoneyCompact(r.total, currency),
	}));

	async function handleExport() {
		const res = (await client.analytics.export.summaryCsv(range)) as {
			filename: string;
			content: string;
		};
		downloadCsv(res.filename, res.content);
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Analytics</span>
					</div>
					<h1 className="page-title">Executive overview</h1>
					<p className="page-sub">
						A cross-module roll-up of people, payroll, operations, and sales —{" "}
						{new Date().getFullYear()} to date.
					</p>
				</div>
				{canExport && (
					<button
						className="btn btn-outline"
						onClick={handleExport}
						type="button"
					>
						<Download size={15} /> Export CSV
					</button>
				)}
			</div>

			{data?.scoped && (
				<div className="an-note">
					You're seeing your team's departments only. Org-wide figures are
					available to administrators, payroll, and auditors.
				</div>
			)}

			{summary.isError && (
				<EmptyState
					compact
					description="Could not load the executive summary. Please try again."
					title="Something went wrong"
				/>
			)}

			<StatTileGrid className="an-kpis" min={200}>
				<StatTile
					icon={Users}
					isLoading={summary.isLoading}
					label="Headcount"
					tone="primary"
					value={formatNumber(data?.headcount ?? 0)}
				/>
				<StatTile
					icon={Briefcase}
					isLoading={summary.isLoading}
					label="Active contracts"
					value={formatNumber(data?.activeContracts ?? 0)}
				/>
				<StatTile
					hint="generated payroll cost"
					icon={Banknote}
					isLoading={summary.isLoading}
					label="Payroll cost"
					value={formatMoneyCompact(data?.payrollCost ?? 0, currency)}
				/>
				<StatTile
					icon={PiggyBank}
					isLoading={summary.isLoading}
					label="Employer contributions"
					value={formatMoneyCompact(data?.employerContributions ?? 0, currency)}
				/>
				<StatTile
					hint={`${formatNumber(data?.overdueHelpdesk ?? 0)} overdue`}
					icon={LifeBuoy}
					isLoading={summary.isLoading}
					label="Open helpdesk"
					tone={data && data.overdueHelpdesk > 0 ? "warning" : "default"}
					value={formatNumber(data?.openHelpdesk ?? 0)}
				/>
				<StatTile
					hint={`${formatNumber(data?.atRiskProjects ?? 0)} at risk`}
					icon={FolderKanban}
					isLoading={summary.isLoading}
					label="Active projects"
					tone={data && data.atRiskProjects > 0 ? "warning" : "default"}
					value={formatNumber(data?.activeProjects ?? 0)}
				/>
				<StatTile
					icon={Handshake}
					isLoading={summary.isLoading}
					label="Open deals"
					value={formatNumber(data?.openDeals ?? 0)}
				/>
				<StatTile
					icon={TrendingUp}
					isLoading={summary.isLoading}
					label="Pipeline value"
					tone="primary"
					value={formatMoneyCompact(data?.pipelineValue ?? 0, currency)}
				/>
			</StatTileGrid>

			<div className="an-section">
				<div className="an-section-title">Needs attention</div>
				<AttentionFeed
					isError={attention.isError}
					items={attention.data ?? []}
				/>
			</div>

			<div className="an-grid-2">
				<div className="an-section">
					<div className="an-section-title">Pipeline by stage</div>
					<BarList emptyLabel="No open deals." items={pipelineBars} />
				</div>
				<div className="an-section">
					<div className="an-section-title">Workforce by department</div>
					<BarList emptyLabel="No active employees." items={workforceBars} />
				</div>
				<div className="an-section">
					<div className="an-section-title">Headcount trend (12 mo)</div>
					<BarList emptyLabel="No headcount history." items={headcountBars} />
				</div>
				<div className="an-section">
					<div className="an-section-title">Payroll cost by period</div>
					<BarList
						emptyLabel="No generated payroll this year."
						items={payrollBars}
					/>
				</div>
			</div>

			<p className="an-foot">
				Figures are computed live from each module — Analytics reads, never
				writes. Payroll cost reflects generated payslips (gross + employer
				contributions), not cash disbursed.
			</p>
		</div>
	);
}
