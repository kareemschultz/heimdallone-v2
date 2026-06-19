import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, Cpu, Plus } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import { BiometricTabs } from "@/features/biometrics/biometric-tabs";
import {
	AdapterStatusBadge,
	BiometricNoAccess,
	DeviceConnectionBadge,
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
import { canManageBiometrics, canViewBiometrics } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

// v2 device-ingest endpoint the on-site poller (e.g. the Raspberry Pi pyzk
// bridge) POSTs batches to, authenticated by the device id + ingest API key.
const INGEST_ENDPOINT =
	"https://api.heimdallone.com/rpc/biometric/ingest/submit";

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
	const org = useContext(OrgCtx);
	const canManage = canManageBiometrics(org.memberRole);
	const [showRegister, setShowRegister] = useState(false);
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
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Time clocks</span>
						<span className="sep">/</span>
						<span>Devices</span>
					</div>
					<h1 className="page-title">Attendance devices</h1>
					<p className="page-sub">
						Registered time clocks and import sources, with their connection
						mode and adapter status.
					</p>
				</div>
				{canManage && (
					<button
						className="btn btn-primary"
						onClick={() => setShowRegister((v) => !v)}
						type="button"
					>
						<Plus size={14} />
						Register device
					</button>
				)}
			</div>

			<BiometricTabs />

			{canManage && showRegister && (
				<RegisterDevicePanel onClose={() => setShowRegister(false)} />
			)}

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

const VENDOR_OPTIONS = [
	{ value: "zkteco", label: "ZKTeco" },
	{ value: "ngteco", label: "NGTeco" },
	{ value: "generic", label: "Generic" },
	{ value: "other", label: "Other" },
];
const MODE_OPTIONS = [
	{ value: "api_ingest", label: "API ingest (poller / Pi posts punches)" },
	{ value: "csv_import", label: "CSV import" },
	{ value: "excel_import", label: "Excel import" },
	{ value: "usb_export_import", label: "USB export → import" },
];

function CopyField({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div style={{ marginTop: 10 }}>
			<div style={{ fontSize: 11.5, color: "var(--fg-3)", marginBottom: 4 }}>
				{label}
			</div>
			<div style={{ display: "flex", gap: 6 }}>
				<input
					className="search"
					readOnly
					style={{ flex: 1, fontFamily: "var(--font-mono, monospace)" }}
					value={value}
				/>
				<button
					aria-label={`Copy ${label}`}
					className="btn btn-outline"
					onClick={() => {
						navigator.clipboard?.writeText(value);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
					type="button"
				>
					{copied ? <Check size={14} /> : <Copy size={14} />}
				</button>
			</div>
		</div>
	);
}

function RegisterDevicePanel({ onClose }: { onClose: () => void }) {
	const qc = useQueryClient();
	const [name, setName] = useState("");
	const [vendor, setVendor] = useState("zkteco");
	const [model, setModel] = useState("");
	const [serialNumber, setSerialNumber] = useState("");
	const [mode, setMode] = useState("api_ingest");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<{
		id: string;
		ingestApiKey?: string;
	} | null>(null);

	const submit = async () => {
		if (!name.trim()) {
			setError("Give the device a name.");
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const res = await client.biometric.devices.create({
				name: name.trim(),
				vendor: vendor as "zkteco" | "ngteco" | "generic" | "other",
				model: model.trim() || undefined,
				serialNumber: serialNumber.trim() || undefined,
				mode: mode as "api_ingest" | "csv_import" | "excel_import",
			});
			qc.invalidateQueries({ queryKey: orpc.biometric.devices.key() });
			setResult(res);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not register device.");
		} finally {
			setBusy(false);
		}
	};

	if (result) {
		return (
			<div className="card card-pad" style={{ marginBottom: 16 }}>
				<h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
					Device registered
				</h3>
				<p style={{ fontSize: 12.5, color: "var(--fg-3)" }}>
					{result.ingestApiKey
						? "Copy the ingest key now — it is shown only once and cannot be retrieved later."
						: "Device created. Use the import tools to upload punch files."}
				</p>
				<CopyField label="Device ID" value={result.id} />
				{result.ingestApiKey && (
					<>
						<CopyField
							label="Ingest API key (shown once)"
							value={result.ingestApiKey}
						/>
						<CopyField label="Ingest endpoint" value={INGEST_ENDPOINT} />
						<div
							style={{
								marginTop: 12,
								padding: 12,
								borderRadius: 10,
								background: "var(--bg-2)",
								fontSize: 12.5,
								lineHeight: 1.5,
								color: "var(--fg-2)",
							}}
						>
							<strong>On-site poller setup:</strong> configure the device bridge
							(e.g. the Raspberry Pi pyzk script) with the device ID and ingest
							key above, posting batches to the ingest endpoint. Keep the key
							secret; rotate it from the device detail page if exposed.
						</div>
					</>
				)}
				<div style={{ marginTop: 14 }}>
					<button className="btn btn-primary" onClick={onClose} type="button">
						Done
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="card card-pad" style={{ marginBottom: 16 }}>
			<h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
				Register a time clock
			</h3>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
					gap: 12,
				}}
			>
				<label style={{ fontSize: 12.5 }}>
					<span style={{ color: "var(--fg-3)" }}>Name</span>
					<input
						className="search"
						onChange={(e) => setName(e.target.value)}
						placeholder="e.g. Main entrance clock"
						style={{ marginTop: 4, width: "100%" }}
						value={name}
					/>
				</label>
				<label style={{ fontSize: 12.5 }}>
					<span style={{ color: "var(--fg-3)" }}>Vendor</span>
					<select
						className="search"
						onChange={(e) => setVendor(e.target.value)}
						style={{ marginTop: 4, width: "100%" }}
						value={vendor}
					>
						{VENDOR_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</label>
				<label style={{ fontSize: 12.5 }}>
					<span style={{ color: "var(--fg-3)" }}>Model</span>
					<input
						className="search"
						onChange={(e) => setModel(e.target.value)}
						placeholder="e.g. ZLM60_TFT"
						style={{ marginTop: 4, width: "100%" }}
						value={model}
					/>
				</label>
				<label style={{ fontSize: 12.5 }}>
					<span style={{ color: "var(--fg-3)" }}>Serial number</span>
					<input
						className="search"
						onChange={(e) => setSerialNumber(e.target.value)}
						placeholder="optional"
						style={{ marginTop: 4, width: "100%" }}
						value={serialNumber}
					/>
				</label>
				<label style={{ fontSize: 12.5 }}>
					<span style={{ color: "var(--fg-3)" }}>Connection mode</span>
					<select
						className="search"
						onChange={(e) => setMode(e.target.value)}
						style={{ marginTop: 4, width: "100%" }}
						value={mode}
					>
						{MODE_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</label>
			</div>
			{error && (
				<p
					style={{
						color: "var(--danger, #e5484d)",
						fontSize: 12.5,
						marginTop: 10,
					}}
				>
					{error}
				</p>
			)}
			<div style={{ display: "flex", gap: 8, marginTop: 14 }}>
				<button
					className="btn btn-primary"
					disabled={busy}
					onClick={submit}
					type="button"
				>
					{busy ? "Registering…" : "Register device"}
				</button>
				<button className="btn btn-outline" onClick={onClose} type="button">
					Cancel
				</button>
			</div>
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
					<div style={{ marginTop: 8 }}>
						<DeviceConnectionBadge
							lastSyncCursor={device.lastSyncCursor}
							lastSyncStatus={device.lastSyncStatus}
							mode={device.mode}
							status={device.status}
						/>
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
