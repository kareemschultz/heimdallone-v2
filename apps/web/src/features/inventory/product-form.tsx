import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { orpc } from "@/utils/orpc";
import type { CategoryRow, ProductRow, ProductTypeRow } from "./types";

export interface ProductFormValues {
	brand: string | null;
	categoryId: string;
	modelName: string | null;
	name: string;
	reorderLevel: number;
	sku: string | null;
	typeId: string;
	unitPriceCents: number | null;
}

interface ProductFormProps {
	existing: ProductRow | null;
	onCancel: () => void;
	onSubmit: (values: ProductFormValues) => Promise<void>;
}

function dollarsToCents(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}
	const parsed = Number.parseFloat(trimmed);
	if (Number.isNaN(parsed) || parsed < 0) {
		return null;
	}
	return Math.round(parsed * 100);
}

export function ProductForm({
	existing,
	onCancel,
	onSubmit,
}: ProductFormProps) {
	const [name, setName] = useState(existing?.name ?? "");
	const [sku, setSku] = useState(existing?.sku ?? "");
	const [brand, setBrand] = useState(existing?.brand ?? "");
	const [modelName, setModelName] = useState(existing?.modelName ?? "");
	const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
	const [typeId, setTypeId] = useState(existing?.typeId ?? "");
	const [price, setPrice] = useState(
		existing?.unitPriceCents == null
			? ""
			: (existing.unitPriceCents / 100).toString()
	);
	const [reorder, setReorder] = useState(
		existing?.reorderLevel == null ? "0" : existing.reorderLevel.toString()
	);
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

	const categories = useQuery(
		orpc.inventory.categories.list.queryOptions({ input: {} })
	);
	const types = useQuery(
		orpc.inventory.productTypes.list.queryOptions({ input: {} })
	);

	const categoryRows = (categories.data as CategoryRow[] | undefined) ?? [];
	const typeRows = (types.data as ProductTypeRow[] | undefined) ?? [];
	// Only the product types under the chosen category are valid.
	const typesForCategory = useMemo(
		() => typeRows.filter((t) => !categoryId || t.categoryId === categoryId),
		[typeRows, categoryId]
	);

	const isEdit = existing != null;

	async function handleSave() {
		setError(null);
		if (!name.trim()) {
			setError("A product name is required.");
			return;
		}
		if (!(isEdit || (categoryId && typeId))) {
			setError("Choose a category and product type.");
			return;
		}
		setBusy(true);
		try {
			await onSubmit({
				name: name.trim(),
				sku: sku.trim() || null,
				modelName: modelName.trim() || null,
				brand: brand.trim() || null,
				categoryId,
				typeId,
				unitPriceCents: dollarsToCents(price),
				reorderLevel: Number.parseInt(reorder, 10) || 0,
			});
		} catch (e) {
			setError(
				(e as { message?: string }).message ?? "Could not save the product."
			);
			setBusy(false);
		}
	}

	return (
		<div className="inv-dialog-backdrop">
			<div
				aria-labelledby="inv-product-title"
				aria-modal="true"
				className="inv-dialog"
				role="dialog"
			>
				<h2 id="inv-product-title">
					{isEdit ? "Edit product" : "New product"}
				</h2>
				<p className="inv-sub">
					Products are the items you track. Quantities change only through
					approved stock movements.
				</p>

				<div className="inv-field">
					<label htmlFor="inv-p-name">Name</label>
					<input
						id="inv-p-name"
						onChange={(e) => setName(e.target.value)}
						placeholder="e.g. Core Router 4-Port"
						value={name}
					/>
				</div>

				<div className="inv-field-row">
					<div className="inv-field">
						<label htmlFor="inv-p-sku">SKU</label>
						<input
							id="inv-p-sku"
							onChange={(e) => setSku(e.target.value)}
							placeholder="optional"
							value={sku}
						/>
					</div>
					<div className="inv-field">
						<label htmlFor="inv-p-brand">Brand</label>
						<input
							id="inv-p-brand"
							onChange={(e) => setBrand(e.target.value)}
							placeholder="optional"
							value={brand}
						/>
					</div>
				</div>

				<div className="inv-field">
					<label htmlFor="inv-p-model">Model</label>
					<input
						id="inv-p-model"
						onChange={(e) => setModelName(e.target.value)}
						placeholder="optional"
						value={modelName}
					/>
				</div>

				{isEdit ? null : (
					<div className="inv-field-row">
						<div className="inv-field">
							<label htmlFor="inv-p-cat">Category</label>
							<select
								id="inv-p-cat"
								onChange={(e) => {
									setCategoryId(e.target.value);
									setTypeId("");
								}}
								value={categoryId}
							>
								<option value="">Select…</option>
								{categoryRows.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</select>
						</div>
						<div className="inv-field">
							<label htmlFor="inv-p-type">Product type</label>
							<select
								disabled={!categoryId}
								id="inv-p-type"
								onChange={(e) => setTypeId(e.target.value)}
								value={typeId}
							>
								<option value="">Select…</option>
								{typesForCategory.map((t) => (
									<option key={t.id} value={t.id}>
										{t.name}
									</option>
								))}
							</select>
						</div>
					</div>
				)}

				<div className="inv-field-row">
					<div className="inv-field">
						<label htmlFor="inv-p-price">Unit price</label>
						<input
							id="inv-p-price"
							inputMode="decimal"
							onChange={(e) => setPrice(e.target.value)}
							placeholder="0.00"
							value={price}
						/>
					</div>
					<div className="inv-field">
						<label htmlFor="inv-p-reorder">Reorder level</label>
						<input
							id="inv-p-reorder"
							inputMode="numeric"
							onChange={(e) => setReorder(e.target.value)}
							placeholder="0"
							value={reorder}
						/>
					</div>
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
						{busy ? "Saving…" : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
