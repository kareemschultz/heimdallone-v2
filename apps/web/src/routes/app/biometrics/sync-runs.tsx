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
	const rows = (runs.data ?? []) as SyncRunRow[];
	const nameById = new Map<string, string>();
	for (const d of (devices.data ?? []) as DeviceRow[]) {
		nameById.set(d.id, d.name);
	}

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

			{runs.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading sync runs…
				</div>
			)}
			{!runs.isLoading && rows.length === 0 && (
				<div className="card card-pad">
					<EmptyState
						description="Import punches or receive an API ingest to see sync history here."
						icon={<RefreshCw size={20} />}
						title="No sync runs yet"
					/>
				</div>
			)}
			{!runs.isLoading && rows.length > 0 && (
				<div className="card" style={{ overflow: "hidden" }}>
					<table className="tbl">
						<thead>
							<tr>
								<th>When</th>
								<th>Device</th>
								<th>Source</th>
								<th>Result</th>
								<th>Fetched</th>
								<th>Created</th>
								<th>Duplicate</th>
								<th>Unmapped</th>
								<th>Errors</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.id}>
									<td>{fmtDateTime(r.startedAt)}</td>
									<td>
										{r.deviceId ? (nameById.get(r.deviceId) ?? "—") : "—"}
									</td>
									<td>{SYNC_MODE_LABEL[r.mode] ?? r.mode}</td>
									<td>{SYNC_STATUS_LABEL[r.status] ?? r.status}</td>
									<td>{r.punchesFetched}</td>
									<td>{r.punchesCreated}</td>
									<td>{r.punchesDuplicate}</td>
									<td>{r.punchesUnmapped}</td>
									<td>{r.punchesError}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
