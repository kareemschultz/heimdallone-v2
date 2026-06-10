import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileWarning, Play, X } from "lucide-react";
import { useContext, useId, useState } from "react";
import { toast } from "sonner";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import { BiometricTabs } from "@/features/biometrics/biometric-tabs";
import { BiometricNoAccess } from "@/features/biometrics/biometric-ui";
import {
	PUNCH_DIRECTION_LABEL,
	PUNCH_SOURCE_LABEL,
	PUNCH_STATUS_LABEL,
	VERIFY_MODE_LABEL,
} from "@/features/biometrics/labels";
import { MapDeviceUserDialog } from "@/features/biometrics/map-device-user-dialog";
import { canManageBiometrics, canViewBiometrics } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/app/biometrics/punches")({
	component: PunchesPage,
});

const PAYROLL_NOTE =
	"Raw punches do not go directly to payroll. Payroll uses approved attendance records after review.";

type StatusFilter =
	| "all"
	| "pending"
	| "processed"
	| "unmapped"
	| "duplicate"
	| "error";

const FILTERS: { key: StatusFilter; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "pending", label: "Pending" },
	{ key: "processed", label: "Processed" },
	{ key: "unmapped", label: "Unmapped" },
	{ key: "duplicate", label: "Duplicate" },
	{ key: "error", label: "Error" },
];

function fmtDateTime(value: string | Date | null | undefined): string {
	if (!value) {
		return "—";
	}
	const d = value instanceof Date ? value : new Date(value);
	return Number.isNaN(d.getTime())
		? "—"
		: d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function invalidateBiometric() {
	queryClient.invalidateQueries({
		predicate: (q) =>
			Array.isArray(q.queryKey) &&
			Array.isArray(q.queryKey[0]) &&
			q.queryKey[0][0] === "biometric",
	});
}

interface PunchRow {
	deviceId: string | null;
	deviceUserId: string | null;
	direction: string;
	employeeFirstName: string | null;
	employeeLastName: string | null;
	errorReason: string | null;
	id: string;
	processingStatus: string;
	punchTime: string | Date;
	source: string;
	verifyMode: string;
}

interface DeviceRow {
	id: string;
	name: string;
}

interface PunchTableRow extends PunchRow {
	canMap: boolean;
	deviceName: string;
	employeeLabel: string;
	onMap: () => void;
}

const punchColumns: ColumnDef<PunchTableRow, unknown>[] = [
	{
		accessorKey: "punchTime",
		header: "When",
		cell: ({ row }) => fmtDateTime(row.original.punchTime),
	},
	{
		accessorKey: "employeeLabel",
		header: "Device user / employee",
		cell: ({ row }) => row.original.employeeLabel,
	},
	{
		accessorKey: "deviceName",
		header: "Device",
		cell: ({ row }) => row.original.deviceName,
	},
	{
		accessorKey: "direction",
		header: "Direction",
		cell: ({ row }) =>
			PUNCH_DIRECTION_LABEL[row.original.direction] ?? row.original.direction,
	},
	{
		accessorKey: "verifyMode",
		header: "Method",
		cell: ({ row }) =>
			VERIFY_MODE_LABEL[row.original.verifyMode] ?? row.original.verifyMode,
	},
	{
		accessorKey: "source",
		header: "Source",
		cell: ({ row }) =>
			PUNCH_SOURCE_LABEL[row.original.source] ?? row.original.source,
	},
	{
		accessorKey: "processingStatus",
		header: "Status",
		cell: ({ row }) => (
			<>
				{PUNCH_STATUS_LABEL[row.original.processingStatus] ??
					row.original.processingStatus}
				{row.original.errorReason ? (
					<div style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
						{row.original.errorReason}
					</div>
				) : null}
			</>
		),
	},
	{
		accessorKey: "id",
		header: "",
		cell: ({ row }) => (
			<div style={{ textAlign: "right" }}>
				{row.original.canMap ? (
					<button
						className="btn btn-sm"
						onClick={row.original.onMap}
						type="button"
					>
						Map
					</button>
				) : null}
			</div>
		),
	},
];

function PunchesPage() {
	const org = useContext(OrgCtx);
	if (!canViewBiometrics(org.memberRole)) {
		return (
			<BiometricNoAccess
				description="Punch review is available to HR and administrators."
				section="Punch review"
			/>
		);
	}
	return <PunchReview canManage={canManageBiometrics(org.memberRole)} />;
}

interface MapTarget {
	deviceId: string;
	deviceName: string;
	deviceUserId: string;
}

function PunchReview({ canManage }: { canManage: boolean }) {
	const [filter, setFilter] = useState<StatusFilter>("all");
	const [confirmProcess, setConfirmProcess] = useState(false);
	const [processing, setProcessing] = useState(false);
	const [mapTarget, setMapTarget] = useState<MapTarget | null>(null);

	const punches = useQuery(
		orpc.biometric.punches.list.queryOptions({
			input: { status: filter === "all" ? undefined : filter, limit: 200 },
		})
	);
	const devices = useQuery(
		orpc.biometric.devices.list.queryOptions({
			input: { includeInactive: true },
		})
	);
	const rawRows = (punches.data ?? []) as PunchRow[];
	const nameById = new Map<string, string>();
	for (const d of (devices.data ?? []) as DeviceRow[]) {
		nameById.set(d.id, d.name);
	}
	const rows: PunchTableRow[] = rawRows.map((p) => {
		const deviceName = p.deviceId ? (nameById.get(p.deviceId) ?? "—") : "—";
		const employeeLabel = p.employeeFirstName
			? `${p.employeeFirstName}${p.employeeLastName ? ` ${p.employeeLastName}` : ""}`
			: (p.deviceUserId ?? "—");
		const canMap =
			canManage && p.processingStatus === "unmapped" && Boolean(p.deviceId);
		return {
			...p,
			deviceName,
			employeeLabel,
			canMap,
			onMap: () =>
				p.deviceId && p.deviceUserId
					? setMapTarget({
							deviceId: p.deviceId,
							deviceName: p.deviceId
								? (nameById.get(p.deviceId) ?? "Device")
								: "Device",
							deviceUserId: p.deviceUserId,
						})
					: undefined,
		};
	});

	const runProcessor = async () => {
		setProcessing(true);
		try {
			const summary = (await client.biometric.processor.run()) as {
				processed: number;
				unmapped: number;
				exceptionsCreated: number;
			};
			toast.success(
				`Processed ${summary.processed}; ${summary.unmapped} unmapped; ${summary.exceptionsCreated} exception(s) raised.`
			);
			invalidateBiometric();
		} catch (err) {
			toast.error(`Processing failed: ${(err as Error).message}`);
		} finally {
			setProcessing(false);
			setConfirmProcess(false);
		}
	};

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Biometrics</span>
						<span className="sep">/</span>
						<span>Punch review</span>
					</div>
					<h1 className="page-title">Punch review</h1>
					<p className="page-sub">
						Review imported device punches before they become approved
						attendance.
					</p>
				</div>
				{canManage && (
					<button
						className="btn btn-primary btn-sm"
						disabled={processing}
						onClick={() => setConfirmProcess(true)}
						type="button"
					>
						<Play size={14} /> Process pending
					</button>
				)}
			</div>

			<BiometricTabs />

			<PayrollNote />

			<div className="ob-filter-row" style={{ marginBottom: 16 }}>
				{FILTERS.map((f) => (
					<button
						className={`ob-filter-pill ${filter === f.key ? "active" : ""}`}
						key={f.key}
						onClick={() => setFilter(f.key)}
						type="button"
					>
						{f.label}
					</button>
				))}
			</div>

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={punchColumns}
					data={rows}
					emptyState={
						<EmptyState
							description="Import punches on a device, or wait for an API ingest / mobile check-in."
							icon={<FileWarning size={20} />}
							title="No punches in this view"
						/>
					}
					isError={punches.isError}
					isLoading={punches.isLoading}
				/>
			</div>

			{confirmProcess && (
				<ConfirmProcessDialog
					onClose={() => setConfirmProcess(false)}
					onConfirm={runProcessor}
					pending={processing}
				/>
			)}
			{mapTarget && (
				<MapDeviceUserDialog
					deviceId={mapTarget.deviceId}
					deviceName={mapTarget.deviceName}
					deviceUserId={mapTarget.deviceUserId}
					onClose={() => setMapTarget(null)}
					onMapped={() => {
						setMapTarget(null);
						invalidateBiometric();
					}}
				/>
			)}
		</div>
	);
}

