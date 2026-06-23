import { StatTile, StatTileGrid } from "@Heimdallone/ui/components/stat-tile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	CheckCircle2,
	Copy,
	DatabaseBackup,
	KeyRound,
	Mail,
	ShieldAlert,
	Users,
} from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/modal";
import { canManageHR } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

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

// Roles HR may grant when creating a login. Excludes tenant_owner / tenant_admin
// (elevated roles that require a deliberate separate action).
const GRANTABLE_ROLES = [
	{ value: "employee", label: "Employee" },
	{ value: "manager", label: "Manager" },
	{ value: "hr_admin", label: "HR Admin" },
	{ value: "payroll_admin", label: "Payroll Admin" },
	{ value: "auditor", label: "Auditor" },
	{ value: "recruiter", label: "Recruiter" },
	{ value: "helpdesk_agent", label: "Helpdesk Agent" },
	{ value: "project_manager", label: "Project Manager" },
	{ value: "sales_admin", label: "Sales Admin" },
	{ value: "sales_rep", label: "Sales Rep" },
	{ value: "inventory_manager", label: "Inventory Manager" },
	{ value: "stock_officer", label: "Stock Officer" },
] as const;

type GrantableRole = (typeof GRANTABLE_ROLES)[number]["value"];

interface ReportItem {
	acknowledged: boolean;
	category: string;
	email: string | null;
	employeeId: string;
	hasLogin: boolean;
	migratedFromV1: boolean;
	name: string;
	profileReviewed: boolean;
}

// ── Create Login Dialog ──────────────────────────────────────────────────────

interface CreatedLogin {
	email: string;
	role: string;
	temporaryPassword: string;
}

interface CreateLoginDialogProps {
	employee: ReportItem;
	onClose: () => void;
	onCreated: () => void;
}

function CreateLoginDialog({
	employee,
	onClose,
	onCreated,
}: CreateLoginDialogProps) {
	const [email, setEmail] = useState(employee.email ?? "");
	const [role, setRole] = useState<GrantableRole>("employee");
	const [error, setError] = useState<string | null>(null);
	const [created, setCreated] = useState<CreatedLogin | null>(null);
	const [copied, setCopied] = useState(false);

	const mutation = useMutation({
		mutationFn: () =>
			client.migration.admin.createLogin({
				employeeId: employee.employeeId,
				email: email.trim() || undefined,
				role,
			}),
		onSuccess: (data) => {
			setCreated({
				email: data.email,
				role: data.role,
				temporaryPassword: data.temporaryPassword,
			});
			onCreated();
		},
		onError: (err: Error) => {
			setError(err.message ?? "Could not create login.");
		},
	});

	function handleCreate() {
		setError(null);
		if (!email.trim()) {
			setError("An email address is required.");
			return;
		}
		mutation.mutate();
	}

	async function handleCopy() {
		if (!created) {
			return;
		}
		try {
			await navigator.clipboard.writeText(created.temporaryPassword);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Could not copy to clipboard.");
		}
	}

	// ── Success state: show temp password once ────────────────────────────────
	if (created) {
		return (
			<Modal
				footer={
					<button className="btn btn-primary" onClick={onClose} type="button">
						Done
					</button>
				}
				icon={<KeyRound size={18} />}
				onClose={onClose}
				title="Login created"
			>
				<p style={{ marginBottom: "0.75rem" }}>
					A login has been created for <strong>{employee.name}</strong> (
					{created.email}, role: {created.role}).
				</p>
				<div
					style={{
						background: "var(--surface-2)",
						borderRadius: "0.375rem",
						padding: "0.75rem",
						marginBottom: "0.75rem",
					}}
				>
					<p
						style={{
							fontSize: "0.75rem",
							color: "var(--fg-3)",
							marginBottom: "0.25rem",
						}}
					>
						Temporary password (shown once — share securely, face-to-face or via
						a private channel):
					</p>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "0.5rem",
						}}
					>
						<code
							style={{
								flex: 1,
								fontFamily: "monospace",
								fontSize: "0.9rem",
								wordBreak: "break-all",
							}}
						>
							{created.temporaryPassword}
						</code>
						<button
							aria-label="Copy temporary password"
							className="btn"
							onClick={handleCopy}
							style={{ flexShrink: 0 }}
							type="button"
						>
							<Copy size={14} />
							{copied ? "Copied" : "Copy"}
						</button>
					</div>
				</div>
				<p
					style={{
						fontSize: "0.75rem",
						color: "var(--danger)",
					}}
				>
					This password will not be shown again. The employee should change it
					on first login.
				</p>
			</Modal>
		);
	}

	// ── Create form ───────────────────────────────────────────────────────────
	return (
		<Modal
			footer={
				<>
					<button
						className="btn"
						disabled={mutation.isPending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={mutation.isPending}
						onClick={handleCreate}
						type="button"
					>
						{mutation.isPending ? "Creating…" : "Create login"}
					</button>
				</>
			}
			icon={<KeyRound size={18} />}
			intro="A temporary password will be generated. Share it with the employee securely."
			onClose={onClose}
			title={`Create login for ${employee.name}`}
		>
			<div className="fn-field">
				<label htmlFor="cl-email">Email address</label>
				<input
					autoComplete="off"
					id="cl-email"
					onChange={(e) => setEmail(e.target.value)}
					placeholder="employee@example.com"
					type="email"
					value={email}
				/>
				{employee.category === "no_login_missing_email" ? (
					<p style={{ fontSize: "0.75rem", color: "var(--fg-3)" }}>
						No email is on file. Enter one to create this login.
					</p>
				) : null}
			</div>

			<div className="fn-field">
				<label htmlFor="cl-role">Portal role</label>
				<select
					id="cl-role"
					onChange={(e) => setRole(e.target.value as GrantableRole)}
					value={role}
				>
					{GRANTABLE_ROLES.map((r) => (
						<option key={r.value} value={r.value}>
							{r.label}
						</option>
					))}
				</select>
			</div>

			{error ? (
				<p style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</p>
			) : null}
		</Modal>
	);
}

