import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	CalendarClock,
	CheckCircle2,
	MessageSquare,
	UserX,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { client, orpc } from "@/utils/orpc";

export type InterviewActionStatus =
	| "scheduled"
	| "completed"
	| "cancelled"
	| "no_show";

export interface InterviewActionRow {
	id: string;
	interviewerEmployeeIds: string[];
	scheduledStart: Date;
	status: InterviewActionStatus;
}

interface InterviewActionsProps {
	canManage: boolean;
	canView: boolean;
	employeesById: Map<string, string>;
	interview: InterviewActionRow;
}

const RECOMMEND_OPTIONS = [
	{ value: "strong_hire", label: "Strong hire" },
	{ value: "hire", label: "Hire" },
	{ value: "no_hire", label: "No hire" },
	{ value: "strong_no_hire", label: "Strong no-hire" },
] as const;

const RECOMMEND_LABEL: Record<string, string> = {
	strong_hire: "Strong hire",
	hire: "Hire",
	no_hire: "No hire",
	strong_no_hire: "Strong no-hire",
};

const RATING_VALUES = [1, 2, 3, 4, 5];

type Dialog =
	| "reschedule"
	| "complete"
	| "cancel"
	| "no_show"
	| "add_feedback"
	| "view_feedback";

export function InterviewActions({
	interview,
	canManage,
	canView,
	employeesById,
}: InterviewActionsProps) {
	const queryClient = useQueryClient();
	const [dialog, setDialog] = useState<Dialog | null>(null);

	const invalidate = () =>
		queryClient.invalidateQueries({
			predicate: (q) => {
				const path = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
				return Array.isArray(path) && path[0] === "recruitment";
			},
		});

	const transition = useMutation({
		mutationFn: (kind: "complete" | "cancel" | "no_show") => {
			const fns = {
				complete: client.recruitment.interviews.complete,
				cancel: client.recruitment.interviews.cancel,
				no_show: client.recruitment.interviews.noShow,
			};
			return fns[kind]({ id: interview.id });
		},
		onSuccess: async () => {
			setDialog(null);
			await invalidate();
			toast.success("Interview updated.");
		},
		onError: (err: Error) => {
			toast.error(`Could not update the interview: ${err.message}`);
		},
	});

	const isScheduled = interview.status === "scheduled";
	const isCompleted = interview.status === "completed";

	const items: { key: Dialog; label: string }[] = [];
	if (isScheduled && canManage) {
		items.push(
			{ key: "reschedule", label: "Reschedule" },
			{ key: "complete", label: "Mark completed" },
			{ key: "cancel", label: "Cancel interview" },
			{ key: "no_show", label: "Mark no-show" }
		);
	}
	if (isCompleted && canManage) {
		items.push({ key: "add_feedback", label: "Add feedback" });
	}
	if (isCompleted && canView) {
		items.push({ key: "view_feedback", label: "View feedback" });
	}

	if (items.length === 0) {
		return <span style={{ color: "var(--fg-3)", fontSize: 12 }}>—</span>;
	}

	return (
		<>
			<details className="move-menu">
				<summary className="btn btn-sm">Actions ▾</summary>
				<div className="move-menu-list">
					{items.map((item) => (
						<button
							className="move-menu-item"
							key={item.key}
							onClick={(e) => {
								e.preventDefault();
								(
									e.currentTarget.closest("details") as HTMLDetailsElement
								).open = false;
								setDialog(item.key);
							}}
							type="button"
						>
							{item.label}
						</button>
					))}
				</div>
			</details>

			{dialog === "reschedule" && (
				<RescheduleDialog
					interviewId={interview.id}
					onClose={() => setDialog(null)}
					onSaved={async () => {
						setDialog(null);
						await invalidate();
					}}
				/>
			)}

			{dialog === "complete" && (
				<ConfirmDialog
					confirmLabel="Mark completed"
					helper="Mark completed after the interview has taken place."
					icon={<CheckCircle2 size={18} />}
					isPending={transition.isPending}
					onCancel={() => setDialog(null)}
					onConfirm={() => transition.mutate("complete")}
					title="Mark interview completed"
				/>
			)}
			{dialog === "cancel" && (
				<ConfirmDialog
					confirmLabel="Cancel interview"
					helper="Cancel only if this interview will not happen."
					icon={<XCircle size={18} />}
					isPending={transition.isPending}
					onCancel={() => setDialog(null)}
					onConfirm={() => transition.mutate("cancel")}
					title="Cancel interview"
				/>
			)}
			{dialog === "no_show" && (
				<ConfirmDialog
					confirmLabel="Mark no-show"
					helper="Use no-show when the candidate or interviewer did not attend."
					icon={<UserX size={18} />}
					isPending={transition.isPending}
					onCancel={() => setDialog(null)}
					onConfirm={() => transition.mutate("no_show")}
					title="Mark no-show"
				/>
			)}

			{dialog === "add_feedback" && (
				<AddFeedbackDialog
					employeesById={employeesById}
					interviewerIds={interview.interviewerEmployeeIds}
					interviewId={interview.id}
					onClose={() => setDialog(null)}
					onSaved={async () => {
						setDialog(null);
						await invalidate();
					}}
				/>
			)}
			{dialog === "view_feedback" && (
				<ViewFeedbackDialog
					employeesById={employeesById}
					interviewId={interview.id}
					onClose={() => setDialog(null)}
				/>
			)}
		</>
	);
}

