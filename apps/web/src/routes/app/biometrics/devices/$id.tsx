import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Cpu, KeyRound, ShieldCheck, Upload } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import {
	BiometricNoAccess,
	DeviceConnectionBadge,
	TagList,
} from "@/features/biometrics/biometric-ui";
import { ImportPunchesDialog } from "@/features/biometrics/import-punches-dialog";
import {
	DEVICE_STATUS_LABEL,
	deviceAdapterStatus,
	MODE_LABEL,
	NETWORK_LABEL,
	PUNCH_DIRECTION_LABEL,
	PUNCH_METHOD_LABEL,
	PUNCH_STATUS_LABEL,
	SYNC_MODE_LABEL,
	SYNC_STATUS_LABEL,
	VENDOR_LABEL,
	VERIFY_MODE_LABEL,
} from "@/features/biometrics/labels";
import { canManageBiometrics, canViewBiometrics } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/biometrics/devices/$id")({
	component: DeviceDetailPage,
});

function fmtDateTime(value: string | Date | null | undefined): string {
	if (!value) {
		return "—";
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

function useDeviceDetail(id: string) {
	const detail = useQuery(
		orpc.biometric.devices.getById.queryOptions({ input: { id }, retry: false })
	);
	const visible = Boolean(detail.data);
	const mappings = useQuery(
		orpc.biometric.mappings.list.queryOptions({
			input: { deviceId: id },
			enabled: visible,
		})
	);
	const syncRuns = useQuery(
		orpc.biometric.syncRuns.list.queryOptions({
			input: { deviceId: id, limit: 10 },
			enabled: visible,
		})
	);
	const punches = useQuery(
		orpc.biometric.punches.list.queryOptions({
			input: { deviceId: id, limit: 15 },
			enabled: visible,
		})
	);
	return { detail, mappings, syncRuns, punches };
}

function DeviceDetailPage() {
	const org = useContext(OrgCtx);
	if (!canViewBiometrics(org.memberRole)) {
		return (
			<BiometricNoAccess
				description="Attendance device management is available to HR and administrators."
				section="Device"
			/>
		);
	}
	return <DeviceDetail canManage={canManageBiometrics(org.memberRole)} />;
}

interface AdapterInfo {
	capabilities: string[];
	connection: { detail: string; live: boolean; mode: string };
	displayName: string;
	providerKey: string;
	status: string;
	supportedModes: string[];
}

function DeviceDetail({ canManage }: { canManage: boolean }) {
	const { id } = useParams({ from: "/app/biometrics/devices/$id" });
	const { detail, mappings, syncRuns, punches } = useDeviceDetail(id);
	const [showImport, setShowImport] = useState(false);

	if (detail.isLoading) {
		return (
			<div className="page">
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading device…
				</div>
			</div>
		);
	}

	if (!detail.data) {
		return (
			<div className="page">
				<div className="card card-pad">
					<EmptyState
						description="This device may have been removed, or you don't have access to it."
						icon={<Cpu size={20} />}
						title="Device not available"
					/>
					<div style={{ textAlign: "center", marginTop: 8 }}>
						<Link to="/app/biometrics/devices">← Back to devices</Link>
					</div>
				</div>
			</div>
		);
	}

	const device = detail.data.device as Record<string, unknown> & {
		id: string;
		mode: string;
		name: string;
		vendor: string;
	};
	const adapter = detail.data.adapter as AdapterInfo;
	const planned = deviceAdapterStatus(device.vendor, device.mode) === "planned";

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<Link to="/app/biometrics/devices">Devices</Link>
						<span className="sep">/</span>
						<span>{device.name}</span>
					</div>
					<h1 className="page-title">{device.name}</h1>
					<p className="page-sub">
						{VENDOR_LABEL[device.vendor] ?? device.vendor}
						{device.model ? ` · ${device.model as string}` : ""} —{" "}
						{DEVICE_STATUS_LABEL[device.status as string] ?? "—"}
					</p>
					<div style={{ marginTop: 8 }}>
						<DeviceConnectionBadge
							lastSyncCursor={device.lastSyncCursor as string | Date | null}
							lastSyncStatus={device.lastSyncStatus as string | null}
							mode={device.mode as string}
							status={device.status as string}
						/>
					</div>
				</div>
				{canManage && (
					<button
						className="btn btn-primary btn-sm"
						onClick={() => setShowImport(true)}
						type="button"
					>
						<Upload size={14} /> Import punches
					</button>
				)}
			</div>

			<ConnectionSection adapter={adapter} device={device} planned={planned} />
			<VendorGuidance adapter={adapter} vendor={device.vendor} />
			<CapabilitiesSection device={device} />
			<MappingsSection
				loading={mappings.isLoading}
				rows={mappings.data ?? []}
			/>
			<SyncRunsSection
				loading={syncRuns.isLoading}
				rows={syncRuns.data ?? []}
			/>
			<PunchesSection loading={punches.isLoading} rows={punches.data ?? []} />
			<SecurityNotes />

			{showImport && (
				<ImportPunchesDialog
					adapterLabel={adapter.displayName}
					deviceId={device.id}
					deviceName={device.name}
					onClose={() => setShowImport(false)}
					onImported={() => {
						mappings.refetch();
						syncRuns.refetch();
						punches.refetch();
					}}
				/>
			)}
		</div>
	);
}

function SectionTitle({ children }: { children: string }) {
	return (
		<div className="eyebrow" style={{ marginBottom: 12 }}>
			{children}
		</div>
	);
}

function ConnectionSection({
	device,
	adapter,
	planned,
}: {
	adapter: AdapterInfo;
	device: Record<string, unknown> & { mode: string };
	planned: boolean;
}) {
	return (
		<div className="bio-section">
			<SectionTitle>Connection &amp; adapter</SectionTitle>
			<dl className="bio-kv">
				<dt>Connection mode</dt>
				<dd>{MODE_LABEL[device.mode] ?? device.mode}</dd>
				<dt>Adapter</dt>
				<dd>{adapter.displayName}</dd>
				<dt>Live sync</dt>
				<dd>
					{adapter.connection.live ? (
						"Available"
					) : (
						<span style={{ color: "var(--fg-2)" }}>
							{planned
								? "Planned — not available yet"
								: "Not used (file import)"}
						</span>
					)}
				</dd>
				<dt>Status detail</dt>
				<dd style={{ color: "var(--fg-2)" }}>{adapter.connection.detail}</dd>
				{Boolean(device.host) && (
					<>
						<dt>Host</dt>
						<dd>
							{device.host as string}
							{device.port ? `:${device.port as number}` : ""}
						</dd>
					</>
				)}
				<dt>Time zone</dt>
				<dd>{(device.timeZone as string) ?? "—"}</dd>
			</dl>
		</div>
	);
}

function VendorGuidance({
	vendor,
	adapter,
}: {
	adapter: AdapterInfo;
	vendor: string;
}) {
	let guidance: string | null = null;
	if (adapter.providerKey === "zkteco_tcp") {
		guidance =
			"Planned integration. Native TCP/IP pull isn't built into the server. Use the external sync-agent (API ingest) or CSV import meanwhile — no live sync runs here yet.";
	} else if (adapter.providerKey === "zkteco_adms") {
		guidance =
			"Planned integration. ADMS/iClock push receiver isn't built yet. Use API ingest or CSV import meanwhile — no live sync runs here yet.";
	} else if (adapter.providerKey === "ngteco_cloud") {
		guidance =
			"Use the NGTeco app/web export or a supported import path. Live cloud-API sync requires vendor verification and production secret storage — it isn't enabled yet.";
	} else if (vendor === "ngteco") {
		guidance =
			"Export attendance logs from the device (app/web or USB) and import them here. There is no live device connection.";
	}
	if (!guidance) {
		return null;
	}
	return (
		<div className="bio-section">
			<SectionTitle>How to get punches from this device</SectionTitle>
			<p style={{ fontSize: 13, color: "var(--fg-2)", margin: 0 }}>
				{guidance}
			</p>
		</div>
	);
}

function flag(v: unknown): string {
	return v ? "Yes" : "No";
}

function CapabilitiesSection({ device }: { device: Record<string, unknown> }) {
	return (
		<div className="bio-section">
			<SectionTitle>Capabilities</SectionTitle>
			<dl className="bio-kv">
				<dt>Punch methods</dt>
				<dd>
					<TagList
						items={device.supportedPunchMethods as string[]}
						map={PUNCH_METHOD_LABEL}
					/>
				</dd>
				<dt>Connectivity</dt>
				<dd>
					<TagList
						items={device.networkCapabilities as string[]}
						map={NETWORK_LABEL}
					/>
				</dd>
				<dt>Capacity</dt>
				<dd>
					{device.capacityUsers
						? `${(device.capacityUsers as number).toLocaleString()} users`
						: "—"}
					{device.capacityUsers && device.capacityLogs ? " · " : ""}
					{device.capacityLogs
						? `${(device.capacityLogs as number).toLocaleString()} logs`
						: ""}
				</dd>
				<dt>Offline logs</dt>
				<dd>{flag(device.supportsOfflineLogs)}</dd>
				<dt>Cloud sync</dt>
				<dd>{flag(device.supportsCloudSync)}</dd>
				<dt>Mobile app</dt>
				<dd>{flag(device.supportsMobileApp)}</dd>
				<dt>Subscription for advanced features</dt>
				<dd>{flag(device.requiresSubscriptionForAdvancedFeatures)}</dd>
			</dl>
		</div>
	);
}

interface MappingRow {
	deviceUserId: string;
	employeeFirstName: string | null;
	employeeLastName: string | null;
	id: string;
}

function MappingsSection({
	rows,
	loading,
}: {
	loading: boolean;
	rows: MappingRow[];
}) {
	return (
		<div className="bio-section">
			<SectionTitle>Employee mappings</SectionTitle>
			{loading && (
				<div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>
			)}
			{!loading && rows.length === 0 && (
				<div style={{ color: "var(--fg-3)", fontSize: 13 }}>
					No device-user mappings yet. Unmapped punches are quarantined until a
					mapping is added.
				</div>
			)}
			{!loading && rows.length > 0 && (
				<table className="tbl">
					<thead>
						<tr>
							<th>Device user id</th>
							<th>Employee</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((m) => (
							<tr key={m.id}>
								<td>{m.deviceUserId}</td>
								<td>
									{m.employeeFirstName
										? `${m.employeeFirstName}${m.employeeLastName ? ` ${m.employeeLastName}` : ""}`
										: "—"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

interface SyncRunRow {
	id: string;
	mode: string;
	punchesCreated: number;
	punchesDuplicate: number;
	punchesError: number;
	startedAt: string | Date;
	status: string;
}

function SyncRunsSection({
	rows,
	loading,
}: {
	loading: boolean;
	rows: SyncRunRow[];
}) {
	return (
		<div className="bio-section">
			<SectionTitle>Recent sync runs</SectionTitle>
			{loading && (
				<div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>
			)}
			{!loading && rows.length === 0 && (
				<div style={{ color: "var(--fg-3)", fontSize: 13 }}>
					No sync runs yet.
				</div>
			)}
			{!loading && rows.length > 0 && (
				<table className="tbl">
					<thead>
						<tr>
							<th>When</th>
							<th>Source</th>
							<th>Result</th>
							<th>Created / dup / err</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.id}>
								<td>{fmtDateTime(r.startedAt)}</td>
								<td>{SYNC_MODE_LABEL[r.mode] ?? r.mode}</td>
								<td>{SYNC_STATUS_LABEL[r.status] ?? r.status}</td>
								<td>
									{r.punchesCreated} / {r.punchesDuplicate} / {r.punchesError}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

interface PunchRow {
	deviceUserId: string | null;
	direction: string;
	employeeFirstName: string | null;
	employeeLastName: string | null;
	id: string;
	processingStatus: string;
	punchTime: string | Date;
	verifyMode: string;
}

function PunchesSection({
	rows,
	loading,
}: {
	loading: boolean;
	rows: PunchRow[];
}) {
	return (
		<div className="bio-section">
			<SectionTitle>Recent punches</SectionTitle>
			{loading && (
				<div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>
			)}
			{!loading && rows.length === 0 && (
				<div style={{ color: "var(--fg-3)", fontSize: 13 }}>
					No punches from this device yet.
				</div>
			)}
			{!loading && rows.length > 0 && (
				<table className="tbl">
					<thead>
						<tr>
							<th>When</th>
							<th>Device user / employee</th>
							<th>Direction</th>
							<th>Method</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((p) => (
							<tr key={p.id}>
								<td>{fmtDateTime(p.punchTime)}</td>
								<td>
									{p.employeeFirstName
										? `${p.employeeFirstName}${p.employeeLastName ? ` ${p.employeeLastName}` : ""}`
										: (p.deviceUserId ?? "—")}
								</td>
								<td>{PUNCH_DIRECTION_LABEL[p.direction] ?? p.direction}</td>
								<td>{VERIFY_MODE_LABEL[p.verifyMode] ?? p.verifyMode}</td>
								<td>
									{PUNCH_STATUS_LABEL[p.processingStatus] ?? p.processingStatus}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

function SecurityNotes() {
	const notes = [
		{
			icon: <ShieldCheck size={14} />,
			text: "Biometric templates (fingerprint/face/palm/iris) are not stored in Heimdallone — only punch events and the verification method.",
		},
		{
			icon: <KeyRound size={14} />,
			text: "Device secrets are never shown after creation. The ingest API key is displayed once and stored only as a hash.",
		},
		{
			icon: <Cpu size={14} />,
			text: "Planned adapters do not perform live sync yet. Use CSV / app / USB import meanwhile.",
		},
	];
	return (
		<div className="bio-section">
			<SectionTitle>Security &amp; privacy</SectionTitle>
			<div className="bio-notes">
				{notes.map((n) => (
					<div className="bio-note" key={n.text}>
						<span className="bio-note-icon">{n.icon}</span>
						<span>{n.text}</span>
					</div>
				))}
			</div>
		</div>
	);
}
