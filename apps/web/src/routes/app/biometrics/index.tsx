import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ArrowRight,
	Clock3,
	Cpu,
	FileWarning,
	MapPin,
	RefreshCw,
	UserX,
} from "lucide-react";
import type { ReactNode } from "react";
import { useContext } from "react";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import { BiometricTabs } from "@/features/biometrics/biometric-tabs";
import { deviceAdapterStatus } from "@/features/biometrics/labels";
import { canViewBiometrics } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/biometrics/")({
	component: BiometricsOverview,
});

function BiometricsOverview() {
	const org = useContext(OrgCtx);
	if (!canViewBiometrics(org.memberRole)) {
		return <OverviewNoAccess />;
	}
	return <OverviewDashboard />;
}

function OverviewNoAccess() {
	return (
		<div className="page">
			<PageHeader />
			<div className="card card-pad">
				<EmptyState
					description="Biometric & time-clock device management is available to HR and administrators. If you clock in from your phone, use the attendance check-in screen instead."
					icon={<Cpu size={20} />}
					title="You don't have access to device management"
				/>
			</div>
		</div>
	);
}

function PageHeader() {
	return (
		<div className="page-header">
			<div>
				<div className="crumbs">
					<span>Heimdallone</span>
					<span className="sep">/</span>
					<span>Biometrics</span>
				</div>
				<h1 className="page-title">Biometrics &amp; time clocks</h1>
				<p className="page-sub">
					Manage attendance devices, imports, synced punches, and
					mobile/geofence attendance sources.
				</p>
			</div>
		</div>
	);
}

interface DeviceRow {
	id: string;
	mode: string;
	status: string;
	vendor: string;
}

