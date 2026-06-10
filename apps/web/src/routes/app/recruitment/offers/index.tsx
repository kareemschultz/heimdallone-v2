import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileSignature } from "lucide-react";
import { useMemo, useState } from "react";

import "@/styles/recruitment.css";
import { EmptyState } from "@/components/empty-state";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/recruitment/offers/")({
	component: OffersListPage,
});

type OfferStatus =
	| "draft"
	| "pending_approval"
	| "approved"
	| "sent"
	| "accepted"
	| "rejected"
	| "expired"
	| "withdrawn";

type FilterKey =
	| "all"
	| "draft"
	| "pending_approval"
	| "sent"
	| "accepted"
	| "rejected_withdrawn";

const FILTERS: {
	key: FilterKey;
	label: string;
	match: (s: OfferStatus) => boolean;
}[] = [
	{ key: "all", label: "All", match: () => true },
	{ key: "draft", label: "Draft", match: (s) => s === "draft" },
	{
		key: "pending_approval",
		label: "Pending approval",
		match: (s) => s === "pending_approval",
	},
	{ key: "sent", label: "Sent", match: (s) => s === "sent" },
	{ key: "accepted", label: "Accepted", match: (s) => s === "accepted" },
	{
		key: "rejected_withdrawn",
		label: "Rejected/Withdrawn",
		match: (s) => s === "rejected" || s === "withdrawn",
	},
];

const STATUS_LABEL: Record<OfferStatus, string> = {
	draft: "Draft",
	pending_approval: "Pending approval",
	approved: "Approved",
	sent: "Sent",
	accepted: "Accepted",
	rejected: "Rejected",
	expired: "Expired",
	withdrawn: "Withdrawn",
};

const STATUS_TONE: Record<OfferStatus, string> = {
	draft: "badge",
	pending_approval: "badge badge-info",
	approved: "badge badge-info",
	sent: "badge badge-info",
	accepted: "badge badge-success",
	rejected: "badge badge-warning",
	expired: "badge badge-warning",
	withdrawn: "badge",
};

const NEXT_ACTION: Record<OfferStatus, string> = {
	draft: "Submit for approval",
	pending_approval: "Awaiting approval",
	approved: "Ready to send",
	sent: "Awaiting candidate response",
	accepted: "Accepted by candidate",
	rejected: "Declined by candidate",
	expired: "Offer expired",
	withdrawn: "Offer withdrawn",
};

const JOIN_PAGE_SIZE = 100;

function formatFrequency(freq: string): string {
	const f = freq.toLowerCase();
	if (f === "monthly" || f === "month") {
		return "/mo";
	}
	if (f === "annual" || f === "annually" || f === "yearly" || f === "year") {
		return "/yr";
	}
	if (f === "hourly" || f === "hour") {
		return "/hr";
	}
	return ` ${freq}`;
}

function formatAmount(value: string): string {
	const n = Number(value);
	if (Number.isNaN(n)) {
		return value;
	}
	return n.toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	});
}

interface OfferRow {
	baseAmount: string | null;
	baseAmountFrequency: string;
	candidateName: string;
	compHidden: boolean;
	createdAt: string | Date;
	currency: string;
	id: string;
	openingTitle: string;
	sentAt: string | Date | null;
	startDate: string | Date | null;
	status: OfferStatus;
}

const offerColumns: ColumnDef<OfferRow, unknown>[] = [
	{
		accessorKey: "candidateName",
		header: "Candidate",
		cell: ({ row }) => (
			<Link
				params={{ id: row.original.id }}
				style={{
					fontWeight: 600,
					color: "var(--fg)",
					textDecoration: "none",
				}}
				to="/app/recruitment/offers/$id"
			>
				{row.original.candidateName}
			</Link>
		),
	},
	{
		accessorKey: "openingTitle",
		header: "Opening",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-2)" }}>{row.original.openingTitle}</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<span className={STATUS_TONE[row.original.status]}>
				{STATUS_LABEL[row.original.status] ?? row.original.status}
			</span>
		),
	},
	{
		accessorKey: "baseAmount",
		header: "Compensation",
		cell: ({ row }) => {
			const o = row.original;
			return (
				<span
					style={{
						color: o.compHidden ? "var(--fg-3)" : "var(--fg)",
					}}
				>
					{o.compHidden ? (
						<span style={{ fontStyle: "italic" }}>Compensation hidden</span>
					) : (
						`${o.currency} ${formatAmount(o.baseAmount as string)}${formatFrequency(o.baseAmountFrequency)}`
					)}
				</span>
			);
		},
	},
	{
		accessorKey: "startDate",
		header: "Start date",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-3)" }}>
				{row.original.startDate
					? new Date(row.original.startDate).toLocaleDateString()
					: "—"}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: "Next step",
		id: "nextStep",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-3)" }}>
				{NEXT_ACTION[row.original.status]}
			</span>
		),
	},
];

