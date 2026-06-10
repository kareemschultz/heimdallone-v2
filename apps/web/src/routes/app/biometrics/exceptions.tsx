import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
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

const RESOLVED_STATES = new Set(["resolved", "dismissed"]);

interface ExceptionTableRow extends ExceptionRow {
	closed: boolean;
	employeeLabel: string;
	onAcknowledge: () => void;
	onDismiss: () => void;
	onResolve: () => void;
	showActions: boolean;
}

const exceptionColumns: ColumnDef<ExceptionTableRow, unknown>[] = [
	{
		accessorKey: "createdAt",
		header: "When",
		cell: ({ row }) => fmtDateTime(row.original.createdAt),
	},
	{
		accessorKey: "employeeLabel",
		header: "Employee",
		cell: ({ row }) => row.original.employeeLabel,
	},
	{
		accessorKey: "type",
		header: "Type",
		cell: ({ row }) =>
			EXCEPTION_TYPE_LABEL[row.original.type] ?? row.original.type,
	},
	{
		accessorKey: "source",
		header: "Source",
		cell: ({ row }) => exceptionSource(row.original.type),
	},
	{
		accessorKey: "severity",
		header: "Severity",
		cell: ({ row }) =>
			EXCEPTION_SEVERITY_LABEL[row.original.severity] ?? row.original.severity,
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) =>
			EXCEPTION_STATUS_LABEL[row.original.status] ?? row.original.status,
	},
	{
		accessorKey: "detail",
		header: "Detail",
		cell: ({ row }) => (
			<div style={{ maxWidth: 320 }}>
				{row.original.detail}
				{row.original.closed && row.original.resolutionNote ? (
					<div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 2 }}>
						Note: {row.original.resolutionNote}
					</div>
				) : null}
			</div>
		),
	},
	{
		accessorKey: "id",
		header: "",
		cell: ({ row }) => (
			<div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
				{row.original.showActions ? (
					<div
						style={{
							display: "inline-flex",
							gap: 6,
							justifyContent: "flex-end",
						}}
					>
						{row.original.status === "open" && (
							<button
								className="btn btn-sm"
								onClick={row.original.onAcknowledge}
								type="button"
							>
								Acknowledge
							</button>
						)}
						<button
							className="btn btn-sm"
							onClick={row.original.onResolve}
							type="button"
						>
							Resolve
						</button>
						<button
							className="btn btn-sm"
							onClick={row.original.onDismiss}
							type="button"
						>
							Dismiss
						</button>
					</div>
				) : null}
			</div>
		),
	},
];

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
	const rawRows = (exceptions.data ?? []) as ExceptionRow[];

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

	const rows: ExceptionTableRow[] = rawRows.map((x) => {
		const employeeLabel = x.employeeFirstName
			? `${x.employeeFirstName}${x.employeeLastName ? ` ${x.employeeLastName}` : ""}`
			: "—";
		const closed = RESOLVED_STATES.has(x.status);
		return {
			...x,
			employeeLabel,
			closed,
			showActions: canReview && !closed,
			onAcknowledge: () => acknowledge(x.id),
			onResolve: () => setAction({ id: x.id, kind: "resolve" }),
			onDismiss: () => setAction({ id: x.id, kind: "dismiss" }),
		};
	});

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

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={exceptionColumns}
					data={rows}
					emptyState={
						<EmptyState
							description="No attendance exceptions in this view. Processing punches may raise new ones."
							icon={<ShieldAlert size={20} />}
							title="Nothing to review"
						/>
					}
					isError={exceptions.isError}
					isLoading={exceptions.isLoading}
				/>
			</div>

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
