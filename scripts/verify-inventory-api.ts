/**
 * Inventory API verification — Phase INV-C (DB-free).
 *
 * Proves the things check-types and audit:permissions cannot:
 *   1. RBAC HELPERS ⟺ actual AC GRANTS — for ALL roles, the byte-aligned
 *      can*Inventory / can*StockMovement / canOverrideNegativeStock helpers must
 *      agree with what `roles[role].authorize({ inventory_*: [action] })` permits
 *      (the "byte-aligned, none-over-grant" guarantee).
 *   2. The expected role matrix (manager tier / catalogue / officer / readers / none).
 *   3. Separation-of-duties capability split: stock_officer may CREATE but never
 *      APPROVE or OVERRIDE; the creator-≠-approver predicate blocks self-approval.
 *   4. The pure ledger sign + fold maths that the approval path depends on.
 *
 * No database, no server: safe to run anywhere (CI, autonomous). Run:
 *   bun scripts/verify-inventory-api.ts
 */

import { isSelfApproval } from "../packages/api/src/lib/inventory/approval";
import {
	foldMovements,
	movementDeltas,
} from "../packages/api/src/lib/inventory/balances";
import {
	canApproveStockMovement,
	canCreateStockMovement,
	canManageInventory,
	canManageInventoryCatalog,
	canOverrideNegativeStock,
	canViewInventory,
} from "../packages/api/src/utils/role-helpers";
import { roles, type TenantRole } from "../packages/auth/src/permissions";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, extra = "") {
	if (cond) {
		pass += 1;
		process.stdout.write(`  ✓ ${label}${extra ? ` — ${extra}` : ""}\n`);
	} else {
		fail += 1;
		process.stdout.write(`  ✗ ${label}${extra ? ` — ${extra}` : ""}\n`);
	}
}

// Does the actual AC role grant permit <resource>:<action>?
function grants(
	roleName: TenantRole,
	resource: "inventory_product" | "inventory_location" | "inventory_stock",
	action: string
): boolean {
	const roleObj = roles[roleName];
	const result = roleObj.authorize({
		[resource]: [action],
	} as Parameters<typeof roleObj.authorize>[0]);
	return result.success;
}

const ALL_ROLES = Object.keys(roles) as TenantRole[];

process.stdout.write("\n§1 RBAC helpers ⟺ actual AC grants (all roles)\n");
for (const r of ALL_ROLES) {
	// View ⟺ inventory_product:read (the whole read audience).
	ok(
		`${r}: canViewInventory ⟺ inventory_product:read`,
		canViewInventory(r) === grants(r, "inventory_product", "read"),
		`helper=${canViewInventory(r)} grant=${grants(r, "inventory_product", "read")}`
	);
	// Full administration ⟺ inventory_stock:approve (FULL_INVENTORY holders only).
	ok(
		`${r}: canManageInventory ⟺ inventory_stock:approve`,
		canManageInventory(r) === grants(r, "inventory_stock", "approve")
	);
	// Catalogue maintenance ⟺ inventory_product:create (full tier + stock_officer).
	ok(
		`${r}: canManageInventoryCatalog ⟺ inventory_product:create`,
		canManageInventoryCatalog(r) === grants(r, "inventory_product", "create")
	);
	// Propose a movement ⟺ inventory_stock:create (full tier + stock_officer).
	ok(
		`${r}: canCreateStockMovement ⟺ inventory_stock:create`,
		canCreateStockMovement(r) === grants(r, "inventory_stock", "create")
	);
	// Approve ⟺ inventory_stock:approve.
	ok(
		`${r}: canApproveStockMovement ⟺ inventory_stock:approve`,
		canApproveStockMovement(r) === grants(r, "inventory_stock", "approve")
	);
	// Negative override ⟺ inventory_stock:negative_override.
	ok(
		`${r}: canOverrideNegativeStock ⟺ inventory_stock:negative_override`,
		canOverrideNegativeStock(r) ===
			grants(r, "inventory_stock", "negative_override")
	);
}

process.stdout.write("\n§2 expected role matrix\n");
// Full manage tier: owner/admin/hr_admin/inventory_manager.
const MANAGE_TIER: TenantRole[] = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"inventory_manager",
];
// Read audience adds stock_officer + auditor.
const READERS: TenantRole[] = [...MANAGE_TIER, "stock_officer", "auditor"];
// No inventory access at all.
const NONE: TenantRole[] = [
	"payroll_admin",
	"manager",
	"employee",
	"recruiter",
	"helpdesk_agent",
	"project_manager",
	"sales_admin",
	"sales_rep",
];
for (const r of MANAGE_TIER) {
	ok(
		`${r} fully manages (approve + override)`,
		canManageInventory(r) &&
			canApproveStockMovement(r) &&
			canOverrideNegativeStock(r)
	);
}
for (const r of READERS) {
	ok(`${r} can view`, canViewInventory(r));
}
for (const r of NONE) {
	ok(
		`${r} has NO inventory access`,
		!(
			canViewInventory(r) ||
			canManageInventory(r) ||
			canManageInventoryCatalog(r) ||
			canCreateStockMovement(r) ||
			grants(r, "inventory_product", "read")
		)
	);
}

process.stdout.write(
	"\n§3 separation of duties (stock_officer + creator≠approver)\n"
);
ok(
	"stock_officer CAN propose a movement",
	canCreateStockMovement("stock_officer")
);
ok(
	"stock_officer CAN maintain the catalogue",
	canManageInventoryCatalog("stock_officer")
);
ok("stock_officer CANNOT approve", !canApproveStockMovement("stock_officer"));
ok(
	"stock_officer CANNOT override negative balance",
	!canOverrideNegativeStock("stock_officer")
);
ok(
	"stock_officer holds NO archive grant",
	!grants("stock_officer", "inventory_product", "archive")
);
ok(
	"creator may not approve their own movement",
	isSelfApproval("user_creator", "user_creator")
);
ok(
	"a different approver is allowed",
	!isSelfApproval("user_approver", "user_creator")
);

process.stdout.write("\n§4 negative-override is manager-only\n");
for (const r of ALL_ROLES) {
	const isManageTier = MANAGE_TIER.includes(r);
	ok(
		`${r}: override ${isManageTier ? "granted" : "denied"}`,
		canOverrideNegativeStock(r) === isManageTier
	);
}

process.stdout.write("\n§5 pure ledger maths (sign + fold)\n");
ok(
	"in credits destination on-hand",
	movementDeltas({ type: "in", qty: 10, destinationLocationId: "bond" })[0]
		.qty === 10
);
ok(
	"sold debits source on-hand",
	movementDeltas({ type: "sold", qty: 4, sourceLocationId: "office" })[0]
		.qty === -4
);
ok(
	"reserve touches reserved not on-hand",
	(() => {
		const [d] = movementDeltas({
			type: "reserve",
			qty: 5,
			destinationLocationId: "office",
		});
		return d.qty === 0 && d.reserved === 5;
	})()
);
ok(
	"transfer is balance-neutral across the org",
	(() => {
		const buckets = foldMovements([
			{ productId: "p", type: "in", qty: 100, destinationLocationId: "bond" },
			{
				productId: "p",
				type: "transfer",
				qty: 30,
				sourceLocationId: "bond",
				destinationLocationId: "office",
			},
		]);
		const total = buckets.reduce((sum, b) => sum + b.qty, 0);
		return total === 100;
	})()
);

process.stdout.write(
	`\nInventory API verification: ${pass} passed, ${fail} failed\n`
);
process.exit(fail === 0 ? 0 : 1);
