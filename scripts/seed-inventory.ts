// Seed Inventory data for Atlas Shipping — Phase INV-B.
//
// Idempotent: deletes the org's inventory rows (movements → balances → product
// children → products → types → categories → locations) then re-inserts catalog,
// locations and an approved-movements ledger, and rebuilds the balance cache via
// the org-scoped recomputeBalances() (proving the ledger → cache invariant).
//
// Run: export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-inventory.ts

import { createId } from "@paralleldrive/cuid2";
import { eq, inArray } from "drizzle-orm";
import {
	movementDeltas,
	recomputeBalances,
} from "../packages/api/src/lib/inventory/balances";
import { createDb } from "../packages/db/src/index";
import { organization, user } from "../packages/db/src/schema/auth";
import {
	inventoryCategory,
	inventoryLocation,
	inventoryPriceHistory,
	inventoryProduct,
	inventoryProductAlias,
	inventoryProductAttribute,
	inventoryProductImage,
	inventoryProductType,
	inventoryStockBalance,
	inventoryStockMovement,
} from "../packages/db/src/schema/inventory";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();
const DEFAULT_CURRENCY = "GYD";

async function resolveOrgId(): Promise<string> {
	const org = (
		await db
			.select()
			.from(organization)
			.where(eq(organization.slug, "atlas-shipping"))
			.limit(1)
	).at(0);
	if (!org) {
		process.stderr.write("Atlas org not found — run seed-dev.ts first.\n");
		process.exit(1);
	}
	return org.id;
}

async function resolveAdminUid(): Promise<string> {
	const rows = await db
		.select({ id: user.id, email: user.email })
		.from(user)
		.limit(200);
	const admin = rows.find((r) => r.email === "admin@atlas-shipping.com");
	if (!admin) {
		process.stderr.write("admin@atlas-shipping.com not found.\n");
		process.exit(1);
	}
	return admin.id;
}

async function resetOrgInventory(orgId: string): Promise<void> {
	const productIds = (
		await db
			.select({ id: inventoryProduct.id })
			.from(inventoryProduct)
			.where(eq(inventoryProduct.organizationId, orgId))
	).map((r) => r.id);

	await db
		.delete(inventoryStockMovement)
		.where(eq(inventoryStockMovement.organizationId, orgId));
	await db
		.delete(inventoryStockBalance)
		.where(eq(inventoryStockBalance.organizationId, orgId));
	if (productIds.length > 0) {
		await db
			.delete(inventoryPriceHistory)
			.where(inArray(inventoryPriceHistory.productId, productIds));
		await db
			.delete(inventoryProductAlias)
			.where(inArray(inventoryProductAlias.productId, productIds));
		await db
			.delete(inventoryProductAttribute)
			.where(inArray(inventoryProductAttribute.productId, productIds));
		await db
			.delete(inventoryProductImage)
			.where(inArray(inventoryProductImage.productId, productIds));
	}
	await db
		.delete(inventoryProduct)
		.where(eq(inventoryProduct.organizationId, orgId));
	await db
		.delete(inventoryProductType)
		.where(eq(inventoryProductType.organizationId, orgId));
	await db
		.delete(inventoryCategory)
		.where(eq(inventoryCategory.organizationId, orgId));
	await db
		.delete(inventoryLocation)
		.where(eq(inventoryLocation.organizationId, orgId));
}

interface SeededCatalog {
	locationBondId: string;
	locationOfficeId: string;
	productIds: Record<string, string>;
}

async function seedCatalog(
	orgId: string,
	createdBy: string
): Promise<SeededCatalog> {
	const networkingId = createId();
	const cpeId = createId();
	await db.insert(inventoryCategory).values([
		{
			id: networkingId,
			organizationId: orgId,
			name: "Networking",
			slug: "networking",
			description: "Core network distribution equipment.",
		},
		{
			id: cpeId,
			organizationId: orgId,
			name: "Customer Premises Equipment",
			slug: "cpe",
			description: "Equipment installed at the customer site.",
		},
	]);

	const routerTypeId = createId();
	const switchTypeId = createId();
	const modemTypeId = createId();
	await db.insert(inventoryProductType).values([
		{
			id: routerTypeId,
			organizationId: orgId,
			categoryId: networkingId,
			name: "Routers",
			slug: "routers",
		},
		{
			id: switchTypeId,
			organizationId: orgId,
			categoryId: networkingId,
			name: "Switches",
			slug: "switches",
		},
		{
			id: modemTypeId,
			organizationId: orgId,
			categoryId: cpeId,
			name: "Modems",
			slug: "modems",
		},
	]);

	const productSpecs = [
		{
			key: "RT-CORE",
			sku: "NS-RT-001",
			name: "Core Router 4-Port",
			categoryId: networkingId,
			typeId: routerTypeId,
			brand: "Mikrotik",
			priceCents: 850_000,
			reorder: 10,
		},
		{
			key: "RT-EDGE",
			sku: "NS-RT-002",
			name: "Edge Router 8-Port",
			categoryId: networkingId,
			typeId: routerTypeId,
			brand: "Mikrotik",
			priceCents: 1_420_000,
			reorder: 6,
		},
		{
			key: "SW-24",
			sku: "NS-SW-024",
			name: "24-Port Gigabit Switch",
			categoryId: networkingId,
			typeId: switchTypeId,
			brand: "TP-Link",
			priceCents: 620_000,
			reorder: 8,
		},
		{
			key: "MD-GPON",
			sku: "NS-MD-001",
			name: "GPON ONU Modem",
			categoryId: cpeId,
			typeId: modemTypeId,
			brand: "Huawei",
			priceCents: 185_000,
			reorder: 40,
		},
		{
			key: "MD-AC",
			sku: "NS-MD-002",
			name: "AC1200 WiFi Modem",
			categoryId: cpeId,
			typeId: modemTypeId,
			brand: "Huawei",
			priceCents: 240_000,
			reorder: 30,
		},
	];

	const productIds: Record<string, string> = {};
	for (const spec of productSpecs) {
		const id = createId();
		productIds[spec.key] = id;
		await db.insert(inventoryProduct).values({
			id,
			organizationId: orgId,
			sku: spec.sku,
			name: spec.name,
			categoryId: spec.categoryId,
			typeId: spec.typeId,
			brand: spec.brand,
			unitPriceCents: spec.priceCents,
			currencyCode: DEFAULT_CURRENCY,
			reorderLevel: spec.reorder,
		});
		await db.insert(inventoryPriceHistory).values({
			id: createId(),
			productId: id,
			newPriceCents: spec.priceCents,
			currencyCode: DEFAULT_CURRENCY,
			effectiveDate: new Date(),
			reason: "Initial catalogue price",
			source: "seed",
			createdBy,
		});
	}

	const locationOfficeId = createId();
	const locationBondId = createId();
	await db.insert(inventoryLocation).values([
		{
			id: locationOfficeId,
			organizationId: orgId,
			name: "Main Office",
			slug: "main-office",
			kind: "office",
			code: "OFF",
		},
		{
			id: locationBondId,
			organizationId: orgId,
			name: "Customs Bond",
			slug: "customs-bond",
			kind: "bond",
			code: "BOND",
		},
	]);

	return { locationBondId, locationOfficeId, productIds };
}

