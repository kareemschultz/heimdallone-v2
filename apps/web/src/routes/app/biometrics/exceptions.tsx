import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import { BiometricTabs } from "@/features/biometrics/biometric-tabs";
import { BiometricNoAccess } from "@/features/biometrics/biometric-ui";
import { ExceptionActionDialog } from "@/features/biometrics/exception-action-dialog";
import {
	EXCEPTION_SEVERITY_LABEL,
	EXCEPTION_STATUS_LABEL,
	EXCEPTION_TYPE_LABEL,
	exceptionSource,
} from "@/features/biometrics/labels";
import { canReviewAttendanceExceptions, canViewBiometrics } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/app/biometrics/exceptions")({
	component: ExceptionsPage,
});

const PAYROLL_NOTE =
	"Raw punches do not go directly to payroll. Payroll uses approved attendance records after review. Unresolved blockers warn or block a pay run.";

type Filter =
	| "open"
	| "blocker"
	| "warning"
	| "info"
	| "in_review"
	| "resolved"
	| "dismissed";

const FILTERS: { key: Filter; label: string }[] = [
	{ key: "open", label: "All open" },
	{ key: "blocker", label: "Blockers" },
	{ key: "warning", label: "Warnings" },
	{ key: "info", label: "Info" },
	{ key: "in_review", label: "In review" },
	{ key: "resolved", label: "Resolved" },
	{ key: "dismissed", label: "Dismissed" },
];

const STATUS_FILTERS = new Set(["open", "in_review", "resolved", "dismissed"]);

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

interface ExceptionRow {
	createdAt: string | Date;
	detail: string;
	employeeFirstName: string | null;
	employeeLastName: string | null;
	id: string;
	resolutionNote: string | null;
	severity: string;
	status: string;
	type: string;
}

function ExceptionsPage() {
	const org = useContext(OrgCtx);
	if (!canViewBiometrics(org.memberRole)) {
		return (
			<BiometricNoAccess
				description="The attendance exception queue is available to HR, managers, and administrators."
				section="Exceptions"
			/>
		);
	}
	return (
		<ExceptionQueue canReview={canReviewAttendanceExceptions(org.memberRole)} />
	);
}

type PendingAction = { id: string; kind: "resolve" | "dismiss" } | null;

function ExceptionQueue({ canReview }: { canReview: boolean }) {
	const [filter, setFilter] = useState<Filter>("open");
	const [action, setAction] = useState<PendingAction>(null);
	const [pending, setPending] = useState(false);

	const isStatus = STATUS_FILTERS.has(filter);
	const exceptions = useQuery(
		orpc.biometric.exceptions.list.queryOptions({
			input: {
				status: isStatus ? (filter as "open") : undefined,
				severity: isStatus ? undefined : (filter as "blocker"),
				limit: 200,
			},
		})
	);
	const rows = (exceptions.data ?? []) as ExceptionRow[];

	const acknowledge = async (id: string) => {
		try {
			await client.biometric.exceptions.acknowledge({ id });
			toast.success("Marked in review.");
			invalidateBiometric();
		} catch (err) {
			toast.error(`Failed: ${(err as Error).message}`);
		}
	};

	const confirmAction = async (note: string) => {
		if (!action) {
			return;
		}
		setPending(true);
		try {
			if (action.kind === "resolve") {
				await client.biometric.exceptions.resolve({ id: action.id, note });
				toast.success("Exception resolved.");
			} else {
				await client.biometric.exceptions.dismiss({ id: action.id, note });
				toast.success("Exception dismissed.");
			}
			invalidateBiometric();
		} catch (err) {
			toast.error(`Failed: ${(err as Error).message}`);
		} finally {
			setPending(false);
			setAction(null);
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
						<span>Exceptions</span>
					</div>
					<h1 className="page-title">Attendance exceptions</h1>
					<p className="page-sub">
						Review punch, geofence, and device issues before they affect
						attendance and payroll.
					</p>
				</div>
			</div>

			<BiometricTabs />

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

			{exceptions.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading exceptions…
				</div>
			)}
			{!exceptions.isLoading && rows.length === 0 && (
				<div className="card card-pad">
					<EmptyState
						description="No attendance exceptions in this view. Processing punches may raise new ones."
						icon={<ShieldAlert size={20} />}
						title="Nothing to review"
					/>
				</div>
			)}
			{!exceptions.isLoading && rows.length > 0 && (
				<div className="card" style={{ overflow: "hidden" }}>
					<table className="tbl">
						<thead>
							<tr>
								<th>When</th>
								<th>Employee</th>
								<th>Type</th>
								<th>Source</th>
								<th>Severity</th>
								<th>Status</th>
								<th>Detail</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{rows.map((x) => (
								<ExceptionRowView
									canReview={canReview}
									exception={x}
									key={x.id}
									onAcknowledge={() => acknowledge(x.id)}
									onDismiss={() => setAction({ id: x.id, kind: "dismiss" })}
									onResolve={() => setAction({ id: x.id, kind: "resolve" })}
								/>
							))}
						</tbody>
					</table>
				</div>
			)}

			{action && (
				<ExceptionActionDialog
					confirmLabel={
						action.kind === "resolve"
							? "Resolve exception"
							: "Dismiss exception"
					}
					description={
						action.kind === "resolve"
							? "Add a note explaining why this is resolved."
							: "Add a note explaining why this is dismissed."
					}
					onClose={() => setAction(null)}
					onConfirm={confirmAction}
					pending={pending}
					title={
						action.kind === "resolve"
							? "Resolve exception"
							: "Dismiss exception"
					}
				/>
			)}
		</div>
	);
}

const RESOLVED_STATES = new Set(["resolved", "dismissed"]);

function ExceptionRowView({
	exception,
	canReview,
	onAcknowledge,
	onResolve,
	onDismiss,
}: {
	canReview: boolean;
	exception: ExceptionRow;
	onAcknowledge: () => void;
	onDismiss: () => void;
	onResolve: () => void;
}) {
	const employee = exception.employeeFirstName
		? `${exception.employeeFirstName}${exception.employeeLastName ? ` ${exception.employeeLastName}` : ""}`
		: "—";
	const closed = RESOLVED_STATES.has(exception.status);
	const showActions = canReview && !closed;
	return (
		<tr>
			<td>{fmtDateTime(exception.createdAt)}</td>
			<td>{employee}</td>
			<td>{EXCEPTION_TYPE_LABEL[exception.type] ?? exception.type}</td>
			<td>{exceptionSource(exception.type)}</td>
			<td>
				{EXCEPTION_SEVERITY_LABEL[exception.severity] ?? exception.severity}
			</td>
			<td>{EXCEPTION_STATUS_LABEL[exception.status] ?? exception.status}</td>
			<td style={{ maxWidth: 320 }}>
				{exception.detail}
				{closed && exception.resolutionNote ? (
					<div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 2 }}>
						Note: {exception.resolutionNote}
					</div>
				) : null}
			</td>
			<td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
				{showActions ? (
					<div
						style={{
							display: "inline-flex",
							gap: 6,
							justifyContent: "flex-end",
						}}
					>
						{exception.status === "open" && (
							<button
								className="btn btn-sm"
								onClick={onAcknowledge}
								type="button"
							>
								Acknowledge
							</button>
						)}
						<button className="btn btn-sm" onClick={onResolve} type="button">
							Resolve
						</button>
						<button className="btn btn-sm" onClick={onDismiss} type="button">
							Dismiss
						</button>
					</div>
				) : null}
			</td>
		</tr>
	);
}
