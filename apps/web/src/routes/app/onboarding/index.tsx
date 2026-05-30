import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	ClipboardList,
	UserPlus,
} from "lucide-react";
import type { ReactNode } from "react";
import { useContext } from "react";

import "@/styles/onboarding.css";
import { EmptyState } from "@/components/empty-state";
import { MyOnboarding } from "@/features/onboarding/my-onboarding";
import { OnboardingTabs } from "@/features/onboarding/onboarding-tabs";
import { canViewOnboarding } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/onboarding/")({
	component: OnboardingOverview,
});

function OnboardingOverview() {
	const org = useContext(OrgCtx);

	// Employees get their own self-service onboarding view (Phase 9G checkpoint
	// 6); staff (HR/admin/manager/auditor/recruiter) get the admin overview.
	if (!canViewOnboarding(org.memberRole)) {
		return <MyOnboarding />;
	}

	return <OnboardingDashboard />;
}

function OnboardingDashboard() {
	const active = useQuery(
		orpc.onboarding.employeeOnboarding.list.queryOptions({
			input: { status: "in_progress", page: 1, pageSize: 1 },
		})
	);
	const notStarted = useQuery(
		orpc.onboarding.employeeOnboarding.list.queryOptions({
			input: { status: "not_started", page: 1, pageSize: 1 },
		})
	);
	const blocked = useQuery(
		orpc.onboarding.employeeOnboarding.list.queryOptions({
			input: { status: "blocked", page: 1, pageSize: 1 },
		})
	);
	const completed = useQuery(
		orpc.onboarding.employeeOnboarding.list.queryOptions({
			input: { status: "completed", page: 1, pageSize: 1 },
		})
	);
	const templates = useQuery(
		orpc.onboarding.templates.list.queryOptions({
			input: { page: 1, pageSize: 1 },
		})
	);

	const activeCount = active.data?.total ?? 0;
	const notStartedCount = notStarted.data?.total ?? 0;
	const blockedCount = blocked.data?.total ?? 0;
	const completedCount = completed.data?.total ?? 0;
	const templatesCount = templates.data?.total ?? 0;

	const isLoading =
		active.isLoading ||
		notStarted.isLoading ||
		blocked.isLoading ||
		completed.isLoading;
	const hasAnyActivity =
		activeCount + notStartedCount + blockedCount + completedCount > 0;

	const attention = buildAttention({
		active: activeCount,
		notStarted: notStartedCount,
		blocked: blockedCount,
		templates: templatesCount,
	});

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Onboarding</span>
					</div>
					<h1 className="page-title">Onboarding</h1>
					<p className="page-sub">
						New-hire onboarding at a glance — who's in progress, blocked, or
						done.
					</p>
				</div>
			</div>

			<OnboardingTabs />

			<div className="sum-row" style={{ marginBottom: 18 }}>
				<StatTile
					delta="Currently being onboarded"
					label="In progress"
					loading={active.isLoading}
					value={activeCount}
				/>
				<StatTile
					delta="Started but no tasks done yet"
					label="Not started"
					loading={notStarted.isLoading}
					value={notStartedCount}
				/>
				<StatTile
					delta="Waiting on a blocked task"
					label="Blocked"
					loading={blocked.isLoading}
					value={blockedCount}
				/>
				<StatTile
					delta="Onboardings finished"
					label="Completed"
					loading={completed.isLoading}
					value={completedCount}
				/>
			</div>

			<div className="card card-pad">
				<div className="eyebrow" style={{ marginBottom: 12 }}>
					What needs attention
				</div>
				{isLoading && (
					<div style={{ fontSize: 13, color: "var(--fg-3)" }}>Loading…</div>
				)}
				{!(isLoading || hasAnyActivity) && (
					<EmptyState
						compact
						description="Create a template, then start onboarding for a new hire."
						icon={<ClipboardList size={20} />}
						secondaryAction={{
							href: "/app/onboarding/templates",
							label: "Open Templates",
						}}
						title="No onboarding activity yet"
					/>
				)}
				{!isLoading && hasAnyActivity && (
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{attention.map((item) => (
							<Link
								className="next-step"
								key={item.key}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									gap: 16,
									padding: "12px 14px",
									textDecoration: "none",
									color: "var(--fg)",
									background: "var(--bg-2)",
									border: "1px solid var(--line)",
									borderRadius: 12,
								}}
								to={item.href}
							>
								<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											width: 32,
											height: 32,
											color: "var(--fg-2)",
											background: "var(--bg-3)",
											borderRadius: 10,
										}}
									>
										{item.icon}
									</div>
									<div>
										<div style={{ fontSize: 13.5, fontWeight: 600 }}>
											{item.title}
										</div>
										<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
											{item.description}
										</div>
									</div>
								</div>
								<ArrowRight color="var(--fg-3)" size={16} />
							</Link>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

interface StatTileProps {
	delta: string;
	label: string;
	loading: boolean;
	value: number;
}

function StatTile({ delta, label, loading, value }: StatTileProps) {
	return (
		<div className="sum-card">
			<span className="lbl">{label}</span>
			<span className="val">{loading ? "…" : value}</span>
			<span className="delta">{delta}</span>
		</div>
	);
}

interface AttentionItem {
	description: string;
	href: "/app/onboarding/employees" | "/app/onboarding/templates";
	icon: ReactNode;
	key: string;
	title: string;
}

function buildAttention(inputs: {
	active: number;
	notStarted: number;
	blocked: number;
	templates: number;
}): AttentionItem[] {
	const items: AttentionItem[] = [];
	if (inputs.blocked > 0) {
		items.push({
			key: "blocked",
			title: `${inputs.blocked} onboarding${inputs.blocked === 1 ? "" : "s"} blocked`,
			description: "Clear the blocking task so the new hire can continue.",
			href: "/app/onboarding/employees",
			icon: <AlertTriangle size={16} />,
		});
	}
	if (inputs.notStarted > 0) {
		items.push({
			key: "not-started",
			title: `${inputs.notStarted} onboarding${inputs.notStarted === 1 ? "" : "s"} not started`,
			description: "Kick off the first tasks for these new hires.",
			href: "/app/onboarding/employees",
			icon: <UserPlus size={16} />,
		});
	}
	if (inputs.active > 0) {
		items.push({
			key: "active",
			title: `${inputs.active} onboarding${inputs.active === 1 ? "" : "s"} in progress`,
			description: "Review progress and keep tasks moving.",
			href: "/app/onboarding/employees",
			icon: <ClipboardList size={16} />,
		});
	}
	if (inputs.templates === 0) {
		items.push({
			key: "templates",
			title: "No onboarding templates yet",
			description: "Create a reusable checklist to start onboarding faster.",
			href: "/app/onboarding/templates",
			icon: <CheckCircle2 size={16} />,
		});
	}
	return items;
}
