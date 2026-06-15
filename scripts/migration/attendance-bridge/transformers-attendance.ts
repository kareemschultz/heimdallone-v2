// biome-ignore-all lint: attendance-bridge transformers (Phase 21O).
//
// PURE v1 attendance-shape → v2 attendance-insert mappers. No DB, no env. The v2
// biometric pipeline (Phase 11) owns the landing tables; these mappers stage v1
// device/user/punch rows into them so the EXISTING processor derives attendance.
// Raw v1 values are preserved (rawPunchTime + rawPayload carry the v1 punch id,
// type, and source); nothing is fabricated.

// ── v1-shaped source types (the subset we bridge) ──
export interface V1AttDevice {
	deviceId: string | null;
	deviceType: string | null; // v1 label (e.g. "zkteco_k40") — cosmetic; real platform ZLM60_TFT
	id: string;
	ipAddress: string | null;
	isActive: boolean;
	locationName: string | null;
	port: number | null;
	serialNumber?: string | null;
}
export interface V1AttDeviceUser {
	deviceId: string;
	employeeId: string | null;
	id: string;
	name: string | null;
	slotIndex: number;
}
export interface V1AttPunch {
	// v1 already resolved the employee at ingest — preserve it (no name guessing).
	deviceId: string | null;
	deviceTimestamp: string | null;
	employeeId: string | null;
	id: string;
	punchAt: string; // ISO (UTC)
	punchType: string;
	source: string; // device | manual | self
}

// v1 punch_type → v2 direction (in/out/unknown). break/overtime nuances are kept
// in rawPayload; the v2 direction enum is in/out/unknown only.
const DIRECTION_BY_TYPE: Record<string, "in" | "out" | "unknown"> = {
	in: "in",
	overtime_in: "in",
	out: "out",
	overtime_out: "out",
	break_start: "unknown",
	break_end: "unknown",
};

export function directionFor(punchType: string): "in" | "out" | "unknown" {
	return DIRECTION_BY_TYPE[punchType] ?? "unknown";
}

// v2 idempotency key — MUST match the live ingest formula (biometric.ts punchKey)
// so a backfill and a later live re-send of the same punch dedupe to a no-op.
export function punchIdempotencyKey(
	deviceId: string | null,
	deviceUserId: string | null,
	punchTime: Date
): string {
	const epoch = Math.floor(punchTime.getTime() / 1000);
	if (deviceId) {
		return `dev|${deviceId}|${deviceUserId ?? "nouser"}|${epoch}`;
	}
	return `import|${deviceUserId ?? "noemp"}|${epoch}`;
}

// ── attendance_device ── (preserve v1 device id so punch.deviceId FKs line up)
export function mapAttendanceDevice(d: V1AttDevice, orgId: string) {
	return {
		id: d.id,
		organizationId: orgId,
		name: d.locationName ?? d.deviceId ?? "Time terminal",
		deviceType: "zkteco" as const,
		vendor: "zkteco" as const,
		// v1's label is cosmetic/unverified; record it for traceability only.
		model: d.deviceType ?? null,
		serialNumber: d.serialNumber ?? null,
		mode: "api_ingest" as const, // the Pi agent posts to the ingest endpoint
		host: d.ipAddress ?? null,
		port: d.port ?? null,
		timeZone: "America/Guyana",
		status: (d.isActive ? "active" : "inactive") as "active" | "inactive",
		supportedPunchMethods: ["fingerprint", "face", "pin"],
		networkCapabilities: ["tcp_ip"],
	};
}

// ── attendance_device_employee_map ── (stable deviceUserId = the slot string;
// keep the numeric slot as deviceUserSerial). Only mapped users (employeeId set).
export function mapDeviceEmployeeMap(u: V1AttDeviceUser, orgId: string) {
	if (!u.employeeId) {
		return null;
	}
	return {
		organizationId: orgId,
		deviceId: u.deviceId,
		deviceUserId: String(u.slotIndex),
		deviceUserSerial: u.slotIndex,
		employeeId: u.employeeId,
		enrollmentNote: u.name ? `v1 enrolment: ${u.name}` : null,
	};
}

// ── attendance_punch (raw staging) ── deviceUserId is the resolved slot string
// (so backfill keys match live-ingest keys). employeeId carried from v1 (the
// v1-resolved match); null → processor sends it to the unmapped review queue.
export function mapAttendancePunch(
	p: V1AttPunch,
	orgId: string,
	deviceUserId: string | null
) {
	const punchTime = new Date(p.punchAt);
	return {
		organizationId: orgId,
		deviceId: p.deviceId,
		deviceUserId,
		employeeId: p.employeeId,
		punchTime,
		rawPunchTime: p.deviceTimestamp ?? p.punchAt,
		direction: directionFor(p.punchType),
		verifyMode: "unknown" as const, // v1 punches don't record the method
		source: "import" as const,
		idempotencyKey: punchIdempotencyKey(p.deviceId, deviceUserId, punchTime),
		rawPayload: {
			v1PunchId: p.id,
			v1PunchType: p.punchType,
			v1Source: p.source,
		},
	};
}
