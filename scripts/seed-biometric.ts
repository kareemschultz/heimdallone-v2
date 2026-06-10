// biome-ignore-all lint/style/noNonNullAssertion: seed script — employee lookups are asserted after an explicit presence check
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: a one-shot seed script is naturally one long imperative function

/**
 * Biometric + Geofencing seed — Atlas Shipping demo data (Phase 11B).
 * Requires seed-dev.ts + seed-hr-core.ts to have run first.
 *
 * Creates (all scoped to Atlas Shipping; fully re-runnable — deletes its own
 * org-scoped rows first, touches ONLY the 8 biometric tables, never attendance):
 *   2 geofence locations  — Main Office (Georgetown), Warehouse / Port
 *   2 attendance devices   — Main Office ZKTeco terminal (api_ingest),
 *                            Warehouse gate terminal (csv_import)
 *   geofence assignments   — org default + a department + per-employee
 *   employee device maps   — several employees on both devices (one device
 *                            user-id is intentionally left UNMAPPED)
 *   2 sync runs            — one success (api_ingest), one partial (csv_import,
 *                            with an unmapped employee)
 *   raw punches            — normal in/out, a duplicate, a missing-checkout,
 *                            an unmapped device user, a malformed error, plus
 *                            two mobile GPS punches
 *   geofence check-ins     — inside radius, outside-with-reason, low-accuracy
 *   attendance exceptions  — blocker + warning + info, open + resolved + dismissed
 *
 * Privacy: NO biometric templates are stored. verifyMode records only the
 * METHOD. No plaintext device secrets are seeded (credentialRef stays null;
 * apiKeyHash holds a hash, not a key).
 *
 * Usage:
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-biometric.ts
 */

import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, sql } from "drizzle-orm";

import { createDb } from "../packages/db/src/index";
import {
	attendanceDevice,
	attendanceDeviceEmployeeMap,
	attendanceDeviceSyncRun,
	attendanceEvent,
	attendanceException,
	attendancePunch,
	department,
	employeeProfile,
	employeeWorkInfo,
	geofenceAssignment,
	geofenceCheckIn,
	geofenceLocation,
	organization,
	user,
} from "../packages/db/src/schema";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();

// Georgetown, Guyana — Main Office; Port area ~2km north for the Warehouse.
const MAIN_OFFICE = { lat: "6.8013000", lon: "-58.1551000" };
const WAREHOUSE = { lat: "6.8200000", lon: "-58.1700000" };
const OPS_DEPT_RE = /operation|warehouse|port|logistics/i;

function ts(dateStr: string, time: string): Date {
	// Guyana is UTC-04:00 (no DST)
	return new Date(`${dateStr}T${time}:00-04:00`);
}

/** NULL-safe idempotency key: device punches and device-less (mobile) punches
 * both collapse to a single unique string per (org, key). */
function punchKey(parts: {
	deviceId: string | null;
	deviceUserId: string | null;
	employeeId: string | null;
	punchTime: Date;
	source: string;
}): string {
	const epoch = Math.floor(parts.punchTime.getTime() / 1000);
	if (parts.deviceId) {
		return `dev|${parts.deviceId}|${parts.deviceUserId ?? "nouser"}|${epoch}`;
	}
	return `${parts.source}|${parts.employeeId ?? "noemp"}|${epoch}`;
}

async function loadOrgData() {
	const org = (
		await db
			.select()
			.from(organization)
			.where(eq(organization.slug, "atlas-shipping"))
			.limit(1)
	).at(0);
	if (!org) {
		console.error("Atlas Shipping org not found. Run seed-dev.ts first.");
		process.exit(1);
	}
	const orgId = org.id;

	const employees = await db
		.select({
			id: employeeProfile.id,
			email: employeeProfile.email,
		})
		.from(employeeProfile)
		.where(eq(employeeProfile.organizationId, orgId));
	if (employees.length === 0) {
		console.error("No employees found. Run seed-hr-core.ts first.");
		process.exit(1);
	}
	const empByEmail = new Map(employees.map((e) => [e.email, e.id]));

	const depts = await db
		.select()
		.from(department)
		.where(eq(department.organizationId, orgId));
	const opsDept = depts.find((d) => OPS_DEPT_RE.test(d.name)) ?? depts.at(0);

	const adminUserId = (await db.select().from(user).limit(1)).at(0)?.id ?? null;

	return { orgId, empByEmail, opsDeptId: opsDept?.id ?? null, adminUserId };
}

