import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { client, orpc } from "@/utils/orpc";

interface MapDeviceUserDialogProps {
	deviceId: string;
	deviceName: string;
	deviceUserId: string;
	onClose: () => void;
	onMapped: () => void;
}

interface EmployeeOption {
	firstName: string;
	id: string;
	lastName: string | null;
}

/**
 * Maps an unmapped device user-id to an employee (creates an
 * attendance_device_employee_map). The API verifies both the device and the
 * employee belong to the org — this dialog is UX only.
 */
export function MapDeviceUserDialog({
	deviceId,
	deviceName,
	deviceUserId,
	onClose,
	onMapped,
}: MapDeviceUserDialogProps) {
	const [employeeId, setEmployeeId] = useState("");
	const [note, setNote] = useState("");
	const [pending, setPending] = useState(false);
	const titleId = useId();
	const descId = useId();
	const empId = useId();
	const noteId = useId();

	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 100 },
		})
	);
	const options = (employees.data?.data ?? []) as EmployeeOption[];

	const submit = async () => {
		if (!employeeId) {
			return;
		}
		setPending(true);
		try {
			await client.biometric.mappings.create({
				deviceId,
				deviceUserId,
				employeeId,
				enrollmentNote: note.trim() === "" ? undefined : note.trim(),
			});
			toast.success("Device user mapped. Run processing again to apply it.");
			onMapped();
		} catch (err) {
			toast.error(`Mapping failed: ${(err as Error).message}`);
		} finally {
			setPending(false);
		}
	};

	return (
		<div
			aria-describedby={descId}
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
					maxWidth: 460,
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
						Map device user
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
					id={descId}
					style={{ color: "var(--fg-2)", fontSize: 13, margin: 0 }}
				>
					Map device user <strong>{deviceUserId}</strong> on{" "}
					<strong>{deviceName}</strong> to an employee. After mapping, run
					processing again to apply it to the quarantined punches.
				</p>

				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label htmlFor={empId} style={{ fontSize: 12, color: "var(--fg-3)" }}>
						Employee *
					</label>
					<select
						className="input"
						id={empId}
						onChange={(e) => setEmployeeId(e.target.value)}
						value={employeeId}
					>
						<option value="">
							{employees.isLoading ? "Loading…" : "Select an employee"}
						</option>
						{options.map((emp) => (
							<option key={emp.id} value={emp.id}>
								{emp.firstName}
								{emp.lastName ? ` ${emp.lastName}` : ""}
							</option>
						))}
					</select>
				</div>

				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					<label
						htmlFor={noteId}
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
						Note (optional)
					</label>
					<input
						className="input"
						id={noteId}
						onChange={(e) => setNote(e.target.value)}
						placeholder="e.g. enrolled on the lobby terminal"
						value={note}
					/>
				</div>

				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					<button
						className="btn btn-sm"
						disabled={pending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={pending || !employeeId}
						onClick={submit}
						type="button"
					>
						{pending ? "Mapping…" : "Map device user"}
					</button>
				</div>
			</div>
		</div>
	);
}
