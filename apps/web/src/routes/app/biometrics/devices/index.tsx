import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Cpu } from "lucide-react";
import { useContext } from "react";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import { BiometricTabs } from "@/features/biometrics/biometric-tabs";
import {
	AdapterStatusBadge,
	BiometricNoAccess,
	TagList,
} from "@/features/biometrics/biometric-ui";
import {
	DEVICE_STATUS_LABEL,
	MODE_LABEL,
	NETWORK_LABEL,
	PUNCH_METHOD_LABEL,
	SYNC_STATUS_LABEL,
	VENDOR_LABEL,
} from "@/features/biometrics/labels";
import { canViewBiometrics } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/biometrics/devices/")({
	component: DevicesListPage,
});

interface DeviceRow {
	capacityLogs: number | null;
	capacityUsers: number | null;
	id: string;
	lastSyncCursor: string | Date | null;
	lastSyncStatus: string | null;
	mode: string;
	model: string | null;
	modelFamily: string | null;
	name: string;
	networkCapabilities: string[];
	status: string;
	supportedPunchMethods: string[];
	vendor: string;
}

function fmtDateTime(value: string | Date | null): string {
	if (!value) {
		return "Never";
	}
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) {
		return "—";
	}
	return d.toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function DevicesListPage() {
	const org = useContext(OrgCtx);
	if (!canViewBiometrics(org.memberRole)) {
		return (
			<BiometricNoAccess
				description="Attendance device management is available to HR and administrators."
				section="Devices"
			/>
		);
	}
	return <DevicesList />;
}

function DevicesList() {
	const devices = useQuery(
		orpc.biometric.devices.list.queryOptions({
			input: { includeInactive: true },
		})
	);
	const rows = (devices.data ?? []) as DeviceRow[];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Biometrics</span>
						<span className="sep">/</span>
						<span>Devices</span>
					</div>
					<h1 className="page-title">Attendance devices</h1>
					<p className="page-sub">
						Registered time clocks and import sources, with their connection
						mode and adapter status.
					</p>
				</div>
			</div>

			<BiometricTabs />

			{devices.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading devices…
				</div>
			)}

			{!devices.isLoading && rows.length === 0 && (
				<div className="card card-pad">
					<EmptyState
						description="Register a time clock or import source to start collecting attendance punches."
						icon={<Cpu size={20} />}
						title="No devices yet"
					/>
				</div>
			)}

			{!devices.isLoading && rows.length > 0 && (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
						gap: 14,
					}}
				>
					{rows.map((d) => (
						<DeviceCard device={d} key={d.id} />
					))}
				</div>
			)}
		</div>
	);
}

function DeviceCard({ device }: { device: DeviceRow }) {
	return (
		<Link
			className="card card-pad"
			params={{ id: device.id }}
			style={{ textDecoration: "none", color: "var(--fg)", display: "block" }}
			to="/app/biometrics/devices/$id"
		>
			<div
				style={{
					display: "flex",
					alignItems: "flex-start",
					justifyContent: "space-between",
					gap: 10,
					marginBottom: 10,
				}}
			>
				<div>
					<div style={{ fontSize: 14.5, fontWeight: 600 }}>{device.name}</div>
					<div style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 2 }}>
						{VENDOR_LABEL[device.vendor] ?? device.vendor}
						{device.model ? ` · ${device.model}` : ""}
						{device.modelFamily ? ` (${device.modelFamily})` : ""}
					</div>
				</div>
				<AdapterStatusBadge mode={device.mode} vendor={device.vendor} />
			</div>

			<dl className="bio-kv" style={{ gridTemplateColumns: "120px 1fr" }}>
				<dt>Connection</dt>
				<dd>{MODE_LABEL[device.mode] ?? device.mode}</dd>
				<dt>Status</dt>
				<dd>{DEVICE_STATUS_LABEL[device.status] ?? device.status}</dd>
				<dt>Last sync</dt>
				<dd>
					{fmtDateTime(device.lastSyncCursor)}
					{device.lastSyncCursor && device.lastSyncStatus
						? ` · ${SYNC_STATUS_LABEL[device.lastSyncStatus] ?? device.lastSyncStatus}`
						: ""}
				</dd>
				{(device.capacityUsers || device.capacityLogs) && (
					<>
						<dt>Capacity</dt>
						<dd>
							{device.capacityUsers
								? `${device.capacityUsers.toLocaleString()} users`
								: ""}
							{device.capacityUsers && device.capacityLogs ? " · " : ""}
							{device.capacityLogs
								? `${device.capacityLogs.toLocaleString()} logs`
								: ""}
						</dd>
					</>
				)}
			</dl>

			<div style={{ marginTop: 10 }}>
				<div style={{ fontSize: 11.5, color: "var(--fg-3)", marginBottom: 4 }}>
					Punch methods
				</div>
				<TagList
					items={device.supportedPunchMethods}
					map={PUNCH_METHOD_LABEL}
				/>
			</div>
			<div style={{ marginTop: 8 }}>
				<div style={{ fontSize: 11.5, color: "var(--fg-3)", marginBottom: 4 }}>
					Connectivity
				</div>
				<TagList items={device.networkCapabilities} map={NETWORK_LABEL} />
			</div>

			<div
				style={{
					marginTop: 12,
					fontSize: 12.5,
					fontWeight: 500,
					color: "var(--accent, var(--fg-2))",
				}}
			>
				View details →
			</div>
		</Link>
	);
}
