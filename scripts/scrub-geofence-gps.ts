/**
 * GPS retention scrub (Phase 11G CP4).
 *
 * After the per-org retention window (attendance_setting.gpsRetentionDays,
 * default 90) precise coordinates are removed from old location rows while the
 * audit/reporting value is preserved:
 *   - geofence_check_in: NULL latitude/longitude, stamp coordsPurgedAt. KEEP
 *     status (verdict), employeeId, organizationId, matchedWorkSiteId,
 *     distanceMeters, accuracyMeters, reason, capturedAt.
 *   - attendance_event: NULL locationLat/locationLon (exact coords too; the
 *     table has no coordsPurgedAt — null IS the scrubbed marker). KEEP source,
 *     deviceId, times, duration.
 *
 * Safe by default: DRY-RUN unless --apply is passed. Recent rows (inside the
 * retention window) are never touched.
 *
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/scrub-geofence-gps.ts                # dry-run (no writes)
 *   bun run scripts/scrub-geofence-gps.ts --apply        # perform the scrub
 *   bun run scripts/scrub-geofence-gps.ts --apply --org=<orgId>
 */
import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { createDb } from "../packages/db/src/index";
import {
	attendanceEvent,
	attendanceSetting,
} from "../packages/db/src/schema/attendance";
import { geofenceCheckIn } from "../packages/db/src/schema/biometric";

const DEFAULT_RETENTION_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const db = createDb();
const apply = process.argv.includes("--apply");
const orgArg = process.argv.find((a) => a.startsWith("--org="))?.split("=")[1];

function out(msg: string): void {
	process.stdout.write(`${msg}\n`);
}

async function scrubOrg(organizationId: string, retentionDays: number) {
	const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY);

	// ── geofence_check_in ──────────────────────────────────────
	const hasCoords = or(
		isNotNull(geofenceCheckIn.latitude),
		isNotNull(geofenceCheckIn.longitude)
	);
	const eligibleCheckIns = await db
		.select({ id: geofenceCheckIn.id })
		.from(geofenceCheckIn)
		.where(
			and(
				eq(geofenceCheckIn.organizationId, organizationId),
				lt(geofenceCheckIn.capturedAt, cutoff),
				isNull(geofenceCheckIn.coordsPurgedAt),
				hasCoords
			)
		);
	const [recentCheckIns] = await db
		.select({ n: sql<number>`count(*)` })
		.from(geofenceCheckIn)
		.where(
			and(
				eq(geofenceCheckIn.organizationId, organizationId),
				sql`${geofenceCheckIn.capturedAt} >= ${cutoff}`,
				hasCoords
			)
		);
	const [alreadyCheckIns] = await db
		.select({ n: sql<number>`count(*)` })
		.from(geofenceCheckIn)
		.where(
			and(
				eq(geofenceCheckIn.organizationId, organizationId),
				isNotNull(geofenceCheckIn.coordsPurgedAt)
			)
		);

	// ── attendance_event (mobile-sourced exact coords) ─────────
	const eventHasCoords = or(
		isNotNull(attendanceEvent.locationLat),
		isNotNull(attendanceEvent.locationLon)
	);
	const eligibleEvents = await db
		.select({ id: attendanceEvent.id })
		.from(attendanceEvent)
		.where(
			and(
				eq(attendanceEvent.organizationId, organizationId),
				lt(attendanceEvent.eventDate, cutoff),
				eventHasCoords
			)
		);

	out(
		`  org ${organizationId} (retention ${retentionDays}d, cutoff ${cutoff.toISOString().slice(0, 10)}):`
	);
	out(
		`    geofence_check_in: eligible=${eligibleCheckIns.length} skippedRecent=${recentCheckIns?.n ?? 0} alreadyScrubbed=${alreadyCheckIns?.n ?? 0}`
	);
	out(`    attendance_event:  eligible=${eligibleEvents.length}`);

	if (!apply) {
		return {
			checkIns: eligibleCheckIns.length,
			events: eligibleEvents.length,
			scrubbed: 0,
		};
	}

	let scrubbed = 0;
	if (eligibleCheckIns.length > 0) {
		await db
			.update(geofenceCheckIn)
			.set({ latitude: null, longitude: null, coordsPurgedAt: new Date() })
			.where(
				and(
					eq(geofenceCheckIn.organizationId, organizationId),
					lt(geofenceCheckIn.capturedAt, cutoff),
					isNull(geofenceCheckIn.coordsPurgedAt),
					hasCoords
				)
			);
		scrubbed += eligibleCheckIns.length;
	}
	if (eligibleEvents.length > 0) {
		await db
			.update(attendanceEvent)
			.set({ locationLat: null, locationLon: null })
			.where(
				and(
					eq(attendanceEvent.organizationId, organizationId),
					lt(attendanceEvent.eventDate, cutoff),
					eventHasCoords
				)
			);
		scrubbed += eligibleEvents.length;
	}
	out(`    → scrubbed ${scrubbed} row(s).`);
	return {
		checkIns: eligibleCheckIns.length,
		events: eligibleEvents.length,
		scrubbed,
	};
}

async function main() {
	out(
		apply
			? "GPS retention scrub — APPLY MODE (writing)."
			: "GPS retention scrub — DRY RUN (no writes). Pass --apply to scrub."
	);

	// Retention is per-org; orgs without an attendance_setting use the default.
	const settings = await db
		.select({
			organizationId: attendanceSetting.organizationId,
			days: attendanceSetting.gpsRetentionDays,
		})
		.from(attendanceSetting);
	const retentionByOrg = new Map(
		settings.map((s) => [s.organizationId, s.days ?? DEFAULT_RETENTION_DAYS])
	);

	// Orgs that actually have check-ins (so default-only orgs still get covered).
	const orgRows = await db
		.selectDistinct({ organizationId: geofenceCheckIn.organizationId })
		.from(geofenceCheckIn);
	let orgIds = orgRows.map((r) => r.organizationId);
	if (orgArg) {
		orgIds = orgIds.filter((id) => id === orgArg);
	}

	let totalCheckIns = 0;
	let totalEvents = 0;
	let totalScrubbed = 0;
	for (const organizationId of orgIds) {
		const r = await scrubOrg(
			organizationId,
			retentionByOrg.get(organizationId) ?? DEFAULT_RETENTION_DAYS
		);
		totalCheckIns += r.checkIns;
		totalEvents += r.events;
		totalScrubbed += r.scrubbed;
	}

	out(
		`\nTotal: ${totalCheckIns} eligible check-in(s), ${totalEvents} eligible event(s), ${totalScrubbed} scrubbed.`
	);
	if (!apply) {
		out("Dry run — nothing changed. Re-run with --apply to scrub.");
	}
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`${err}\n`);
	process.exit(1);
});