async function clearExisting(orgId: string) {
	// Child → parent order so FKs never block the delete.
	await db
		.delete(attendanceException)
		.where(eq(attendanceException.organizationId, orgId));
	await db
		.delete(geofenceCheckIn)
		.where(eq(geofenceCheckIn.organizationId, orgId));
	await db
		.delete(attendancePunch)
		.where(eq(attendancePunch.organizationId, orgId));
	// Remove attendance_events the processor created from biometric/mobile/import
	// punches so re-seeding + re-processing does not accumulate duplicate events.
	// (manual/admin events are left untouched; affected records recalc on reprocess.)
	await db
		.delete(attendanceEvent)
		.where(
			and(
				eq(attendanceEvent.organizationId, orgId),
				inArray(attendanceEvent.source, ["biometric", "mobile", "import"])
			)
		);
	await db
		.delete(attendanceDeviceSyncRun)
		.where(eq(attendanceDeviceSyncRun.organizationId, orgId));
	await db
		.delete(attendanceDeviceEmployeeMap)
		.where(eq(attendanceDeviceEmployeeMap.organizationId, orgId));
	await db
		.delete(geofenceAssignment)
		.where(eq(geofenceAssignment.organizationId, orgId));
	await db
		.delete(attendanceDevice)
		.where(eq(attendanceDevice.organizationId, orgId));
	await db
		.delete(geofenceLocation)
		.where(eq(geofenceLocation.organizationId, orgId));
}

