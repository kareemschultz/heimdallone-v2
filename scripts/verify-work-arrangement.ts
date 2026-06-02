/**
 * Work-arrangement verification (Phase 11G CP1).
 *
 * Proves: arrangementPolicy() classifies every mode correctly (only `onsite`
 * enforces the fence + raises exceptions), and resolveEmployeeArrangement reads
 * the seeded per-employee column. Run after seed-biometric.ts.
 *
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/verify-work-arrangement.ts
 */
import { and, eq } from "drizzle-orm";
import {
	arrangementPolicy,
	resolveEmployeeArrangement,
	type WorkArrangement,
} from "../packages/api/src/utils/geofence";
import { createDb } from "../packages/db/src/index";
import { employeeProfile, organization } from "../packages/db/src/schema";

const db = createDb();
let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
	process.stdout.write(
		`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}\n`
	);
	if (!ok) {
		failures += 1;
	}
}

async function empId(orgId: string, email: string): Promise<string | null> {
	const [row] = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.organizationId, orgId),
				eq(employeeProfile.email, email)
			)
		)
		.limit(1);
	return row?.id ?? null;
}

async function main() {
	// 1. Pure policy classification.
	const onsite = arrangementPolicy("onsite");
	check(
		"onsite enforces fence + raises exceptions + GPS required",
		onsite.geofenceEnforced &&
			onsite.raisesGeofenceException &&
			onsite.gpsRequired
	);
	for (const a of ["remote", "field", "exempt"] as WorkArrangement[]) {
		const p = arrangementPolicy(a);
		check(
			`${a}: no fence, no exception, GPS optional`,
			!(p.geofenceEnforced || p.raisesGeofenceException || p.gpsRequired)
		);
	}
	const hybrid = arrangementPolicy("hybrid");
	check(
		"hybrid: fence-aware but never auto-exception",
		hybrid.geofenceEnforced && !hybrid.raisesGeofenceException
	);

	// 2. DB resolution of seeded arrangements.
	const org = (
		await db
			.select()
			.from(organization)
			.where(eq(organization.slug, "atlas-shipping"))
			.limit(1)
	).at(0);
	if (!org) {
		check("Atlas org present", false, "run seed-dev.ts");
		process.exit(1);
	}
	const orgId = org.id;

	const kareena = await empId(orgId, "kareena.ramnath@atlas-shipping.com");
	const devon = await empId(orgId, "devon.ali@atlas-shipping.com");
	const maya = await empId(orgId, "maya.persaud@atlas-shipping.com");

	if (kareena) {
		check(
			"kareena resolves to remote",
			(await resolveEmployeeArrangement(kareena)) === "remote"
		);
	}
	if (devon) {
		check(
			"devon resolves to field",
			(await resolveEmployeeArrangement(devon)) === "field"
		);
	}
	if (maya) {
		check(
			"maya defaults to onsite",
			(await resolveEmployeeArrangement(maya)) === "onsite"
		);
	}

	if (failures > 0) {
		process.stderr.write(`\n${failures} check(s) FAILED.\n`);
		process.exit(1);
	}
	process.stdout.write("\nAll work-arrangement checks passed.\n");
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`${err}\n`);
	process.exit(1);
});