function OverviewDashboard() {
	const devices = useQuery(
		orpc.biometric.devices.list.queryOptions({
			input: { includeInactive: true },
		})
	);
	const syncRuns = useQuery(
		orpc.biometric.syncRuns.list.queryOptions({ input: { limit: 50 } })
	);
	const pending = useQuery(
		orpc.biometric.punches.list.queryOptions({
			input: { status: "pending", limit: 500 },
		})
	);
	const unmapped = useQuery(
		orpc.biometric.punches.list.queryOptions({
			input: { status: "unmapped", limit: 500 },
		})
	);
	const openExceptions = useQuery(
		orpc.biometric.exceptions.list.queryOptions({
			input: { status: "open", limit: 500 },
		})
	);

	const deviceRows = (devices.data ?? []) as DeviceRow[];
	const activeDevices = deviceRows.filter((d) => d.status === "active").length;
	const plannedDevices = deviceRows.filter(
		(d) => deviceAdapterStatus(d.vendor, d.mode) === "planned"
	).length;
	const runRows = syncRuns.data ?? [];
	const failedRuns = runRows.filter(
		(r) => r.status === "failed" || r.status === "partial"
	).length;
	const pendingCount = pending.data?.length ?? 0;
	const unmappedCount = unmapped.data?.length ?? 0;
	const openCount = openExceptions.data?.length ?? 0;

	const attention = buildAttention({
		unmapped: unmappedCount,
		failedRuns,
		pending: pendingCount,
		open: openCount,
		planned: plannedDevices,
	});

	return (
		<div className="page">
			<PageHeader />
			<BiometricTabs />

			<div className="sum-row" style={{ marginBottom: 18 }}>
				<StatTile
					delta="Devices currently in service"
					label="Active devices"
					loading={devices.isLoading}
					value={activeDevices}
				/>
				<StatTile
					delta="Imports & API ingests (recent)"
					label="Sync runs"
					loading={syncRuns.isLoading}
					value={runRows.length}
				/>
				<StatTile
					delta="Punches awaiting processing"
					label="Pending punches"
					loading={pending.isLoading}
					value={pendingCount}
				/>
				<StatTile
					delta="Need review/resolution"
					label="Open exceptions"
					loading={openExceptions.isLoading}
					value={openCount}
				/>
				<StatTile
					delta="Live sync not built yet"
					label="Planned adapters"
					loading={devices.isLoading}
					value={plannedDevices}
				/>
			</div>

			<div className="card card-pad" style={{ marginBottom: 18 }}>
				<div className="eyebrow" style={{ marginBottom: 12 }}>
					What needs attention
				</div>
				{attention.length === 0 ? (
					<div style={{ fontSize: 13, color: "var(--fg-3)" }}>
						Nothing needs attention right now.
					</div>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{attention.map((item) => (
							<AttentionRow item={item} key={item.key} />
						))}
					</div>
				)}
			</div>

			<div className="card card-pad">
				<div className="eyebrow" style={{ marginBottom: 12 }}>
					Quick links
				</div>
				<div className="quick-links">
					<Link className="quick-link" to="/app/biometrics/devices">
						<span className="quick-link-icon">
							<Cpu size={16} />
						</span>
						<span>Devices</span>
						<ArrowRight color="var(--fg-3)" size={14} />
					</Link>
					<Link className="quick-link" to="/app/biometrics/sync-runs">
						<span className="quick-link-icon">
							<RefreshCw size={16} />
						</span>
						<span>Sync runs</span>
						<ArrowRight color="var(--fg-3)" size={14} />
					</Link>
					<Link className="quick-link" to="/app/biometrics/punches">
						<span className="quick-link-icon">
							<FileWarning size={16} />
						</span>
						<span>Punches</span>
						<ArrowRight color="var(--fg-3)" size={14} />
					</Link>
					<a className="quick-link" href="/app/geofencing">
						<span className="quick-link-icon">
							<MapPin size={16} />
						</span>
						<span>Geofencing (coming soon)</span>
						<ArrowRight color="var(--fg-3)" size={14} />
					</a>
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

type BioHref =
	| "/app/biometrics/devices"
	| "/app/biometrics/sync-runs"
	| "/app/biometrics/punches";

interface AttentionItem {
	description: string;
	href: BioHref;
	icon: ReactNode;
	key: string;
	title: string;
}

function plural(n: number): string {
	return n === 1 ? "" : "s";
}

function buildAttention(i: {
	unmapped: number;
	failedRuns: number;
	pending: number;
	open: number;
	planned: number;
}): AttentionItem[] {
	const items: AttentionItem[] = [];
	if (i.unmapped > 0) {
		items.push({
			key: "unmapped",
			title: `${i.unmapped} unmapped device-user ${i.unmapped === 1 ? "punch" : "punches"}`,
			description: "Map the device user id to an employee, then reprocess.",
			href: "/app/biometrics/punches",
			icon: <UserX size={16} />,
		});
	}
	if (i.failedRuns > 0) {
		items.push({
			key: "failed-runs",
			title: `${i.failedRuns} sync run${plural(i.failedRuns)} failed or partial`,
			description: "Review the import errors and retry if needed.",
			href: "/app/biometrics/sync-runs",
			icon: <AlertTriangle size={16} />,
		});
	}
	if (i.pending > 0) {
		items.push({
			key: "pending",
			title: `${i.pending} ${i.pending === 1 ? "punch" : "punches"} pending processing`,
			description: "Run the processor to turn punches into attendance.",
			href: "/app/biometrics/punches",
			icon: <FileWarning size={16} />,
		});
	}
	if (i.open > 0) {
		items.push({
			key: "open-exceptions",
			title: `${i.open} open attendance exception${plural(i.open)}`,
			description: "Resolve or dismiss exceptions in the review queue.",
			href: "/app/biometrics/punches",
			icon: <AlertTriangle size={16} />,
		});
	}
	if (i.planned > 0) {
		items.push({
			key: "planned",
			title: `${i.planned} device${plural(i.planned)} on planned-only adapters`,
			description:
				"Live sync isn't built for these yet — use CSV/app/USB import meanwhile.",
			href: "/app/biometrics/devices",
			icon: <Clock3 size={16} />,
		});
	}
	return items;
}

function AttentionRow({ item }: { item: AttentionItem }) {
	return (
		<Link
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
					<div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.title}</div>
					<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
						{item.description}
					</div>
				</div>
			</div>
			<ArrowRight color="var(--fg-3)" size={16} />
		</Link>
	);
}
