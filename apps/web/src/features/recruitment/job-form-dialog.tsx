import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { client } from "@/utils/orpc";

export interface JobFormInitial {
	description: string;
	employmentType: string;
	endDate: string;
	startDate: string;
	title: string;
	vacancyCount: number;
	workLocation: string;
}

interface JobFormDialogProps {
	initial?: Partial<JobFormInitial>;
	jobId?: string;
	mode: "create" | "edit";
	onClose: () => void;
	onSaved: (jobId: string) => void;
}

const EMPLOYMENT_TYPES = [
	"Full-time",
	"Part-time",
	"Contract",
	"Temporary",
	"Internship",
];

const MIN_VACANCIES = 1;

function emptyToUndefined(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

export function JobFormDialog({
	mode,
	jobId,
	initial,
	onClose,
	onSaved,
}: JobFormDialogProps) {
	const [title, setTitle] = useState(initial?.title ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [employmentType, setEmploymentType] = useState(
		initial?.employmentType ?? ""
	);
	const [workLocation, setWorkLocation] = useState(initial?.workLocation ?? "");
	const [vacancyCount, setVacancyCount] = useState(
		initial?.vacancyCount ?? MIN_VACANCIES
	);
	const [startDate, setStartDate] = useState(initial?.startDate ?? "");
	const [endDate, setEndDate] = useState(initial?.endDate ?? "");

	const titleError = title.trim() === "";

	const mutation = useMutation({
		mutationFn: () => {
			if (mode === "create") {
				return client.recruitment.jobs.create({
					title: title.trim(),
					description: emptyToUndefined(description),
					employmentType: emptyToUndefined(employmentType),
					workLocation: emptyToUndefined(workLocation),
					vacancyCount,
					startDate: emptyToUndefined(startDate),
					endDate: emptyToUndefined(endDate),
				});
			}
			return client.recruitment.jobs.update({
				id: jobId as string,
				title: title.trim(),
				description: emptyToUndefined(description),
				employmentType: emptyToUndefined(employmentType),
				workLocation: emptyToUndefined(workLocation),
				vacancyCount,
				startDate: startDate.trim() === "" ? null : startDate.trim(),
				endDate: endDate.trim() === "" ? null : endDate.trim(),
			});
		},
		onSuccess: (result: { id: string }) => {
			toast.success(
				mode === "create" ? "Job opening created." : "Changes saved."
			);
			onSaved(result.id);
		},
		onError: (err: Error) => {
			toast.error(`Could not save the job: ${err.message}`);
		},
	});

	const handleSubmit = () => {
		if (titleError) {
			toast.error("Please enter a job title.");
			return;
		}
		mutation.mutate();
	};

	let submitLabel = mode === "create" ? "Create job" : "Save changes";
	if (mutation.isPending) {
		submitLabel = "Saving…";
	}

	return (
		<div
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
				overflowY: "auto",
			}}
		>
			<div
				className="card card-pad"
				style={{
					width: "100%",
					maxWidth: 560,
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
					<h2 style={{ fontSize: 15, fontWeight: 600 }}>
						{mode === "create" ? "New job opening" : "Edit job opening"}
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

				<Field label="Job title" required>
					<input
						className="input"
						onChange={(e) => setTitle(e.target.value)}
						placeholder="e.g. Yard Operator"
						style={{ width: "100%" }}
						value={title}
					/>
					{titleError && (
						<span style={{ color: "var(--danger, #c0392b)", fontSize: 11.5 }}>
							A job title is required.
						</span>
					)}
				</Field>

				<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
					<Field label="Employment type" style={{ flex: 1, minWidth: 180 }}>
						<select
							className="input"
							onChange={(e) => setEmploymentType(e.target.value)}
							style={{ width: "100%" }}
							value={employmentType}
						>
							<option value="">Not specified</option>
							{EMPLOYMENT_TYPES.map((t) => (
								<option key={t} value={t}>
									{t}
								</option>
							))}
						</select>
					</Field>
					<Field label="Number of openings" style={{ width: 160 }}>
						<input
							className="input"
							min={MIN_VACANCIES}
							onChange={(e) =>
								setVacancyCount(
									Math.max(
										MIN_VACANCIES,
										Number(e.target.value) || MIN_VACANCIES
									)
								)
							}
							style={{ width: "100%" }}
							type="number"
							value={vacancyCount}
						/>
					</Field>
				</div>

				<Field label="Work location">
					<input
						className="input"
						onChange={(e) => setWorkLocation(e.target.value)}
						placeholder="e.g. Berbice, Guyana / Remote"
						style={{ width: "100%" }}
						value={workLocation}
					/>
				</Field>

				<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
					<Field label="Start date" style={{ flex: 1, minWidth: 160 }}>
						<input
							className="input"
							onChange={(e) => setStartDate(e.target.value)}
							style={{ width: "100%" }}
							type="date"
							value={startDate}
						/>
					</Field>
					<Field label="End date" style={{ flex: 1, minWidth: 160 }}>
						<input
							className="input"
							onChange={(e) => setEndDate(e.target.value)}
							style={{ width: "100%" }}
							type="date"
							value={endDate}
						/>
					</Field>
				</div>

				<Field label="Description">
					<textarea
						className="input"
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Role summary, responsibilities, requirements…"
						rows={5}
						style={{ width: "100%", resize: "vertical" }}
						value={description}
					/>
				</Field>

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
						disabled={mutation.isPending || titleError}
						onClick={handleSubmit}
						type="button"
					>
						{submitLabel}
					</button>
				</div>
			</div>
		</div>
	);
}

function Field({
	label,
	required,
	style,
	children,
}: {
	label: string;
	required?: boolean;
	style?: React.CSSProperties;
	children: React.ReactNode;
}) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
			<span style={{ fontSize: 12, color: "var(--fg-3)" }}>
				{label}
				{required ? " *" : ""}
			</span>
			{children}
		</div>
	);
}
