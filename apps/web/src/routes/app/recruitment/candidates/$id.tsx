import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	CalendarClock,
	FileText,
	MessageSquare,
	StickyNote,
	User,
} from "lucide-react";
import { useContext, useMemo, useState } from "react";

import "@/styles/recruitment.css";
import { EmptyState } from "@/components/empty-state";
import { RecruitmentTabs } from "@/features/recruitment/recruitment-tabs";
import { canManageRecruitment } from "@/lib/rbac";
import { safeHttpUrl } from "@/lib/safe-url";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/recruitment/candidates/$id")({
	component: CandidateDetailPage,
});

// ─── Types ──────────────────────────────────────────────────────────────────

type CandidateStatus = "active" | "inactive_pool" | "blocked";
type SectionTab =
	| "profile"
	| "applications"
	| "interviews"
	| "notes"
	| "documents";
type InterviewStatus = "scheduled" | "completed" | "cancelled" | "no_show";

// ─── Labels & Tones ─────────────────────────────────────────────────────────

const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
	active: "Active",
	inactive_pool: "Talent pool",
	blocked: "Blocked",
};

const CANDIDATE_STATUS_TONE: Record<CandidateStatus, string> = {
	active: "badge badge-success",
	inactive_pool: "badge",
	blocked: "badge badge-warning",
};

const SOURCE_LABEL: Record<string, string> = {
	direct: "Direct",
	referral: "Referral",
	job_board: "Job board",
	agency: "Agency",
	linkedin: "LinkedIn",
	other: "Other",
};

const STAGE_LABEL: Record<string, string> = {
	new: "Just applied",
	screening: "Screening",
	shortlisted: "Shortlisted",
	interview: "In interviews",
	offer: "Offer stage",
	hired: "Hired",
	rejected: "Not selected",
	withdrawn: "Withdrew",
};

const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = {
	scheduled: "Scheduled",
	completed: "Completed",
	cancelled: "Cancelled",
	no_show: "No-show",
};

const INTERVIEW_STATUS_TONE: Record<InterviewStatus, string> = {
	scheduled: "badge badge-info",
	completed: "badge badge-success",
	cancelled: "badge",
	no_show: "badge badge-warning",
};

const SECTION_TABS: { key: SectionTab; label: string }[] = [
	{ key: "profile", label: "Profile" },
	{ key: "applications", label: "Applications" },
	{ key: "interviews", label: "Interviews" },
	{ key: "notes", label: "Notes" },
	{ key: "documents", label: "Documents" },
];

