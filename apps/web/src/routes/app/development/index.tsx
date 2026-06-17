import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Award,
	BookOpen,
	GraduationCap,
	Sparkles,
	TriangleAlert,
} from "lucide-react";
import { useContext } from "react";

import "@/styles/development.css";
import { EmptyState } from "@/components/empty-state";
import { DevBadge, expiryStateTone } from "@/features/development/badge";
import { DevelopmentTabs } from "@/features/development/development-tabs";
import { expiryBadgeText } from "@/features/development/labels";
import type {
	EmployeeCertification,
	EmployeeSkill,
	Enrollment,
	TrainingProgram,
} from "@/features/development/types";
import { canViewDevelopment } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/development/")({
	component: DevelopmentOverview,
});

function NoAccess() {
	return (
		<div className="page">
			<EmptyState
				description="You do not have access to the Development module."
				icon={<GraduationCap size={28} />}
				title="No access"
			/>
		</div>
	);
}

function DevelopmentOverview() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const isEmployeeOnly = role === "employee";

	const programsQuery = useQuery({
		...orpc.development.programs.list.queryOptions({ input: {} }),
		enabled: canViewDevelopment(role) && !isEmployeeOnly,
	});
	const enrollmentsQuery = useQuery({
		...orpc.development.enrollments.list.queryOptions({ input: {} }),
		enabled: canViewDevelopment(role) && !isEmployeeOnly,
	});
	const certsQuery = useQuery({
		...orpc.development.certifications.list.queryOptions({ input: undefined }),
		enabled: canViewDevelopment(role) && !isEmployeeOnly,
	});
	const skillsQuery = useQuery({
		...orpc.development.skills.employee.list.queryOptions({ input: undefined }),
		enabled: canViewDevelopment(role) && !isEmployeeOnly,
	});

	if (!canViewDevelopment(role)) {
		return <NoAccess />;
	}

	// Pure employees land on a page that LINKS to the self tabs (NOT a redirect).
	if (isEmployeeOnly) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<h1 className="page-title">Development</h1>
						<p className="page-sub">
							Your training, certifications and skills.
						</p>
					</div>
				</div>
				<DevelopmentTabs />
				<div className="dv-quicklinks">
					<Link className="dv-quicklink" to="/app/development/my-training">
						<span className="dv-ql-title">My training</span>
						<span className="dv-ql-sub">
							Browse programs and track your progress.
						</span>
					</Link>
					<Link
						className="dv-quicklink"
						to="/app/development/my-certifications"
					>
						<span className="dv-ql-title">My certifications</span>
						<span className="dv-ql-sub">
							Record credentials and watch expiry dates.
						</span>
					</Link>
					<Link className="dv-quicklink" to="/app/development/my-skills">
						<span className="dv-ql-title">My skills</span>
						<span className="dv-ql-sub">Record the skills you hold.</span>
					</Link>
				</div>
			</div>
		);
	}

	const programs = (programsQuery.data ?? []) as TrainingProgram[];
	const enrollments = (enrollmentsQuery.data ?? []) as Enrollment[];
	const certs = (certsQuery.data ?? []) as EmployeeCertification[];
	const skills = (skillsQuery.data ?? []) as EmployeeSkill[];

	const activePrograms = programs.filter((p) => p.status === "active").length;
	const inProgress = enrollments.filter(
		(e) => e.status === "in_progress"
	).length;
	const expiringSoon = certs.filter(
		(c) => c.expiryState === "expiring_soon"
	).length;
	const expired = certs.filter((c) => c.expiryState === "expired").length;
	const failed = enrollments.filter((e) => e.status === "failed");
	const expiringCerts = certs.filter(
		(c) =>
			c.status === "active" &&
			(c.expiryState === "expiring_soon" || c.expiryState === "expired")
	);

	const loading =
		programsQuery.isLoading ||
		enrollmentsQuery.isLoading ||
		certsQuery.isLoading ||
		skillsQuery.isLoading;
	const hasError =
		programsQuery.isError ||
		enrollmentsQuery.isError ||
		certsQuery.isError ||
		skillsQuery.isError;

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<h1 className="page-title">Development</h1>
					<p className="page-sub">
						Training, certifications and the skills matrix.
					</p>
				</div>
			</div>

			<DevelopmentTabs />

			{loading && <div className="dv-skeleton" />}
			{hasError && !loading && (
				<p className="page-sub" style={{ color: "var(--danger)" }}>
					Some data could not be loaded. Please retry.
				</p>
			)}

			{!(loading || hasError) && (
				<>
					<div className="dv-tiles">
						<div className="dv-tile">
							<span className="dv-tile-val">{activePrograms}</span>
							<span className="dv-tile-lbl">Active programs</span>
						</div>
						<div className="dv-tile">
							<span className="dv-tile-val">{inProgress}</span>
							<span className="dv-tile-lbl">Enrollments in progress</span>
						</div>
						<div className={`dv-tile ${expiringSoon > 0 ? "alert" : ""}`}>
							<span className="dv-tile-val">{expiringSoon}</span>
							<span className="dv-tile-lbl">Certs expiring ≤90d</span>
						</div>
						<div className={`dv-tile ${expired > 0 ? "alert" : ""}`}>
							<span className="dv-tile-val">{expired}</span>
							<span className="dv-tile-lbl">Certs expired</span>
						</div>
						<div className="dv-tile">
							<span className="dv-tile-val">{skills.length}</span>
							<span className="dv-tile-lbl">Skills assessed</span>
						</div>
					</div>

					<div className="dv-attention">
						<div className="dv-attention-title">
							<TriangleAlert
								size={15}
								style={{ marginRight: 6, verticalAlign: "-2px" }}
							/>
							Needs attention
						</div>
						<div className="dv-attention-group">
							<div className="dv-attention-head">
								Expiring / expired certifications
							</div>
							{expiringCerts.length === 0 ? (
								<p className="dv-attention-empty">
									No certifications need action.
								</p>
							) : (
								expiringCerts.slice(0, 8).map((c) => (
									<div className="dv-attention-item" key={c.id}>
										<span className="dv-name">{c.employeeName}</span>
										<span>{c.certificationTypeName}</span>
										<DevBadge tone={expiryStateTone(c.expiryState)}>
											{expiryBadgeText(
												c.expiryState,
												c.daysUntilExpiry,
												c.thresholdBucket
											)}
										</DevBadge>
									</div>
								))
							)}
						</div>
						<div className="dv-attention-group">
							<div className="dv-attention-head">Failed enrollments</div>
							{failed.length === 0 ? (
								<p className="dv-attention-empty">No failed enrollments.</p>
							) : (
								failed.slice(0, 8).map((e) => (
									<div className="dv-attention-item" key={e.id}>
										<span className="dv-name">{e.employeeName}</span>
										<span>Score: {e.scorePercent ?? "—"}%</span>
									</div>
								))
							)}
						</div>
					</div>

					<div className="dv-quicklinks">
						<Link className="dv-quicklink" to="/app/development/training">
							<span className="dv-ql-title">
								<BookOpen
									size={14}
									style={{ marginRight: 6, verticalAlign: "-2px" }}
								/>
								Training catalogue
							</span>
							<span className="dv-ql-sub">
								{programs.length} program(s). Enroll and assign.
							</span>
						</Link>
						<Link className="dv-quicklink" to="/app/development/certifications">
							<span className="dv-ql-title">
								<Award
									size={14}
									style={{ marginRight: 6, verticalAlign: "-2px" }}
								/>
								Certifications
							</span>
							<span className="dv-ql-sub">
								{certs.length} credential(s) tracked.
							</span>
						</Link>
						<Link className="dv-quicklink" to="/app/development/skills">
							<span className="dv-ql-title">
								<Sparkles
									size={14}
									style={{ marginRight: 6, verticalAlign: "-2px" }}
								/>
								Skills matrix
							</span>
							<span className="dv-ql-sub">
								Find who knows what, at what level.
							</span>
						</Link>
					</div>
				</>
			)}
		</div>
	);
}
