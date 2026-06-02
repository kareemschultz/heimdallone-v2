/**
 * Biometric + Geofencing API/processor verification (Phase 11C).
 *
 * Verifies the parts that don't require an authenticated HTTP session:
 *  - adapter row parsing (the core of punches.importRows / ingest)
 *  - geofence math + evaluation (the core of checkIns.createSelf)
 *  - the privacy guard (rejects biometric-template payloads)
 *  - the punch processor end-to-end against seeded data (punch → event →
 *    attendance_record; unmapped → blocker exception; idempotent re-run)
 *
 * Full RBAC/HTTP checks (403 matrix, ingest API-key auth, check-in self-scope,
 * secret-stripping in responses) are exercised in the Phase 11D browser pass /
 * a live authenticated RPC run — documented as deferred at the end.
 *
 * Usage (run seed-biometric.ts first for a clean pending state):
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-biometric.ts && bun run scripts/verify-biometric-api.ts
 */
import { and, eq } from "drizzle-orm";
import {
	containsBiometricTemplate,
	getAdapter,
} from "../packages/api/src/utils/attendance-adapters";
import { processPendingPunches } from "../packages/api/src/utils/biometric-processor";
import {
	evaluateCheckIn,
	haversineMeters,
} from "../packages/api/src/utils/geofence";
import { createDb } from "../packages/db/src/index";
import {
	attendanceEvent,
	attendanceException,
	attendancePunch,
	attendanceRecord,
	employeeProfile,
	organization,
} from "../packages/db/src/schema";

const db = createDb();
let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
	const mark = ok ? "✓" : "✗";
	process.stdout.write(`  ${mark} ${label}${detail ? ` — ${detail}` : ""}\n`);
	if (!ok) {
		failures += 1;
	}
}