async function seed() {
	const { orgId, empByEmail, opsDeptId, adminUserId } = await loadOrgData();
	console.log(`Org: Atlas Shipping (${orgId})`);

	await clearExisting(orgId);

	const emp = (email: string): string => {
		const id = empByEmail.get(email);
		if (!id) {
			console.error(`Seeded employee not found: ${email}`);
			process.exit(1);
		}
		return id;
	};
	const maya = emp("maya.persaud@atlas-shipping.com");
	const rohan = emp("rohan.gopaul@atlas-shipping.com");
	const shanice = emp("shanice.powell@atlas-shipping.com");
	const devon = emp("devon.ali@atlas-shipping.com");
	const kareena = emp("kareena.ramnath@atlas-shipping.com");

	// Work arrangements (Phase 11G): demo remote + field workers so they aren't
	// flagged outside-geofence. maya/rohan/shanice stay onsite (default).
	await db
		.update(employeeWorkInfo)
		.set({ workArrangement: "remote" })
		.where(eq(employeeWorkInfo.employeeId, kareena));
	await db
		.update(employeeWorkInfo)
		.set({ workArrangement: "field" })
		.where(eq(employeeWorkInfo.employeeId, devon));

	// ── Geofence locations ──────────────────────────────────────────────
	const officeSiteId = createId();
	const warehouseSiteId = createId();
	await db.insert(geofenceLocation).values([
		{
			id: officeSiteId,
			organizationId: orgId,
			name: "Main Office",
			address: "Lot 12 Water Street, Georgetown",
			latitude: MAIN_OFFICE.lat,
			longitude: MAIN_OFFICE.lon,
			radiusMeters: 150,
			accuracyThresholdMeters: 100,
		},
		{
			id: warehouseSiteId,
			organizationId: orgId,
			name: "Warehouse / Port",
			address: "GNIC Wharf, Lombard Street, Georgetown",
			latitude: WAREHOUSE.lat,
			longitude: WAREHOUSE.lon,
			radiusMeters: 250,
			accuracyThresholdMeters: 120,
		},
	]);

	// ── Devices (4 vendor families — the adapter/provider model) ─────────
	// No plaintext secrets are seeded: credentialRef stays null; apiKeyHash holds
	// a hash (not a usable key). Live ZKTeco-TCP / ADMS / NGTeco-cloud are marked
	// as planned modes — we do not fake live sync.
	const officeDeviceId = createId(); // ZKTeco TCP/IP terminal
	const admsDeviceId = createId(); // ZKTeco ADMS/iClock (planned)
	const ngTcDeviceId = createId(); // NGTeco TC-series cloud/app clock
	const ngK4DeviceId = createId(); // NGTeco K4 WiFi/TCP/USB clock
	await db.insert(attendanceDevice).values([
		{
			id: officeDeviceId,
			organizationId: orgId,
			name: "Main Office ZKTeco Terminal",
			vendor: "zkteco",
			deviceType: "zkteco",
			model: "SpeedFace-V5L",
			modelFamily: "SpeedFace",
			serialNumber: "ZK-OFFICE-0001",
			mode: "zkteco_tcp_planned", // live TCP pull planned; agent→api_ingest is the working path
			host: "192.168.10.20",
			port: 4370,
			workSiteId: officeSiteId,
			direction: "alternate",
			// HASH of the ingest key (agent fallback path), never the key itself.
			apiKeyHash:
				"7b1c0e4f9a2d8c3b6e5f0a1d4c7b9e2f3a6d8c1b0e4f9a2d8c3b6e5f0a1d4c7b",
			supportedPunchMethods: ["face", "fingerprint", "rfid", "pin"],
			networkCapabilities: ["tcp_ip", "wifi_2_4ghz"],
			capacityUsers: 3000,
			capacityLogs: 100_000,
			supportsOfflineLogs: true,
			supportsShiftRules: true,
			isScheduled: true,
			scheduleIntervalMinutes: 15,
			lastSyncStatus: "success",
			clockOffsetSeconds: 12,
			status: "active",
		},
		{
			id: admsDeviceId,
			organizationId: orgId,
			name: "Warehouse Gate ZKTeco (ADMS push)",
			vendor: "zkteco",
			deviceType: "zkteco",
			model: "K40 Pro",
			modelFamily: "K-series",
			serialNumber: "ZK-WHSE-0007",
			mode: "zkteco_adms_push_planned", // push receiver planned
			workSiteId: warehouseSiteId,
			direction: "alternate",
			supportedPunchMethods: ["fingerprint", "rfid", "pin"],
			networkCapabilities: ["tcp_ip"],
			capacityUsers: 1000,
			capacityLogs: 50_000,
			supportsOfflineLogs: true,
			clockOffsetSeconds: 340, // beyond the 300s drift threshold → drift exception
			status: "active",
		},
		{
			id: ngTcDeviceId,
			organizationId: orgId,
			name: "Reception NGTeco TC Cloud Clock",
			vendor: "ngteco",
			deviceType: "generic",
			model: "TC2",
			modelFamily: "TC-series",
			serialNumber: "NG-TC-1042",
			// Current supported path = manual app export; live cloud API is planned.
			mode: "ngteco_app_export",
			workSiteId: officeSiteId,
			direction: "alternate",
			supportedPunchMethods: ["face", "fingerprint", "rfid", "pin"],
			networkCapabilities: ["wifi_2_4ghz", "wifi_5ghz", "cloud_app"],
			capacityUsers: 500,
			capacityLogs: 100_000,
			supportsOfflineLogs: true,
			supportsCloudSync: true,
			supportsMobileApp: true,
			requiresSubscriptionForAdvancedFeatures: true,
			status: "active",
		},
		{
			id: ngK4DeviceId,
			organizationId: orgId,
			name: "Warehouse NGTeco K4 Clock",
			vendor: "ngteco",
			deviceType: "generic",
			model: "K4",
			modelFamily: "K-series",
			serialNumber: "NG-K4-2207",
			mode: "usb_export_import", // WiFi/TCP/USB export → file import
			workSiteId: warehouseSiteId,
			direction: "alternate",
			supportedPunchMethods: ["face", "fingerprint", "rfid", "pin"],
			networkCapabilities: ["wifi_2_4ghz", "tcp_ip", "usb"],
			capacityUsers: 1000,
			capacityLogs: 100_000,
			supportsOfflineLogs: true,
			status: "active",
		},
	]);

	// ── Employee ↔ device-user mappings ─────────────────────────────────
	// deviceUserId "9001" on the NGTeco K4 device is intentionally NOT mapped.
	await db.insert(attendanceDeviceEmployeeMap).values([
		{
			id: createId(),
			organizationId: orgId,
			deviceId: officeDeviceId,
			deviceUserId: "1001",
			deviceUserSerial: 1,
			employeeId: maya,
		},
		{
			id: createId(),
			organizationId: orgId,
			deviceId: officeDeviceId,
			deviceUserId: "1002",
			deviceUserSerial: 2,
			employeeId: rohan,
		},
		{
			id: createId(),
			organizationId: orgId,
			deviceId: officeDeviceId,
			deviceUserId: "1003",
			deviceUserSerial: 3,
			employeeId: shanice,
		},
		{
			id: createId(),
			organizationId: orgId,
			deviceId: ngK4DeviceId,
			deviceUserId: "2001",
			deviceUserSerial: 1,
			employeeId: devon,
		},
		{
			id: createId(),
			organizationId: orgId,
			deviceId: ngK4DeviceId,
			deviceUserId: "2002",
			deviceUserSerial: 2,
			employeeId: kareena,
		},
	]);

	// ── Geofence assignments (org default + department + per-employee) ──
	await db.insert(geofenceAssignment).values([
		{
			id: createId(),
			organizationId: orgId,
			workSiteId: officeSiteId,
			scope: "organization",
			isDefault: true,
		},
		...(opsDeptId
			? [
					{
						id: createId(),
						organizationId: orgId,
						workSiteId: warehouseSiteId,
						scope: "department" as const,
						departmentId: opsDeptId,
					},
				]
			: []),
		{
			id: createId(),
			organizationId: orgId,
			workSiteId: warehouseSiteId,
			scope: "employee",
			employeeId: devon,
			isDefault: true,
		},
	]);

	// ── Sync runs ───────────────────────────────────────────────────────
	const successRunId = createId();
	const partialRunId = createId();
	await db.insert(attendanceDeviceSyncRun).values([
		{
			id: successRunId,
			organizationId: orgId,
			deviceId: officeDeviceId,
			mode: "api_ingest",
			startedAt: ts("2026-05-28", "06:00"),
			finishedAt: ts("2026-05-28", "06:00"),
			cursorFrom: ts("2026-05-27", "00:00"),
			cursorTo: ts("2026-05-28", "06:00"),
			punchesFetched: 6,
			punchesCreated: 4,
			punchesDuplicate: 1,
			punchesUnmapped: 0,
			punchesError: 1,
			status: "success",
			triggeredByUserId: adminUserId,
		},
		{
			id: partialRunId,
			organizationId: orgId,
			deviceId: ngK4DeviceId,
			mode: "csv_import",
			startedAt: ts("2026-05-28", "07:30"),
			finishedAt: ts("2026-05-28", "07:30"),
			punchesFetched: 3,
			punchesCreated: 1,
			punchesDuplicate: 0,
			punchesUnmapped: 1,
			punchesError: 0,
			status: "partial",
			errorSummary:
				"1 punch for an unmapped device user (9001) was quarantined.",
			triggeredByUserId: adminUserId,
		},
	]);

	// ── Raw punches (pre-processor states: pending/duplicate/unmapped/error) ─
	interface PunchSeed {
		deviceId: string | null;
		deviceUserId: string | null;
		direction: "in" | "out" | "unknown";
		employeeId: string | null;
		errorReason?: string;
		processingStatus:
			| "pending"
			| "processed"
			| "unmapped"
			| "duplicate"
			| "error";
		punchTime: Date;
		rawPunchTime: string;
		source: "manual" | "biometric" | "mobile" | "import" | "admin";
		syncRunId: string | null;
		verifyMode:
			| "fingerprint"
			| "face"
			| "card"
			| "password"
			| "mobile_gps"
			| "manual"
			| "unknown";
	}

	const mayaIn = ts("2026-05-28", "08:02");
	const punchSeeds: PunchSeed[] = [
		// Normal in/out — Maya, office device, awaiting the 11C processor
		{
			deviceId: officeDeviceId,
			deviceUserId: "1001",
			employeeId: maya,
			punchTime: mayaIn,
			rawPunchTime: "2026-05-28 08:02:11",
			direction: "in",
			verifyMode: "face",
			source: "biometric",
			processingStatus: "pending",
			syncRunId: successRunId,
		},
		{
			deviceId: officeDeviceId,
			deviceUserId: "1001",
			employeeId: maya,
			punchTime: ts("2026-05-28", "16:34"),
			rawPunchTime: "2026-05-28 16:34:50",
			direction: "out",
			verifyMode: "face",
			source: "biometric",
			processingStatus: "pending",
			syncRunId: successRunId,
		},
		// Duplicate — same Maya 'in' re-ingested (different second so the seed row is distinct, flagged duplicate)
		{
			deviceId: officeDeviceId,
			deviceUserId: "1001",
			employeeId: maya,
			punchTime: ts("2026-05-28", "08:03"),
			rawPunchTime: "2026-05-28 08:03:01",
			direction: "in",
			verifyMode: "face",
			source: "biometric",
			processingStatus: "duplicate",
			syncRunId: successRunId,
		},
		// Missing checkout — Rohan clocked in, never out
		{
			deviceId: officeDeviceId,
			deviceUserId: "1002",
			employeeId: rohan,
			punchTime: ts("2026-05-28", "08:15"),
			rawPunchTime: "2026-05-28 08:15:03",
			direction: "in",
			verifyMode: "fingerprint",
			source: "biometric",
			processingStatus: "pending",
			syncRunId: successRunId,
		},
		// Malformed/error — bad direction code from the device
		{
			deviceId: officeDeviceId,
			deviceUserId: "1003",
			employeeId: shanice,
			punchTime: ts("2026-05-28", "09:00"),
			rawPunchTime: "2026-05-28 09:00:00",
			direction: "unknown",
			verifyMode: "unknown",
			source: "biometric",
			processingStatus: "error",
			syncRunId: successRunId,
			errorReason: "Unrecognised punch/verify code from device.",
		},
		// Unmapped device user — no employee resolved (NGTeco K4 export)
		{
			deviceId: ngK4DeviceId,
			deviceUserId: "9001",
			employeeId: null,
			punchTime: ts("2026-05-28", "07:05"),
			rawPunchTime: "2026-05-28 07:05:00",
			direction: "in",
			verifyMode: "card",
			source: "import",
			processingStatus: "unmapped",
			syncRunId: partialRunId,
		},
		// Mobile GPS — Devon inside the warehouse radius
		{
			deviceId: null,
			deviceUserId: null,
			employeeId: devon,
			punchTime: ts("2026-05-28", "07:48"),
			rawPunchTime: "2026-05-28 07:48:20",
			direction: "in",
			verifyMode: "mobile_gps",
			source: "mobile",
			processingStatus: "pending",
			syncRunId: null,
		},
		// Mobile GPS — Kareena outside the radius (will get an exception)
		{
			deviceId: null,
			deviceUserId: null,
			employeeId: kareena,
			punchTime: ts("2026-05-28", "08:20"),
			rawPunchTime: "2026-05-28 08:20:00",
			direction: "in",
			verifyMode: "mobile_gps",
			source: "mobile",
			processingStatus: "pending",
			syncRunId: null,
		},
	];

	const punchIds: string[] = [];
	const insertedPunches = punchSeeds.map((p) => {
		const id = createId();
		punchIds.push(id);
		return {
			id,
			organizationId: orgId,
			deviceId: p.deviceId,
			syncRunId: p.syncRunId,
			deviceUserId: p.deviceUserId,
			employeeId: p.employeeId,
			punchTime: p.punchTime,
			rawPunchTime: p.rawPunchTime,
			direction: p.direction,
			verifyMode: p.verifyMode,
			source: p.source,
			processingStatus: p.processingStatus,
			idempotencyKey: punchKey(p),
			errorReason: p.errorReason ?? null,
			rawPayload: { deviceUserId: p.deviceUserId, raw: p.rawPunchTime },
		};
	});
	await db.insert(attendancePunch).values(insertedPunches);

	const devonMobilePunchId = punchIds[6]!;
	const kareenaMobilePunchId = punchIds[7]!;
	const rohanMissingOutPunchId = punchIds[3]!;
	const unmappedPunchId = punchIds[5]!;

	// ── Geofence check-ins ──────────────────────────────────────────────
	const insideCheckId = createId();
	const outsideCheckId = createId();
	const lowAccCheckId = createId();
	await db.insert(geofenceCheckIn).values([
		{
			id: insideCheckId,
			organizationId: orgId,
			employeeId: devon,
			attendancePunchId: devonMobilePunchId,
			latitude: "6.8201500",
			longitude: "-58.1698000",
			accuracyMeters: 18,
			matchedWorkSiteId: warehouseSiteId,
			distanceMeters: 24,
			status: "inside",
			capturedAt: ts("2026-05-28", "07:48"),
		},
		{
			id: outsideCheckId,
			organizationId: orgId,
			employeeId: kareena,
			attendancePunchId: kareenaMobilePunchId,
			latitude: "6.8500000",
			longitude: "-58.2000000",
			accuracyMeters: 22,
			matchedWorkSiteId: warehouseSiteId,
			distanceMeters: 5400,
			status: "outside",
			reason: "Collecting documents at the client's office before heading in.",
			capturedAt: ts("2026-05-28", "08:20"),
		},
		{
			id: lowAccCheckId,
			organizationId: orgId,
			employeeId: maya,
			attendancePunchId: null,
			latitude: "6.8010000",
			longitude: "-58.1555000",
			accuracyMeters: 260, // worse than the 100m threshold
			matchedWorkSiteId: officeSiteId,
			distanceMeters: 70,
			status: "low_accuracy",
			capturedAt: ts("2026-05-28", "08:05"),
		},
	]);

	// ── Attendance exceptions (open/resolved/dismissed; blocker/warning/info) ─
	await db.insert(attendanceException).values([
		{
			id: createId(),
			organizationId: orgId,
			employeeId: rohan,
			attendancePunchId: rohanMissingOutPunchId,
			deviceId: officeDeviceId,
			type: "missing_clock_out",
			severity: "blocker",
			status: "open",
			detail:
				"Rohan Gopaul clocked in at 08:15 on 2026-05-28 but never clocked out.",
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: null,
			attendancePunchId: unmappedPunchId,
			deviceId: ngK4DeviceId,
			type: "unmapped_punch",
			severity: "blocker",
			status: "open",
			detail:
				"NGTeco K4 device user-id 9001 has no employee mapping. Punch quarantined.",
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: kareena,
			attendancePunchId: kareenaMobilePunchId,
			geofenceCheckInId: outsideCheckId,
			type: "outside_geofence",
			severity: "warning",
			status: "resolved",
			detail: "Kareena Ramnath checked in 5.4km from Warehouse / Port.",
			resolutionAction: "approved_with_reason",
			resolutionNote: "Confirmed client errand; check-in accepted.",
			resolvedBy: adminUserId,
			resolvedAt: ts("2026-05-28", "09:10"),
		},
		{
			id: createId(),
			organizationId: orgId,
			employeeId: maya,
			geofenceCheckInId: lowAccCheckId,
			type: "low_gps_accuracy",
			severity: "warning",
			status: "open",
			detail: "GPS accuracy 260m exceeded the 100m threshold for Main Office.",
		},
		{
			id: createId(),
			organizationId: orgId,
			deviceId: admsDeviceId,
			type: "clock_drift",
			severity: "info",
			status: "dismissed",
			detail:
				"Warehouse Gate ZKTeco (ADMS push) clock drifted 340s from server time.",
			resolutionAction: "device_clock_resynced",
			resolutionNote:
				"Reset device clock during the weekly maintenance window.",
			resolvedBy: adminUserId,
			resolvedAt: ts("2026-05-29", "10:00"),
		},
	]);

	return { orgId, mayaIn, officeDeviceId };
}

