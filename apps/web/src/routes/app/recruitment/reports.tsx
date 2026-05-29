import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart2, Briefcase } from "lucide-react";

import "@/styles/recruitment.css";
import { EmptyState } from "@/components/empty-state";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/recruitment/reports")({
	component: RecruitmentReportsPage,
});

// Plain-language labels for application stages
const STAGE_LABELS: Record<string, string> = {
	new: "Just applied",
	screening: "Screening",
	shortlisted: "Shortlisted",
	interview: "Interviewing",
	offer: "Offer",
	hired: "Hired",
	rejected: "Rejected",
	withdrawn: "Withdrawn",
};

const PIPELINE_STAGES = [
	"new",
	"screening",
	"shortlisted",
	"interview",
	"offer",
	"hired",
	"rejected",
	"withdrawn",
] as const;

const STAGE_COLORS: Record<string, string> = {
	new: "var(--accent)",
	screening: "var(--fg-2)",
	shortlisted: "var(--fg-2)",
	interview: "var(--fg-2)",
	offer: "var(--success, #22c55e)",
	hired: "var(--success, #22c55e)",
	rejected: "var(--danger, #ef4444)",
	withdrawn: "var(--fg-4)",
};

// ── Data hook — isolates all useQuery calls from render logic ────────────────

function useRecruitmentReports() {
	const openJobs = useQuery(
		orpc.recruitment.jobs.list.queryOptions({
			input: { status: "open", page: 1, pageSize: 1 },
		})
	);
	const allCandidates = useQuery(
		orpc.recruitment.candidates.list.queryOptions({
			input: { page: 1, pageSize: 1 },
		})
	);
	const allApplications = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { page: 1, pageSize: 1 },
		})
	);
	const scheduledInterviews = useQuery(
		orpc.recruitment.interviews.list.queryOptions({
			input: { status: "scheduled", page: 1, pageSize: 1 },
		})
	);
	const sentOffers = useQuery(
		orpc.recruitment.offers.list.queryOptions({
			input: { status: "sent", page: 1, pageSize: 1 },
		})
	);
	const hiredApplications = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { stage: "hired", page: 1, pageSize: 1 },
		})
	);
	const stageNew = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { stage: "new", page: 1, pageSize: 1 },
		})
	);
	const stageScreening = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { stage: "screening", page: 1, pageSize: 1 },
		})
	);
	const stageShortlisted = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { stage: "shortlisted", page: 1, pageSize: 1 },
		})
	);
	const stageInterview = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { stage: "interview", page: 1, pageSize: 1 },
		})
	);
	const stageOffer = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { stage: "offer", page: 1, pageSize: 1 },
		})
	);
	const stageRejected = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { stage: "rejected", page: 1, pageSize: 1 },
		})
	);
	const stageWithdrawn = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { stage: "withdrawn", page: 1, pageSize: 1 },
		})
	);
	const acceptedOffers = useQuery(
		orpc.recruitment.offers.list.queryOptions({
			input: { status: "accepted", page: 1, pageSize: 1 },
		})
	);
	const rejectedOffers = useQuery(
		orpc.recruitment.offers.list.queryOptions({
			input: { status: "rejected", page: 1, pageSize: 1 },
		})
	);
	const expiredOffers = useQuery(
		orpc.recruitment.offers.list.queryOptions({
			input: { status: "expired", page: 1, pageSize: 1 },
		})
	);

	const isLoadingTiles =
		openJobs.isLoading ||
		allCandidates.isLoading ||
		allApplications.isLoading ||
		scheduledInterviews.isLoading ||
		sentOffers.isLoading ||
		hiredApplications.isLoading;

	const isPipelineLoading =
		stageNew.isLoading ||
		stageScreening.isLoading ||
		stageShortlisted.isLoading ||
		stageInterview.isLoading ||
		stageOffer.isLoading ||
		stageRejected.isLoading ||
		stageWithdrawn.isLoading;

	const isOfferLoading =
		sentOffers.isLoading ||
		acceptedOffers.isLoading ||
		rejectedOffers.isLoading ||
		expiredOffers.isLoading;

	const openJobsCount = openJobs.data?.total ?? 0;
	const totalCandidates = allCandidates.data?.total ?? 0;
	const pipelineCount = allApplications.data?.total ?? 0;
	const interviewsCount = scheduledInterviews.data?.total ?? 0;
	const sentOffersCount = sentOffers.data?.total ?? 0;
	const hiredCount = hiredApplications.data?.total ?? 0;

	const stageCounts: Record<string, number> = {
		new: stageNew.data?.total ?? 0,
		screening: stageScreening.data?.total ?? 0,
		shortlisted: stageShortlisted.data?.total ?? 0,
		interview: stageInterview.data?.total ?? 0,
		offer: stageOffer.data?.total ?? 0,
		hired: hiredApplications.data?.total ?? 0,
		rejected: stageRejected.data?.total ?? 0,
		withdrawn: stageWithdrawn.data?.total ?? 0,
	};

	const offerAccepted = acceptedOffers.data?.total ?? 0;
	const offerRejected = rejectedOffers.data?.total ?? 0;
	const offerExpired = expiredOffers.data?.total ?? 0;

	return {
		isLoadingTiles,
		isPipelineLoading,
		isOfferLoading,
		tiles: {
			openJobsCount,
			totalCandidates,
			pipelineCount,
			interviewsCount,
			sentOffersCount,
			hiredCount,
			openJobsLoading: openJobs.isLoading,
			candidatesLoading: allCandidates.isLoading,
			applicationsLoading: allApplications.isLoading,
			interviewsLoading: scheduledInterviews.isLoading,
			offersLoading: sentOffers.isLoading,
			hiredLoading: hiredApplications.isLoading,
		},
		stageCounts,
		offers: {
			sent: sentOffersCount,
			accepted: offerAccepted,
			rejected: offerRejected,
			expired: offerExpired,
			total: offerAccepted + offerRejected + offerExpired + sentOffersCount,
		},
		hasAnyActivity: openJobsCount + pipelineCount + totalCandidates > 0,
	};
}

