// Display-side mirrors of the inventory router outputs (Phase INV-C/D).

export interface CategoryRow {
	description: string | null;
	id: string;
	isActive: boolean;
	name: string;
	slug: string;
}

export interface ProductTypeRow {
	categoryId: string;
	id: string;
	isActive: boolean;
	name: string;
	slug: string;
}

export interface ProductRow {
	brand: string | null;
	categoryId: string | null;
	categoryName: string | null;
	currencyCode: string | null;
	id: string;
	isActive: boolean;
	modelName: string | null;
	name: string;
	reorderLevel: number | null;
	sku: string | null;
	typeId: string | null;
	typeName: string | null;
	unitPriceCents: number | null;
	updatedAt: string;
}

export interface LocationRow {
	code: string | null;
	id: string;
	isActive: boolean;
	kind: "office" | "bond";
	name: string;
	slug: string;
}

export type MovementStatus =
	| "draft"
	| "pending"
	| "approved"
	| "rejected"
	| "cancelled";

export type MovementType =
	| "in"
	| "out"
	| "transfer"
	| "adjustment"
	| "count_adjustment"
	| "reserve"
	| "release"
	| "damaged"
	| "returned"
	| "issued"
	| "sold";

export interface MovementRow {
	approvedAt: string | null;
	approvedBy: string | null;
	createdAt: string;
	createdBy: string | null;
	destinationLocationId: string | null;
	destinationLocationName: string | null;
	id: string;
	notes: string | null;
	productId: string;
	productName: string | null;
	productSku: string | null;
	qty: number;
	reason: string | null;
	reference: string | null;
	sourceLocationId: string | null;
	sourceLocationName: string | null;
	status: MovementStatus;
	type: MovementType;
}

export interface BalanceRow {
	locationId: string;
	locationKind: "office" | "bond" | null;
	locationName: string | null;
	productId: string;
	productName: string | null;
	productSku: string | null;
	qty: number;
	reorderLevel: number | null;
	reserved: number;
	unitPriceCents: number | null;
}

export interface InventorySummary {
	lowStockCount: number;
	onHandUnits: number;
	pendingMovements: number;
	productCount: number;
	stockValueCents: number;
}
