/**
 * Geofence evaluation (Phase 11C). Server-side ONLY — the client verdict is
 * never trusted. Distance is great-circle (haversine), matching Horilla's
 * geopy.geodesic approach (a flat-earth approximation is wrong past ~100m).
 */
import { db } from "@Heimdallone/db";
import {
	employeeWorkInfo,
	geofenceAssignment,
	geofenceLocation,
} from "@Heimdallone/db/schema/index";
import { and, eq, isNull } from "drizzle-orm";

const EARTH_RADIUS_METERS = 6_371_000;

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

/** Great-circle distance in metres between two lat/lon points. */
export function haversineMeters(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return Math.round(EARTH_RADIUS_METERS * 2 * Math.asin(Math.sqrt(a)));
}

export interface WorkSiteRow {
	accuracyThresholdMeters: number;
	allowOutsideWithReason: boolean;
	id: string;
	latitude: string;
	longitude: string;
	name: string;
	radiusMeters: number;
}

/**
 * Resolve the work site an employee should check in against. Precedence:
 * employee assignment → department assignment → org-wide default. Returns null
 * if no active site is assigned/defaulted.
 */
export async function resolveWorkSiteForEmployee(
	organizationId: string,
	employeeId: string
): Promise<WorkSiteRow | null> {
	const siteCols = {
		id: geofenceLocation.id,
		name: geofenceLocation.name,
		latitude: geofenceLocation.latitude,
		longitude: geofenceLocation.longitude,
		radiusMeters: geofenceLocation.radiusMeters,
		accuracyThresholdMeters: geofenceLocation.accuracyThresholdMeters,
		allowOutsideWithReason: geofenceLocation.allowOutsideWithReason,
	};

	const activeSite = and(
		eq(geofenceLocation.isActive, true),
		isNull(geofenceLocation.deletedAt),
		isNull(geofenceAssignment.deletedAt)
	);

	// 1. Employee-scoped
	const [byEmployee] = await db
		.select(siteCols)
		.from(geofenceAssignment)
		.innerJoin(
			geofenceLocation,
			eq(geofenceAssignment.workSiteId, geofenceLocation.id)
		)
		.where(
			and(
				eq(geofenceAssignment.organizationId, organizationId),
				eq(geofenceAssignment.scope, "employee"),
				eq(geofenceAssignment.employeeId, employeeId),
				activeSite
			)
		)
		.limit(1);
	if (byEmployee) {
		return byEmployee;
	}

	// 2. Department-scoped (via the employee's work-info department)
	const [workInfo] = await db
		.select({ departmentId: employeeWorkInfo.departmentId })
		.from(employeeWorkInfo)
		.where(eq(employeeWorkInfo.employeeId, employeeId))
		.limit(1);
	if (workInfo?.departmentId) {
		const [byDept] = await db
			.select(siteCols)
			.from(geofenceAssignment)
			.innerJoin(
				geofenceLocation,
				eq(geofenceAssignment.workSiteId, geofenceLocation.id)
			)
			.where(
				and(
					eq(geofenceAssignment.organizationId, organizationId),
					eq(geofenceAssignment.scope, "department"),
					eq(geofenceAssignment.departmentId, workInfo.departmentId),
					activeSite
				)
			)
			.limit(1);
		if (byDept) {
			return byDept;
		}
	}

	// 3. Org-wide default
	const [byOrg] = await db
		.select(siteCols)
		.from(geofenceAssignment)
		.innerJoin(
			geofenceLocation,
			eq(geofenceAssignment.workSiteId, geofenceLocation.id)
		)
		.where(
			and(
				eq(geofenceAssignment.organizationId, organizationId),
				eq(geofenceAssignment.scope, "organization"),
				activeSite
			)
		)
		.limit(1);
	return byOrg ?? null;
}

export type GeofenceVerdict =
	| "inside"
	| "outside"
	| "low_accuracy"
	| "unverified";

