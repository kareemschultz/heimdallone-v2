import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { client } from "@/utils/orpc";
import { NotePromptDialog } from "./offboarding-note-prompt-dialog";
import { useInvalidateOffboarding } from "./use-invalidate-offboarding";

type TaskActionKind = "skip" | "block";

interface TaskActionsProps {
	status: string;
	taskId: string;
	taskTitle: string;
}

/**
 * HR row actions for a single clearance task. "Complete" is a direct mutation;
 * "Skip" and "Block" open a note prompt (block requires a reason). All actions
 * are no-ops once the task is already done or skipped.
 */
export function TaskActions({ taskId, taskTitle, status }: TaskActionsProps) {
	const invalidate = useInvalidateOffboarding();
	const [dialog, setDialog] = useState<TaskActionKind | null>(null);

	const completeMutation = useMutation({
		mutationFn: () => client.offboarding.tasks.complete({ id: taskId }),
		onSuccess: () => {
			toast.success("Task marked complete.");
			invalidate();
		},
		onError: (err: Error) => toast.error(`Could not complete: ${err.message}`),
	});

	const skipMutation = useMutation({
		mutationFn: (note: string) =>
			client.offboarding.tasks.skip({
				id: taskId,
				note: note === "" ? undefined : note,
			}),
		onSuccess: () => {
			toast.success("Task skipped.");
			invalidate();
			setDialog(null);
		},
		onError: (err: Error) => toast.error(`Could not skip: ${err.message}`),
	});

	const blockMutation = useMutation({
		mutationFn: (note: string) =>
			client.offboarding.tasks.block({ id: taskId, note }),
		onSuccess: () => {
			toast.success("Task marked blocked.");
			invalidate();
			setDialog(null);
		},
		onError: (err: Error) => toast.error(`Could not block: ${err.message}`),
	});

	const isResolved = status === "done" || status === "skipped";
	if (isResolved) {
		return <span style={{ color: "var(--fg-3)", fontSize: 12 }}>—</span>;
	}

	return (
		<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
			<button
				className="btn btn-primary btn-sm"
				disabled={completeMutation.isPending}
				onClick={() => completeMutation.mutate()}
				type="button"
			>
				Complete
			</button>
			<button
				className="btn btn-sm"
				onClick={() => setDialog("skip")}
				type="button"
			>
				Skip
			</button>
			<button
				className="btn btn-sm"
				onClick={() => setDialog("block")}
				type="button"
			>
				Block
			</button>

			{dialog === "skip" && (
				<NotePromptDialog
					confirmLabel="Skip task"
					description={`"${taskTitle}" will be recorded as skipped and counts as resolved.`}
					noteLabel="Reason for skipping"
					notePlaceholder="Why is this task not needed for this exit?"
					onClose={() => setDialog(null)}
					onConfirm={(note) => skipMutation.mutate(note)}
					pending={skipMutation.isPending}
					pendingLabel="Skipping…"
					title="Skip this task?"
				/>
			)}
			{dialog === "block" && (
				<NotePromptDialog
					confirmLabel="Mark blocked"
					description={`"${taskTitle}" will be flagged as blocked. A reason is required so the blocker is visible on the case.`}
					noteLabel="What is blocking it?"
					notePlaceholder="Describe the blocker"
					noteRequired
					onClose={() => setDialog(null)}
					onConfirm={(note) => blockMutation.mutate(note)}
					pending={blockMutation.isPending}
					pendingLabel="Saving…"
					title="Mark task as blocked?"
				/>
			)}
		</div>
	);
}
