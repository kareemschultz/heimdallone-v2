import { useMutation } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { EXIT_TYPE_LABEL } from "@/features/offboarding/labels";
import { client } from "@/utils/orpc";

// EXIT_TYPE enum from the offboarding schema. Empty string = no specific type.
const EXIT_TYPE_OPTIONS = [
	"resignation",
	"termination",
	"retirement",
	"contract_end",
	"involuntary",
] as const;

type ExitType = (typeof EXIT_TYPE_OPTIONS)[number];

interface OffboardingTemplateFormDialogProps {
	initial?: { name: string; description: string; exitType: ExitType | "" };
	mode: "create" | "edit";
	onClose: () => void;
	onSaved: (templateId: string) => void;
	templateId?: string;
}

export function OffboardingTemplateFormDialog({
	mode,
	templateId,
	initial,
	onClose,
	onSaved,
}: OffboardingTemplateFormDialogProps) {
	const [name, setName] = useState(initial?.name ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [exitType, setExitType] = useState<ExitType | "">(
		initial?.exitType ?? ""
	);
	const nameError = name.trim() === "";

	const mutation = useMutation({
		mutationFn: () => {
			const description_ = description.trim();
			const exitType_ = exitType === "" ? null : exitType;
			if (mode === "create") {
				return client.offboarding.templates.create({
					name: name.trim(),
					description: description_ === "" ? undefined : description_,
					exitType: exitType_,
				});
			}
			return client.offboarding.templates.update({
				id: templateId as string,
				name: name.trim(),
				description: description_ === "" ? null : description_,
				exitType: exitType_,
			});
		},
		onSuccess: (result: { id: string }) => {
			toast.success(mode === "create" ? "Template created." : "Changes saved.");
			onSaved(result.id);
		},
		onError: (err: Error) => {
			toast.error(`Could not save the template: ${err.message}`);
		},
	});

	let submitLabel = mode === "create" ? "Create template" : "Save changes";
	if (mutation.isPending) {
		submitLabel = "Saving…";
	}

	return (
		<Modal
			footer={
				<>
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
						disabled={mutation.isPending || nameError}
						onClick={() => mutation.mutate()}
						type="button"
					>
						{submitLabel}
					</button>
				</>
			}
			icon={<ClipboardList size={18} />}
			intro="Templates are copied into each offboarding case when the case starts. Editing a template does not change cases already in progress."
			onClose={onClose}
			title={mode === "create" ? "New offboarding template" : "Edit template"}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor="ob-template-name"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Template name *
				</label>
				<input
					className="input"
					id="ob-template-name"
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g. Standard resignation offboarding"
					style={{ width: "100%" }}
					value={name}
				/>
				{nameError && (
					<span style={{ color: "var(--danger, #c0392b)", fontSize: 11.5 }}>
						A template name is required.
					</span>
				)}
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor="ob-template-exit-type"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Exit type
				</label>
				<select
					className="input"
					id="ob-template-exit-type"
					onChange={(e) => setExitType(e.target.value as ExitType | "")}
					style={{ width: "100%" }}
					value={exitType}
				>
					<option value="">Any exit type</option>
					{EXIT_TYPE_OPTIONS.map((value) => (
						<option key={value} value={value}>
							{EXIT_TYPE_LABEL[value]}
						</option>
					))}
				</select>
				<span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
					Optional — helps you pick the right checklist when starting a case.
				</span>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor="ob-template-desc"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Description
				</label>
				<textarea
					className="input"
					id="ob-template-desc"
					onChange={(e) => setDescription(e.target.value)}
					placeholder="When should this checklist be used?"
					rows={3}
					style={{ width: "100%", resize: "vertical" }}
					value={description}
				/>
			</div>
		</Modal>
	);
}
