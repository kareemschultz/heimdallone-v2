import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { orpc } from "@/utils/orpc";
import { movementTypeLabel } from "./labels";
import type { LocationRow, MovementType, ProductRow } from "./types";

export interface MovementFormValues {
	destinationLocationId: string | null;
	notes: string | null;
	productId: string;
	qty: number;
	reason: string | null;
	reference: string | null;
	sourceLocationId: string | null;
	type: MovementType;
}

interface MovementFormProps {
	onCancel: () => void;
	onSubmit: (values: MovementFormValues) => Promise<void>;
}

const TYPE_OPTIONS: MovementType[] = [
	"in",
	"out",
	"transfer",
	"returned",
	"sold",
	"issued",
	"damaged",
	"adjustment",
	"count_adjustment",
	"reserve",
	"release",
];

/** Which location fields a movement type needs (mirrors the server's
 *  movementDeltas requirements so the form can't build an invalid movement). */
function fieldsFor(type: MovementType): { source: boolean; dest: boolean } {
	if (type === "transfer") {
		return { source: true, dest: true };
	}
	if (
		type === "out" ||
		type === "sold" ||
		type === "issued" ||
		type === "damaged"
	) {
		return { source: true, dest: false };
	}
	// in / returned / adjustment / count_adjustment / reserve / release
	return { source: false, dest: true };
}

/** PURE: validate the movement form. Returns an error message, or null when the
 *  movement is structurally valid. Kept out of the component to keep its
 *  cognitive complexity in check. */
function validate(args: {
	productId: string;
	qtyNum: number;
	type: MovementType;
	fields: { source: boolean; dest: boolean };
	sourceLocationId: string;
	destinationLocationId: string;
}): string | null {
	const {
		productId,
		qtyNum,
		type,
		fields,
		sourceLocationId,
		destinationLocationId,
	} = args;
	if (!productId) {
		return "Choose a product.";
	}
	if (!qtyNum || qtyNum <= 0) {
		return "Quantity must be a positive whole number.";
	}
	if (fields.source && !sourceLocationId) {
		return "Choose a source location.";
	}
	if (fields.dest && !destinationLocationId) {
		return "Choose a destination location.";
	}
	if (type === "transfer" && sourceLocationId === destinationLocationId) {
		return "Transfer source and destination must differ.";
	}
	return null;
}

export function MovementForm({ onCancel, onSubmit }: MovementFormProps) {
	const [productId, setProductId] = useState("");
	const [type, setType] = useState<MovementType>("in");
	const [qty, setQty] = useState("1");
	const [sourceLocationId, setSourceLocationId] = useState("");
	const [destinationLocationId, setDestinationLocationId] = useState("");
	const [reason, setReason] = useState("");
	const [reference, setReference] = useState("");
	const [notes, setNotes] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onCancel();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onCancel]);

	const products = useQuery(
		orpc.inventory.products.list.queryOptions({ input: { activeOnly: true } })
	);
	const locations = useQuery(
		orpc.inventory.locations.list.queryOptions({ input: undefined })
	);
	const productRows = (products.data as ProductRow[] | undefined) ?? [];
	const locationRows = (locations.data as LocationRow[] | undefined) ?? [];

	const fields = useMemo(() => fieldsFor(type), [type]);

	async function handleSave() {
		setError(null);
		const qtyNum = Number.parseInt(qty, 10);
		const validationError = validate({
			productId,
			qtyNum,
			type,
			fields,
			sourceLocationId,
			destinationLocationId,
		});
		if (validationError) {
			setError(validationError);
			return;
		}
		setBusy(true);
		try {
			await onSubmit({
				productId,
				type,
				qty: qtyNum,
				sourceLocationId: fields.source ? sourceLocationId : null,
				destinationLocationId: fields.dest ? destinationLocationId : null,
				reason: reason.trim() || null,
				reference: reference.trim() || null,
				notes: notes.trim() || null,
			});
		} catch (e) {
			setError(
				(e as { message?: string }).message ?? "Could not record the movement."
			);
			setBusy(false);
		}
	}

	return (
		<div className="inv-dialog-backdrop">
			<div
				aria-labelledby="inv-movement-title"
				aria-modal="true"
				className="inv-dialog"
				role="dialog"
			>
				<h2 id="inv-movement-title">New stock movement</h2>
				<p className="inv-sub">
					A movement is recorded as pending. A different person approves it
					before stock levels change (separation of duties).
				</p>

				<div className="inv-field">
					<label htmlFor="inv-m-product">Product</label>
					<select
						id="inv-m-product"
						onChange={(e) => setProductId(e.target.value)}
						value={productId}
					>
						<option value="">Select a product…</option>
						{productRows.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
								{p.sku ? ` (${p.sku})` : ""}
							</option>
						))}
					</select>
				</div>

				<div className="inv-field-row">
					<div className="inv-field">
						<label htmlFor="inv-m-type">Type</label>
						<select
							id="inv-m-type"
							onChange={(e) => setType(e.target.value as MovementType)}
							value={type}
						>
							{TYPE_OPTIONS.map((t) => (
								<option key={t} value={t}>
									{movementTypeLabel(t)}
								</option>
							))}
						</select>
					</div>
					<div className="inv-field">
						<label htmlFor="inv-m-qty">Quantity</label>
						<input
							id="inv-m-qty"
							inputMode="numeric"
							onChange={(e) => setQty(e.target.value)}
							value={qty}
						/>
					</div>
				</div>

				{fields.source ? (
					<div className="inv-field">
						<label htmlFor="inv-m-source">From location</label>
						<select
							id="inv-m-source"
							onChange={(e) => setSourceLocationId(e.target.value)}
							value={sourceLocationId}
						>
							<option value="">Select…</option>
							{locationRows.map((l) => (
								<option key={l.id} value={l.id}>
									{l.name}
								</option>
							))}
						</select>
					</div>
				) : null}

				{fields.dest ? (
					<div className="inv-field">
						<label htmlFor="inv-m-dest">To location</label>
						<select
							id="inv-m-dest"
							onChange={(e) => setDestinationLocationId(e.target.value)}
							value={destinationLocationId}
						>
							<option value="">Select…</option>
							{locationRows.map((l) => (
								<option key={l.id} value={l.id}>
									{l.name}
								</option>
							))}
						</select>
					</div>
				) : null}

				<div className="inv-field-row">
					<div className="inv-field">
						<label htmlFor="inv-m-reason">Reason</label>
						<input
							id="inv-m-reason"
							onChange={(e) => setReason(e.target.value)}
							placeholder="optional"
							value={reason}
						/>
					</div>
					<div className="inv-field">
						<label htmlFor="inv-m-ref">Reference</label>
						<input
							id="inv-m-ref"
							onChange={(e) => setReference(e.target.value)}
							placeholder="e.g. PO-2002"
							value={reference}
						/>
					</div>
				</div>

				<div className="inv-field">
					<label htmlFor="inv-m-notes">Notes</label>
					<textarea
						id="inv-m-notes"
						onChange={(e) => setNotes(e.target.value)}
						placeholder="optional"
						rows={2}
						value={notes}
					/>
				</div>

				{error ? (
					<p className="inv-sub" style={{ color: "var(--danger)" }}>
						{error}
					</p>
				) : null}

				<div className="inv-dialog-actions">
					<button
						className="inv-btn"
						disabled={busy}
						onClick={onCancel}
						type="button"
					>
						Cancel
					</button>
					<button
						className="inv-btn primary"
						disabled={busy}
						onClick={handleSave}
						type="button"
					>
						{busy ? "Recording…" : "Record movement"}
					</button>
				</div>
			</div>
		</div>
	);
}
