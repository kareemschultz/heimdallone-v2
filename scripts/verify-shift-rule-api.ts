/**
 * Shift-rule API RBAC verification — Phase 21J (DB-free).
 *
 * scheduleRules reuses the `roster` AC resource (read/manage) — so audit stays
 * 161/21 — but pay-policy MUTATION is narrowed in the handler to admin/HR/payroll
 * via `canManageScheduleRules`. This proves the two things check-types/audit can't:
 *
 *   §1  canManageScheduleRules ⟺ {owner, admin, hr_admin, payroll_admin} for every
 *       one of the 12 roles (least-privilege; managers excluded).
 *   §2  Two-layer authz: a manager HOLDS the roster:manage AC grant (first layer)
 *       yet canManageScheduleRules(manager) === false (handler narrowing) — so the
 *       AC gate alone does NOT let a manager edit pay policy.
 *   §3  Read audience: scheduleRules read reuses roster:read; canViewRoster ⟺
 *       roster:read for every role (manager/employee/auditor included).
 *
 * No database, no server. Run: bun scripts/verify-shift-rule-api.ts
 */

import {
	canManageScheduleRules,
	canViewRoster,
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

function grants(roleName: TenantRole, action: string): boolean {
	const roleObj = roles[roleName];
	return roleObj.authorize({
		roster: [action],
	} as Parameters<typeof roleObj.authorize>[0]).success;
}

const ALL_ROLES = Object.keys(roles) as TenantRole[];
const MANAGERS_OF_PAY_POLICY = new Set([
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"payroll_admin",
]);

process.stdout.write(
	"\n§1 canManageScheduleRules ⟺ admin/HR/payroll (all roles)\n"
);
for (const r of ALL_ROLES) {
	const expected = MANAGERS_OF_PAY_POLICY.has(r);
	ok(
		`${r}: canManageScheduleRules === ${expected}`,
		canManageScheduleRules(r) === expected,
		`helper=${canManageScheduleRules(r)}`
	);
}

process.stdout.write(
	"\n§2 two-layer authz — AC grant is broader than the handler\n"
);
ok(
	"manager HOLDS the roster:manage AC grant (first layer passes)",
	grants("manager", "manage") === true
);
ok(
	"…but canManageScheduleRules(manager) === false (handler narrows pay policy)",
	canManageScheduleRules("manager") === false
);
ok(
	"manager can still manage roster ASSIGNMENTS (roster:manage), not pay policy",
	grants("manager", "manage") === true &&
		canManageScheduleRules("manager") === false
);
ok(
	"employee cannot manage pay policy",
	canManageScheduleRules("employee") === false
);
ok(
	"auditor cannot manage pay policy",
	canManageScheduleRules("auditor") === false
);

process.stdout.write("\n§3 read audience — scheduleRules read ⟺ roster:read\n");
for (const r of ALL_ROLES) {
	ok(
		`${r}: canViewRoster ⟺ roster:read`,
		canViewRoster(r) === grants(r, "read"),
		`helper=${canViewRoster(r)} grant=${grants(r, "read")}`
	);
}
ok("manager can read schedule rules", canViewRoster("manager") === true);
ok("employee can read schedule rules", canViewRoster("employee") === true);
ok("auditor can read schedule rules", canViewRoster("auditor") === true);

process.stdout.write(`\n${pass}/${pass + fail} checks passed\n`);
if (fail > 0) {
	process.exit(1);
}
