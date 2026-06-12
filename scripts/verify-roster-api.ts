/**
 * Roster API verification — Phase 21D-D (DB-free).
 *
 * Proves the two things that can't be caught by check-types or audit:permissions:
 *   1. RBAC HELPERS ⟺ actual AC GRANTS — for all 12 roles, the byte-aligned
 *      canViewRoster/canManageRoster/canApproveRoster helpers must agree with what
 *      `roles[role].authorize({ roster: [action] })` actually permits. This is the
 *      "byte-aligned, none-over-grant" guarantee the project relies on.
 *   2. The pure scheduling + override-validation logic (enumerateRosterDates,
 *      validateOverride) behaves correctly — the bulk recurring-pattern primitive
 *      and the per-day override coherence rules.
 *
 * No database, no server: safe to run anywhere (CI, autonomous). Run:
 *   bun scripts/verify-roster-api.ts
 */

import {
	canApproveRoster,
	canManageRoster,
	canViewRoster,
	seesAllRoster,
} from "../packages/api/src/utils/role-helpers";
import {
	enumerateRosterDates,
	validateOverride,
} from "../packages/api/src/utils/roster-logic";
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

// Does the actual AC role grant permit roster:<action>?
function grants(roleName: TenantRole, action: string): boolean {
	const roleObj = roles[roleName];
	const result = roleObj.authorize({
		roster: [action],
	} as Parameters<typeof roleObj.authorize>[0]);
	return result.success;
}

const ALL_ROLES = Object.keys(roles) as TenantRole[];

process.stdout.write("\n§1 RBAC helpers ⟺ actual AC grants (all roles)\n");
for (const r of ALL_ROLES) {
	// canManageRoster ⟺ roster:manage grant
	ok(
		`${r}: canManageRoster ⟺ roster:manage`,
		canManageRoster(r) === grants(r, "manage"),
		`helper=${canManageRoster(r)} grant=${grants(r, "manage")}`
	);
	// canApproveRoster ⟺ roster:approve grant
	ok(
		`${r}: canApproveRoster ⟺ roster:approve`,
		canApproveRoster(r) === grants(r, "approve"),
		`helper=${canApproveRoster(r)} grant=${grants(r, "approve")}`
	);
	// canViewRoster ⟺ roster:read grant
	ok(
		`${r}: canViewRoster ⟺ roster:read`,
		canViewRoster(r) === grants(r, "read"),
		`helper=${canViewRoster(r)} grant=${grants(r, "read")}`
	);
}

process.stdout.write("\n§2 expected role matrix\n");
// Manage/approve: owner/admin/hr_admin + manager. Read: those + payroll/employee/
// auditor. NONE: recruiter/helpdesk_agent/project_manager/sales_admin/sales_rep.
const MANAGERS: TenantRole[] = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"manager",
];
const READERS: TenantRole[] = [
	...MANAGERS,
	"payroll_admin",
	"employee",
	"auditor",
];
const NONE: TenantRole[] = [
	"recruiter",
	"helpdesk_agent",
	"project_manager",
	"sales_admin",
	"sales_rep",
];
for (const r of MANAGERS) {
	ok(`${r} can manage+approve`, canManageRoster(r) && canApproveRoster(r));
}
for (const r of READERS) {
	ok(`${r} can view`, canViewRoster(r));
}
for (const r of NONE) {
	ok(
		`${r} has NO roster access`,
		!(
			canViewRoster(r) ||
			canManageRoster(r) ||
			canApproveRoster(r) ||
			grants(r, "read")
		)
	);
}

process.stdout.write("\n§3 seesAllRoster scope ceiling\n");
ok("payroll_admin sees all", seesAllRoster("payroll_admin"));
ok("auditor sees all", seesAllRoster("auditor"));
ok("hr_admin sees all", seesAllRoster("hr_admin"));
ok("manager is SCOPED (not all)", !seesAllRoster("manager"));
ok("employee is SCOPED (not all)", !seesAllRoster("employee"));

process.stdout.write("\n§4 enumerateRosterDates (recurring pattern)\n");
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const everyDay = enumerateRosterDates(d("2026-06-01"), d("2026-06-07"), null);
ok("inclusive range length", everyDay.length === 7, `${everyDay.length}`);
// 2026-06-01 is a Monday. Weekdays Mon–Fri = [1..5].
const weekdays = enumerateRosterDates(
	d("2026-06-01"),
	d("2026-06-07"),
	new Set([1, 2, 3, 4, 5])
);
ok(
	"Mon–Fri filter excludes weekend",
	weekdays.length === 5,
	`${weekdays.length}`
);
ok(
	"weekend excluded (Sat 06-06 / Sun 06-07 absent)",
	!(
		weekdays.some((x) => x.toISOString().slice(0, 10) === "2026-06-06") ||
		weekdays.some((x) => x.toISOString().slice(0, 10) === "2026-06-07")
	)
);
const sundays = enumerateRosterDates(
	d("2026-06-01"),
	d("2026-06-30"),
	new Set([0])
);
ok("June 2026 has 4 Sundays", sundays.length === 4, `${sundays.length}`);
ok(
	"empty range (from>to) yields nothing",
	enumerateRosterDates(d("2026-06-07"), d("2026-06-01"), null).length === 0
);

process.stdout.write("\n§5 validateOverride coherence\n");
function throws(fn: () => unknown): boolean {
	try {
		fn();
		return false;
	} catch {
		return true;
	}
}
ok(
	"none → clears custom minutes",
	(() => {
		const v = validateOverride({
			overrideType: "none",
			customStartMinutes: 540,
			customEndMinutes: 1020,
		});
		return v.customStartMinutes === null && v.customEndMinutes === null;
	})()
);
ok(
	"day_off → clears custom minutes",
	(() => {
		const v = validateOverride({ overrideType: "day_off" });
		return v.customStartMinutes === null && v.customEndMinutes === null;
	})()
);
ok(
	"custom_hours valid → keeps minutes",
	(() => {
		const v = validateOverride({
			overrideType: "custom_hours",
			customStartMinutes: 540,
			customEndMinutes: 1020,
		});
		return v.customStartMinutes === 540 && v.customEndMinutes === 1020;
	})()
);
ok(
	"custom_hours missing minutes → throws",
	throws(() => validateOverride({ overrideType: "custom_hours" }))
);
ok(
	"custom_hours start≥end → throws",
	throws(() =>
		validateOverride({
			overrideType: "custom_hours",
			customStartMinutes: 1020,
			customEndMinutes: 540,
		})
	)
);
ok(
	"custom_hours end>1440 → throws",
	throws(() =>
		validateOverride({
			overrideType: "custom_hours",
			customStartMinutes: 60,
			customEndMinutes: 2000,
		})
	)
);

process.stdout.write(`\nRoster API checks: ${pass} passed, ${fail} failed\n`);
if (fail > 0) {
	process.exit(1);
}
