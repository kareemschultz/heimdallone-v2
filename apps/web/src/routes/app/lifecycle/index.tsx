import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useContext } from "react";

import "@/styles/lifecycle.css";
import { EmptyState } from "@/components/empty-state";
import { LifecycleTabs } from "@/features/lifecycle/lifecycle-tabs";
import type {
	DisciplinaryRecordRow,
	ResignationRow,
	TransferRow,
} from "@/features/lifecycle/types";
import {
	canRequestResignation,
	canViewDisciplinary,
	canViewResignations,
	canViewTransfers,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/lifecycle/")({
	component: LifecycleOverview,
});

const OPEN_DISCIPLINARY = new Set([
	"draft",
	"explanation_requested",
	"explained",
	"action_taken",
	"appealed",
]);
const PENDING_TRANSFER = new Set([
	"draft",
	"submitted",
	"approved",
	"scheduled",
]);
const HR_QUEUE_RESIGNATION = new Set([
	"submitted",
	"manager_approved",
	"hr_approved",
]);

function Tile({
	value,
	label,
	alert,
}: {
	alert?: boolean;
	label: string;
	value: number | string;
}) {
	return (
		<div className={alert ? "lc-tile alert" : "lc-tile"}>
			<span className="lc-tile-val">{value}</span>
			<span className="lc-tile-lbl">{label}</span>
		</div>
	);
}

function LifecycleOverview() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const seesDisciplinary = canViewDisciplinary(role);
	const seesTransfers = canViewTransfers(role);
	const seesResignations = canViewResignations(role);
	const isStaffViewer = seesDisciplinary || seesTransfers || seesResignations;

	const disciplinaryQuery = useQuery({
		...orpc.lifecycle.disciplinary.records.list.queryOptions({ input: {} }),
		enabled: seesDisciplinary,
	});
	const transfersQuery = useQuery({
		...orpc.lifecycle.transfers.list.queryOptions({ input: {} }),
		enabled: seesTransfers,
	});
	const resignationsQuery = useQuery({
		...orpc.lifecycle.resignations.list.queryOptions({ input: {} }),
		enabled: seesResignations,
	});

	const records = (disciplinaryQuery.data ?? []) as DisciplinaryRecordRow[];
	const transfers = (transfersQuery.data ?? []) as TransferRow[];
	const resignations = (resignationsQuery.data ?? []) as ResignationRow[];

	const openCases = records.filter((r) => OPEN_DISCIPLINARY.has(r.status));
	const pendingTransfers = transfers.filter((t) =>
		PENDING_TRANSFER.has(t.status)
	);
	const hrQueue = resignations.filter((r) =>
		HR_QUEUE_RESIGNATION.has(r.status)
	);

	const header = (
		<div className="page-header">
			<div>
				<div className="crumbs">
					<span>{org.orgName}</span>
					<span className="sep">/</span>
					<span>Lifecycle</span>
				</div>
				<h1 className="page-title">Lifecycle</h1>
				<p className="page-sub">
					Disciplinary cases, internal transfers, and resignations.
				</p>
			</div>
		</div>
	);

	// Pure employee (no staff view grants) → a landing that LINKS to /my, never a
	// render-time redirect (lesson #84 — OrgCtx defaults role to "employee" until
	// membership loads).
	if (!isStaffViewer) {
		return (
			<div className="page">
				{header}
				<LifecycleTabs />
				{canRequestResignation(role) ? (
					<EmptyState
						action={{
							label: "Go to My lifecycle",
							href: "/app/lifecycle/my",
						}}
						description="View your disciplinary records and submit or withdraw a resignation."
						title="Your lifecycle"
					/>
				) : (
					<EmptyState
						description="You do not have access to the lifecycle module."
						title="No access"
					/>
				)}
			</div>
		);
	}

	return (
		<div className="page">
			{header}
			<LifecycleTabs />

			<div className="lc-tiles">
				{seesDisciplinary && (
					<Tile
						alert={openCases.length > 0}
						label="Open disciplinary cases"
						value={openCases.length}
					/>
				)}
				{seesTransfers && (
					<Tile label="Pending transfers" value={pendingTransfers.length} />
				)}
				{seesResignations && (
					<Tile
						alert={hrQueue.length > 0}
						label="Resignations awaiting approval"
						value={hrQueue.length}
					/>
				)}
			</div>

			<div className="lc-attention">
				<div className="lc-attention-title">Needs attention</div>
				{openCases.length === 0 &&
					pendingTransfers.length === 0 &&
					hrQueue.length === 0 && (
						<div className="lc-attention-row">Nothing needs attention.</div>
					)}
				{openCases.slice(0, 5).map((r) => (
					<div className="lc-attention-row" key={r.id}>
						<span className="lc-badge tone-warning">Disciplinary</span>
						{r.reference} · {r.employeeName}
					</div>
				))}
				{hrQueue.slice(0, 5).map((r) => (
					<div className="lc-attention-row" key={r.id}>
						<span className="lc-badge tone-warning">Resignation</span>
						{r.reference} · {r.employeeName}
					</div>
				))}
				{pendingTransfers.slice(0, 5).map((t) => (
					<div className="lc-attention-row" key={t.id}>
						<span className="lc-badge tone-info">Transfer</span>
						{t.reference} · {t.employeeName}
					</div>
				))}
			</div>

			<div className="lc-quicklinks">
				{seesDisciplinary && (
					<Link className="lc-quicklink" to="/app/lifecycle/disciplinary">
						<span className="lc-ql-title">Disciplinary cases</span>
						<span className="lc-ql-sub">
							Incident → explanation → action → appeal
						</span>
					</Link>
				)}
				{seesTransfers && (
					<Link className="lc-quicklink" to="/app/lifecycle/transfers">
						<span className="lc-ql-title">Transfers</span>
						<span className="lc-ql-sub">Effective-dated dept / role moves</span>
					</Link>
				)}
				{seesResignations && (
					<Link className="lc-quicklink" to="/app/lifecycle/resignations">
						<span className="lc-ql-title">Resignations</span>
						<span className="lc-ql-sub">
							Notice, approval, offboarding handoff
						</span>
					</Link>
				)}
			</div>
		</div>
	);
}
