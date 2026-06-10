/**
 * Assets seed (Phase 12B) — realistic Atlas Shipping asset data.
 *
 * Idempotent: clears this org's asset_* rows (request → assignment → asset →
 * category) then re-inserts, so reruns never duplicate.
 *
 * Seeds: 5 categories; 10 assets across statuses; 8 assignments (5 open + 3
 * returned incl. one damaged); 4 requests (requested/approved/rejected/cancelled).
 *
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-assets.ts
 */
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { createDb } from "../packages/db/src/index";
import {
	asset,
	assetAssignment,
	assetCategory,
	assetRequest,
} from "../packages/db/src/schema/assets";
import { organization, user } from "../packages/db/src/schema/auth";
import { employeeProfile } from "../packages/db/src/schema/hr-core";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY);

async function main() {
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
	const orgId = org.id;

	const employees = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.organizationId, orgId),
				eq(employeeProfile.isActive, true)
			)
		)
		.limit(8);
	if (employees.length < 5) {
		process.stderr.write("Not enough active employees — run seed-dev.ts.\n");
		process.exit(1);
	}
	const emp = employees.map((e) => e.id);

	const owner = (
		await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, "owner@atlas-shipping.com"))
			.limit(1)
	).at(0);
	const ownerUserId = owner?.id ?? null;

	// ── Idempotent reset (FK-safe order) ──────────────────────
	await db.delete(assetRequest).where(eq(assetRequest.organizationId, orgId));
	await db
		.delete(assetAssignment)
		.where(eq(assetAssignment.organizationId, orgId));
	await db.delete(asset).where(eq(asset.organizationId, orgId));
	await db.delete(assetCategory).where(eq(assetCategory.organizationId, orgId));

	// ── Categories ────────────────────────────────────────────
	const cat = {
		laptop: createId(),
		phone: createId(),
		network: createId(),
		accessCard: createId(),
		vehicle: createId(),
	};
	await db.insert(assetCategory).values([
		{
			id: cat.laptop,
			organizationId: orgId,
			name: "Laptop",
			description: "Company laptops and notebooks",
		},
		{
			id: cat.phone,
			organizationId: orgId,
			name: "Mobile Phone",
			description: "Company mobile handsets",
		},
		{
			id: cat.network,
			organizationId: orgId,
			name: "Network Equipment",
			description: "Routers, switches, access points",
		},
		{
			id: cat.accessCard,
			organizationId: orgId,
			name: "Access Card",
			description: "Door / gate access cards",
		},
		{
			id: cat.vehicle,
			organizationId: orgId,
			name: "Vehicle / Field Equipment",
			description: "Field vehicles and equipment",
		},
	]);

	// ── Assets ────────────────────────────────────────────────
	const a = {
		laptop1: createId(), // assigned
		laptop2: createId(), // available
		laptop3: createId(), // assigned (history)
		phone1: createId(), // assigned
		phone2: createId(), // available
		network1: createId(), // assigned (network device in use)
		card1: createId(), // assigned (access card)
		vehicle1: createId(), // available field equipment
		damaged1: createId(), // available but last returned damaged
		retired1: createId(), // retired / write-off
	};
	await db.insert(asset).values([
		{
			id: a.laptop1,
			organizationId: orgId,
			categoryId: cat.laptop,
			name: 'Dell Latitude 5440 14"',
			trackingId: "AST-LT-0001",
			status: "in_use",
			currentAssigneeId: emp[0],
			purchaseDate: daysAgo(400),
			purchaseCost: "285000.00",
		},
		{
			id: a.laptop2,
			organizationId: orgId,
			categoryId: cat.laptop,
			name: "Lenovo ThinkPad T14",
			trackingId: "AST-LT-0002",
			status: "available",
			purchaseDate: daysAgo(120),
			purchaseCost: "312000.00",
		},
		{
			id: a.laptop3,
			organizationId: orgId,
			categoryId: cat.laptop,
			name: "HP EliteBook 840",
			trackingId: "AST-LT-0003",
			status: "in_use",
			currentAssigneeId: emp[1],
			purchaseDate: daysAgo(300),
			purchaseCost: "298000.00",
		},
		{
			id: a.phone1,
			organizationId: orgId,
			categoryId: cat.phone,
			name: "Samsung Galaxy A55",
			trackingId: "AST-PH-0001",
			status: "in_use",
			currentAssigneeId: emp[2],
			purchaseDate: daysAgo(200),
			purchaseCost: "96000.00",
		},
		{
			id: a.phone2,
			organizationId: orgId,
			categoryId: cat.phone,
			name: "iPhone SE (3rd gen)",
			trackingId: "AST-PH-0002",
			status: "available",
			purchaseDate: daysAgo(90),
			purchaseCost: "128000.00",
		},
		{
			id: a.network1,
			organizationId: orgId,
			categoryId: cat.network,
			name: "Ubiquiti UDM Pro",
			trackingId: "AST-NW-0001",
			status: "in_use",
			currentAssigneeId: emp[3],
			purchaseDate: daysAgo(500),
			purchaseCost: "78000.00",
		},
		{
			id: a.card1,
			organizationId: orgId,
			categoryId: cat.accessCard,
			name: "Gate Access Card #A-118",
			trackingId: "AST-AC-0118",
			status: "in_use",
			currentAssigneeId: emp[4],
			purchaseDate: daysAgo(260),
		},
		{
			id: a.vehicle1,
			organizationId: orgId,
			categoryId: cat.vehicle,
			name: "Handheld Barcode Scanner",
			trackingId: "AST-FE-0007",
			status: "available",
			purchaseDate: daysAgo(150),
			purchaseCost: "42000.00",
		},
		{
			id: a.damaged1,
			organizationId: orgId,
			categoryId: cat.laptop,
			name: "Acer Aspire 5 (maintenance)",
			trackingId: "AST-LT-0009",
			status: "available",
			purchaseDate: daysAgo(700),
			purchaseCost: "180000.00",
			description: "Returned with major damage — pending repair assessment.",
		},
		{
			id: a.retired1,
			organizationId: orgId,
			categoryId: cat.phone,
			name: "Nokia 6 (legacy)",
			trackingId: "AST-PH-0099",
			status: "retired",
			purchaseDate: daysAgo(1500),
			purchaseCost: "55000.00",
			description: "End of life — written off.",
		},
	]);

	// ── Assignments (4 open + 3 returned incl. one damaged) ───
	await db.insert(assetAssignment).values([
		// Open custody (matches each in_use asset's currentAssigneeId).
		{
			id: createId(),
			organizationId: orgId,
			assetId: a.laptop1,
			assignedToId: emp[0],
			assignedByUserId: ownerUserId,
			assignedAt: daysAgo(380),
			returnDueDate: null,
		},
		{
			id: createId(),
			organizationId: orgId,
			assetId: a.laptop3,
			assignedToId: emp[1],
			assignedByUserId: ownerUserId,
			assignedAt: daysAgo(90),
		},
		{
			id: createId(),
			organizationId: orgId,
			assetId: a.phone1,
			assignedToId: emp[2],
			assignedByUserId: ownerUserId,
			assignedAt: daysAgo(180),
		},
		{
			id: createId(),
			organizationId: orgId,
			assetId: a.network1,
			assignedToId: emp[3],
			assignedByUserId: ownerUserId,
			assignedAt: daysAgo(450),
		},
		{
			id: createId(),
			organizationId: orgId,
			assetId: a.card1,
			assignedToId: emp[4],
			assignedByUserId: ownerUserId,
			assignedAt: daysAgo(240),
		},
		// Returned history — laptop2 was previously held then returned healthy.
		{
			id: createId(),
			organizationId: orgId,
			assetId: a.laptop2,
			assignedToId: emp[2],
			assignedByUserId: ownerUserId,
			assignedAt: daysAgo(110),
			returnedAt: daysAgo(20),
			returnCondition: "healthy",
			returnReceivedByUserId: ownerUserId,
			notes: "Returned in good condition on role change.",
		},
		// Returned history — phone2 returned with minor damage.
		{
			id: createId(),
			organizationId: orgId,
			assetId: a.phone2,
			assignedToId: emp[0],
			assignedByUserId: ownerUserId,
			assignedAt: daysAgo(80),
			returnedAt: daysAgo(10),
			returnCondition: "minor_damage",
			returnReceivedByUserId: ownerUserId,
			notes: "Minor screen scratch noted.",
		},
		// Damaged return — Acer returned with major damage (now available/maintenance).
		{
			id: createId(),
			organizationId: orgId,
			assetId: a.damaged1,
			assignedToId: emp[1],
			assignedByUserId: ownerUserId,
			assignedAt: daysAgo(120),
			returnedAt: daysAgo(5),
			returnCondition: "major_damage",
			returnReceivedByUserId: ownerUserId,
			notes: "Liquid damage — sent for repair assessment.",
		},
	]);

	// ── Requests (one per status) ─────────────────────────────
	await db.insert(assetRequest).values([
		{
			id: createId(),
			organizationId: orgId,
			employeeId: emp[5],
			requestedByUserId: ownerUserId,
			categoryId: cat.laptop,
			description: "Need a laptop for the new finance hire.",
			status: "requested",
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: emp[6] ?? emp[0],
			requestedByUserId: ownerUserId,
			categoryId: cat.phone,
			description: "Field supervisor needs a company phone.",
			status: "approved",
			resolvedByUserId: ownerUserId,
			resolvedAt: daysAgo(3),
			fulfilledAssetId: a.phone2,
			resolutionNote: "Approved — issued iPhone SE.",
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: emp[2],
			requestedByUserId: ownerUserId,
			categoryId: cat.accessCard,
			description: "Replacement access card for lost one.",
			status: "rejected",
			resolvedByUserId: ownerUserId,
			resolvedAt: daysAgo(2),
			resolutionNote: "Rejected — existing card located.",
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: emp[3],
			requestedByUserId: ownerUserId,
			categoryId: cat.vehicle,
			description: "Requested barcode scanner for warehouse.",
			status: "cancelled",
			resolvedByUserId: ownerUserId,
			resolvedAt: daysAgo(1),
			resolutionNote: "Withdrawn by requester.",
		},
	]);

	// ── Counts ────────────────────────────────────────────────
	const counts = {
		categories: (
			await db
				.select()
				.from(assetCategory)
				.where(eq(assetCategory.organizationId, orgId))
		).length,
		assets: (
			await db.select().from(asset).where(eq(asset.organizationId, orgId))
		).length,
		assignments: (
			await db
				.select()
				.from(assetAssignment)
				.where(eq(assetAssignment.organizationId, orgId))
		).length,
		requests: (
			await db
				.select()
				.from(assetRequest)
				.where(eq(assetRequest.organizationId, orgId))
		).length,
	};
	process.stdout.write(
		`Assets seed complete: ${counts.categories} categories, ${counts.assets} assets, ${counts.assignments} assignments, ${counts.requests} requests.\n`
	);
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`${err}\n`);
	process.exit(1);
});