export interface GeofenceEvaluation {
	distanceMeters: number | null;
	matchedWorkSiteId: string | null;
	status: GeofenceVerdict;
	withinGeofence: boolean;
}

/**
 * Evaluate a GPS fix against a resolved work site. `unverified` = no site or no
 * coordinates. `low_accuracy` = the fix is too imprecise to trust. Otherwise
 * inside/outside by great-circle distance vs the site radius.
 */
export function evaluateCheckIn(params: {
	accuracyMeters: number | null;
	lat: number | null;
	lon: number | null;
	site: WorkSiteRow | null;
}): GeofenceEvaluation {
	const { site, lat, lon, accuracyMeters } = params;
	if (!site || lat === null || lon === null) {
		return {
			status: "unverified",
			distanceMeters: null,
			matchedWorkSiteId: site?.id ?? null,
			withinGeofence: false,
		};
	}

	const distanceMeters = haversineMeters(
		lat,
		lon,
		Number(site.latitude),
		Number(site.longitude)
	);

	if (
		accuracyMeters !== null &&
		accuracyMeters > site.accuracyThresholdMeters
	) {
		return {
			status: "low_accuracy",
			distanceMeters,
			matchedWorkSiteId: site.id,
			withinGeofence: distanceMeters <= site.radiusMeters,
		};
	}

	const withinGeofence = distanceMeters <= site.radiusMeters;
	return {
		status: withinGeofence ? "inside" : "outside",
		distanceMeters,
		matchedWorkSiteId: site.id,
		withinGeofence,
	};
}

// ── Work arrangement (Phase 11G) ─────────────────────────────────────────────

export type WorkArrangement =
	| "onsite"
	| "hybrid"
	| "remote"
	| "field"
	| "exempt";

export interface ArrangementPolicy {
	arrangement: WorkArrangement;
	// Worker is expected inside an assigned worksite geofence.
	geofenceEnforced: boolean;
	// A GPS fix is mandatory to check in (else check-in is allowed without coords).
	gpsRequired: boolean;
	// Plain-language label for HR/manager surfaces.
	label: string;
	// An outside / low-accuracy / unverified result raises an attendance exception.
	raisesGeofenceException: boolean;
}

const ARRANGEMENT_LABEL: Record<WorkArrangement, string> = {
	onsite: "Onsite",
	hybrid: "Hybrid",
	remote: "Remote",
	field: "Field work",
	exempt: "Geofence exempt",
};

/** Resolve an employee's work arrangement (defaults to onsite). */
export async function resolveEmployeeArrangement(
	employeeId: string
): Promise<WorkArrangement> {
	const [info] = await db
		.select({ a: employeeWorkInfo.workArrangement })
		.from(employeeWorkInfo)
		.where(eq(employeeWorkInfo.employeeId, employeeId))
		.limit(1);
	return (info?.a as WorkArrangement | undefined) ?? "onsite";
}

/** Behaviour rules for an arrangement. Only `onsite` enforces the geofence and
 * raises exceptions for being away; everyone else may legitimately be elsewhere. */
export function arrangementPolicy(a: WorkArrangement): ArrangementPolicy {
	const label = ARRANGEMENT_LABEL[a] ?? "Onsite";
	if (a === "onsite") {
		return {
			arrangement: "onsite",
			label,
			geofenceEnforced: true,
			raisesGeofenceException: true,
			gpsRequired: true,
		};
	}
	if (a === "hybrid") {
		// Onsite or remote depending on the day — be lenient (no auto-exception).
		return {
			arrangement: "hybrid",
			label,
			geofenceEnforced: true,
			raisesGeofenceException: false,
			gpsRequired: true,
		};
	}
	// remote / field / exempt — not tied to a physical worksite.
	return {
		arrangement: a,
		label,
		geofenceEnforced: false,
		raisesGeofenceException: false,
		gpsRequired: false,
	};
}