// ── Page ─────────────────────────────────────────────────────────────────────

function RecruitmentReportsPage() {
	const data = useRecruitmentReports();

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Recruitment</span>
						<span className="sep">/</span>
						<span>Reports</span>
					</div>
					<h1 className="page-title">Reports</h1>
					<p className="page-sub">
						Hiring activity at a glance — pipeline health, offer outcomes, and
						stage-by-stage breakdowns.
					</p>
				</div>
			</div>

			<RecruitmentTabs />

			<TilesRow tiles={data.tiles} />

			{!(data.isLoadingTiles || data.hasAnyActivity) && (
				<div className="card card-pad" style={{ marginBottom: 16 }}>
					<EmptyState
						description="Create a job opening and start collecting candidates to see report data here."
						icon={<Briefcase size={24} />}
						secondaryAction={{
							href: "/app/recruitment/jobs",
							label: "Open Jobs",
						}}
						title="No recruitment activity yet"
					/>
				</div>
			)}

			{(data.hasAnyActivity || data.isLoadingTiles) && (
				<PipelineCard
					isLoading={data.isPipelineLoading}
					stageCounts={data.stageCounts}
				/>
			)}

			{(data.hasAnyActivity || data.isLoadingTiles) && (
				<OfferCard isLoading={data.isOfferLoading} offers={data.offers} />
			)}
		</div>
	);
}

// ── Section components ────────────────────────────────────────────────────────

interface TilesData {
	applicationsLoading: boolean;
	candidatesLoading: boolean;
	hiredCount: number;
	hiredLoading: boolean;
	interviewsCount: number;
	interviewsLoading: boolean;
	offersLoading: boolean;
	openJobsCount: number;
	openJobsLoading: boolean;
	pipelineCount: number;
	sentOffersCount: number;
	totalCandidates: number;
}

function TilesRow({ tiles }: { tiles: TilesData }) {
	return (
		<div className="sum-row" style={{ marginBottom: 18 }}>
			<StatTile
				delta="Currently accepting candidates"
				label="Open jobs"
				loading={tiles.openJobsLoading}
				value={tiles.openJobsCount}
			/>
			<StatTile
				delta="Distinct candidate records"
				label="Total candidates"
				loading={tiles.candidatesLoading}
				value={tiles.totalCandidates}
			/>
			<StatTile
				delta="All stages combined"
				label="Applications in pipeline"
				loading={tiles.applicationsLoading}
				value={tiles.pipelineCount}
			/>
			<StatTile
				delta="Waiting on interviewer or candidate"
				label="Interviews scheduled"
				loading={tiles.interviewsLoading}
				value={tiles.interviewsCount}
			/>
			<StatTile
				delta="Sent, awaiting candidate response"
				label="Offers sent"
				loading={tiles.offersLoading}
				value={tiles.sentOffersCount}
			/>
			<StatTile
				delta="Accepted offers, stage = hired"
				label="Hired"
				loading={tiles.hiredLoading}
				value={tiles.hiredCount}
			/>
		</div>
	);
}

