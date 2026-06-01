import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	BadgeCheck,
	Boxes,
	ClipboardCheck,
	FileText,
	KeyRound,
	LogOut,
	ShieldCheck,
	Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useContext } from "react";

import "@/styles/offboarding.css";
import { EmptyState } from "@/components/empty-state";
import { OffboardingTabs } from "@/features/offboarding/offboarding-tabs";
import { canReadOffboardingSettlement, canViewOffboarding } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/offboarding/")({
	component: OffboardingOverview,
});

function OffboardingOverview() {
	const org = useContext(OrgCtx);

	// Employees don't get the HR management overview. Self-service resignation /
	// "my offboarding" ships in a later Phase 10D checkpoint.
	if (!canViewOffboarding(org.memberRole)) {
		return <OffboardingSelfServicePlaceholder />;
	}

	return <OffboardingDashboard />;
}

function useCaseCount(
	status:
		| "pending_approval"
		| "active"
		| "in_clearance"
		| "pending_settlement"
		| "closed"
) {
	return useQuery(
		orpc.offboarding.cases.list.queryOptions({
			input: { status, page: 1, pageSize: 1 },
		})
	);
}

function OffboardingDashboard() {
	const org = useContext(OrgCtx);
	const canSeeSettlement = canReadOffboardingSettlement(org.memberRole);

	const pendingApproval = useCaseCount("pending_approval");
	const active = useCaseCount("active");
	const inClearance = useCaseCount("in_clearance");
	const pendingSettlement = useCaseCount("pending_settlement");
	const closed = useCaseCount("closed");

	const pendingApprovalCount = pendingApproval.data?.total ?? 0;
	const activeCount = active.data?.total ?? 0;
	const inClearanceCount = inClearance.data?.total ?? 0;
	const pendingSettlementCount = pendingSettlement.data?.total ?? 0;
	const closedCount = closed.data?.total ?? 0;

	const isLoading =
		pendingApproval.isLoading ||
		active.isLoading ||
		inClearance.isLoading ||
		pendingSettlement.isLoading;

	const hasAnyActivity =
		pendingApprovalCount +
			activeCount +
			inClearanceCount +
			pendingSettlementCount +
			closedCount >
		0;

	const attention = buildAttention({
		pendingApproval: pendingApprovalCount,
		inClearance: inClearanceCount,
		pendingSettlement: pendingSettlementCount,
		canSeeSettlement,
	});

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Offboarding</span>
					</div>
					<h1 className="page-title">Offboarding</h1>
					<p className="page-sub">
						Manage employee exits, clearance tasks, asset returns, access
						removal, and final readiness.
					</p>
				</div>
			</div>

			<OffboardingTabs />

			<div className="sum-row" style={{ marginBottom: 18 }}>
				<StatTile
					delta="Exits currently being processed"
					label="Active cases"
					loading={active.isLoading}
					value={activeCount}
				/>
				<StatTile
					delta="Resignations awaiting a decision"
					label="Pending approval"
					loading={pendingApproval.isLoading}
					value={pendingApprovalCount}
				/>
				<StatTile
					delta="Working through clearance tasks"
					label="In clearance"
					loading={inClearance.isLoading}
					value={inClearanceCount}
				/>
				<StatTile
					delta="Waiting on final settlement"
					label="Pending settlement"
					loading={pendingSettlement.isLoading}
					value={pendingSettlementCount}
				/>
				<StatTile
					delta="Completed offboardings"
					label="Closed"
					loading={closed.isLoading}
					value={closedCount}
				/>
			</div>

			<div className="card card-pad" style={{ marginBottom: 18 }}>
				<div className="eyebrow" style={{ marginBottom: 12 }}>
					What needs attention
				</div>
				{isLoading && (
					<div style={{ fontSize: 13, color: "var(--fg-3)" }}>Loading…</div>
				)}
				{!(isLoading || hasAnyActivity) && (
					<EmptyState
						compact
						description="When an employee resigns or is offboarded, their case shows up here."
						icon={<LogOut size={20} />}
						secondaryAction={{
							href: "/app/offboarding/templates",
							label: "Open Templates",
						}}
						title="No offboarding activity yet"
					/>
				)}
				{!isLoading && hasAnyActivity && attention.length === 0 && (
					<div style={{ fontSize: 13, color: "var(--fg-3)" }}>
						Nothing needs attention right now — every case is on track.
					</div>
				)}
				{!isLoading && attention.length > 0 && (
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

			<div className="card card-pad">
				<div className="eyebrow" style={{ marginBottom: 12 }}>
					Quick links
				</div>
				<div className="quick-links">
					{QUICK_LINKS.map((link) => (
						<Link className="quick-link" key={link.key} to={link.href}>
							<span className="quick-link-icon">{link.icon}</span>
							<span>{link.label}</span>
							<ArrowRight color="var(--fg-3)" size={14} />
						</Link>
					))}
				</div>
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

type OffboardingHref =
	| "/app/offboarding/cases"
	| "/app/offboarding/templates"
	| "/app/offboarding/tasks"
	| "/app/offboarding/assets"
	| "/app/offboarding/access";

interface AttentionItem {
	description: string;
	href: OffboardingHref;
	icon: ReactNode;
	key: string;
	title: string;
}

function plural(n: number): string {
	return n === 1 ? "" : "s";
}

function buildAttention(inputs: {
	pendingApproval: number;
	inClearance: number;
	pendingSettlement: number;
	canSeeSettlement: boolean;
}): AttentionItem[] {
	const items: AttentionItem[] = [];
	if (inputs.pendingApproval > 0) {
		items.push({
			key: "pending-approval",
			title: `${inputs.pendingApproval} resignation${plural(inputs.pendingApproval)} awaiting approval`,
			description: "Review and approve or decline pending resignations.",
			href: "/app/offboarding/cases",
			icon: <BadgeCheck size={16} />,
		});
	}
	if (inputs.inClearance > 0) {
		items.push({
			key: "in-clearance",
			title: `${inputs.inClearance} case${plural(inputs.inClearance)} in clearance`,
			description:
				"Work through asset returns, access removal, and document collection.",
			href: "/app/offboarding/cases",
			icon: <ClipboardCheck size={16} />,
		});
	}
	if (inputs.pendingSettlement > 0 && inputs.canSeeSettlement) {
		items.push({
			key: "pending-settlement",
			title: `${inputs.pendingSettlement} case${plural(inputs.pendingSettlement)} pending settlement`,
			description: "Confirm final-pay readiness before closing the case.",
			href: "/app/offboarding/cases",
			icon: <Wallet size={16} />,
		});
	}
	return items;
}

interface QuickLink {
	href: OffboardingHref;
	icon: ReactNode;
	key: string;
	label: string;
}

const QUICK_LINKS: QuickLink[] = [
	{
		key: "cases",
		label: "View cases",
		href: "/app/offboarding/cases",
		icon: <LogOut size={16} />,
	},
	{
		key: "templates",
		label: "View templates",
		href: "/app/offboarding/templates",
		icon: <FileText size={16} />,
	},
	{
		key: "tasks",
		label: "View tasks",
		href: "/app/offboarding/tasks",
		icon: <ClipboardCheck size={16} />,
	},
	{
		key: "assets",
		label: "Asset returns",
		href: "/app/offboarding/assets",
		icon: <Boxes size={16} />,
	},
	{
		key: "access",
		label: "Access removal",
		href: "/app/offboarding/access",
		icon: <KeyRound size={16} />,
	},
];

function OffboardingSelfServicePlaceholder() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Offboarding</span>
					</div>
					<h1 className="page-title">Offboarding</h1>
					<p className="page-sub">
						Submit a resignation and track your own exit.
					</p>
				</div>
			</div>

			<div
				className="card card-pad"
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					minHeight: 320,
					textAlign: "center",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 48,
						height: 48,
						marginBottom: 12,
						color: "var(--fg-4)",
						background: "var(--bg-3)",
						borderRadius: 14,
					}}
				>
					<ShieldCheck size={20} />
				</div>
				<div className="eyebrow" style={{ marginBottom: 8 }}>
					Coming later
				</div>
				<div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
					Employee self-service
				</div>
				<p
					style={{
						maxWidth: 420,
						marginTop: 8,
						fontSize: 13.5,
						color: "var(--fg-3)",
					}}
				>
					Submitting a resignation and tracking your own offboarding ships in a
					later Phase 10D checkpoint.
				</p>
			</div>
		</div>
	);
}
