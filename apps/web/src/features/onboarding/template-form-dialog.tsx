import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
		<div
			aria-describedby="template-form-desc"
			aria-labelledby="template-form-title"
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
					maxWidth: 480,
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
					<h2
						id="template-form-title"
						style={{ fontSize: 15, fontWeight: 600 }}
					>
						{mode === "create" ? "New onboarding template" : "Edit template"}
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
				<p
					id="template-form-desc"
					style={{ color: "var(--fg-3)", fontSize: 12.5, margin: 0 }}
				>
					Templates are copied into each employee onboarding when it starts.
					Editing a template does not change onboarding already in progress.
				</p>

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
						disabled={mutation.isPending || nameError}
						onClick={() => mutation.mutate()}
						type="button"
					>
						{submitLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