const JOIN_PAGE_SIZE = 100;

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatWhen(value: Date): string {
	return value.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

// ─── Page ────────────────────────────────────────────────────────────────────

function CandidateDetailPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageRecruitment(org.memberRole);
	const { id } = Route.useParams();

	const [activeSection, setActiveSection] = useState<SectionTab>("profile");

	// Primary candidate record
	const candidateQuery = useQuery(
		orpc.recruitment.candidates.get.queryOptions({ input: { id } })
	);

	// Applications for this candidate — needed by Applications + Interviews tabs
	const applicationsQuery = useQuery(
		orpc.recruitment.applications.list.queryOptions({
			input: { candidateId: id, page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);

	// Job openings for client-side title join (Applications tab)
	const jobsQuery = useQuery(
		orpc.recruitment.jobs.list.queryOptions({
			input: { page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);

	// Notes (recruiter/HR only — may throw FORBIDDEN)
	const notesQuery = useQuery({
		...orpc.recruitment.notes.list.queryOptions({
			input: { candidateId: id },
		}),
		retry: false,
	});

	// Documents (recruiter/HR only — may throw FORBIDDEN)
	const documentsQuery = useQuery({
		...orpc.recruitment.documents.list.queryOptions({
			input: { candidateId: id },
		}),
		retry: false,
	});

	// ─ Derived: application ids → set for interview filter
	const appIds = useMemo(() => {
		const set = new Set<string>();
		for (const a of applicationsQuery.data?.data ?? []) {
			set.add(a.id);
		}
		return set;
	}, [applicationsQuery.data]);

	// ─ Interviews: list all, then filter client-side by appIds
	// We call interviews.list per application to keep things scoped, but because
	// there's no bulk call, we use the full list + client filter pattern from
	// interviews.tsx.
	const interviewsQuery = useQuery(
		orpc.recruitment.interviews.list.queryOptions({
			input: { page: 1, pageSize: JOIN_PAGE_SIZE },
		})
	);

	const candidateInterviews = useMemo(
		() =>
			(interviewsQuery.data?.data ?? []).filter((iv) =>
				appIds.has(iv.applicationId)
			),
		[interviewsQuery.data, appIds]
	);

	// ─ Job title lookup
	const jobTitleById = useMemo(() => {
		const map = new Map<string, string>();
		for (const j of jobsQuery.data?.data ?? []) {
			map.set(j.id, j.title);
		}
		return map;
	}, [jobsQuery.data]);

	// ─ Application→jobOpeningId lookup for the Applications tab
	const appRows = useMemo(
		() =>
			(applicationsQuery.data?.data ?? []).map((a) => ({
				id: a.id,
				openingTitle: jobTitleById.get(a.jobOpeningId) ?? "—",
				stage: a.stage,
				appliedAt: new Date(a.appliedAt),
			})),
		[applicationsQuery.data, jobTitleById]
	);

	// ─ Page-level data
	const c = candidateQuery.data;
	const candidateStatus = (c?.status ?? "active") as CandidateStatus;
	const fullName = c
		? [c.firstName, c.lastName].filter(Boolean).join(" ")
		: "Loading…";

	return (
		<div className="page">
			{/* ── Header ─────────────────────────────────────────────────── */}
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span style={{ color: "var(--fg-3)" }}>Heimdallone</span>
						<span className="sep">/</span>
						<span style={{ color: "var(--fg-3)" }}>Recruitment</span>
						<span className="sep">/</span>
						<Link
							style={{ color: "var(--fg-3)", textDecoration: "none" }}
							to="/app/recruitment/candidates"
						>
							<ArrowLeft
								size={12}
								style={{ verticalAlign: "middle", marginRight: 4 }}
							/>
							Candidates
						</Link>
						<span className="sep">/</span>
						<span>{c ? fullName : "…"}</span>
					</div>
					<h1 className="page-title">{fullName}</h1>
					{c && (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								marginTop: 6,
							}}
						>
							<span className={CANDIDATE_STATUS_TONE[candidateStatus]}>
								{CANDIDATE_STATUS_LABEL[candidateStatus]}
							</span>
							{c.email && (
								<span style={{ color: "var(--fg-3)", fontSize: 12.5 }}>
									{c.email}
								</span>
							)}
						</div>
					)}
				</div>
				{canManage && (
					<div className="page-actions">
						<button
							className="btn btn-outline btn-sm"
							disabled
							title="Edit candidate — coming later"
							type="button"
						>
							Edit candidate
						</button>
					</div>
				)}
			</div>

			{/* ── Module tabs (Recruitment nav) ──────────────────────────── */}
			<RecruitmentTabs />

			{/* ── Section strip ──────────────────────────────────────────── */}
			<div
				style={{
					display: "flex",
					gap: 2,
					padding: 4,
					marginBottom: 18,
					overflowX: "auto",
					scrollbarWidth: "none",
					background: "var(--bg-1)",
					border: "1px solid var(--line)",
					borderRadius: 14,
				}}
			>
				{SECTION_TABS.map((tab) => (
					<button
						className={`recruitment-tab${activeSection === tab.key ? "active" : ""}`}
						key={tab.key}
						onClick={() => setActiveSection(tab.key)}
						type="button"
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* ── Section content ────────────────────────────────────────── */}
			{activeSection === "profile" && (
				<ProfileSection candidateQuery={candidateQuery} />
			)}
			{activeSection === "applications" && (
				<ApplicationsSection
					appRows={appRows}
					isLoading={applicationsQuery.isLoading || jobsQuery.isLoading}
				/>
			)}
			{activeSection === "interviews" && (
				<InterviewsSection
					isLoading={interviewsQuery.isLoading || applicationsQuery.isLoading}
					rows={candidateInterviews}
				/>
			)}
			{activeSection === "notes" && <NotesSection query={notesQuery} />}
			{activeSection === "documents" && (
				<DocumentsSection query={documentsQuery} />
			)}
		</div>
	);
}

// ─── Profile Section ─────────────────────────────────────────────────────────

function ProfileSection({
	candidateQuery,
}: {
	candidateQuery: ReturnType<typeof useQuery>;
}) {
	if (candidateQuery.isLoading) {
		return (
			<div
				className="card card-pad"
				style={{ color: "var(--fg-3)", fontSize: 13 }}
			>
				Loading profile…
			</div>
		);
	}

	const c = candidateQuery.data as
		| {
				firstName: string;
				lastName: string | null;
				email: string;
				phone: string | null;
				source: string;
				status: string;
				createdAt: string | Date;
				dateOfBirth: string | null;
				gender: string | null;
				address: string | null;
				country: string | null;
				linkedinUrl: string | null;
				resumeUrl: string | null;
				portfolioUrl: string | null;
		  }
		| null
		| undefined;

	if (!c) {
		return (
			<div className="card card-pad">
				<EmptyState
					description="This candidate may have been removed or you may not have access."
					icon={<User size={20} />}
					title="Candidate not found"
				/>
			</div>
		);
	}

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
				gap: 16,
			}}
		>
			{/* Main profile details */}
			<div className="card card-pad">
				<div className="eyebrow" style={{ marginBottom: 10 }}>
					Contact &amp; identity
				</div>
				<dl
					style={{
						display: "grid",
						gridTemplateColumns: "1fr",
						gap: 10,
						margin: 0,
					}}
				>
					<DetailRow
						label="Full name"
						value={[c.firstName, c.lastName].filter(Boolean).join(" ")}
					/>
					<DetailRow label="Email" value={c.email} />
					<DetailRow label="Phone" value={c.phone ?? "—"} />
					<DetailRow label="Country" value={c.country ?? "—"} />
					{/* Sensitive fields — null means redacted by API for non-managing roles */}
					<DetailRow
						label="Date of birth"
						redacted={c.dateOfBirth === null}
						value={c.dateOfBirth ?? (c.dateOfBirth === null ? "Hidden" : "—")}
					/>
					<DetailRow
						label="Gender"
						redacted={c.gender === null}
						value={c.gender ?? "Hidden"}
					/>
					<DetailRow
						label="Address"
						redacted={c.address === null}
						value={c.address ?? "Hidden"}
					/>
				</dl>
			</div>

			{/* Sidebar: source + links */}
			<div>
				<div className="card card-pad">
					<div className="eyebrow" style={{ marginBottom: 10 }}>
						Pipeline info
					</div>
					<dl
						style={{
							display: "grid",
							gridTemplateColumns: "1fr",
							gap: 10,
							margin: 0,
						}}
					>
						<DetailRow
							label="Source"
							value={SOURCE_LABEL[c.source] ?? c.source}
						/>
						<DetailRow
							label="Status"
							value={
								CANDIDATE_STATUS_LABEL[c.status as CandidateStatus] ?? c.status
							}
						/>
						<DetailRow
							label="Added"
							value={new Date(c.createdAt).toLocaleDateString()}
						/>
					</dl>
				</div>
				{(c.resumeUrl ?? c.portfolioUrl ?? c.linkedinUrl) && (
					<div className="card card-pad" style={{ marginTop: 16 }}>
						<div className="eyebrow" style={{ marginBottom: 10 }}>
							Links
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							{safeHttpUrl(c.linkedinUrl) && (
								<a
									href={safeHttpUrl(c.linkedinUrl)}
									rel="noopener noreferrer"
									style={{ fontSize: 13, color: "var(--fg-2)" }}
									target="_blank"
								>
									LinkedIn
								</a>
							)}
							{safeHttpUrl(c.resumeUrl) && (
								<a
									href={safeHttpUrl(c.resumeUrl)}
									rel="noopener noreferrer"
									style={{ fontSize: 13, color: "var(--fg-2)" }}
									target="_blank"
								>
									Resume
								</a>
							)}
							{safeHttpUrl(c.portfolioUrl) && (
								<a
									href={safeHttpUrl(c.portfolioUrl)}
									rel="noopener noreferrer"
									style={{ fontSize: 13, color: "var(--fg-2)" }}
									target="_blank"
								>
									Portfolio
								</a>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Applications Section ────────────────────────────────────────────────────

function ApplicationsSection({
	appRows,
	isLoading,
}: {
	appRows: {
		id: string;
		openingTitle: string;
		stage: string;
		appliedAt: Date;
	}[];
	isLoading: boolean;
}) {
	if (isLoading) {
		return (
			<div
				className="card card-pad"
				style={{ color: "var(--fg-3)", fontSize: 13 }}
			>
				Loading applications…
			</div>
		);
	}

	if (appRows.length === 0) {
		return (
			<div className="card card-pad">
				<EmptyState
					description="When this candidate applies to a job opening, it will appear here."
					icon={<FileText size={20} />}
					title="No applications yet"
				/>
			</div>
		);
	}

	return (
		<div className="card" style={{ overflow: "hidden" }}>
			<table className="tbl">
				<thead>
					<tr>
						<th>Opening</th>
						<th>Stage</th>
						<th>Applied</th>
					</tr>
				</thead>
				<tbody>
					{appRows.map((app) => (
						<tr key={app.id}>
							<td style={{ fontWeight: 600, color: "var(--fg)" }}>
								{app.openingTitle}
							</td>
							<td>
								<span className="badge">
									{STAGE_LABEL[app.stage] ?? app.stage}
								</span>
							</td>
							<td style={{ color: "var(--fg-3)" }}>
								{app.appliedAt.toLocaleDateString()}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// ─── Interviews Section ───────────────────────────────────────────────────────

function InterviewsSection({
	rows,
	isLoading,
}: {
	rows: {
		id: string;
		applicationId: string;
		scheduledStart: string | Date;
		interviewType: string | null;
		status: string;
	}[];
	isLoading: boolean;
}) {
	if (isLoading) {
		return (
			<div
				className="card card-pad"
				style={{ color: "var(--fg-3)", fontSize: 13 }}
			>
				Loading interviews…
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="card card-pad">
				<EmptyState
					description="Once interviews are scheduled for this candidate's applications, they'll appear here."
					icon={<CalendarClock size={20} />}
					title="No interviews scheduled"
				/>
			</div>
		);
	}

	return (
		<div className="card" style={{ overflow: "hidden" }}>
			<table className="tbl">
				<thead>
					<tr>
						<th>When</th>
						<th>Type</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((iv) => {
						const status = iv.status as InterviewStatus;
						return (
							<tr key={iv.id}>
								<td style={{ whiteSpace: "nowrap", color: "var(--fg)" }}>
									{formatWhen(new Date(iv.scheduledStart))}
								</td>
								<td style={{ color: "var(--fg-2)" }}>
									{iv.interviewType ?? "—"}
								</td>
								<td>
									<span className={INTERVIEW_STATUS_TONE[status] ?? "badge"}>
										{INTERVIEW_STATUS_LABEL[status] ?? status}
									</span>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

// ─── Notes Section ────────────────────────────────────────────────────────────

function NotesSection({ query }: { query: ReturnType<typeof useQuery> }) {
	// API throws FORBIDDEN for non-managing roles — surface a gentle message
	const isForbidden =
		query.isError &&
		(query.error as { code?: string } | null)?.code === "FORBIDDEN";

	if (query.isLoading) {
		return (
			<div
				className="card card-pad"
				style={{ color: "var(--fg-3)", fontSize: 13 }}
			>
				Loading notes…
			</div>
		);
	}

	if (isForbidden) {
		return (
			<div className="card card-pad">
				<EmptyState
					description="You don't have access to notes for this candidate. Notes are visible to recruiters and HR only."
					icon={<StickyNote size={20} />}
					title="Notes are restricted"
				/>
			</div>
		);
	}

	if (query.isError) {
		return (
			<div className="card card-pad">
				<EmptyState
					description="An error occurred loading notes. Please try again later."
					icon={<StickyNote size={20} />}
					title="Could not load notes"
				/>
			</div>
		);
	}

	const notes = (query.data ?? []) as {
		id: string;
		body: string;
		authorUserId: string;
		createdAt: string | Date;
	}[];

	if (notes.length === 0) {
		return (
			<div className="card card-pad">
				<EmptyState
					description="Internal notes added by recruiters and HR will appear here."
					icon={<StickyNote size={20} />}
					title="No notes yet"
				/>
			</div>
		);
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
			{notes.map((note) => (
				<div className="card card-pad" key={note.id}>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "flex-start",
							marginBottom: 8,
							gap: 12,
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
							<MessageSquare
								size={13}
								style={{ color: "var(--fg-3)", flexShrink: 0 }}
							/>
							<span style={{ fontSize: 12, color: "var(--fg-3)" }}>
								Team member
							</span>
						</div>
						<span
							style={{
								fontSize: 12,
								color: "var(--fg-3)",
								whiteSpace: "nowrap",
							}}
						>
							{new Date(note.createdAt).toLocaleDateString()}
						</span>
					</div>
					<p
						style={{
							margin: 0,
							fontSize: 13.5,
							lineHeight: 1.55,
							color: "var(--fg)",
							whiteSpace: "pre-wrap",
						}}
					>
						{note.body}
					</p>
				</div>
			))}
		</div>
	);
}

// ─── Documents Section ────────────────────────────────────────────────────────

function DocumentsSection({ query }: { query: ReturnType<typeof useQuery> }) {
	const isForbidden =
		query.isError &&
		(query.error as { code?: string } | null)?.code === "FORBIDDEN";

	if (query.isLoading) {
		return (
			<div
				className="card card-pad"
				style={{ color: "var(--fg-3)", fontSize: 13 }}
			>
				Loading documents…
			</div>
		);
	}

	if (isForbidden) {
		return (
			<div className="card card-pad">
				<EmptyState
					description="You don't have access to documents for this candidate."
					icon={<FileText size={20} />}
					title="Documents are restricted"
				/>
			</div>
		);
	}

	if (query.isError) {
		return (
			<div className="card card-pad">
				<EmptyState
					description="An error occurred loading documents. Please try again later."
					icon={<FileText size={20} />}
					title="Could not load documents"
				/>
			</div>
		);
	}

	const docs = (query.data ?? []) as {
		id: string;
		fileName: string;
		documentType: string;
		createdAt: string | Date;
		fileUrl: string;
	}[];

	if (docs.length === 0) {
		return (
			<div className="card card-pad">
				<EmptyState
					description="Resumes, cover letters, and other files attached to this candidate will appear here."
					icon={<FileText size={20} />}
					title="No documents uploaded"
				/>
			</div>
		);
	}

	return (
		<div className="card" style={{ overflow: "hidden" }}>
			<table className="tbl">
				<thead>
					<tr>
						<th>File name</th>
						<th>Type</th>
						<th>Uploaded</th>
					</tr>
				</thead>
				<tbody>
					{docs.map((doc) => (
						<tr key={doc.id}>
							<td>
								{safeHttpUrl(doc.fileUrl) ? (
									<a
										href={safeHttpUrl(doc.fileUrl)}
										rel="noopener noreferrer"
										style={{ color: "var(--fg)", fontWeight: 600 }}
										target="_blank"
									>
										{doc.fileName}
									</a>
								) : (
									<span style={{ color: "var(--fg)", fontWeight: 600 }}>
										{doc.fileName}
									</span>
								)}
							</td>
							<td style={{ color: "var(--fg-2)" }}>{doc.documentType}</td>
							<td style={{ color: "var(--fg-3)" }}>
								{new Date(doc.createdAt).toLocaleDateString()}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// ─── DetailRow ────────────────────────────────────────────────────────────────

function DetailRow({
	label,
	value,
	redacted = false,
}: {
	label: string;
	value: string;
	redacted?: boolean;
}) {
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "120px 1fr",
				gap: 8,
				fontSize: 13,
			}}
		>
			<dt style={{ color: "var(--fg-3)" }}>{label}</dt>
			<dd
				style={{
					margin: 0,
					color: redacted ? "var(--fg-3)" : "var(--fg)",
					fontStyle: redacted ? "italic" : "normal",
				}}
			>
				{value}
			</dd>
		</div>
	);
}
