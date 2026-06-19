/**
 * Surveys API verification — Phase Surveys (DB-free).
 *
 * Proves what check-types and audit:permissions cannot:
 *   1. RBAC HELPERS ⟺ actual AC GRANTS for ALL roles — canViewSurveys /
 *      canManageSurveys / canRespondToSurvey must agree with what
 *      roles[role].authorize({ survey: [action] }) actually permits.
 *   2. The expected matrix: every role can read/respond (the survey feed is
 *      universal); only owner/admin/hr_admin can manage/create/publish/archive.
 *
 * Anonymity (respondentUserId NULL + aggregate-only results) is enforced in the
 * router handler + the DB partial-unique and is covered by the schema/handler;
 * this script locks the GRANT MATRIX, which is the part a mis-grant could widen.
 *
 * No database, no server. Run: bun scripts/verify-surveys-api.ts
 */

import {
	canManageSurveys,
	canRespondToSurvey,
	canViewSurveys,
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
		survey: [action],
	} as Parameters<typeof roleObj.authorize>[0]).success;
}

const ALL_ROLES = Object.keys(roles) as TenantRole[];
const MANAGERS: TenantRole[] = ["tenant_owner", "tenant_admin", "hr_admin"];

process.stdout.write("\n§1 RBAC helpers ⟺ actual AC grants (all roles)\n");
for (const r of ALL_ROLES) {
	ok(
		`${r}: canViewSurveys ⟺ survey:read`,
		canViewSurveys(r) === grants(r, "read"),
		`helper=${canViewSurveys(r)} grant=${grants(r, "read")}`
	);
	ok(
		`${r}: canRespondToSurvey ⟺ survey:read`,
		canRespondToSurvey(r) === grants(r, "read")
	);
	ok(
		`${r}: canManageSurveys ⟺ survey:manage`,
		canManageSurveys(r) === grants(r, "manage"),
		`helper=${canManageSurveys(r)} grant=${grants(r, "manage")}`
	);
}

process.stdout.write("\n§2 expected matrix\n");
for (const r of ALL_ROLES) {
	ok(`${r} can view + respond`, canViewSurveys(r) && canRespondToSurvey(r));
}
for (const r of MANAGERS) {
	ok(`${r} can manage`, canManageSurveys(r));
}
for (const r of ALL_ROLES.filter((x) => !MANAGERS.includes(x))) {
	ok(`${r} CANNOT manage`, !canManageSurveys(r));
}

process.stdout.write(
	"\n§3 management actions concentrated on owner/admin/hr_admin\n"
);
for (const action of ["create", "update", "publish", "archive", "manage"]) {
	for (const r of ALL_ROLES) {
		const expected = MANAGERS.includes(r);
		ok(
			`survey:${action} granted=${expected} for ${r}`,
			grants(r, action) === expected
		);
	}
}

process.stdout.write(
	`\nSurveys API verification: ${pass} passed, ${fail} failed\n`
);
process.exit(fail === 0 ? 0 : 1);