// ── Page ─────────────────────────────────────────────────────────────────────

function NoAccess() {
	return (
		<div className="page">
			<div className="page-header">
				<h1 className="page-title">Migration status</h1>
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "0.5rem",
					padding: "3rem 0",
					color: "var(--fg-3)",
				}}
			>
				<DatabaseBackup size={28} />
				<p>
					The migration status report is available to administrators and HR.
				</p>
			</div>
		</div>
	);
}

function MigrationStatusPage() {
	const org = useContext(OrgCtx);
	const canView = canManageHR(org.memberRole);
	const qc = useQueryClient();

	const report = useQuery(
		orpc.migration.admin.report.queryOptions({ enabled: canView })
	);

	const [loginTarget, setLoginTarget] = useState<ReportItem | null>(null);

	function invalidateReport() {
		qc.invalidateQueries(orpc.migration.admin.report.queryOptions());
	}

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
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "0.5rem",
						padding: "3rem 0",
						color: "var(--fg-3)",
					}}
				>
					<ShieldAlert size={28} />
					<p>The report could not be loaded. Please try again.</p>
				</div>
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
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{items.length === 0 ? (
									<tr>
										<td colSpan={7}>
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
											<td>
												{row.category === "no_login_has_email" ||
												row.category === "no_login_missing_email" ? (
													<button
														className="btn"
														onClick={() => setLoginTarget(row as ReportItem)}
														style={{
															fontSize: "0.8rem",
															padding: "0.25rem 0.6rem",
														}}
														type="button"
													>
														<KeyRound size={12} />
														Create login
													</button>
												) : null}
											</td>
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

			{loginTarget ? (
				<CreateLoginDialog
					employee={loginTarget}
					onClose={() => setLoginTarget(null)}
					onCreated={() => {
						toast.success(`Login created for ${loginTarget.name}.`);
						invalidateReport();
						// Keep dialog open so the admin can see and copy the temp password.
					}}
				/>
			) : null}
		</div>
	);
}