function RescheduleDialog({
	interviewId,
	onClose,
	onSaved,
}: {
	interviewId: string;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [start, setStart] = useState("");
	const [end, setEnd] = useState("");
	const [location, setLocation] = useState("");

	const mutation = useMutation({
		mutationFn: () =>
			client.recruitment.interviews.reschedule({
				id: interviewId,
				scheduledStart: start,
				scheduledEnd: end || null,
				location: location.trim() || undefined,
			}),
		onSuccess: () => {
			toast.success("Interview rescheduled.");
			onSaved();
		},
		onError: (err: Error) => {
			toast.error(`Could not reschedule: ${err.message}`);
		},
	});

	return (
		<Modal
			footer={
				<>
					<button
						className="btn btn-sm"
						disabled={start.trim() === "" || mutation.isPending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={start.trim() === "" || mutation.isPending}
						onClick={() => mutation.mutate()}
						type="button"
					>
						{mutation.isPending ? "Saving…" : "Save new time"}
					</button>
				</>
			}
			icon={<CalendarClock size={18} />}
			intro="Update the date, time, and location for this interview."
			onClose={onClose}
			title="Reschedule interview"
		>
			<Labeled label="New date & time">
				<input
					className="input"
					onChange={(e) => setStart(e.target.value)}
					style={{ width: "100%" }}
					type="datetime-local"
					value={start}
				/>
			</Labeled>
			<Labeled label="Ends (optional)">
				<input
					className="input"
					onChange={(e) => setEnd(e.target.value)}
					style={{ width: "100%" }}
					type="datetime-local"
					value={end}
				/>
			</Labeled>
			<Labeled label="Location (optional)">
				<input
					className="input"
					onChange={(e) => setLocation(e.target.value)}
					placeholder="e.g. Video call / Office"
					style={{ width: "100%" }}
					value={location}
				/>
			</Labeled>
		</Modal>
	);
}

function AddFeedbackDialog({
	interviewId,
	interviewerIds,
	employeesById,
	onClose,
	onSaved,
}: {
	interviewId: string;
	interviewerIds: string[];
	employeesById: Map<string, string>;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [interviewerId, setInterviewerId] = useState("");
	const [rating, setRating] = useState(3);
	const [recommend, setRecommend] = useState<string>("hire");
	const [strengths, setStrengths] = useState("");
	const [concerns, setConcerns] = useState("");
	const [notes, setNotes] = useState("");

	// Each interviewer may submit feedback only once (DB unique constraint).
	// Hide interviewers who already submitted so we never trigger a conflict.
	const existing = useQuery(
		orpc.recruitment.feedback.list.queryOptions({ input: { interviewId } })
	);
	const submittedIds = new Set(
		(existing.data ?? []).map((f) => f.interviewerEmployeeId)
	);
	const availableIds = interviewerIds.filter(
		(empId) => !submittedIds.has(empId)
	);
	const effectiveId =
		interviewerId && availableIds.includes(interviewerId)
			? interviewerId
			: (availableIds[0] ?? "");
	const noneAvailable = !existing.isLoading && availableIds.length === 0;

	const mutation = useMutation({
		mutationFn: () =>
			client.recruitment.feedback.submit({
				interviewId,
				interviewerEmployeeId: effectiveId,
				rating,
				recommend: recommend as (typeof RECOMMEND_OPTIONS)[number]["value"],
				strengths: strengths.trim() || undefined,
				concerns: concerns.trim() || undefined,
				notes: notes.trim() || undefined,
			}),
		onSuccess: () => {
			toast.success("Feedback saved.");
			onSaved();
		},
		onError: (err: Error) => {
			toast.error(`Could not save feedback: ${err.message}`);
		},
	});

	return (
		<Modal
			footer={
				<>
					<button
						className="btn btn-sm"
						disabled={effectiveId === "" || noneAvailable || mutation.isPending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={effectiveId === "" || noneAvailable || mutation.isPending}
						onClick={() => mutation.mutate()}
						type="button"
					>
						{mutation.isPending ? "Saving…" : "Save feedback"}
					</button>
				</>
			}
			icon={<MessageSquare size={18} />}
			intro="Feedback helps the hiring team decide the next step."
			onClose={onClose}
			title="Add interview feedback"
		>
			{noneAvailable ? (
				<p style={{ color: "var(--fg-3)", fontSize: 13, margin: 0 }}>
					All interviewers have already given feedback for this interview.
				</p>
			) : (
				<Labeled label="Interviewer">
					<select
						className="input"
						onChange={(e) => setInterviewerId(e.target.value)}
						style={{ width: "100%" }}
						value={effectiveId}
					>
						{availableIds.map((empId) => (
							<option key={empId} value={empId}>
								{employeesById.get(empId) ?? `Interviewer ${empId.slice(0, 6)}`}
							</option>
						))}
					</select>
				</Labeled>
			)}
			<div style={{ display: "flex", gap: 12 }}>
				<Labeled label="Rating (1–5)" style={{ flex: 1 }}>
					<select
						className="input"
						onChange={(e) => setRating(Number(e.target.value))}
						style={{ width: "100%" }}
						value={rating}
					>
						{RATING_VALUES.map((n) => (
							<option key={n} value={n}>
								{n}
							</option>
						))}
					</select>
				</Labeled>
				<Labeled label="Recommendation" style={{ flex: 1 }}>
					<select
						className="input"
						onChange={(e) => setRecommend(e.target.value)}
						style={{ width: "100%" }}
						value={recommend}
					>
						{RECOMMEND_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</Labeled>
			</div>
			<Labeled label="Strengths (optional)">
				<textarea
					className="input"
					onChange={(e) => setStrengths(e.target.value)}
					rows={2}
					style={{ width: "100%", resize: "vertical" }}
					value={strengths}
				/>
			</Labeled>
			<Labeled label="Concerns (optional)">
				<textarea
					className="input"
					onChange={(e) => setConcerns(e.target.value)}
					rows={2}
					style={{ width: "100%", resize: "vertical" }}
					value={concerns}
				/>
			</Labeled>
			<Labeled label="Notes (optional)">
				<textarea
					className="input"
					onChange={(e) => setNotes(e.target.value)}
					rows={2}
					style={{ width: "100%", resize: "vertical" }}
					value={notes}
				/>
			</Labeled>
		</Modal>
	);
}

function ViewFeedbackDialog({
	interviewId,
	employeesById,
	onClose,
}: {
	interviewId: string;
	employeesById: Map<string, string>;
	onClose: () => void;
}) {
	const feedback = useQuery(
		orpc.recruitment.feedback.list.queryOptions({
			input: { interviewId },
		})
	);
	const rows = feedback.data ?? [];

	return (
		<Modal
			footer={
				<button className="btn btn-sm" onClick={onClose} type="button">
					Close
				</button>
			}
			icon={<MessageSquare size={18} />}
			intro="Ratings and notes submitted by interviewers for this interview."
			onClose={onClose}
			title="Interview feedback"
		>
			{feedback.isLoading && (
				<p style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</p>
			)}
			{!feedback.isLoading && rows.length === 0 && (
				<p style={{ color: "var(--fg-3)", fontSize: 13 }}>
					No feedback has been recorded for this interview yet.
				</p>
			)}
			{rows.map((f) => (
				<div
					className="card card-pad"
					key={f.id}
					style={{ display: "flex", flexDirection: "column", gap: 4 }}
				>
					<div
						style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
					>
						<span style={{ fontWeight: 600, fontSize: 13 }}>
							{employeesById.get(f.interviewerEmployeeId) ?? "Interviewer"}
						</span>
						<span className="badge">
							{RECOMMEND_LABEL[f.recommend] ?? f.recommend}
						</span>
					</div>
					<div style={{ color: "var(--fg-2)", fontSize: 12.5 }}>
						Rating: {f.rating}/5
					</div>
					{f.strengths && (
						<div style={{ fontSize: 12.5 }}>
							<strong>Strengths:</strong> {f.strengths}
						</div>
					)}
					{f.concerns && (
						<div style={{ fontSize: 12.5 }}>
							<strong>Concerns:</strong> {f.concerns}
						</div>
					)}
					{f.notes && (
						<div style={{ fontSize: 12.5, color: "var(--fg-2)" }}>
							{f.notes}
						</div>
					)}
				</div>
			))}
		</Modal>
	);
}

function ConfirmDialog({
	title,
	helper,
	icon,
	confirmLabel,
	isPending,
	onCancel,
	onConfirm,
}: {
	title: string;
	helper: string;
	icon?: React.ReactNode;
	confirmLabel: string;
	isPending: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<Modal
			footer={
				<>
					<button
						className="btn btn-sm"
						disabled={isPending}
						onClick={onCancel}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={isPending}
						onClick={onConfirm}
						type="button"
					>
						{isPending ? "Working…" : confirmLabel}
					</button>
				</>
			}
			icon={icon}
			intro={helper}
			onClose={onCancel}
			title={title}
		>
			{/* Confirm-only dialogs have no body fields */}
			<span />
		</Modal>
	);
}

function Labeled({
	label,
	style,
	children,
}: {
	label: string;
	style?: React.CSSProperties;
	children: React.ReactNode;
}) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
			<span style={{ fontSize: 12, color: "var(--fg-3)" }}>{label}</span>
			{children}
		</div>
	);
}
