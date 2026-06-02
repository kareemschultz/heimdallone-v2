import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { client } from "@/utils/orpc";
import { useInvalidateOffboarding } from "./use-invalidate-offboarding";

export interface InterviewDefaults {
	conductedAt: string | Date | null;
	internalNotes: string | null;
	isPrivate: boolean | null;
	overallRating: number | null;
	reasonForLeaving: string | null;
	whatCouldImprove: string | null;
	whatWentWell: string | null;
	wouldRehire: boolean | null;
}

interface InterviewDialogProps {
	caseId: string;
	existing: InterviewDefaults | null;
	onClose: () => void;
}

function toDateInput(value: string | Date | null): string {
	if (!value) {
		return "";
	}
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function rehireToSelect(value: boolean | null): string {
	if (value === true) {
		return "yes";
	}
	if (value === false) {
		return "no";
	}
	return "";
}

/**
 * Record or update the exit interview. HR-only (the API gate is
 * offboarding:manage_interview). Private is the default so notes stay HR-only;
 * `wouldRehire` and `internalNotes` are never shown to non-HR by the read API.
 */
export function InterviewDialog({
	caseId,
	existing,
	onClose,
}: InterviewDialogProps) {
	const invalidate = useInvalidateOffboarding();
	const [conductedAt, setConductedAt] = useState(
		toDateInput(existing?.conductedAt ?? null)
	);
	const [isPrivate, setIsPrivate] = useState(existing?.isPrivate ?? true);
	const [rating, setRating] = useState(
		existing?.overallRating ? String(existing.overallRating) : ""
	);
	const [reason, setReason] = useState(existing?.reasonForLeaving ?? "");
	const [wentWell, setWentWell] = useState(existing?.whatWentWell ?? "");
	const [improve, setImprove] = useState(existing?.whatCouldImprove ?? "");
	const [rehire, setRehire] = useState(
		rehireToSelect(existing?.wouldRehire ?? null)
	);
	const [notes, setNotes] = useState(existing?.internalNotes ?? "");

	const titleId = useId();
	const dateId = useId();
	const privateId = useId();
	const ratingId = useId();
	const reasonId = useId();
	const wellId = useId();
	const improveId = useId();
	const rehireId = useId();
	const notesId = useId();

	const trimOrNull = (v: string) => (v.trim() === "" ? null : v.trim());

	const mutation = useMutation({
		mutationFn: () =>
			client.offboarding.interviews.upsert({
				caseId,
				conductedAt: conductedAt === "" ? undefined : conductedAt,
				isPrivate,
				overallRating: rating === "" ? null : Number(rating),
				reasonForLeaving: trimOrNull(reason),
				whatWentWell: trimOrNull(wentWell),
				whatCouldImprove: trimOrNull(improve),
				wouldRehire: rehire === "" ? null : rehire === "yes",
				internalNotes: trimOrNull(notes),
			}),
		onSuccess: () => {
			toast.success(
				existing ? "Exit interview updated." : "Exit interview recorded."
			);
			invalidate();
			onClose();
		},
		onError: (err: Error) => toast.error(`Could not save: ${err.message}`),
	});

	return (
		<div
			aria-labelledby={titleId}
			aria-modal="true"
			role="dialog"
			style={{
				position: "fixed",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 24,
				background: "rgba(0,0,0,0.55)",
				zIndex: 60,
			}}
		>
			<div
				className="card card-pad"
				style={{
					width: "100%",
					maxWidth: 540,
					maxHeight: "90vh",
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					gap: 14,
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<h2 id={titleId} style={{ fontSize: 15, fontWeight: 600 }}>
						{existing ? "Edit exit interview" : "Record exit interview"}
					</h2>
					<button
						aria-label="Close"
						className="btn btn-sm"
						onClick={onClose}
						type="button"
					>
						<X size={14} />
					</button>
				</div>

				<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
					<DialogField flex htmlFor={dateId} label="Date conducted">
						<input
							className="input"
							id={dateId}
							onChange={(e) => setConductedAt(e.target.value)}
							type="date"
							value={conductedAt}
						/>
					</DialogField>
					<DialogField flex htmlFor={ratingId} label="Overall rating">
						<select
							className="input"
							id={ratingId}
							onChange={(e) => setRating(e.target.value)}
							value={rating}
						>
							<option value="">Not rated</option>
							<option value="1">1 — Poor</option>
							<option value="2">2</option>
							<option value="3">3 — Neutral</option>
							<option value="4">4</option>
							<option value="5">5 — Excellent</option>
						</select>
					</DialogField>
				</div>

				<DialogField htmlFor={reasonId} label="Reason for leaving">
					<textarea
						className="input"
						id={reasonId}
						onChange={(e) => setReason(e.target.value)}
						rows={2}
						style={{ resize: "vertical" }}
						value={reason}
					/>
				</DialogField>
				<DialogField htmlFor={wellId} label="What went well">
					<textarea
						className="input"
						id={wellId}
						onChange={(e) => setWentWell(e.target.value)}
						rows={2}
						style={{ resize: "vertical" }}
						value={wentWell}
					/>
				</DialogField>
				<DialogField htmlFor={improveId} label="What could improve">
					<textarea
						className="input"
						id={improveId}
						onChange={(e) => setImprove(e.target.value)}
						rows={2}
						style={{ resize: "vertical" }}
						value={improve}
					/>
				</DialogField>

				<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
					<DialogField flex htmlFor={rehireId} label="Would rehire (HR only)">
						<select
							className="input"
							id={rehireId}
							onChange={(e) => setRehire(e.target.value)}
							value={rehire}
						>
							<option value="">Not assessed</option>
							<option value="yes">Yes</option>
							<option value="no">No</option>
						</select>
					</DialogField>
				</div>

				<DialogField htmlFor={notesId} label="Internal notes (HR only)">
					<textarea
						className="input"
						id={notesId}
						onChange={(e) => setNotes(e.target.value)}
						placeholder="Never shown to the employee or non-HR roles."
						rows={2}
						style={{ resize: "vertical" }}
						value={notes}
					/>
				</DialogField>

				<label
					htmlFor={privateId}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						fontSize: 13,
						color: "var(--fg-2)",
					}}
				>
					<input
						checked={isPrivate}
						id={privateId}
						onChange={(e) => setIsPrivate(e.target.checked)}
						type="checkbox"
					/>
					Keep private (visible to HR only)
				</label>

				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button
						className="btn btn-sm"
						disabled={mutation.isPending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={mutation.isPending}
						onClick={() => mutation.mutate()}
						type="button"
					>
						{mutation.isPending ? "Saving…" : "Save interview"}
					</button>
				</div>
			</div>
		</div>
	);
}

function DialogField({
	label,
	htmlFor,
	flex,
	children,
}: {
	label: string;
	htmlFor: string;
	flex?: boolean;
	children: ReactNode;
}) {
	return (
		<div
			style={{
				flex: flex ? 1 : undefined,
				minWidth: flex ? 180 : undefined,
				display: "flex",
				flexDirection: "column",
				gap: 4,
			}}
		>
			<label htmlFor={htmlFor} style={{ fontSize: 12, color: "var(--fg-3)" }}>
				{label}
			</label>
			{children}
		</div>
	);
}
