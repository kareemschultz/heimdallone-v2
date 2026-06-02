import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileWarning, Play } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import { BiometricTabs } from "@/features/biometrics/biometric-tabs";
import { BiometricNoAccess } from "@/features/biometrics/biometric-ui";
import {
	PUNCH_DIRECTION_LABEL,
	PUNCH_STATUS_LABEL,
	VERIFY_MODE_LABEL,
} from "@/features/biometrics/labels";
import { canManageBiometrics, canViewBiometrics } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/app/biometrics/punches")({
	component: PunchesPage,
});

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
	{ key: "unmapped", label: "Unmapped" },
	{ key: "duplicate", label: "Duplicate" },
	{ key: "error", label: "Error" },
	{ key: "processed", label: "Processed" },
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

function PunchesPage() {
	const org = useContext(OrgCtx);
	if (!canViewBiometrics(org.memberRole)) {
		return (
			<BiometricNoAccess
				description="Punch review is available to HR and administrators."
				section="Punches"
			/>
		);
	}
	return <PunchesList canManage={canManageBiometrics(org.memberRole)} />;
}

function PunchesList({ canManage }: { canManage: boolean }) {
	const [filter, setFilter] = useState<StatusFilter>("all");
	const [processing, setProcessing] = useState(false);

	const punches = useQuery(
		orpc.biometric.punches.list.queryOptions({
			input: { status: filter === "all" ? undefined : filter, limit: 200 },
		})
	);
	const rows = (punches.data ?? []) as PunchRow[];

	const runProcessor = async () => {
		setProcessing(true);
		try {
			const summary = (await client.biometric.processor.run()) as {
				processed: number;
				unmapped: number;
			};
			toast.success(
				`Processed ${summary.processed} punch${summary.processed === 1 ? "" : "es"}; ${summary.unmapped} unmapped.`
			);
			queryClient.invalidateQueries({
				predicate: (q) =>
					Array.isArray(q.queryKey) &&
					Array.isArray(q.queryKey[0]) &&
					q.queryKey[0][0] === "biometric",
			});
		} catch (err) {
			toast.error(`Processing failed: ${(err as Error).message}`);
		} finally {
			setProcessing(false);
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
						<span>Punches</span>
					</div>
					<h1 className="page-title">Synced punches</h1>
					<p className="page-sub">
						Raw punches staged from devices, imports, and mobile check-ins. They
						become attendance only after processing.
					</p>
				</div>
				{canManage && (
					<button
						className="btn btn-primary btn-sm"
						disabled={processing}
						onClick={runProcessor}
						type="button"
					>
						<Play size={14} /> {processing ? "Processing…" : "Process pending"}
					</button>
				)}
			</div>

			<BiometricTabs />

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

			{punches.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading punches…
				</div>
			)}
			{!punches.isLoading && rows.length === 0 && (
				<div className="card card-pad">
					<EmptyState
						description="Import punches on a device, or wait for an API ingest / mobile check-in."
						icon={<FileWarning size={20} />}
						title="No punches in this view"
					/>
				</div>
			)}
			{!punches.isLoading && rows.length > 0 && (
				<div className="card" style={{ overflow: "hidden" }}>
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
										{PUNCH_STATUS_LABEL[p.processingStatus] ??
											p.processingStatus}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
