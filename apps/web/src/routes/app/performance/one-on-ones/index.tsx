import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/performance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/performance/badge";
import { OneOnOneForm } from "@/features/performance/one-on-one-form";
import {
	fmtDateTime,
	oneOnOneStatusLabel,
	oneOnOneStatusTone,
} from "@/features/performance/one-on-one-labels";
import type { OneOnOneRow } from "@/features/performance/one-on-one-types";
import { PerformanceTabs } from "@/features/performance/performance-tabs";
import { canRecordOneOnOne, canViewOneOnOnes } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/performance/one-on-ones/")({
	component: OneOnOnesListPage,
});

function OneOnOnesListPage() {
	const org = useContext(OrgCtx);
	const canView = canViewOneOnOnes(org.memberRole);
	const canRecord = canRecordOneOnOne(org.memberRole);
	const [showCreate, setShowCreate] = useState(false);

	const list = useQuery(
		orpc.performance.oneOnOnes.list.queryOptions({
			input: {},
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">1-on-1s</h1>
					</div>
				</div>
				<EmptyState
					action={{ label: "Back to performance", href: "/app/performance" }}
					description="1-on-1s are between you and your manager or your team."
					icon={<MessagesSquare size={28} />}
					title="You don't have access to 1-on-1s"
				/>
			</div>
		);
	}

	const rows = (list.data as OneOnOneRow[] | undefined) ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Performance</span>
					</div>
					<h1 className="page-title">1-on-1s</h1>
					<p className="page-sub">
						{rows.length} meeting{rows.length === 1 ? "" : "s"}
					</p>
				</div>
				{canRecord ? (
					<button
						className="btn btn-primary"
						onClick={() => setShowCreate(true)}
						type="button"
					>
						New 1-on-1
					</button>
				) : null}
			</div>

			<PerformanceTabs />

			{list.isLoading ? <div className="pf-skeleton" /> : null}
			{list.isError ? (
				<EmptyState
					compact
					description="Could not load your 1-on-1s. Try again."
					title="Something went wrong"
				/>
			) : null}
			{!(list.isLoading || list.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="No 1-on-1s yet. Managers can schedule one with a team member."
					title="No 1-on-1s yet"
				/>
			) : null}

			{rows.length > 0 ? (
				<div className="pf-cards">
					{rows.map((m) => (
						<Link
							className="pf-card pf-card-link"
							key={m.id}
							params={{ id: m.id }}
							to="/app/performance/one-on-ones/$id"
						>
							<div className="pf-card-top">
								<span className="pf-name">
									{m.managerName ?? "—"} & {m.employeeName ?? "—"}
								</span>
								<Badge tone={oneOnOneStatusTone(m.status)}>
									{oneOnOneStatusLabel(m.status)}
								</Badge>
							</div>
							<div className="pf-card-meta">
								<span className="pf-sub">{fmtDateTime(m.scheduledAt)}</span>
							</div>
						</Link>
					))}
				</div>
			) : null}

			{showCreate ? (
				<OneOnOneForm onClose={() => setShowCreate(false)} />
			) : null}
		</div>
	);
}