async function main() {
	// ── 1. Adapter parsing (generic CSV) ──
	const csv = [
		"device_user_id,timestamp,direction,verify_mode",
		"1001,2026-06-01 08:00:00,in,face",
		"1001,2026-06-01 17:00:00,out,face",
		"bad,not-a-date,in,face",
	].join("\n");
	const parsed = getAdapter("generic_csv").parseImportRows(csv);
	check(
		"generic_csv adapter parses valid rows",
		parsed.punches.length === 2,
		`${parsed.punches.length} punches`
	);
	check(
		"generic_csv adapter reports bad rows",
		parsed.errors.length === 1,
		`${parsed.errors.length} errors`
	);

	// ── 2. NGTeco adapter (Title Case headers) ──
	const ngCsv = [
		"User ID,Time,State,Verify Mode",
		"2001,2026-06-01 07:30:00,in,fingerprint",
	].join("\n");
	const ng = getAdapter("ngteco_app").parseImportRows(ngCsv);
	check("ngteco_app adapter maps Title Case headers", ng.punches.length === 1);
	check(
		"ngteco_cloud adapter is marked planned (live)",
		getAdapter("ngteco_cloud").getConnectionStatus().live === false
	);
	check(
		"zkteco_tcp adapter is marked planned",
		getAdapter("zkteco_tcp").status === "planned"
	);

	// ── 3. Geofence math + evaluation ──
	const near = haversineMeters(6.8013, -58.1551, 6.801_35, -58.155_15);
	check("haversine near points < 20m", near < 20, `${near}m`);
	const site = {
		id: "site1",
		name: "Office",
		latitude: "6.8013000",
		longitude: "-58.1551000",
		radiusMeters: 150,
		accuracyThresholdMeters: 100,
		allowOutsideWithReason: true,
	};
	check(
		"evaluateCheckIn inside",
		evaluateCheckIn({ site, lat: 6.8014, lon: -58.1552, accuracyMeters: 10 })
			.status === "inside"
	);
	check(
		"evaluateCheckIn outside",
		evaluateCheckIn({ site, lat: 6.85, lon: -58.2, accuracyMeters: 10 })
			.status === "outside"
	);
	check(
		"evaluateCheckIn low_accuracy",
		evaluateCheckIn({ site, lat: 6.8014, lon: -58.1552, accuracyMeters: 250 })
			.status === "low_accuracy"
	);
	check(
		"evaluateCheckIn unverified (no site)",
		evaluateCheckIn({ site: null, lat: 6.8, lon: -58.1, accuracyMeters: 10 })
			.status === "unverified"
	);

	// ── 4. Privacy guard ──
	check(
		"rejects fingerprint template payload",
		containsBiometricTemplate({
			deviceUserId: "1",
			fingerprintTemplate: "x",
		}) === true
	);
	check(
		"allows clean punch payload",
		containsBiometricTemplate({ deviceUserId: "1", verifyMode: "face" }) ===
			false
	);

	// ── 5. Processor end-to-end against seeded data ──
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

	const pendingBefore = (
		await db
			.select()
			.from(attendancePunch)
			.where(
				and(
					eq(attendancePunch.organizationId, orgId),
					eq(attendancePunch.processingStatus, "pending")
				)
			)
	).length;

	const summary = await processPendingPunches(orgId);
	process.stdout.write(
		`  processor summary: ${JSON.stringify(summary)}\n  (pending before run: ${pendingBefore})\n`
	);
	check(
		"processor processed seeded pending punches",
		summary.processed > 0 || pendingBefore === 0,
		`${summary.processed} processed`
	);
	check(
		"processor quarantined the unmapped punch",
		summary.unmapped >= 1 || pendingBefore === 0,
		`${summary.unmapped} unmapped`
	);

	// biometric attendance_event rows created
	const bioEvents = await db
		.select({ id: attendanceEvent.id })
		.from(attendanceEvent)
		.where(
			and(
				eq(attendanceEvent.organizationId, orgId),
				eq(attendanceEvent.source, "biometric")
			)
		);
	check(
		"biometric attendance_event rows exist",
		bioEvents.length > 0,
		`${bioEvents.length}`
	);

	// Maya's daily record has worked minutes (in 08:02 → out 16:34 ≈ 512m)
	const maya = (
		await db
			.select({ id: employeeProfile.id })
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.organizationId, orgId),
					eq(employeeProfile.email, "maya.persaud@atlas-shipping.com")
				)
			)
			.limit(1)
	).at(0);
	if (maya) {
		const [rec] = await db
			.select({ worked: attendanceRecord.workedMinutes })
			.from(attendanceRecord)
			.where(
				and(
					eq(attendanceRecord.organizationId, orgId),
					eq(attendanceRecord.employeeId, maya.id)
				)
			)
			.limit(1);
		check(
			"Maya's attendance_record has worked minutes",
			Boolean(rec && rec.worked > 0),
			`${rec?.worked ?? 0}m`
		);
	}

	// unmapped punch → status unmapped + open blocker exception
	const [unmappedPunch] = await db
		.select({ status: attendancePunch.processingStatus })
		.from(attendancePunch)
		.where(
			and(
				eq(attendancePunch.organizationId, orgId),
				eq(attendancePunch.deviceUserId, "9001")
			)
		)
		.limit(1);
	check(
		"unmapped punch marked 'unmapped'",
		unmappedPunch?.status === "unmapped",
		unmappedPunch?.status
	);
	const unmappedExc = await db
		.select({ id: attendanceException.id })
		.from(attendanceException)
		.where(
			and(
				eq(attendanceException.organizationId, orgId),
				eq(attendanceException.type, "unmapped_punch"),
				eq(attendanceException.status, "open")
			)
		);
	check("open unmapped_punch blocker exception exists", unmappedExc.length > 0);

	// ── 6. Idempotency: re-run creates no new events ──
	const eventsBefore = (
		await db
			.select({ id: attendanceEvent.id })
			.from(attendanceEvent)
			.where(eq(attendanceEvent.organizationId, orgId))
	).length;
	const rerun = await processPendingPunches(orgId);
	const eventsAfter = (
		await db
			.select({ id: attendanceEvent.id })
			.from(attendanceEvent)
			.where(eq(attendanceEvent.organizationId, orgId))
	).length;
	check(
		"processor is idempotent (no new events on re-run)",
		eventsAfter === eventsBefore,
		`${eventsBefore} → ${eventsAfter}`
	);
	check(
		"re-run processed 0 punches",
		rerun.processed === 0,
		`${rerun.processed}`
	);

	process.stdout.write(
		"\nDeferred to the 11D browser pass / live RPC run: RBAC 403 matrix, ingest API-key auth, geofence check-in self-scope, and secret-stripping in responses.\n"
	);

	if (failures > 0) {
		process.stderr.write(`\n${failures} check(s) FAILED.\n`);
		process.exit(1);
	}
	process.stdout.write("\nAll biometric API/processor checks passed.\n");
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`${err}\n`);
	process.exit(1);
});
