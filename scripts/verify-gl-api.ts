/**
 * General Ledger API verification — Phase 21D-E (DB-free).
 *
 *   1. RBAC HELPERS ⟺ actual AC GRANTS for all 12 roles (journal/account):
 *      canViewGL ⟺ journal:read+account:read, canManageGL ⟺ journal:post+
 *      account:create, canReverseGL ⟺ journal:reverse.
 *   2. The pure double-entry invariants (validateJournalLines, parseAmountToCents,
 *      assertEntryMutable) — balance, one-sided lines, post-immutability.
 *
 * No database, no server. Run: bun scripts/verify-gl-api.ts
 */
import {
	assertEntryMutable,
	centsToAmount,
	parseAmountToCents,
	validateJournalLines,
} from "../packages/api/src/utils/gl-logic";
import {
	canManageGL,
	canReverseGL,
	canViewGL,
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
function throws(fn: () => unknown): boolean {
	try {
		fn();
		return false;
	} catch {
		return true;
	}
}
function grants(
	roleName: TenantRole,
	resource: string,
	action: string
): boolean {
	const roleObj = roles[roleName];
	return roleObj.authorize({
		[resource]: [action],
	} as Parameters<typeof roleObj.authorize>[0]).success;
}

const ALL_ROLES = Object.keys(roles) as TenantRole[];

process.stdout.write(
	"\n§1 RBAC helpers ⟺ actual AC grants (journal/account)\n"
);
for (const r of ALL_ROLES) {
	const view = grants(r, "journal", "read") && grants(r, "account", "read");
	ok(
		`${r}: canViewGL ⟺ journal+account read`,
		canViewGL(r) === view,
		`${canViewGL(r)}/${view}`
	);
	const manage = grants(r, "journal", "post") && grants(r, "account", "create");
	ok(
		`${r}: canManageGL ⟺ journal:post+account:create`,
		canManageGL(r) === manage,
		`${canManageGL(r)}/${manage}`
	);
	ok(
		`${r}: canReverseGL ⟺ journal:reverse`,
		canReverseGL(r) === grants(r, "journal", "reverse"),
		`${canReverseGL(r)}/${grants(r, "journal", "reverse")}`
	);
}

process.stdout.write("\n§2 expected role matrix\n");
const MANAGERS: TenantRole[] = [
	"tenant_owner",
	"tenant_admin",
	"payroll_admin",
];
const VIEW_ONLY: TenantRole[] = ["hr_admin", "auditor"];
const NONE: TenantRole[] = [
	"manager",
	"employee",
	"recruiter",
	"helpdesk_agent",
	"project_manager",
	"sales_admin",
	"sales_rep",
];
for (const r of MANAGERS) {
	ok(
		`${r} manages + reverses + views`,
		canManageGL(r) && canReverseGL(r) && canViewGL(r)
	);
}
for (const r of VIEW_ONLY) {
	ok(
		`${r} views but cannot manage/reverse`,
		canViewGL(r) && !canManageGL(r) && !canReverseGL(r)
	);
}
for (const r of NONE) {
	ok(
		`${r} has NO GL access`,
		!(canViewGL(r) || canManageGL(r) || canReverseGL(r))
	);
}

process.stdout.write("\n§3 parseAmountToCents\n");
ok("string 123.45 → 12345", parseAmountToCents("123.45") === 12_345);
ok("number 100 → 10000", parseAmountToCents(100) === 10_000);
ok("rounds 0.005 → 1", parseAmountToCents(0.005) === 1);
ok(
	"negative throws",
	throws(() => parseAmountToCents(-1))
);
ok(
	"NaN throws",
	throws(() => parseAmountToCents("abc"))
);
ok("centsToAmount(12345) → '123.45'", centsToAmount(12_345) === "123.45");

process.stdout.write("\n§4 validateJournalLines (double-entry)\n");
const line = (debit: number, credit: number) => ({
	accountId: "acct",
	debit,
	credit,
});
ok(
	"balanced 2-line passes",
	(() => {
		const t = validateJournalLines([line(100, 0), line(0, 100)]);
		return t.debitCents === 10_000 && t.creditCents === 10_000;
	})()
);
ok(
	"balanced multi-line passes",
	(() => {
		const t = validateJournalLines([line(100, 0), line(50, 0), line(0, 150)]);
		return t.debitCents === 15_000 && t.creditCents === 15_000;
	})()
);
ok(
	"single line throws (need ≥2)",
	throws(() => validateJournalLines([line(100, 0)]))
);
ok(
	"unbalanced throws",
	throws(() => validateJournalLines([line(100, 0), line(0, 90)]))
);
ok(
	"line with both debit+credit throws",
	throws(() => validateJournalLines([line(100, 100), line(0, 100)]))
);
ok(
	"line with neither throws",
	throws(() => validateJournalLines([line(0, 0), line(0, 100)]))
);
ok(
	"negative amount throws",
	throws(() => validateJournalLines([line(-100, 0), line(0, 100)]))
);

process.stdout.write("\n§5 assertEntryMutable (post-immutability)\n");
ok("draft is mutable", !throws(() => assertEntryMutable("draft")));
ok(
	"posted throws",
	throws(() => assertEntryMutable("posted"))
);
ok(
	"reversed throws",
	throws(() => assertEntryMutable("reversed"))
);

process.stdout.write(`\nGL API checks: ${pass} passed, ${fail} failed\n`);
if (fail > 0) {
	process.exit(1);
}
