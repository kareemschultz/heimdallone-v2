import { FileInput } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { client } from "@/utils/orpc";

interface ImportResult {
	created: number;
	duplicate: number;
	errors: string[];
}

interface ImportPunchesDialogProps {
	adapterLabel: string;
	deviceId: string;
	deviceName: string;
	onClose: () => void;
	onImported: () => void;
}

const SAMPLE = `device_user_id,timestamp,direction,verify_mode
1001,2026-06-01 08:00:00,in,face
1001,2026-06-01 17:00:00,out,face`;

/**
 * Manual CSV/export paste import. This is the universally-supported path (every
 * adapter can parse a delimited export), and the documented fallback for
 * planned-live devices (ZKTeco TCP/ADMS, NGTeco cloud). File upload is not built
 * yet — paste rows for now; we do NOT fake a file picker.
 */
export function ImportPunchesDialog({
	deviceId,
	deviceName,
	adapterLabel,
	onClose,
	onImported,
}: ImportPunchesDialogProps) {
	const [csv, setCsv] = useState("");
	const [process, setProcess] = useState(true);
	const [pending, setPending] = useState(false);
	const [result, setResult] = useState<ImportResult | null>(null);
	const csvId = useId();
	const processId = useId();

	const submit = async () => {
		if (csv.trim() === "") {
			return;
		}
		setPending(true);
		try {
			const res = (await client.biometric.punches.importRows({
				deviceId,
				csv,
				process,
			})) as ImportResult;
			setResult(res);
			toast.success(
				`Imported ${res.created} punch${res.created === 1 ? "" : "es"} (${res.duplicate} duplicate, ${res.errors.length} error${res.errors.length === 1 ? "" : "s"}).`
			);
			onImported();
		} catch (err) {
			toast.error(`Import failed: ${(err as Error).message}`);
		} finally {
			setPending(false);
		}
	};

	return (
		<Modal
			footer={
				<>
					<button
						className="btn btn-sm"
						disabled={pending}
						onClick={onClose}
						type="button"
					>
						{result ? "Close" : "Cancel"}
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={pending || csv.trim() === ""}
						onClick={submit}
						type="button"
					>
						{pending ? "Importing…" : "Import"}
					</button>
				</>
			}
			icon={<FileInput size={18} />}
			intro={
				<>
					Paste rows exported from {adapterLabel}. File upload isn't available
					yet — paste CSV/export rows for now. Required columns:{" "}
					<code>device_user_id</code> and <code>timestamp</code>; optional{" "}
					<code>direction</code> and <code>verify_mode</code>.
				</>
			}
			onClose={onClose}
			title={`Import punches — ${deviceName}`}
			wide
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				<label htmlFor={csvId} style={{ fontSize: 12, color: "var(--fg-3)" }}>
					CSV / export rows *
				</label>
				<textarea
					className="input"
					id={csvId}
					onChange={(e) => setCsv(e.target.value)}
					placeholder={SAMPLE}
					rows={8}
					style={{
						width: "100%",
						resize: "vertical",
						fontFamily: "var(--font-mono, monospace)",
						fontSize: 12,
					}}
					value={csv}
				/>
			</div>

			<label
				htmlFor={processId}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					fontSize: 12.5,
					color: "var(--fg-2)",
				}}
			>
				<input
					checked={process}
					id={processId}
					onChange={(e) => setProcess(e.target.checked)}
					type="checkbox"
				/>
				Process into attendance immediately (map, dedupe, create events)
			</label>

			{result && (
				<div
					style={{
						fontSize: 12.5,
						color: "var(--fg-2)",
						background: "var(--bg-2)",
						border: "1px solid var(--line)",
						borderRadius: 10,
						padding: "10px 12px",
					}}
				>
					<div>
						Imported <strong>{result.created}</strong> · duplicate (skipped){" "}
						<strong>{result.duplicate}</strong> · errors{" "}
						<strong>{result.errors.length}</strong>
					</div>
					{result.errors.length > 0 && (
						<ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
							{result.errors.slice(0, 5).map((e) => (
								<li key={e}>{e}</li>
							))}
						</ul>
					)}
				</div>
			)}
		</Modal>
	);
}
