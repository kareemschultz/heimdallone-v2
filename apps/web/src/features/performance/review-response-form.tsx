import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { client } from "@/utils/orpc";
import { relationshipLabel } from "./review-labels";
import type { ReviewRequestRow } from "./review-types";

function invalidatePerformance(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("performance"),
	});
}

const RATINGS = [1, 2, 3, 4, 5];

// A reviewer answers a request assigned to THEM (the API enforces ownership and
// blocks re-submission). 15E keeps the form to one overall rating + comment —
// questionId is optional on the API, so no template wiring is needed here.
export function ReviewResponseForm({
	request,
	onClose,
}: {
	onClose: () => void;
	request: ReviewRequestRow;
}) {
	const qc = useQueryClient();
	const [rating, setRating] = useState<number | null>(null);
	const [comment, setComment] = useState("");

	const submit = useMutation({
		mutationFn: async () => {
			await client.performance.reviewCycles.responses.save({
				requestId: request.id,
				answerRating: rating ?? undefined,
				answerText: comment.trim() || undefined,
			});
			await client.performance.reviewCycles.responses.submit({
				requestId: request.id,
			});
		},
		onSuccess: () => {
			toast.success("Review submitted. Thank you.");
			invalidatePerformance(qc);
			onClose();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not submit your review"),
	});

	const decline = useMutation({
		mutationFn: () =>
			client.performance.reviewCycles.requests.decline({ id: request.id }),
		onSuccess: () => {
			toast.success("Review request declined");
			invalidatePerformance(qc);
			onClose();
		},
		onError: (e: { message?: string }) =>
			toast.error(e?.message ?? "Could not decline the request"),
	});

	const busy = submit.isPending || decline.isPending;

	return (
		<Modal
			footer={
				<>
					<button
						className="btn"
						disabled={busy}
						onClick={() => decline.mutate()}
						type="button"
					>
						Decline
					</button>
					<button
						className="btn btn-primary"
						disabled={busy || (rating === null && !comment.trim())}
						onClick={() => submit.mutate()}
						type="button"
					>
						Submit review
					</button>
				</>
			}
			icon={<Star size={18} />}
			onClose={onClose}
			title={`Review ${request.subjectName ?? "—"}`}
		>
			<p className="pf-sub">
				You are giving {relationshipLabel(request.relationship).toLowerCase()}{" "}
				feedback. Your answers go to HR; peer feedback is shown anonymously.
			</p>
			<div className="pf-field">
				<span>Overall rating</span>
				<div className="pf-rating-row">
					{RATINGS.map((n) => (
						<button
							aria-pressed={rating === n}
							className={`pf-rating-pill ${rating === n ? "active" : ""}`}
							key={n}
							onClick={() => setRating(n)}
							type="button"
						>
							{n}
						</button>
					))}
				</div>
			</div>
			<label className="pf-field" htmlFor="pf-response-comment">
				<span>Comments</span>
				<textarea
					id="pf-response-comment"
					onChange={(e) => setComment(e.target.value)}
					placeholder="What is going well, and what could improve?"
					rows={4}
					value={comment}
				/>
			</label>
		</Modal>
	);
}
