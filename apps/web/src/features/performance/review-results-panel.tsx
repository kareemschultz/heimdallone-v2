import { EyeOff, Lock } from "lucide-react";

import { Badge } from "./badge";
import { relationshipLabel, requestStatusLabel } from "./review-labels";
import type {
	NamedResult,
	PeerResults,
	ResponseRow,
	ReviewResults,
} from "./review-types";

// Render one answer. Ratings and free text are the two shapes the seed/API use;
// everything else falls back to the raw text.
function AnswerLine({ r }: { r: ResponseRow }) {
	if (r.answerRating !== null && r.answerRating !== undefined) {
		return (
			<div className="pf-answer">
				<span className="pf-answer-rating">{r.answerRating} / 5</span>
				{r.answerText ? (
					<span className="pf-sub"> · {r.answerText}</span>
				) : null}
			</div>
		);
	}
	if (r.answerText) {
		return <div className="pf-answer">{r.answerText}</div>;
	}
	return <div className="pf-answer pf-sub">No answer recorded.</div>;
}

function NamedBlock({ item }: { item: NamedResult }) {
	return (
		<div className="pf-result-block">
			<div className="pf-result-head">
				<span className="pf-name">{item.reviewerName ?? "—"}</span>
				<Badge tone="info">{relationshipLabel(item.relationship)}</Badge>
				<span className="pf-sub">{requestStatusLabel(item.status)}</span>
			</div>
			{item.responses.length === 0 ? (
				<p className="pf-sub">No response submitted yet.</p>
			) : (
				item.responses.map((r) => <AnswerLine key={r.id} r={r} />)
			)}
		</div>
	);
}

// The peer block is the anonymity-critical surface. It renders exactly the mode
// the SERVER chose — it never has reviewer names in aggregated/hidden mode, so
// there is nothing to leak. Raw mode (names) is only ever returned to HR.
function PeerBlock({ peers }: { peers: PeerResults }) {
	if (peers.mode === "hidden") {
		return (
			<div className="pf-result-block pf-peer-hidden">
				<div className="pf-result-head">
					<EyeOff size={14} />
					<span className="pf-name">Peer feedback</span>
				</div>
				<p className="pf-sub">{peers.message}</p>
				<p className="pf-sub">
					{peers.submitted} of {peers.threshold} needed.
				</p>
			</div>
		);
	}
	if (peers.mode === "aggregated") {
		return (
			<div className="pf-result-block">
				<div className="pf-result-head">
					<Lock size={14} />
					<span className="pf-name">Peer feedback (anonymous)</span>
					<span className="pf-sub">{peers.submitted} responses</span>
				</div>
				{peers.items.flatMap((it, idx) =>
					it.responses.map((r) => (
						<AnswerLine key={r.id ?? `peer-${idx}`} r={r} />
					))
				)}
			</div>
		);
	}
	// raw — HR only.
	return (
		<div className="pf-result-block">
			<div className="pf-result-head">
				<span className="pf-name">Peer feedback</span>
				<Badge tone="warning">HR view — names shown</Badge>
				<span className="pf-sub">
					{peers.submitted} of {peers.count} submitted
				</span>
			</div>
			{peers.items.map((it, idx) => (
				<div className="pf-result-sub" key={`raw-${it.reviewerName ?? idx}`}>
					<span className="pf-name">{it.reviewerName ?? "—"}</span>
					<span className="pf-sub"> · {requestStatusLabel(it.status)}</span>
					{it.responses.map((r) => (
						<AnswerLine key={r.id} r={r} />
					))}
				</div>
			))}
		</div>
	);
}

export function ReviewResultsPanel({ results }: { results: ReviewResults }) {
	return (
		<div className="pf-results">
			{results.named.map((item) => (
				<NamedBlock
					item={item}
					key={`${item.relationship}-${item.reviewerName}`}
				/>
			))}
			<PeerBlock peers={results.peers} />
		</div>
	);
}
