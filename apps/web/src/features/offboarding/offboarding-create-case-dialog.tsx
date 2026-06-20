import { useMutation, useQuery } from "@tanstack/react-query";
import { UserMinus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { EXIT_TYPE_LABEL } from "@/features/offboarding/labels";
import { client, orpc } from "@/utils/orpc";

// HR-initiated exits only. Resignation is employee self-service (later CP).
const EXIT_TYPE_OPTIONS = [
	"termination",
	"retirement",
	"contract_end",
	"involuntary",
] as const;

type ExitType = (typeof EXIT_TYPE_OPTIONS)[number];

interface OffboardingCreateCaseDialogProps {
	onClose: () => void;
	onCreated: (caseId: string) => void;
}

export function OffboardingCreateCaseDialog({
	onClose,
	onCreated,
}: OffboardingCreateCaseDialogProps) {
	const [employeeId, setEmployeeId] = useState("");
	const [exitType, setExitType] = useState<ExitType>("termination");
	const [lastWorkingDay, setLastWorkingDay] = useState("");
	const [exitReason, setExitReason] = useState("");
	const [internalNote, setInternalNote] = useState("");
	const [templateId, setTemplateId] = useState("");

	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 100 },
		})
	);
	const templates = useQuery(
		orpc.offboarding.templates.list.queryOptions({
			input: { includeInactive: false },
		})
	);

	const employeeRows = employees.data?.data ?? [];
	const templateRows = templates.data ?? [];
	// Involuntary/termination should carry a reason for the audit trail.
	const reasonRecommended =
		exitType === "involuntary" || exitType === "termination";
	const employeeMissing = employeeId === "";

	const mutation = useMutation({
		mutationFn: () =>
			client.offboarding.cases.create({
				employeeId,
				exitType,
				exitReason: exitReason.trim() === "" ? undefined : exitReason.trim(),
				lastWorkingDay: lastWorkingDay === "" ? undefined : lastWorkingDay,
				internalNote:
					internalNote.trim() === "" ? undefined : internalNote.trim(),
				templateId: templateId === "" ? undefined : templateId,
			}),
		onSuccess: (result: { id: string }) => {
			toast.success("Offboarding case opened.");
			onCreated(result.id);
		},
		onError: (err: Error) => {
			toast.error(`Could not open the case: ${err.message}`);
		},
	});

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
						disabled={mutation.isPending || employeeMissing}
						onClick={() => mutation.mutate()}
						type="button"
					>
						{mutation.isPending ? "Opening…" : "Open case"}
					</button>
				</>
			}
			icon={<UserMinus size={18} />}
			intro="For employee resignations, the employee submits their own resignation. Use this to start an employer-initiated exit."
			onClose={onClose}
			title="Open an offboarding case"
			wide
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor="ob-case-employee"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Employee *
				</label>
				<select
					className="input"
					id="ob-case-employee"
					onChange={(e) => setEmployeeId(e.target.value)}
					style={{ width: "100%" }}
					value={employeeId}
				>
					<option value="">
						{employees.isLoading ? "Loading employees…" : "Select an employee"}
					</option>
					{employeeRows.map((emp) => (
						<option key={emp.id} value={emp.id}>
							{emp.firstName}
							{emp.lastName ? ` ${emp.lastName}` : ""}
							{emp.departmentName ? ` — ${emp.departmentName}` : ""}
						</option>
					))}
				</select>
				{employeeMissing && (
					<span style={{ color: "var(--danger, #c0392b)", fontSize: 11.5 }}>
						Choose the employee who is leaving.
					</span>
				)}
			</div>

			<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
				<div
					style={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						gap: 4,
					}}
				>
					<label
						htmlFor="ob-case-exit-type"
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
						Exit type *
					</label>
					<select
						className="input"
						id="ob-case-exit-type"
						onChange={(e) => setExitType(e.target.value as ExitType)}
						style={{ width: "100%" }}
						value={exitType}
					>
						{EXIT_TYPE_OPTIONS.map((value) => (
							<option key={value} value={value}>
								{EXIT_TYPE_LABEL[value]}
							</option>
						))}
					</select>
				</div>
				<div
					style={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						gap: 4,
					}}
				>
					<label
						htmlFor="ob-case-lwd"
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
						Last working day
					</label>
					<input
						className="input"
						id="ob-case-lwd"
						onChange={(e) => setLastWorkingDay(e.target.value)}
						style={{ width: "100%" }}
						type="date"
						value={lastWorkingDay}
					/>
				</div>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor="ob-case-template"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Clearance template
				</label>
				<select
					className="input"
					id="ob-case-template"
					onChange={(e) => setTemplateId(e.target.value)}
					style={{ width: "100%" }}
					value={templateId}
				>
					<option value="">No template (add tasks later)</option>
					{templateRows.map((tpl) => (
						<option key={tpl.id} value={tpl.id}>
							{tpl.name}
						</option>
					))}
				</select>
				<span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
					Picking a template copies its clearance tasks into the case.
				</span>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor="ob-case-reason"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Reason {reasonRecommended ? "(recommended)" : "(optional)"}
				</label>
				<textarea
					className="input"
					id="ob-case-reason"
					onChange={(e) => setExitReason(e.target.value)}
					placeholder="Why is this exit happening?"
					rows={2}
					style={{ width: "100%", resize: "vertical" }}
					value={exitReason}
				/>
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label
					htmlFor="ob-case-note"
					style={{ fontSize: 12, color: "var(--fg-3)" }}
				>
					Internal HR note
				</label>
				<textarea
					className="input"
					id="ob-case-note"
					onChange={(e) => setInternalNote(e.target.value)}
					placeholder="Visible to HR only — never shown to the employee."
					rows={2}
					style={{ width: "100%", resize: "vertical" }}
					value={internalNote}
				/>
			</div>
		</Modal>
	);
}