function OffersListPage() {
	const [filter, setFilter] = useState<FilterKey>("all");

	// Offers are few; fetch all + filter client-side so the combined
	// Rejected/Withdrawn chip works against the single-status API.
	const offers = useQuery(
		orpc.recruitment.offers.list.queryOptions({
			input: { page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);
	// Join candidate + opening client-side (TODO 9I: denormalize into offers.list).
	const applications = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);
	const candidates = useQuery(
		orpc.recruitment.candidates.list.queryOptions({
			input: { page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);
	const jobs = useQuery(
		orpc.recruitment.jobs.list.queryOptions({
			input: { page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);

	const applicationsById = useMemo(() => {
		const map = new Map<
			string,
			{ candidateId: string; jobOpeningId: string }
		>();
		for (const a of applications.data?.data ?? []) {
			map.set(a.id, {
				candidateId: a.candidateId,
				jobOpeningId: a.jobOpeningId,
			});
		}
		return map;
	}, [applications.data]);

	const candidateNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const c of candidates.data?.data ?? []) {
			map.set(c.id, [c.firstName, c.lastName].filter(Boolean).join(" "));
		}
		return map;
	}, [candidates.data]);

	const jobTitleById = useMemo(() => {
		const map = new Map<string, string>();
		for (const j of jobs.data?.data ?? []) {
			map.set(j.id, j.title);
		}
		return map;
	}, [jobs.data]);

	const rows = useMemo(() => {
		const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
		return (offers.data?.data ?? [])
			.filter((o) => activeFilter.match(o.status as OfferStatus))
			.map((o) => {
				const app = applicationsById.get(o.applicationId);
				const candidateName = app
					? (candidateNameById.get(app.candidateId) ?? "Candidate")
					: "Candidate";
				const openingTitle = app
					? (jobTitleById.get(app.jobOpeningId) ?? "—")
					: "—";
				// Compensation is null when the API has redacted it for this role.
				const compHidden = o.baseAmount === null || o.baseAmount === undefined;
				return {
					id: o.id,
					candidateName,
					openingTitle,
					status: o.status as OfferStatus,
					compHidden,
					currency: o.currency,
					baseAmount: o.baseAmount,
					baseAmountFrequency: o.baseAmountFrequency,
					startDate: o.startDate,
					createdAt: o.createdAt,
					sentAt: o.sentAt,
				};
			});
	}, [offers.data, filter, applicationsById, candidateNameById, jobTitleById]);

	const isLoading = offers.isLoading;

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Recruitment</span>
						<span className="sep">/</span>
						<span>Offers</span>
					</div>
					<h1 className="page-title">Offers</h1>
					<p className="page-sub">
						Offers are sensitive. Compensation is only visible to authorized
						roles.
					</p>
				</div>
			</div>

			<RecruitmentTabs />

			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: 6,
					marginBottom: 14,
				}}
			>
				{FILTERS.map((f) => (
					<button
						className={`filter-chip ${filter === f.key ? "active" : ""}`}
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
					columns={offerColumns}
					data={rows as OfferRow[]}
					emptyState={
						<EmptyState
							description={
								filter === "all"
									? "Once offers are created for candidates, they'll appear here."
									: "No offers match this filter."
							}
							icon={<FileSignature size={20} />}
							title={filter === "all" ? "No offers yet" : "No matching offers"}
						/>
					}
					isError={offers.isError}
					isLoading={isLoading}
				/>
			</div>
		</div>
	);
}
