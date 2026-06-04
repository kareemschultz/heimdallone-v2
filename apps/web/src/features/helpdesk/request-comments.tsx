import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { client } from "@/utils/orpc";
import { CommentForm } from "./comment-form";
import { fmtDateTime } from "./labels";
import type { HelpdeskComment } from "./types";

function invalidateHelpdesk(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("helpdesk"),
	});
}

function CommentItem({ c }: { c: HelpdeskComment }) {
	return (
		<div className={`hd-comment ${c.isInternal ? "internal" : ""}`}>
			<div className="hd-comment-head">
				<span className="hd-comment-author">
					{c.authorName ?? "Team member"}
				</span>
				{c.isInternal ? (
					<span className="hd-badge tone-warning">
						<Lock size={10} /> Internal
					</span>
				) : null}
				<span className="hd-comment-meta">{fmtDateTime(c.createdAt)}</span>
			</div>
			<div className="hd-comment-body">{c.body}</div>
		</div>
	);
}

/**
 * The conversation timeline plus the internal-notes panel. Internal notes are
 * server-redacted: for anyone who may not see them, `comments` simply contains
 * none and `canViewInternalNotes` is false — the UI never receives the data and
 * then hides it. The internal section header + form only render when the server
 * said the caller may see internal notes.
 */
export function RequestComments({
	requestId,
	comments,
	canViewInternalNotes,
	canComment,
	canAddInternal,
	isTerminal,
	isCancelled,
}: {
	canAddInternal: boolean;
	canComment: boolean;
	canViewInternalNotes: boolean;
	comments: HelpdeskComment[];
	isCancelled: boolean;
	isTerminal: boolean;
	requestId: string;
}) {
	const qc = useQueryClient();
	const publicComments = comments.filter((c) => !c.isInternal);
	const internalComments = comments.filter((c) => c.isInternal);

	const addPublic = useMutation({
		mutationFn: (body: string) =>
			client.helpdesk.comments.create({ requestId, body }),
		onSuccess: () => {
			toast.success("Comment added");
			invalidateHelpdesk(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not add the comment"),
	});

	const addInternal = useMutation({
		mutationFn: (body: string) =>
			client.helpdesk.comments.createInternal({ requestId, body }),
		onSuccess: () => {
			toast.success("Internal note added");
			invalidateHelpdesk(qc);
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not add the note"),
	});

	return (
		<>
			<h3 className="hd-section-title">Conversation</h3>
			<div className="hd-comments">
				{publicComments.length === 0 ? (
					<p className="hd-form-hint">No comments yet.</p>
				) : (
					publicComments.map((c) => <CommentItem c={c} key={c.id} />)
				)}
			</div>
			{canComment && !isTerminal ? (
				<CommentForm
					hint="Visible to the requester."
					id="hd-public-comment"
					label="Add a comment"
					onSubmit={(body) => addPublic.mutate(body)}
					pending={addPublic.isPending}
					placeholder="Write a reply…"
					submitLabel="Add comment"
				/>
			) : null}
			{isTerminal && canComment ? (
				<p className="hd-form-hint">
					This request is closed, so new comments are disabled.
				</p>
			) : null}

			{canViewInternalNotes ? (
				<>
					<h3 className="hd-section-title">Internal notes</h3>
					<p className="hd-form-hint">
						Only the helpdesk team can see these — never the requesting
						employee.
					</p>
					<div className="hd-comments">
						{internalComments.length === 0 ? (
							<p className="hd-form-hint">No internal notes yet.</p>
						) : (
							internalComments.map((c) => <CommentItem c={c} key={c.id} />)
						)}
					</div>
					{canAddInternal && !isCancelled ? (
						<CommentForm
							hint="Hidden from the requester."
							id="hd-internal-note"
							internal
							label="Add an internal note"
							onSubmit={(body) => addInternal.mutate(body)}
							pending={addInternal.isPending}
							placeholder="Add a private note for the team…"
							submitLabel="Add internal note"
						/>
					) : null}
				</>
			) : null}
		</>
	);
}
