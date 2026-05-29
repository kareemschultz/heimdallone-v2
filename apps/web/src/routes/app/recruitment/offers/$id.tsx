import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import "@/styles/recruitment.css";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/recruitment/offers/$id")({
	component: OfferDetailPage,
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

function formatDate(value: string | Date | null | undefined): string {
	if (!value) {
		return "—";
	}
	return new Date(value).toLocaleDateString();
}

function DetailRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div
			style={{
				display: "flex",
				justifyContent: "space-between",
				gap: 16,
				padding: "8px 0",
				borderBottom: "1px solid var(--line)",
			}}
		>
			<span style={{ color: "var(--fg-3)", fontSize: 13 }}>{label}</span>
			<span style={{ color: "var(--fg)", fontSize: 13, textAlign: "right" }}>
				{children}
			</span>
		</div>
	);
}

function SectionCard({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="card card-pad" style={{ marginBottom: 14 }}>
			<h2
				style={{
					fontSize: 13,
					fontWeight: 600,
					color: "var(--fg)",
					marginBottom: 8,
				}}
			>
				{title}
			</h2>
			{children}
		</div>
	);
}

function OfferDetailPage() {
	const { id } = Route.useParams();

	const offer = useQuery(
		orpc.recruitment.offers.get.queryOptions({ input: { id } })
	);
	const applicationId = offer.data?.applicationId;

	const application = useQuery(
		orpc.recruitment.applications.get.queryOptions({
			input: { id: applicationId ?? "" },
			enabled: !!applicationId,
		})
	);
	const candidateId = application.data?.candidateId;
	const jobOpeningId = application.data?.jobOpeningId;

	const candidate = useQuery(
		orpc.recruitment.candidates.get.queryOptions({
			input: { id: candidateId ?? "" },
			enabled: !!candidateId,
		})
	);
	const job = useQuery(
		orpc.recruitment.jobs.get.queryOptions({
			input: { id: jobOpeningId ?? "" },
			enabled: !!jobOpeningId,
		})
	);

	const o = offer.data;
	const status = (o?.status ?? "draft") as OfferStatus;
	const compHidden = !o || o.baseAmount === null || o.baseAmount === undefined;
	const candidateName = candidate.data
		? [candidate.data.firstName, candidate.data.lastName]
				.filter(Boolean)
				.join(" ")
		: "—";

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<Link
							style={{ color: "var(--fg-3)", textDecoration: "none" }}
							to="/app/recruitment/offers"
						>
							<ArrowLeft
								size={12}
								style={{ verticalAlign: "middle", marginRight: 4 }}
							/>
							Offers
						</Link>
						<span className="sep">/</span>
						<span>{candidateName}</span>
					</div>
					<h1 className="page-title">Offer</h1>
					<p className="page-sub">
						Offers are sensitive. Compensation is only visible to authorized
						roles.
					</p>
				</div>
				{o && (
					<div className="page-actions">
						<span className={STATUS_TONE[status]}>
							{STATUS_LABEL[status] ?? status}
						</span>
					</div>
				)}
			</div>

			<RecruitmentTabs />

			{offer.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading offer…
				</div>
			)}

			{!(offer.isLoading || o) && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					This offer could not be found.
				</div>
			)}

			{o && (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: 14,
						alignItems: "start",
					}}
				>
					<div>
						<SectionCard title="Offer summary">
							<DetailRow label="Status">
								<span className={STATUS_TONE[status]}>
									{STATUS_LABEL[status] ?? status}
								</span>
							</DetailRow>
							<DetailRow label="Candidate">{candidateName}</DetailRow>
							<DetailRow label="Email">
								{candidate.data?.email ?? "—"}
							</DetailRow>
							<DetailRow label="Job opening">
								{job.data?.title ?? "—"}
							</DetailRow>
						</SectionCard>

						<SectionCard title="Compensation">
							{compHidden ? (
								<p
									style={{
										color: "var(--fg-3)",
										fontStyle: "italic",
										fontSize: 13,
									}}
								>
									Compensation hidden — only authorized roles can view offer
									amounts.
								</p>
							) : (
								<>
									<DetailRow label="Base">
										{`${o.currency} ${formatAmount(o.baseAmount as string)}`}
									</DetailRow>
									<DetailRow label="Frequency">
										{o.baseAmountFrequency}
									</DetailRow>
									<DetailRow label="Variable / bonus">
										{o.variableAmount
											? `${o.currency} ${formatAmount(o.variableAmount)}`
											: "—"}
									</DetailRow>
								</>
							)}
						</SectionCard>
					</div>

					<div>
						<SectionCard title="Important dates">
							<DetailRow label="Start date">
								{formatDate(o.startDate)}
							</DetailRow>
							<DetailRow label="Expires">{formatDate(o.expiresAt)}</DetailRow>
							<DetailRow label="Created">{formatDate(o.createdAt)}</DetailRow>
							<DetailRow label="Sent">{formatDate(o.sentAt)}</DetailRow>
							<DetailRow label="Responded">
								{formatDate(o.respondedAt)}
							</DetailRow>
						</SectionCard>

						<SectionCard title="Approval">
							<DetailRow label="Approval required">
								{o.approvalRequired ? "Yes" : "No"}
							</DetailRow>
							<DetailRow label="Approved">{formatDate(o.approvedAt)}</DetailRow>
							{o.letterUrl ? (
								<DetailRow label="Offer letter">
									<a
										href={o.letterUrl}
										rel="noopener noreferrer"
										style={{ color: "var(--accent, var(--fg))" }}
										target="_blank"
									>
										View letter
									</a>
								</DetailRow>
							) : null}
						</SectionCard>

						<SectionCard title="Status timeline">
							<p style={{ color: "var(--fg-3)", fontSize: 13 }}>
								A full status history will appear here in a later update.
							</p>
						</SectionCard>
					</div>
				</div>
			)}
		</div>
	);
}
