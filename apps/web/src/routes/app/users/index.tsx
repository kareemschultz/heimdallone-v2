import { StatTile, StatTileGrid } from "@Heimdallone/ui/components/stat-tile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Check,
	Copy,
	Mail,
	ShieldCheck,
	UserMinus,
	UserPlus,
	Users,
	X,
} from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/users.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { authClient } from "@/lib/auth-client";
import { canManageHR } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

export const Route = createFileRoute("/app/users/")({
	component: UsersAccessPage,
});

// v2 organization roles (Better Auth `ac` roles in packages/auth/permissions.ts).
// Owner can assign any of these; the server `ac` rejects assignments the caller
// is not permitted to make regardless of what this picker shows.
const ROLE_CATALOGUE: { value: string; label: string; description: string }[] =
	[
		{
			value: "tenant_owner",
			label: "Owner",
			description:
				"Full access. Manages the workspace, billing, members and ownership.",
		},
		{
			value: "tenant_admin",
			label: "Administrator",
			description:
				"Full operational access including members and settings; not billing/ownership.",
		},
		{
			value: "hr_admin",
			label: "HR Admin",
			description:
				"Manages employees, contracts, leave, onboarding/offboarding and members.",
		},
		{
			value: "payroll_admin",
			label: "Payroll Admin",
			description: "Runs payroll, manages pay items, tax and finance reports.",
		},
		{
			value: "manager",
			label: "Manager",
			description:
				"Manages their own team — attendance, leave approvals, roster, reviews.",
		},
		{
			value: "employee",
			label: "Employee",
			description: "Self-service: own profile, payslips, leave, schedule.",
		},
		{
			value: "auditor",
			label: "Auditor",
			description: "Read-only access across modules for review and compliance.",
		},
		{
			value: "recruiter",
			label: "Recruiter",
			description: "Recruitment pipeline and candidate onboarding.",
		},
		{
			value: "helpdesk_agent",
			label: "Helpdesk Agent",
			description: "Helpdesk request queue and assignment.",
		},
		{
			value: "project_manager",
			label: "Project Manager",
			description: "Org-wide projects, tasks, milestones and project time.",
		},
		{
			value: "sales_admin",
			label: "Sales Admin",
			description: "Full CRM — customers, leads, deals and pipeline.",
		},
		{
			value: "sales_rep",
			label: "Sales Rep",
			description: "Own CRM records — leads, deals and activities.",
		},
		{
			value: "inventory_manager",
			label: "Inventory Manager",
			description:
				"Full inventory — catalogue, locations, stock movements and approvals.",
		},
		{
			value: "stock_officer",
			label: "Stock Officer",
			description:
				"Maintains catalogue and proposes stock movements (no approval).",
		},
	];

function roleLabel(role: string): string {
	return ROLE_CATALOGUE.find((r) => r.value === role)?.label ?? role;
}

interface MemberRow {
	createdAt?: string | Date;
	id: string;
	role: string;
	user?: { name?: string | null; email?: string | null };
	userId: string;
}

interface InvitationRow {
	email: string;
	expiresAt?: string | Date;
	id: string;
	role?: string | null;
	status: string;
}

function formatDate(value?: string | Date): string {
	if (!value) {
		return "—";
	}
	const d = typeof value === "string" ? new Date(value) : value;
	return Number.isNaN(d.getTime())
		? "—"
		: d.toLocaleDateString(undefined, {
				day: "numeric",
				month: "short",
				year: "numeric",
			});
}

function UsersAccessPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageHR(org.memberRole);
	const activeOrg = authClient.useActiveOrganization();
	const orgId = activeOrg.data?.id ?? "";
	const qc = useQueryClient();

	const [inviteOpen, setInviteOpen] = useState(false);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState("employee");
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [confirmRemove, setConfirmRemove] = useState<{
		id: string;
		email: string;
	} | null>(null);

	const membersQuery = useQuery({
		queryKey: ["org-members", orgId],
		enabled: !!orgId,
		queryFn: async () => {
			const res = await authClient.organization.listMembers({
				query: { organizationId: orgId },
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to load members");
			}
			return (res.data?.members ?? []) as unknown as MemberRow[];
		},
	});

	const invitationsQuery = useQuery({
		queryKey: ["org-invitations", orgId],
		enabled: !!orgId && canManage,
		queryFn: async () => {
			const res = await authClient.organization.listInvitations({
				query: { organizationId: orgId },
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to load invitations");
			}
			return (res.data ?? []) as unknown as InvitationRow[];
		},
	});

	const invalidate = () => {
		qc.invalidateQueries({ queryKey: ["org-members", orgId] });
		qc.invalidateQueries({ queryKey: ["org-invitations", orgId] });
	};

	const updateRole = useMutation({
		mutationFn: async (input: { memberId: string; role: string }) => {
			const res = await authClient.organization.updateMemberRole({
				memberId: input.memberId,
				role: input.role as Parameters<
					typeof authClient.organization.updateMemberRole
				>[0]["role"],
				organizationId: orgId,
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to update role");
			}
		},
		onSuccess: () => {
			toast.success("Role updated.");
			invalidate();
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const removeMember = useMutation({
		mutationFn: async (memberIdOrEmail: string) => {
			const res = await authClient.organization.removeMember({
				memberIdOrEmail,
				organizationId: orgId,
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to remove member");
			}
		},
		onSuccess: () => {
			toast.success("Member removed.");
			invalidate();
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const inviteMember = useMutation({
		mutationFn: async (input: { email: string; role: string }) => {
			const res = await authClient.organization.inviteMember({
				email: input.email.trim().toLowerCase(),
				role: input.role as Parameters<
					typeof authClient.organization.inviteMember
				>[0]["role"],
				organizationId: orgId,
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to create invitation");
			}
		},
		onSuccess: () => {
			toast.success("Invitation created. Copy the link to share it.");
			setInviteEmail("");
			setInviteRole("employee");
			setInviteOpen(false);
			invalidate();
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const cancelInvitation = useMutation({
		mutationFn: async (invitationId: string) => {
			const res = await authClient.organization.cancelInvitation({
				invitationId,
			});
			if (res.error) {
				throw new Error(res.error.message ?? "Failed to cancel invitation");
			}
		},
		onSuccess: () => {
			toast.success("Invitation cancelled.");
			invalidate();
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const copyInviteLink = async (invitationId: string) => {
		const link = `${window.location.origin}/accept-invitation/${invitationId}`;
		try {
			await navigator.clipboard.writeText(link);
			setCopiedId(invitationId);
			toast.success("Invite link copied.");
			setTimeout(() => setCopiedId(null), 2000);
		} catch {
			toast.error(`Could not copy. Link: ${link}`);
		}
	};

	if (!canManage) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">Users & Access</h1>
				</div>
				<EmptyState
					description="Only workspace owners, administrators and HR admins can manage members and invitations."
					icon={<ShieldCheck size={32} />}
					title="You don't have access to user management"
				/>
			</div>
		);
	}

	const members = membersQuery.data ?? [];
	const pending = (invitationsQuery.data ?? []).filter(
		(i) => i.status === "pending"
	);
	const adminCount = members.filter((m) =>
		["tenant_owner", "tenant_admin", "hr_admin"].includes(m.role)
	).length;

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Users & Access</span>
					</div>
					<h1 className="page-title">Users & Access</h1>
					<p className="page-sub">
						Manage who can sign in to {org.orgName}, their roles, and pending
						invitations.
					</p>
				</div>
				<button
					className="btn btn-primary"
					onClick={() => setInviteOpen(true)}
					type="button"
				>
					<UserPlus size={14} />
					Invite member
				</button>
			</div>

			<StatTileGrid>
				<StatTile
					icon={Users}
					label="Members"
					tone="primary"
					value={members.length}
				/>
				<StatTile icon={ShieldCheck} label="Admins" value={adminCount} />
				<StatTile
					icon={Mail}
					label="Pending invites"
					tone={pending.length > 0 ? "warning" : "default"}
					value={pending.length}
				/>
			</StatTileGrid>

			{/* Members */}
			<div className="card card-pad" style={{ marginTop: 18 }}>
				<div className="card-head-row">
					<h4 style={{ fontSize: "15px", fontWeight: 600 }}>Members</h4>
				</div>
				{membersQuery.isLoading && (
					<p className="page-sub">Loading members...</p>
				)}
				{membersQuery.isError && (
					<p className="page-sub" style={{ color: "var(--danger)" }}>
						Could not load members. Try again.
					</p>
				)}
				{!(membersQuery.isLoading || membersQuery.isError) &&
					members.length === 0 && (
						<EmptyState
							description="Invite people to give them access to this workspace."
							icon={<Users size={28} />}
							title="No members yet"
						/>
					)}
				{members.length > 0 && (
					<div className="table-wrap">
						<table className="tbl">
							<thead>
								<tr>
									<th>Member</th>
									<th>Role</th>
									<th>Joined</th>
									<th aria-label="Actions" />
								</tr>
							</thead>
							<tbody>
								{members.map((m) => (
									<tr key={m.id}>
										<td>
											<div className="usr-identity">
												<span className="usr-name">
													{m.user?.name || m.user?.email || "Member"}
												</span>
												<span className="usr-email">{m.user?.email}</span>
											</div>
										</td>
										<td className="usr-role-cell">
											<select
												aria-label={`Role for ${m.user?.email}`}
												className="usr-role-select"
												onChange={(e) =>
													updateRole.mutate({
														memberId: m.id,
														role: e.target.value,
													})
												}
												value={m.role}
											>
												{ROLE_CATALOGUE.map((r) => (
													<option key={r.value} value={r.value}>
														{r.label}
													</option>
												))}
												{!ROLE_CATALOGUE.some((r) => r.value === m.role) && (
													<option value={m.role}>{m.role}</option>
												)}
											</select>
										</td>
										<td>{formatDate(m.createdAt)}</td>
										<td style={{ textAlign: "right" }}>
											<button
												className="btn btn-ghost btn-sm"
												onClick={() =>
													setConfirmRemove({
														id: m.id,
														email: m.user?.email ?? "this member",
													})
												}
												type="button"
											>
												<X size={13} />
												Remove
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* Pending invitations */}
			<div className="card card-pad" style={{ marginTop: 18 }}>
				<div className="card-head-row">
					<h4 style={{ fontSize: "15px", fontWeight: 600 }}>
						Pending invitations
					</h4>
				</div>
				<p className="page-sub" style={{ marginTop: 0 }}>
					Invitations are accepted by signing in with the invited email at the
					invite link. Email delivery is not configured — use{" "}
					<strong>Copy link</strong> to share it.
				</p>
				{pending.length === 0 ? (
					<EmptyState
						description="Invite a member to see pending invitations here."
						icon={<Mail size={28} />}
						title="No pending invitations"
					/>
				) : (
					<div className="table-wrap">
						<table className="tbl">
							<thead>
								<tr>
									<th>Email</th>
									<th>Role</th>
									<th>Expires</th>
									<th aria-label="Actions" />
								</tr>
							</thead>
							<tbody>
								{pending.map((inv) => (
									<tr key={inv.id}>
										<td>{inv.email}</td>
										<td>
											<span className="usr-role-static">
												{roleLabel(inv.role ?? "employee")}
											</span>
										</td>
										<td>{formatDate(inv.expiresAt)}</td>
										<td style={{ textAlign: "right" }}>
											<div
												style={{
													display: "flex",
													gap: 6,
													justifyContent: "flex-end",
												}}
											>
												<button
													className="btn btn-outline btn-sm"
													onClick={() => copyInviteLink(inv.id)}
													type="button"
												>
													{copiedId === inv.id ? (
														<Check size={13} />
													) : (
														<Copy size={13} />
													)}
													{copiedId === inv.id ? "Copied" : "Copy link"}
												</button>
												<button
													className="btn btn-ghost btn-sm"
													onClick={() => cancelInvitation.mutate(inv.id)}
													type="button"
												>
													<X size={13} />
													Cancel
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* Invite dialog */}
			{inviteOpen && (
				<Modal
					footer={
						<>
							<button
								className="btn btn-ghost"
								onClick={() => setInviteOpen(false)}
								type="button"
							>
								Cancel
							</button>
							<button
								className="btn btn-primary"
								disabled={inviteMember.isPending || inviteEmail.trim() === ""}
								onClick={() =>
									inviteMember.mutate({ email: inviteEmail, role: inviteRole })
								}
								type="button"
							>
								<Mail size={14} />
								{inviteMember.isPending ? "Creating..." : "Create invitation"}
							</button>
						</>
					}
					icon={<UserPlus size={18} />}
					intro="They will be able to accept once they sign in with this email. Email delivery is not configured — copy and share the invite link after creating."
					onClose={() => setInviteOpen(false)}
					title="Invite a member"
				>
					<div className="usr-form-field">
						<label htmlFor="invite-email">Email address</label>
						<input
							id="invite-email"
							onChange={(e) => setInviteEmail(e.target.value)}
							placeholder="person@company.com"
							type="email"
							value={inviteEmail}
						/>
					</div>
					<div className="usr-form-field">
						<label htmlFor="invite-role">Role</label>
						<select
							id="invite-role"
							onChange={(e) => setInviteRole(e.target.value)}
							value={inviteRole}
						>
							{ROLE_CATALOGUE.map((r) => (
								<option key={r.value} value={r.value}>
									{r.label}
								</option>
							))}
						</select>
						<p className="usr-role-hint">
							{ROLE_CATALOGUE.find((r) => r.value === inviteRole)?.description}
						</p>
					</div>
				</Modal>
			)}

			{/* Remove confirmation */}
			{confirmRemove && (
				<Modal
					footer={
						<>
							<button
								className="btn btn-ghost"
								onClick={() => setConfirmRemove(null)}
								type="button"
							>
								Cancel
							</button>
							<button
								className="btn btn-primary"
								disabled={removeMember.isPending}
								onClick={() => {
									removeMember.mutate(confirmRemove.id);
									setConfirmRemove(null);
								}}
								type="button"
							>
								<X size={14} />
								Remove
							</button>
						</>
					}
					icon={<UserMinus size={18} />}
					intro={`Remove ${confirmRemove.email} from ${org.orgName}? They will lose access immediately. Their employee record is kept.`}
					onClose={() => setConfirmRemove(null)}
					title="Remove member"
				>
					{null}
				</Modal>
			)}
		</div>
	);
}
