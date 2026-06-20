import { useMutation } from "@tanstack/react-query";
import { LayoutTemplate } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { client } from "@/utils/orpc";

interface TemplateFormDialogProps {
	initial?: { name: string; description: string };
	mode: "create" | "edit";
	onClose: () => void;
	onSaved: (templateId: string) => void;
	templateId?: string;
}

export function TemplateFormDialog({
	mode,
	templateId,
	initial,
	onClose,
	onSaved,
}: TemplateFormDialogProps) {
	const [name, setName] = useState(initial?.name ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const nameError = name.trim() === "";

	const mutation = useMutation({
		mutationFn: () => {
			const description_ = description.trim() || undefined;
			if (mode === "create") {
				return client.onboarding.templates.create({
					name: name.trim(),
					description: description_,
				});
			}
			return client.onboarding.templates.update({
				id: templateId as string,
				name: name.trim(),
				description: description.trim() === "" ? null : description.trim(),
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
			icon={<LayoutTemplate size={18} />}
			intro="Templates are copied into each employee onboarding when it starts. Editing a template does not change onboarding already in progress."
			onClose={onClose}
			title={mode === "create" ? "New onboarding template" : "Edit template"}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor="template-name"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Template name *
				</label>
				<input
					className="input"
					id="template-name"
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g. Standard employee onboarding"
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
					htmlFor="template-desc"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Description
				</label>
				<textarea
					className="input"
					id="template-desc"
					onChange={(e) => setDescription(e.target.value)}
					placeholder="Who is this template for?"
					rows={3}
					style={{ width: "100%", resize: "vertical" }}
					value={description}
				/>
			</div>
		</Modal>
	);
}