function PayrollNote() {
	return (
		<div
			style={{
				marginBottom: 14,
				padding: "10px 14px",
				fontSize: 12.5,
				color: "var(--fg-2)",
				background: "var(--bg-2)",
				border: "1px solid var(--line)",
				borderRadius: 12,
			}}
		>
			{PAYROLL_NOTE}
		</div>
	);
}

function ConfirmProcessDialog({
	onConfirm,
	onClose,
	pending,
}: {
	onClose: () => void;
	onConfirm: () => void;
	pending: boolean;
}) {
	const titleId = useId();
	const descId = useId();
	return (
		<div
			aria-describedby={descId}
			aria-labelledby={titleId}
			aria-modal="true"
			role="dialog"
			style={{
				position: "fixed",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 24,
				background: "rgba(0,0,0,0.55)",
				zIndex: 60,
			}}
		>
			<div
				className="card card-pad"
				style={{
					width: "100%",
					maxWidth: 440,
					display: "flex",
					flexDirection: "column",
					gap: 14,
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<h2 id={titleId} style={{ fontSize: 15, fontWeight: 600 }}>
						Process pending punches
					</h2>
					<button
						aria-label="Close"
						className="btn btn-sm"
						onClick={onClose}
						type="button"
					>
						<X size={14} />
					</button>
				</div>
				<p
					id={descId}
					style={{ color: "var(--fg-2)", fontSize: 13, margin: 0 }}
				>
					This turns staged punches into attendance events and may create
					exceptions for missing, duplicate, or unmapped punches. It does not
					finalize or update payroll.
				</p>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button
						className="btn btn-sm"
						disabled={pending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={pending}
						onClick={onConfirm}
						type="button"
					>
						{pending ? "Processing…" : "Process pending"}
					</button>
				</div>
			</div>
		</div>
	);
}
