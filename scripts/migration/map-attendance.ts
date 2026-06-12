// biome-ignore-all lint: one-shot attendance mappers (Phase 21B).
//
// Attendance punches must retain timestamp, source, employee, and device/GPS
// context. v1 punches carry GPS + device_timestamp + logical_shift_date.

import { coverFields, type Mapper } from "./types-v1";

const m = (v2: string | null, status: any, note?: string) => ({
	v2,
	status,
	note,
});

const punchMapper: Mapper = {
	v1Table: "attendance_punches",
	v2Target: "attendance_punch",
	classification: "direct_map",
	reason: "raw punches with timestamp/source/device/GPS",
	selectSql: 'SELECT * FROM "attendance_punches"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("attendance_punch.id", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			employee_id: m("attendance_punch.employee_id", "mapped"),
			punch_at: m("attendance_punch.punched_at", "mapped"),
			punch_type: m("attendance_punch.type", "mapped", "in/out"),
			source: m("attendance_punch.source", "mapped"),
			device_id: m("attendance_punch.device_id", "mapped"),
			created_by_user_id: m("attendance_punch.created_by", "mapped"),
			note: m("attendance_punch.note", "mapped"),
			logical_shift_date: m(
				"attendance_punch.shift_date",
				"manual_review",
				"v1 derives logical shift date — confirm v2 derivation"
			),
			break_minutes_deducted: m("attendance_punch.break_minutes", "mapped"),
			device_timestamp: m("attendance_punch.device_timestamp", "mapped"),
			synced_at: m(null, "dropped", "edge-sync telemetry"),
			latitude: m(
				"geofence_check_in / punch geo",
				"manual_review",
				"GPS — confirm v2 punch carries geo"
			),
			longitude: m("geofence_check_in / punch geo", "manual_review"),
			accuracy_meters: m("punch geo accuracy", "manual_review"),
			is_gps_mocked: m("punch geo mocked flag", "manual_review"),
			verified_work_location_id: m("geofence_location", "manual_review"),
		};
		const withGeo = rows.filter((r) => r.latitude != null).length;
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [
				`${rows.length} punches`,
				`${withGeo} carry GPS coordinates (confirm v2 punch geo home)`,
			],
		};
	},
};

const correctionMapper: Mapper = {
	v1Table: "punch_correction_requests",
	v2Target: "attendance_correction",
	classification: "direct_map",
	reason: "punch correction workflow",
	selectSql: 'SELECT * FROM "punch_correction_requests"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("attendance_correction.id", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			employee_id: m("attendance_correction.employee_id", "mapped"),
			original_punch_id: m("attendance_correction.punch_id", "mapped"),
			requested_punch_at: m("attendance_correction.requested_at", "mapped"),
			requested_punch_type: m("attendance_correction.requested_type", "mapped"),
			reason: m("attendance_correction.reason", "mapped"),
			status: m("attendance_correction.status", "mapped"),
			reviewed_by_user_id: m("attendance_correction.reviewed_by", "mapped"),
			reviewed_at: m("attendance_correction.reviewed_at", "mapped"),
			review_note: m("attendance_correction.review_note", "mapped"),
		};
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [`${rows.length} corrections`],
		};
	},
};

const deviceMapper: Mapper = {
	v1Table: "attendance_devices",
	v2Target: "attendance_device",
	classification: "direct_map",
	reason: "device registry",
	selectSql: 'SELECT * FROM "attendance_devices"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("attendance_device.id", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			device_id: m("attendance_device.device_id", "mapped"),
			device_type: m("attendance_device.type", "mapped"),
			location_name: m("attendance_device.location", "mapped"),
			work_location_id: m("geofence_location", "manual_review"),
			is_active: m("attendance_device.is_active", "mapped"),
			ip_address: m("attendance_device.ip_address", "mapped"),
			port: m("attendance_device.port", "mapped"),
			notes: m("attendance_device.notes", "mapped"),
			api_key_hash: m(
				"attendance_device.api_key_hash",
				"manual_review",
				"device secret — rotate on cutover"
			),
			api_key_last_four: m("attendance_device.api_key_last_four", "mapped"),
			last_seen_at: m("attendance_device.last_seen_at", "mapped"),
			last_punch_at: m("attendance_device.last_punch_at", "mapped"),
			last_punch_count: m(null, "dropped", "telemetry"),
			api_key_rotated_at: m("attendance_device.api_key_rotated_at", "mapped"),
			sync_requested_at: m(null, "dropped", "edge-sync telemetry"),
		};
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [`${rows.length} devices`],
		};
	},
};

const deviceUserMapper: Mapper = {
	v1Table: "attendance_device_users",
	v2Target: "attendance_device_employee_map",
	classification: "transform_map",
	reason: "device slot <-> employee binding",
	selectSql: 'SELECT * FROM "attendance_device_users"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("attendance_device_employee_map.id", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			device_id: m("attendance_device_employee_map.device_id", "mapped"),
			slot_index: m("attendance_device_employee_map.slot", "mapped"),
			name: m("(label)", "mapped"),
			employee_id: m("attendance_device_employee_map.employee_id", "mapped"),
			synced_at: m(null, "dropped", "edge-sync telemetry"),
		};
		const unbound = rows.filter((r) => !r.employee_id).length;
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [
				`${rows.length} device-user slots`,
				`${unbound} not bound to an employee`,
			],
		};
	},
};

export const attendanceMappers: Mapper[] = [
	punchMapper,
	correctionMapper,
	deviceMapper,
	deviceUserMapper,
];
