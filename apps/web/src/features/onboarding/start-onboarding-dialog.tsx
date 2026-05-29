import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { client, orpc } from "@/utils/orpc";

interface StartOnboardingDialogProps {
	onClose: () => void;
	onStarted: (onboardingId: string) => void;
}

export function StartOnboardingDialog({
	onClose,
	onStarted,
}: StartOnboardingDialogProps) {
	const [employeeId, setEmployeeId] = useState("");
	const [templateId, setTemplateId] = useState("");

	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 100 },
		})
	);
	const templates = useQuery(
		orpc.onboarding.templates.list.queryOptions({
			input: { page: 1, pageSize: 100 },
		})
	);

	const employeeRows = (employees.data?.data ?? []) as {
		id: string;
		firstName: string;
		lastName: string | null;
	}[];
	const templateRows = templates.data?.data ?? [];

	const mutation = useMutation({
		mutationFn: () =>
			client.onboarding.employeeOnboarding.start({ employeeId, templateId }),
		onSuccess: (result: { id: string }) => {
			toast.success("Onboarding started.");
			onStarted(result.id);
		},
		onError: (err: Error) => {
			toast.error(`Could not start onboarding: ${err.message}`);
		},
	});

	const canSubmit =
		employeeId !== "" && templateId !== "" && !mutation.isPending;

	return (
		<div
			aria-describedby="start-ob-desc"
			aria-labelledby="start-ob-title"
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
					<h2 id="start-ob-title" style={{ fontSize: 15, fontWeight: 600 }}>
						Start onboarding
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
					id="start-ob-desc"
					style={{ color: "var(--fg-3)", fontSize: 12.5, margin: 0 }}
				>
					The chosen template's tasks are copied into this onboarding. Later
					template edits won't change it.
				</p>

				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label
						htmlFor="start-employee"
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
						Employee *
					</label>
					<select
						className="input"
						id="start-employee"
						onChange={(e) => setEmployeeId(e.target.value)}
						style={{ width: "100%" }}
						value={employeeId}
					>
						<option value="">Select an employee…</option>
						{employeeRows.map((emp) => (
							<option key={emp.id} value={emp.id}>
								{[emp.firstName, emp.lastName].filter(Boolean).join(" ")}
							</option>
						))}
					</select>
				</div>

				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label
						htmlFor="start-template"
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
						Template *
					</label>
					<select
						className="input"
						id="start-template"
						onChange={(e) => setTemplateId(e.target.value)}
						style={{ width: "100%" }}
						value={templateId}
					>
						<option value="">Select a template…</option>
						{templateRows.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
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
						disabled={!canSubmit}
						onClick={() => mutation.mutate()}
						type="button"
					>
						{mutation.isPending ? "Starting…" : "Start onboarding"}
					</button>
				</div>
			</div>
		</div>
	);
}
