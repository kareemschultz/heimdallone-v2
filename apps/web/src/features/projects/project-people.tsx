import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import type { ProjectMemberRow } from "@/features/projects/types";
import { client, orpc } from "@/utils/orpc";

function invalidateProjects(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("projects"),
	});
}

const MEMBER_ROLE_LABEL: Record<string, string> = {
	lead: "Lead",
	member: "Member",
	viewer: "Viewer",
};

interface EmployeeOption {
	firstName: string;
	id: string;
	lastName: string | null;
}

function AddMemberDialog({
	projectId,
	existingIds,
	onClose,
	onDone,
}: {
	existingIds: Set<string>;
	onClose: () => void;
	onDone: () => void;
	projectId: string;
}) {
	const [employeeId, setEmployeeId] = useState("");
	const [memberRole, setMemberRole] = useState("member");
	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { page: 1, pageSize: 100 },
		})
	);
	const emps = (
		(employees.data as { data?: EmployeeOption[] } | undefined)?.data ?? []
	).filter((e) => !existingIds.has(e.id));

	const add = useMutation({
		mutationFn: () =>
			client.projects.members.add({
				projectId,
				employeeId,
				role: memberRole as "lead" | "member" | "viewer",
			}),
		onSuccess: () => {
			toast.success("Member added");
			onDone();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not add the member"),
	});

	return (
		<Modal
			footer={
				<>
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!employeeId || add.isPending}
						onClick={() => add.mutate()}
						type="button"
					>
						Add member
					</button>
				</>
			}
			icon={<UserPlus size={18} />}
			intro="Choose an employee and assign them a role on this project."
			onClose={onClose}
			title="Add a team member"
		>
			{employees.isLoading ? <div className="pj-skeleton" /> : null}
			<label className="pj-field" htmlFor="pj-member-employee">
				<span>Employee</span>
				<select
					id="pj-member-employee"
					onChange={(e) => setEmployeeId(e.target.value)}
					value={employeeId}
				>
					<option value="">Choose an employee…</option>
					{emps.map((e) => (
						<option key={e.id} value={e.id}>
							{e.firstName} {e.lastName ?? ""}
						</option>
					))}
				</select>
			</label>
			<label className="pj-field" htmlFor="pj-member-role">
				<span>Role on this project</span>
				<select
					id="pj-member-role"
					onChange={(e) => setMemberRole(e.target.value)}
					value={memberRole}
				>
					<option value="member">Member</option>
					<option value="lead">Lead</option>
					<option value="viewer">Viewer</option>
				</select>
			</label>
		</Modal>
	);
}

export function ProjectPeople({
	projectId,
	canManageMembers,
}: {
	canManageMembers: boolean;
	projectId: string;
}) {
	const qc = useQueryClient();
	const [showAdd, setShowAdd] = useState(false);
	const members = useQuery(
		orpc.projects.members.list.queryOptions({ input: { projectId } })
	);
	const rows = (members.data as ProjectMemberRow[] | undefined) ?? [];
	const existingIds = new Set(rows.map((m) => m.employeeId));

	const remove = useMutation({
		mutationFn: (memberId: string) =>
			client.projects.members.remove({ projectId, memberId }),
		onSuccess: () => {
			toast.success("Member removed");
			invalidateProjects(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not remove the member"),
	});

	return (
		<div className="pj-panel">
			<div className="pj-panel-head">
				<span className="pj-section-title">Team</span>
				{canManageMembers ? (
					<button
						className="btn btn-sm btn-primary"
						onClick={() => setShowAdd(true)}
						type="button"
					>
						Add member
					</button>
				) : null}
			</div>

			{members.isLoading ? <div className="pj-skeleton" /> : null}
			{members.isError ? (
				<EmptyState
					compact
					description="Could not load the team. Try again."
					title="Something went wrong"
				/>
			) : null}
			{!(members.isLoading || members.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="No one has been added to this project yet."
					title="No team members"
				/>
			) : null}

			{rows.length > 0 ? (
				<table className="pj-table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Role</th>
							<th>Allocation</th>
							{canManageMembers ? <th aria-label="Actions" /> : null}
						</tr>
					</thead>
					<tbody>
						{rows.map((m) => (
							<tr key={m.id}>
								<td>{m.employeeName ?? "—"}</td>
								<td>{MEMBER_ROLE_LABEL[m.role] ?? m.role}</td>
								<td>
									{m.allocationPercent === null
										? "—"
										: `${m.allocationPercent}%`}
								</td>
								{canManageMembers ? (
									<td>
										<button
											className="btn btn-sm"
											disabled={remove.isPending}
											onClick={() => remove.mutate(m.id)}
											type="button"
										>
											Remove
										</button>
									</td>
								) : null}
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			{showAdd ? (
				<AddMemberDialog
					existingIds={existingIds}
					onClose={() => setShowAdd(false)}
					onDone={() => {
						setShowAdd(false);
						invalidateProjects(qc);
					}}
					projectId={projectId}
				/>
			) : null}
		</div>
	);
}