function PipelineCard({
	isLoading,
	stageCounts,
}: {
	isLoading: boolean;
	stageCounts: Record<string, number>;
}) {
	const pipelineMax = Math.max(...Object.values(stageCounts), 1);

	return (
		<div className="card card-pad" style={{ marginBottom: 16 }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 16,
				}}
			>
				<BarChart2 color="var(--fg-3)" size={16} />
				<span style={{ fontWeight: 600, fontSize: 14 }}>Pipeline by stage</span>
			</div>

			{isLoading && (
				<div style={{ fontSize: 13, color: "var(--fg-3)" }}>Loading…</div>
			)}

			{!isLoading && (
				<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
					{PIPELINE_STAGES.map((stage) => {
						const count = stageCounts[stage] ?? 0;
						const pct = (count / pipelineMax) * 100;
						return (
							<PipelineRow
								color={STAGE_COLORS[stage] ?? "var(--fg-3)"}
								count={count}
								key={stage}
								label={STAGE_LABELS[stage] ?? stage}
								pct={pct}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

function PipelineRow({
	label,
	count,
	pct,
	color,
}: {
	label: string;
	count: number;
	pct: number;
	color: string;
}) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
			<div
				style={{
					width: 120,
					flexShrink: 0,
					fontSize: 12.5,
					color: "var(--fg-2)",
					fontWeight: 500,
				}}
			>
				{label}
			</div>
			<div
				style={{
					flex: 1,
					height: 10,
					background: "var(--bg-3)",
					borderRadius: 5,
					overflow: "hidden",
				}}
			>
				{count > 0 && (
					<div
						style={{
							width: `${pct}%`,
							height: "100%",
							background: color,
							borderRadius: 5,
							transition: "width 300ms ease",
						}}
					/>
				)}
			</div>
			<div
				style={{
					width: 32,
					flexShrink: 0,
					fontSize: 12.5,
					color: "var(--fg-3)",
					textAlign: "right",
					fontVariantNumeric: "tabular-nums",
				}}
			>
				{count}
			</div>
		</div>
	);
}

interface OfferCounts {
	accepted: number;
	expired: number;
	rejected: number;
	sent: number;
	total: number;
}

function OfferCard({
	isLoading,
	offers,
}: {
	isLoading: boolean;
	offers: OfferCounts;
}) {
	return (
		<div className="card card-pad" style={{ marginBottom: 16 }}>
			<div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
				Offer outcomes
			</div>

			{isLoading && (
				<div style={{ fontSize: 13, color: "var(--fg-3)" }}>Loading…</div>
			)}

			{!isLoading && offers.total === 0 && (
				<div
					style={{
						fontSize: 13,
						color: "var(--fg-3)",
						textAlign: "center",
						padding: "16px 0",
					}}
				>
					No offers have been sent yet.
				</div>
			)}

			{!isLoading && offers.total > 0 && (
				<>
					<div
						style={{
							display: "flex",
							height: 12,
							borderRadius: 6,
							overflow: "hidden",
							background: "var(--bg-3)",
							marginBottom: 14,
						}}
					>
						<OfferSegment
							color="var(--accent)"
							count={offers.sent}
							total={offers.total}
						/>
						<OfferSegment
							color="var(--success, #22c55e)"
							count={offers.accepted}
							total={offers.total}
						/>
						<OfferSegment
							color="var(--danger, #ef4444)"
							count={offers.rejected}
							total={offers.total}
						/>
						<OfferSegment
							color="var(--fg-4)"
							count={offers.expired}
							total={offers.total}
						/>
					</div>

					<div
						style={{
							display: "flex",
							flexWrap: "wrap",
							gap: "8px 20px",
							fontSize: 12.5,
						}}
					>
						<OfferLegend
							color="var(--accent)"
							count={offers.sent}
							label="Awaiting response"
						/>
						<OfferLegend
							color="var(--success, #22c55e)"
							count={offers.accepted}
							label="Accepted"
						/>
						<OfferLegend
							color="var(--danger, #ef4444)"
							count={offers.rejected}
							label="Declined"
						/>
						<OfferLegend
							color="var(--fg-4)"
							count={offers.expired}
							label="Expired"
						/>
					</div>
				</>
			)}
		</div>
	);
}

// ── Primitives ────────────────────────────────────────────────────────────────

interface StatTileProps {
	delta: string;
	label: string;
	loading: boolean;
	value: number;
}

function StatTile({ delta, label, loading, value }: StatTileProps) {
	return (
		<div className="sum-card">
			<span className="lbl">{label}</span>
			<span className="val">{loading ? "…" : value}</span>
			<span className="delta">{delta}</span>
		</div>
	);
}

function OfferSegment({
	color,
	count,
	total,
}: {
	color: string;
	count: number;
	total: number;
}) {
	const pct = total > 0 ? (count / total) * 100 : 0;
	if (pct <= 0) {
		return null;
	}
	return (
		<div style={{ width: `${pct}%`, height: "100%", background: color }} />
	);
}

function OfferLegend({
	color,
	label,
	count,
}: {
	color: string;
	label: string;
	count: number;
}) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
			<div
				style={{
					width: 8,
					height: 8,
					borderRadius: 2,
					background: color,
					flexShrink: 0,
				}}
			/>
			<span style={{ color: "var(--fg-3)" }}>
				{label}: <strong style={{ color: "var(--fg)" }}>{count}</strong>
			</span>
		</div>
	);
}