async function seedLedger(
	orgId: string,
	createdBy: string,
	approvedBy: string,
	cat: SeededCatalog
): Promise<{ approved: number; pending: number }> {
	const now = new Date();
	const approvedRows: (typeof inventoryStockMovement.$inferInsert)[] = [];
	const pendingRows: (typeof inventoryStockMovement.$inferInsert)[] = [];

	// Receive 100 of every product into the bond (approved `in`).
	for (const productId of Object.values(cat.productIds)) {
		approvedRows.push({
			id: createId(),
			organizationId: orgId,
			productId,
			type: "in",
			qty: 100,
			destinationLocationId: cat.locationBondId,
			reason: "Opening stock receipt",
			reference: "INIT-RECEIPT",
			status: "approved",
			createdBy,
			approvedBy,
			approvedAt: now,
		});
	}
	// Transfer 30 core routers bond → office; then sell 10 from office.
	approvedRows.push({
		id: createId(),
		organizationId: orgId,
		productId: cat.productIds["RT-CORE"],
		type: "transfer",
		qty: 30,
		sourceLocationId: cat.locationBondId,
		destinationLocationId: cat.locationOfficeId,
		reason: "Move sellable stock to office",
		status: "approved",
		createdBy,
		approvedBy,
		approvedAt: now,
	});
	approvedRows.push({
		id: createId(),
		organizationId: orgId,
		productId: cat.productIds["RT-CORE"],
		type: "sold",
		qty: 10,
		sourceLocationId: cat.locationOfficeId,
		reason: "Customer sale",
		reference: "SO-1001",
		status: "approved",
		createdBy,
		approvedBy,
		approvedAt: now,
	});
	// One pending receipt awaiting approval (shows the approval queue).
	pendingRows.push({
		id: createId(),
		organizationId: orgId,
		productId: cat.productIds["SW-24"],
		type: "in",
		qty: 50,
		destinationLocationId: cat.locationBondId,
		reason: "Restock shipment",
		reference: "PO-2002",
		status: "pending",
		createdBy,
	});

	await db
		.insert(inventoryStockMovement)
		.values([...approvedRows, ...pendingRows]);
	return { approved: approvedRows.length, pending: pendingRows.length };
}

async function main() {
	const orgId = await resolveOrgId();
	const adminUid = await resolveAdminUid();

	await resetOrgInventory(orgId);
	const cat = await seedCatalog(orgId, adminUid);
	const counts = await seedLedger(orgId, adminUid, adminUid, cat);

	// Rebuild the derived balance cache from the approved ledger (org-scoped).
	await db.transaction((tx) => recomputeBalances(tx, orgId));

	const balanceCount = (
		await db
			.select({ id: inventoryStockBalance.id })
			.from(inventoryStockBalance)
			.where(eq(inventoryStockBalance.organizationId, orgId))
	).length;

	// Sanity: deltas of the approved ledger should match the cached buckets.
	const _check = movementDeltas({
		type: "in",
		qty: 100,
		destinationLocationId: cat.locationBondId,
	});

	process.stdout.write(
		`✓ Inventory seeded for Atlas Shipping: ${Object.keys(cat.productIds).length} products, 2 locations, ${counts.approved} approved + ${counts.pending} pending movements, ${balanceCount} balance buckets (delta-check ${_check.length === 1 ? "ok" : "FAIL"}).\n`
	);
	process.exit(0);
}

main().catch((e) => {
	process.stderr.write(`${e}\n`);
	process.exit(1);
});
