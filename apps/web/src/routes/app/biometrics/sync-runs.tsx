import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useContext } from "react";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import { BiometricTabs } from "@/features/biometrics/biometric-tabs";
import { BiometricNoAccess } from "@/features/biometrics/biometric-ui";
import {
	SYNC_MODE_LABEL,
	SYNC_STATUS_LABEL,
} from "@/features/biometrics/labels";
import { canViewBiometrics } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/biometrics/sync-runs")({
	component: SyncRunsPage,
});

function fmtDateTime(value: string | Date | null | undefined): string {
	if (!value) {
		return "—";
	}
	const d = value instanceof Date ? value : new Date(value);
	return Number.isNaN(d.getTime())
		? "—"
		: d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

interface SyncRunRow {
	deviceId: string | null;
	id: string;
	mode: string;
	punchesCreated: number;
	punchesDuplicate: number;
	punchesError: number;
	punchesFetched: number;
	punchesUnmapped: number;
	startedAt: string | Date;
	status: string;
}

interface DeviceRow {
	id: string;
	name: string;
}

interface SyncRunTableRow extends SyncRunRow {
	deviceName: string;
}

const syncRunColumns: ColumnDef<SyncRunTableRow, unknown>[] = [
	{
		accessorKey: "startedAt",
		header: "When",
		cell: ({ row }) => fmtDateTime(row.original.startedAt),
	},
	{
		accessorKey: "deviceName",
		header: "Device",
		cell: ({ row }) => row.original.deviceName,
	},
	{
		accessorKey: "mode",
		header: "Source",
		cell: ({ row }) => SYNC_MODE_LABEL[row.original.mode] ?? row.original.mode,
	},
	{
		accessorKey: "status",
		header: "Result",
		cell: ({ row }) =>
			SYNC_STATUS_LABEL[row.original.status] ?? row.original.status,
	},
	{
		accessorKey: "punchesFetched",
		header: "Fetched",
		cell: ({ row }) => row.original.punchesFetched,
	},
	{
		accessorKey: "punchesCreated",
		header: "Created",
		cell: ({ row }) => row.original.punchesCreated,
	},
	{
		accessorKey: "punchesDuplicate",
		header: "Duplicate",
		cell: ({ row }) => row.original.punchesDuplicate,
	},
	{
		accessorKey: "punchesUnmapped",
		header: "Unmapped",
		cell: ({ row }) => row.original.punchesUnmapped,
	},
	{
		accessorKey: "punchesError",
		header: "Errors",
		cell: ({ row }) => row.original.punchesError,
	},
];

function SyncRunsPage() {
	const org = useContext(OrgCtx);
	if (!canViewBiometrics(org.memberRole)) {
		return (
			<BiometricNoAccess
				description="Sync-run history is available to HR and administrators."
				section="Sync runs"
			/>
		);
	}
	return <SyncRunsList />;
}

function SyncRunsList() {
	const runs = useQuery(
		orpc.biometric.syncRuns.list.queryOptions({ input: { limit: 100 } })
	);
	const devices = useQuery(
		orpc.biometric.devices.list.queryOptions({
			input: { includeInactive: true },
		})
	);
	const rawRows = (runs.data ?? []) as SyncRunRow[];
	const nameById = new Map<string, string>();
	for (const d of (devices.data ?? []) as DeviceRow[]) {
		nameById.set(d.id, d.name);
	}
	const rows: SyncRunTableRow[] = rawRows.map((r) => ({
		...r,
		deviceName: r.deviceId ? (nameById.get(r.deviceId) ?? "—") : "—",
	}));

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Biometrics</span>
						<span className="sep">/</span>
						<span>Sync runs</span>
					</div>
					<h1 className="page-title">Sync runs</h1>
					<p className="page-sub">
						Every import and API ingest, with row counts and errors. No device
						logs are cleared.
					</p>
				</div>
			</div>

			<BiometricTabs />

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={syncRunColumns}
					data={rows}
					emptyState={
						<EmptyState
							description="Import punches or receive an API ingest to see sync history here."
							icon={<RefreshCw size={20} />}
							title="No sync runs yet"
						/>
					}
					isError={runs.isError}
					isLoading={runs.isLoading}
				/>
			</div>
		</div>
	);
}
