import { StatTile, StatTileGrid } from "@Heimdallone/ui/components/stat-tile";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Briefcase,
	Calendar,
	FileSignature,
	UserPlus,
	Users,
} from "lucide-react";

import "@/styles/recruitment.css";
import { EmptyState } from "@/components/empty-state";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/recruitment/")({
	component: RecruitmentOverview,
});

function RecruitmentOverview() {
	const openJobs = useQuery(
		orpc.recruitment.jobs.list.queryOptions({
			input: { status: "open", page: 1, pageSize: 1 },
		})
	);

	const allApplications = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { page: 1, pageSize: 1 },
		})
	);

	const hiredApplications = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { stage: "hired", page: 1, pageSize: 1 },
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

	const pendingOffers = useQuery(
		orpc.recruitment.offers.list.queryOptions({
			input: { status: "pending_approval", page: 1, pageSize: 1 },
		})
	);

	const isLoading =
		openJobs.isLoading ||
		allApplications.isLoading ||
		scheduledInterviews.isLoading ||
		sentOffers.isLoading;

	const openJobsCount = openJobs.data?.total ?? 0;
	const totalCandidates = allApplications.data?.total ?? 0;
	const hiredCount = hiredApplications.data?.total ?? 0;
	const activeCandidates = Math.max(0, totalCandidates - hiredCount);
	const interviewsCount = scheduledInterviews.data?.total ?? 0;
	const offersWaiting =
		(sentOffers.data?.total ?? 0) + (pendingOffers.data?.total ?? 0);

	const hasAnyActivity =
		openJobsCount + totalCandidates + interviewsCount + offersWaiting > 0;

	const nextSteps = buildNextSteps({
		openJobs: openJobsCount,
		activeCandidates,
		interviews: interviewsCount,
		pendingApprovalOffers: pendingOffers.data?.total ?? 0,
		sentOffers: sentOffers.data?.total ?? 0,
	});

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Recruitment</span>
					</div>
					<h1 className="page-title">Recruitment</h1>
					<p className="page-sub">
						Open hiring activity at a glance — jobs, candidates, interviews,
						offers.
					</p>
				</div>
			</div>

			<RecruitmentTabs />

			<StatTileGrid className="sum-row" min={200}>
				<StatTile
					hint="Currently accepting candidates"
					icon={Briefcase}
					isLoading={openJobs.isLoading}
					label="Open jobs"
					tone="primary"
					value={openJobsCount}
				/>
				<StatTile
					hint={
						hiredCount > 0
							? `${hiredCount} hired (excluded)`
							: "Across all open jobs"
					}
					icon={Users}
					isLoading={allApplications.isLoading || hiredApplications.isLoading}
					label="Active candidates"
					value={activeCandidates}
				/>
				<StatTile
					hint="Waiting on interviewer or candidate"
					icon={Calendar}
					isLoading={scheduledInterviews.isLoading}
					label="Interviews scheduled"
					value={interviewsCount}
				/>
				<StatTile
					hint="Sent or awaiting approval"
					icon={FileSignature}
					isLoading={sentOffers.isLoading || pendingOffers.isLoading}
					label="Offers in flight"
					value={offersWaiting}
				/>
			</StatTileGrid>

			<div className="card card-pad" style={{ marginBottom: 16 }}>
				<div className="eyebrow" style={{ marginBottom: 12 }}>
					What to do next
				</div>
				{isLoading && (
					<div style={{ fontSize: 13, color: "var(--fg-3)" }}>Loading…</div>
				)}
				{!(isLoading || hasAnyActivity) && (
					<EmptyState
						compact
						description="Create a hiring request, then post a job to start a pipeline."
						icon={<Briefcase size={20} />}
						secondaryAction={{
							href: "/app/recruitment/jobs",
							label: "Open Jobs",
						}}
						title="No recruitment activity yet"
					/>
				)}
				{!isLoading && hasAnyActivity && (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 10,
						}}
					>
						{nextSteps.map((step) => (
							<Link
								className="next-step"
								key={step.key}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									gap: 16,
									padding: "12px 14px",
									textDecoration: "none",
									color: "var(--fg)",
									background: "var(--bg-2)",
									border: "1px solid var(--line)",
									borderRadius: 12,
								}}
								to={step.href}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 12,
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											width: 32,
											height: 32,
											color: "var(--fg-2)",
											background: "var(--bg-3)",
											borderRadius: 10,
										}}
									>
										{step.icon}
									</div>
									<div>
										<div style={{ fontSize: 13.5, fontWeight: 600 }}>
											{step.title}
										</div>
										<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
											{step.description}
										</div>
									</div>
								</div>
								<ArrowRight color="var(--fg-3)" size={16} />
							</Link>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

interface NextStep {
	description: string;
	href:
		| "/app/recruitment/jobs"
		| "/app/recruitment/pipeline"
		| "/app/recruitment/interviews"
		| "/app/recruitment/offers";
	icon: React.ReactNode;
	key: string;
	title: string;
}

interface NextStepInputs {
	activeCandidates: number;
	interviews: number;
	openJobs: number;
	pendingApprovalOffers: number;
	sentOffers: number;
}

function buildNextSteps(inputs: NextStepInputs): NextStep[] {
	const steps: NextStep[] = [];

	if (inputs.pendingApprovalOffers > 0) {
		steps.push({
			key: "approve-offers",
			title: `${inputs.pendingApprovalOffers} offer${inputs.pendingApprovalOffers === 1 ? "" : "s"} need approval`,
			description: "Review and approve so they can be sent to candidates.",
			href: "/app/recruitment/offers",
			icon: <FileSignature size={16} />,
		});
	}

	if (inputs.sentOffers > 0) {
		steps.push({
			key: "track-offers",
			title: `${inputs.sentOffers} offer${inputs.sentOffers === 1 ? "" : "s"} awaiting candidate response`,
			description: "Follow up if a response window has lapsed.",
			href: "/app/recruitment/offers",
			icon: <FileSignature size={16} />,
		});
	}

	if (inputs.interviews > 0) {
		steps.push({
			key: "interviews",
			title: `${inputs.interviews} interview${inputs.interviews === 1 ? "" : "s"} scheduled`,
			description:
				"Check details, reschedule, or capture feedback after each one.",
			href: "/app/recruitment/interviews",
			icon: <Calendar size={16} />,
		});
	}

	if (inputs.activeCandidates > 0) {
		steps.push({
			key: "pipeline",
			title: `${inputs.activeCandidates} candidate${inputs.activeCandidates === 1 ? "" : "s"} in pipeline`,
			description: "Move applications along stages on the pipeline board.",
			href: "/app/recruitment/pipeline",
			icon: <Users size={16} />,
		});
	}

	if (inputs.openJobs === 0) {
		steps.push({
			key: "post-job",
			title: "No open jobs yet",
			description: "Open a job to start collecting candidates.",
			href: "/app/recruitment/jobs",
			icon: <UserPlus size={16} />,
		});
	}

	return steps;
}
