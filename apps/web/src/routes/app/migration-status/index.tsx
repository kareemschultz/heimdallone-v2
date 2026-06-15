import { StatTile, StatTileGrid } from "@Heimdallone/ui/components/stat-tile";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	CheckCircle2,
	DatabaseBackup,
	Mail,
	ShieldAlert,
	Users,
} from "lucide-react";
import { useContext } from "react";
import { EmptyState } from "@/components/empty-state";
import { canManageHR } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/migration-status/")({
	component: MigrationStatusPage,
});

type Category =
	| "login_active"
	| "login_pending_ack"
	| "login_pending_review"
	| "no_login_has_email"
	| "no_login_missing_email";

const CATEGORY_LABEL: Record<Category, string> = {
	login_active: "Login active",
	login_pending_ack: "Awaiting first-login acknowledgement",
	login_pending_review: "Profile review pending",
	no_login_has_email: "No login — has email (can be invited)",
	no_login_missing_email: "No login — email needed",
};

const CATEGORY_TONE: Record<Category, string> = {
	login_active: "var(--success)",
	login_pending_ack: "var(--warning)",
	login_pending_review: "var(--warning)",
	no_login_has_email: "var(--fg-3)",
	no_login_missing_email: "var(--danger)",
};

function NoAccess() {
	return (
		<div className="page">
			<div className="page-header">
				<h1 className="page-title">Migration status</h1>
			</div>
			<EmptyState
				description="The migration status report is available to administrators and HR."
				icon={<DatabaseBackup size={28} />}
				title="You don't have access to the migration status report"
			/>
		</div>
	);
}

function MigrationStatusPage() {
	const org = useContext(OrgCtx);
	const canView = canManageHR(org.memberRole);
	const report = useQuery(
		orpc.migration.admin.report.queryOptions({ enabled: canView })
	);

	if (!canView) {
		return <NoAccess />;
	}

	const summary = report.data?.summary;
	const items = report.data?.items ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<h1 className="page-title">Migration status</h1>
				<p className="page-subtitle">
					Who was migrated, whose login was preserved, who still needs an email
					or login, and who has acknowledged the first-login notice.
				</p>
			</div>

			{report.isError ? (
				<EmptyState
					description="The report could not be loaded. Please try again."
					icon={<ShieldAlert size={28} />}
					title="Couldn't load the migration status report"
				/>
			) : (
				<>
					<StatTileGrid>
						<StatTile
							icon={Users}
							label="Employees"
							value={String(summary?.total ?? 0)}
						/>
						<StatTile
							icon={CheckCircle2}
							label="Logins preserved"
							tone="success"
							value={String(summary?.loginPreserved ?? 0)}
						/>
						<StatTile
							hint="awaiting first-login acknowledgement"
							icon={ShieldAlert}
							label="Pending acknowledgement"
							tone="warning"
							value={String(summary?.pendingAck ?? 0)}
						/>
						<StatTile
							hint="confirm if they need portal access"
							icon={Mail}
							label="No email — needs decision"
							tone="danger"
							value={String(summary?.missingEmail ?? 0)}
						/>
					</StatTileGrid>

					<div className="table-wrap" style={{ marginTop: "1rem" }}>
						<table className="data-table">
							<thead>
								<tr>
									<th>Employee</th>
									<th>Email</th>
									<th>Login</th>
									<th>Status</th>
									<th>Acknowledged</th>
									<th>Reviewed</th>
								</tr>
							</thead>
							<tbody>
								{items.length === 0 ? (
									<tr>
										<td colSpan={6}>
											{report.isLoading
												? "Loading…"
												: "No employees in this organization yet."}
										</td>
									</tr>
								) : (
									items.map((row) => (
										<tr key={row.employeeId}>
											<td>
												<Link
													params={{ id: row.employeeId }}
													to="/app/employees/$id"
												>
													{row.name}
												</Link>
											</td>
											<td>{row.email ?? "— (no login)"}</td>
											<td>{row.hasLogin ? "Yes" : "No"}</td>
											<td>
												<span
													style={{
														color: CATEGORY_TONE[row.category as Category],
														fontWeight: 500,
													}}
												>
													{CATEGORY_LABEL[row.category as Category]}
												</span>
											</td>
											<td>{row.acknowledged ? "Yes" : "—"}</td>
											<td>{row.profileReviewed ? "Yes" : "—"}</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
					<p
						className="text-muted-foreground"
						style={{ fontSize: "0.75rem", marginTop: "0.75rem" }}
					>
						No-login employees are listed so HR can confirm whether each should
						receive a real email/login before cutover. Placeholder emails are
						never created.
					</p>
				</>
			)}
		</div>
	);
}
