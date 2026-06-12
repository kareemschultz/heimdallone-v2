/**
 * Notifications API verification — Phase 21D-F (DB-free).
 *
 * The inbox is UNIVERSAL: every one of the 12 roles must hold notification:read
 * and notification:manage (the bell/inbox is shown to everyone), and the helpers
 * must agree. Self-scoping (a member only ever touches their own rows) is a
 * handler property enforced by selfScope(userId + org) — covered by check-types
 * + the handler shape; this script proves the GRANT MATRIX, which is the part a
 * mis-grant could silently widen.
 *
 * Run: bun scripts/verify-notifications-api.ts
 */
import {
	canManageNotifications,
	canViewNotifications,
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
		notification: [action],
	} as Parameters<typeof roleObj.authorize>[0]).success;
}

const ALL_ROLES = Object.keys(roles) as TenantRole[];

process.stdout.write("\n§1 every role holds the inbox grant + helpers agree\n");
for (const r of ALL_ROLES) {
	ok(`${r}: notification:read granted`, grants(r, "read"));
	ok(`${r}: notification:manage granted`, grants(r, "manage"));
	ok(
		`${r}: canViewNotifications ⟺ grant`,
		canViewNotifications(r) === grants(r, "read")
	);
	ok(
		`${r}: canManageNotifications ⟺ grant`,
		canManageNotifications(r) === grants(r, "manage")
	);
}

process.stdout.write(`\n§2 coverage: ${ALL_ROLES.length} roles (expect 12)\n`);
ok("all 12 roles present", ALL_ROLES.length === 12, `${ALL_ROLES.length}`);

process.stdout.write(
	`\nNotifications API checks: ${pass} passed, ${fail} failed\n`
);
if (fail > 0) {
	process.exit(1);
}
