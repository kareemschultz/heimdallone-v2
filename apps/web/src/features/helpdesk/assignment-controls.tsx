import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { client, orpc } from "@/utils/orpc";

function invalidateHelpdesk(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("helpdesk"),
	});
}

const TERMINAL = new Set(["closed", "cancelled"]);

// Friendly labels for the agent-role tags shown in the picker.
const ROLE_LABEL: Record<string, string> = {
	owner: "Owner",
	tenant_owner: "Owner",
	admin: "Admin",
	tenant_admin: "Admin",
	hr_admin: "HR",
	helpdesk_agent: "Helpdesk agent",
};

interface Agent {
	name: string | null;
	role: string;
	userId: string;
}

function TeammatePicker({
	onClose,
	onPick,
	pending,
}: {
	onClose: () => void;
	onPick: (userId: string) => void;
	pending: boolean;
}) {
	const agents = useQuery(
		orpc.helpdesk.requests.assignableAgents.queryOptions({ input: undefined })
	);
	const rows = (agents.data ?? []) as Agent[];
	const [selected, setSelected] = useState("");

	return (
		<Modal
			footer={
				<>
					<button className="btn" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={!selected || pending}
						onClick={() => onPick(selected)}
						type="button"
					>
						Assign
					</button>
				</>
			}
			icon={<UserCheck size={18} />}
			intro="Pick a helpdesk agent or admin to take this request."
			onClose={onClose}
			title="Assign to a teammate"
		>
			{agents.isLoading ? <div className="hd-skeleton" /> : null}
			{!agents.isLoading && rows.length === 0 ? (
				<p className="hd-desc">No assignable teammates were found.</p>
			) : null}
			<label className="hd-field" htmlFor="hd-assign-agent">
				<span>Teammate</span>
				<select
					id="hd-assign-agent"
					onChange={(e) => setSelected(e.target.value)}
					value={selected}
				>
					<option value="">Choose a teammate…</option>
					{rows.map((a) => (
						<option key={a.userId} value={a.userId}>
							{a.name ?? "Teammate"} · {ROLE_LABEL[a.role] ?? a.role}
						</option>
					))}
				</select>
			</label>
		</Modal>
	);
}

/**
 * Assignment controls for the request detail. Only roles with `canAssign`
 * (helpdesk/HR/admin) see these; the server re-checks every call. Hidden once the
 * request is terminal (a closed/cancelled request can't be reassigned).
 */
export function AssignmentControls({
	requestId,
	assigneeName,
	status,
	canAssign,
}: {
	assigneeName: string | null;
	canAssign: boolean;
	requestId: string;
	status: string;
}) {
	const qc = useQueryClient();
	const [showPicker, setShowPicker] = useState(false);

	const done = (msg: string) => {
		toast.success(msg);
		setShowPicker(false);
		invalidateHelpdesk(qc);
	};
	const fail = (e: { message?: string }) =>
		toast.error(e?.message ?? "Could not update the assignment");

	const assignToMe = useMutation({
		mutationFn: () => client.helpdesk.requests.assignToMe({ id: requestId }),
		onSuccess: () => done("Assigned to you"),
		onError: fail,
	});
	const assignTeammate = useMutation({
		mutationFn: (userId: string) =>
			client.helpdesk.requests.assign({
				id: requestId,
				assignedToUserId: userId,
			}),
		onSuccess: () => done("Request assigned"),
		onError: fail,
	});
	const unassign = useMutation({
		mutationFn: () => client.helpdesk.requests.unassign({ id: requestId }),
		onSuccess: () => done("Returned to the unassigned pool"),
		onError: fail,
	});

	if (!canAssign || TERMINAL.has(status)) {
		return null;
	}

	const pending =
		assignToMe.isPending || assignTeammate.isPending || unassign.isPending;

	return (
		<div className="hd-assign">
			<div className="hd-assign-row">
				<span className="hd-k">Assignment</span>
				<span className="hd-assign-name">
					{assigneeName ? `Assigned to ${assigneeName}` : "Unassigned"}
				</span>
			</div>
			<div className="hd-actions">
				<button
					className="btn btn-sm"
					disabled={pending}
					onClick={() => assignToMe.mutate()}
					type="button"
				>
					Assign to me
				</button>
				<button
					className="btn btn-sm"
					disabled={pending}
					onClick={() => setShowPicker(true)}
					type="button"
				>
					Assign teammate
				</button>
				{assigneeName ? (
					<button
						className="btn btn-sm"
						disabled={pending}
						onClick={() => unassign.mutate()}
						type="button"
					>
						Unassign
					</button>
				) : null}
			</div>

			{showPicker ? (
				<TeammatePicker
					onClose={() => setShowPicker(false)}
					onPick={(userId) => assignTeammate.mutate(userId)}
					pending={assignTeammate.isPending}
				/>
			) : null}
		</div>
	);
}