async function verify(ctx: {
	orgId: string;
	mayaIn: Date;
	officeDeviceId: string;
}) {
	const { orgId } = ctx;

	const counts = {
		geofence_location: (
			await db
				.select()
				.from(geofenceLocation)
				.where(eq(geofenceLocation.organizationId, orgId))
		).length,
		attendance_device: (
			await db
				.select()
				.from(attendanceDevice)
				.where(eq(attendanceDevice.organizationId, orgId))
		).length,
		attendance_device_employee_map: (
			await db
				.select()
				.from(attendanceDeviceEmployeeMap)
				.where(eq(attendanceDeviceEmployeeMap.organizationId, orgId))
		).length,
		geofence_assignment: (
			await db
				.select()
				.from(geofenceAssignment)
				.where(eq(geofenceAssignment.organizationId, orgId))
		).length,
		attendance_device_sync_run: (
			await db
				.select()
				.from(attendanceDeviceSyncRun)
				.where(eq(attendanceDeviceSyncRun.organizationId, orgId))
		).length,
		attendance_punch: (
			await db
				.select()
				.from(attendancePunch)
				.where(eq(attendancePunch.organizationId, orgId))
		).length,
		geofence_check_in: (
			await db
				.select()
				.from(geofenceCheckIn)
				.where(eq(geofenceCheckIn.organizationId, orgId))
		).length,
		attendance_exception: (
			await db
				.select()
				.from(attendanceException)
				.where(eq(attendanceException.organizationId, orgId))
		).length,
	};
	console.log("Seed counts:");
	for (const [k, v] of Object.entries(counts)) {
		console.log(`  ${k}: ${v}`);
	}

	// Idempotency negative test — re-inserting a seen (org, idempotencyKey) MUST fail.
	const dupKey = punchKey({
		deviceId: ctx.officeDeviceId,
		deviceUserId: "1001",
		employeeId: null,
		punchTime: ctx.mayaIn,
		source: "biometric",
	});
	let idempotencyEnforced = false;
	try {
		await db.insert(attendancePunch).values({
			id: createId(),
			organizationId: orgId,
			deviceId: ctx.officeDeviceId,
			deviceUserId: "1001",
			punchTime: ctx.mayaIn,
			direction: "in",
			verifyMode: "face",
			source: "biometric",
			processingStatus: "pending",
			idempotencyKey: dupKey,
		});
	} catch {
		idempotencyEnforced = true;
	}
	console.log(
		`Idempotency unique constraint (att_punch_idem_uq): ${idempotencyEnforced ? "ENFORCED ✓ (duplicate rejected)" : "NOT ENFORCED ✗"}`
	);
	if (!idempotencyEnforced) {
		console.error("FAIL: duplicate idempotency key was accepted.");
		process.exit(1);
	}

	// Privacy assertion — no template/biometric-data columns exist on any table.
	const banned = [
		"template",
		"fingerprint_data",
		"face_template",
		"palm",
		"iris",
		"biometric_data",
	];
	const cols = await db.execute(sql`
		select column_name from information_schema.columns
		where table_name in (
			'attendance_device', 'attendance_device_employee_map',
			'attendance_device_sync_run', 'attendance_punch', 'geofence_location',
			'geofence_assignment', 'geofence_check_in', 'attendance_exception'
		)
	`);
	const colNames: string[] = (cols.rows ?? []).map(
		(r) => (r as { column_name: string }).column_name
	);
	const offenders = colNames.filter((c) => banned.some((b) => c.includes(b)));
	console.log(
		`Privacy check — biometric-template columns: ${offenders.length === 0 ? "NONE ✓" : `FOUND ${offenders.join(", ")} ✗`}`
	);
	if (offenders.length > 0) {
		process.exit(1);
	}
}

async function main() {
	const ctx = await seed();
	await verify(ctx);
	console.log("Biometric + Geofencing seed complete.");
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
