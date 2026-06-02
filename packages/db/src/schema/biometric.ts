import { relations, sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import {
	attendanceCorrection,
	attendanceEvent,
	attendanceRecord,
	attendanceSourceEnum,
} from "./attendance";
import { user } from "./auth";
import {
	cuid,
	department,
	employeeProfile,
	orgRef,
	timestamps,
} from "./hr-core";

// ───────────────────────────────────────────────────────────────────────────
// Biometric + Geofencing schema — Phase 11B
//
// An INGESTION + RECONCILIATION layer that sits in front of the existing
// Attendance module. Raw device punches and mobile GPS check-ins are STAGED
// here (attendance_punch); a processor (Phase 11C) maps + de-duplicates +
// geofence-validates them, then creates attendance_event rows (source =
// biometric/mobile/import) that recalculate attendance_record. ONLY approved
// attendance_record rows ever reach payroll — see
// docs/architecture/biometric-geofencing-implementation-plan.md §5–§6.
//
// HARD PRIVACY RULE (§11): we store ONLY punch/check-in events and the
// verification METHOD (verifyMode enum). NO fingerprint / face / palm / iris
// templates, images, or raw biometric identity material are ever ingested or
// stored. Device credentials live in `credentialRef` as an ENCRYPTED secret
// reference (never plaintext) and the ingest key only as a hash (`apiKeyHash`).
// ───────────────────────────────────────────────────────────────────────────

// ─── Enums (13) ──────────────────────────────────────────────────────────────

export const attendanceDeviceTypeEnum = pgEnum("attendance_device_type", [
	"zkteco",
	"anviz",
	"cosec",
	"dahua",
	"generic",
	"virtual_kiosk",
]);

// Device vendor / brand family. Drives which adapter is used. Adapters for
// zkteco-live + ngteco-cloud are planned; generic file/API import is the MVP.
export const attendanceVendorEnum = pgEnum("attendance_vendor", [
	"zkteco",
	"ngteco",
	"generic",
	"other",
]);

// Connection / integration mode (the device's "connectionMode"). MVP implements
// the file/API import paths (csv_import, excel_import, usb_export_import,
// api_ingest, ngteco_cloud_export, ngteco_app_export, vendor_manual_upload). The
// `*_planned` values name not-yet-built live integrations (ZKTeco TCP pull,
// ZKTeco ADMS push, custom vendor adapters) so the UI/API can represent them
// honestly without faking live sync.
export const attendanceDeviceModeEnum = pgEnum("attendance_device_mode", [
	"csv_import",
	"excel_import",
	"usb_export_import",
	"api_ingest",
	"zkteco_tcp_planned",
	"zkteco_adms_push_planned",
	"ngteco_cloud_export",
	"ngteco_app_export",
	"vendor_manual_upload",
	"custom_adapter_planned",
]);

export const attendanceDeviceStatusEnum = pgEnum("attendance_device_status", [
	"active",
	"inactive",
	"error",
]);

export const attendanceDeviceDirectionEnum = pgEnum(
	"attendance_device_direction",
	["in", "out", "alternate", "system"]
);

export const attendanceSyncStatusEnum = pgEnum("attendance_sync_status", [
	"running",
	"success",
	"partial",
	"failed",
]);

export const attendancePunchDirectionEnum = pgEnum(
	"attendance_punch_direction",
	["in", "out", "unknown"]
);

export const attendancePunchStatusEnum = pgEnum("attendance_punch_status", [
	"pending",
	"processed",
	"unmapped",
	"duplicate",
	"error",
]);

// The verification METHOD a device reported — NOT any biometric template.
export const attendanceVerifyModeEnum = pgEnum("attendance_verify_mode", [
	"fingerprint",
	"face",
	"card",
	"password",
	"mobile_gps",
	"manual",
	"unknown",
]);

export const geofenceAssignmentScopeEnum = pgEnum("geofence_assignment_scope", [
	"organization",
	"department",
	"employee",
]);

export const geofenceCheckStatusEnum = pgEnum("geofence_check_status", [
	"inside",
	"outside",
	"low_accuracy",
	"unverified",
]);

export const attendanceExceptionTypeEnum = pgEnum("attendance_exception_type", [
	"unmapped_punch",
	"duplicate_punch",
	"missing_clock_out",
	"outside_geofence",
	"low_gps_accuracy",
	"clock_drift",
	"spoofing_suspected",
	"device_error",
	"out_of_window",
]);

export const attendanceExceptionStatusEnum = pgEnum(
	"attendance_exception_status",
	["open", "in_review", "resolved", "dismissed"]
);

export const attendanceExceptionSeverityEnum = pgEnum(
	"attendance_exception_severity",
	["info", "warning", "blocker"]
);

// ─── 1. geofence_location (work site) ─────────────────────────────────────────
// Org-scoped named site with a centre + allowed radius. Coordinates are
// numeric(10,7) (≈11mm precision). NOTE: the existing attendance_event
// locationLat/locationLon columns are `text` — reconciling those two to numeric
// is a flagged follow-up (plan §4.3); new columns use numeric.

export const geofenceLocation = pgTable(
	"geofence_location",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		address: text("address"),
		latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
		longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
		radiusMeters: integer("radius_meters").default(150).notNull(),
		accuracyThresholdMeters: integer("accuracy_threshold_meters")
			.default(100)
			.notNull(),
		allowOutsideWithReason: boolean("allow_outside_with_reason")
			.default(true)
			.notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		notes: text("notes"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("geofence_location_org_idx").on(t.organizationId),
		uniqueIndex("geofence_location_org_name_uq")
			.on(t.organizationId, t.name)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ─── 2. attendance_device ─────────────────────────────────────────────────────
// Registry of a physical/virtual device or import source. SECRETS: connection
// credentials are referenced via `credentialRef` (an encrypted-secret pointer,
// never plaintext); the ingest API key is stored only as `apiKeyHash`.

export const attendanceDevice = pgTable(
	"attendance_device",
	{
		id: cuid(),
		organizationId: orgRef(),
		name: text("name").notNull(),
		deviceType: attendanceDeviceTypeEnum("device_type")
			.default("generic")
			.notNull(),
		vendor: attendanceVendorEnum("vendor").default("generic").notNull(),
		model: text("model"),
		modelFamily: text("model_family"),
		serialNumber: text("serial_number"),
		mode: attendanceDeviceModeEnum("mode").default("csv_import").notNull(),
		host: text("host"),
		port: integer("port"),
		timeZone: text("time_zone").default("America/Guyana").notNull(),
		workSiteId: text("work_site_id").references(() => geofenceLocation.id, {
			onDelete: "set null",
		}),
		direction: attendanceDeviceDirectionEnum("direction")
			.default("alternate")
			.notNull(),
		// Hash of the ingest API key — the plaintext key is shown once on creation
		// and never persisted. Never returned to the client.
		apiKeyHash: text("api_key_hash"),
		// Reference/handle to an encrypted secret (device password / API secret).
		// NEVER plaintext, NEVER returned to the client, NEVER logged or audited.
		credentialRef: text("credential_ref"),
		isScheduled: boolean("is_scheduled").default(false).notNull(),
		scheduleIntervalMinutes: integer("schedule_interval_minutes"),
		lastSyncCursor: timestamp("last_sync_cursor", { withTimezone: true }),
		lastSyncStatus: attendanceSyncStatusEnum("last_sync_status"),
		clockOffsetSeconds: integer("clock_offset_seconds").default(0).notNull(),
		status: attendanceDeviceStatusEnum("status").default("active").notNull(),
		// ── Capability metadata (vendor/model-driven; drives the adapter UI) ──
		// supportedPunchMethods values: face/fingerprint/rfid/pin/mobile_app/gps_mobile
		supportedPunchMethods: jsonb("supported_punch_methods")
			.$type<string[]>()
			.default([])
			.notNull(),
		// networkCapabilities values: wifi_2_4ghz/wifi_5ghz/tcp_ip/usb/cloud_app
		networkCapabilities: jsonb("network_capabilities")
			.$type<string[]>()
			.default([])
			.notNull(),
		capacityUsers: integer("capacity_users"),
		capacityLogs: integer("capacity_logs"),
		supportsOfflineLogs: boolean("supports_offline_logs")
			.default(false)
			.notNull(),
		supportsShiftRules: boolean("supports_shift_rules")
			.default(false)
			.notNull(),
		supportsCloudSync: boolean("supports_cloud_sync").default(false).notNull(),
		supportsMobileApp: boolean("supports_mobile_app").default(false).notNull(),
		supportsGpsPunch: boolean("supports_gps_punch").default(false).notNull(),
		requiresSubscriptionForAdvancedFeatures: boolean(
			"requires_subscription_for_advanced_features"
		)
			.default(false)
			.notNull(),
		notes: text("notes"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("attendance_device_org_idx").on(t.organizationId),
		index("attendance_device_site_idx").on(t.workSiteId),
		// One serial number per org among live devices (used for ADMS SN match)
		uniqueIndex("attendance_device_org_serial_uq")
			.on(t.organizationId, t.serialNumber)
			.where(sql`${t.serialNumber} is not null and ${t.deletedAt} is null`),
	]
);

// ─── 3. attendance_device_employee_map ────────────────────────────────────────
// Maps (device, device user-id STRING) → employee. We map on the stable
// `deviceUserId` enrolment string, NOT the device serial index `uid` (which
// resets on re-enrolment — ZKTeco/Horilla gotcha).

export const attendanceDeviceEmployeeMap = pgTable(
	"attendance_device_employee_map",
	{
		id: cuid(),
		organizationId: orgRef(),
		deviceId: text("device_id")
			.notNull()
			.references(() => attendanceDevice.id, { onDelete: "cascade" }),
		deviceUserId: text("device_user_id").notNull(),
		deviceUserSerial: integer("device_user_serial"),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		enrollmentNote: text("enrollment_note"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("att_dev_map_org_idx").on(t.organizationId),
		index("att_dev_map_emp_idx").on(t.employeeId),
		uniqueIndex("att_dev_map_device_user_uq")
			.on(t.deviceId, t.deviceUserId)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ─── 4. attendance_device_sync_run ────────────────────────────────────────────
// One row per ingest batch (csv_import / api_ingest). The audit trail of a sync.

export const attendanceDeviceSyncRun = pgTable(
	"attendance_device_sync_run",
	{
		id: cuid(),
		organizationId: orgRef(),
		deviceId: text("device_id").references(() => attendanceDevice.id, {
			onDelete: "set null",
		}),
		mode: attendanceDeviceModeEnum("mode").notNull(),
		startedAt: timestamp("started_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		cursorFrom: timestamp("cursor_from", { withTimezone: true }),
		cursorTo: timestamp("cursor_to", { withTimezone: true }),
		punchesFetched: integer("punches_fetched").default(0).notNull(),
		punchesCreated: integer("punches_created").default(0).notNull(),
		punchesDuplicate: integer("punches_duplicate").default(0).notNull(),
		punchesUnmapped: integer("punches_unmapped").default(0).notNull(),
		punchesError: integer("punches_error").default(0).notNull(),
		status: attendanceSyncStatusEnum("status").default("running").notNull(),
		errorSummary: text("error_summary"),
		triggeredByUserId: text("triggered_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(t) => [
		index("att_sync_run_org_idx").on(t.organizationId),
		index("att_sync_run_device_idx").on(t.deviceId),
		index("att_sync_run_status_idx").on(t.status),
	]
);

// ─── 5. attendance_punch (raw staging) ────────────────────────────────────────
// The ERPNext "Employee Checkin" equivalent. Every raw event lands here first
// and is NEVER read by payroll. Dedupe is enforced by a single computed
// `idempotencyKey` (NULL-safe across all sources, unlike a composite key over
// nullable deviceId/deviceUserId).

export const attendancePunch = pgTable(
	"attendance_punch",
	{
		id: cuid(),
		organizationId: orgRef(),
		deviceId: text("device_id").references(() => attendanceDevice.id, {
			onDelete: "set null",
		}),
		syncRunId: text("sync_run_id").references(
			() => attendanceDeviceSyncRun.id,
			{ onDelete: "set null" }
		),
		deviceUserId: text("device_user_id"),
		// Nullable until the punch is mapped to an employee.
		employeeId: text("employee_id").references(() => employeeProfile.id, {
			onDelete: "restrict",
		}),
		punchTime: timestamp("punch_time", { withTimezone: true }).notNull(),
		rawPunchTime: text("raw_punch_time"),
		direction: attendancePunchDirectionEnum("direction")
			.default("unknown")
			.notNull(),
		verifyMode: attendanceVerifyModeEnum("verify_mode")
			.default("unknown")
			.notNull(),
		source: attendanceSourceEnum("source").default("import").notNull(),
		processingStatus: attendancePunchStatusEnum("processing_status")
			.default("pending")
			.notNull(),
		// Dedupe key: device punches → org|deviceId|deviceUserId|epoch;
		// device-less (mobile/manual) → org|employeeId|epoch|source.
		idempotencyKey: text("idempotency_key").notNull(),
		createdAttendanceEventId: text("created_attendance_event_id").references(
			() => attendanceEvent.id,
			{ onDelete: "set null" }
		),
		errorReason: text("error_reason"),
		rawPayload: jsonb("raw_payload"),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("att_punch_org_status_idx").on(t.organizationId, t.processingStatus),
		index("att_punch_emp_idx").on(t.employeeId),
		index("att_punch_device_idx").on(t.deviceId),
		index("att_punch_time_idx").on(t.punchTime),
		// Idempotency — re-ingesting a seen punch is a no-op (status=duplicate).
		uniqueIndex("att_punch_idem_uq")
			.on(t.organizationId, t.idempotencyKey)
			.where(sql`${t.deletedAt} is null`),
	]
);

// ─── 6. geofence_assignment ───────────────────────────────────────────────────
// Ties a work site to an employee / department / whole org. Resolution
// precedence at check-in: employee → department → organization default.

export const geofenceAssignment = pgTable(
	"geofence_assignment",
	{
		id: cuid(),
		organizationId: orgRef(),
		workSiteId: text("work_site_id")
			.notNull()
			.references(() => geofenceLocation.id, { onDelete: "cascade" }),
		scope: geofenceAssignmentScopeEnum("scope").notNull(),
		employeeId: text("employee_id").references(() => employeeProfile.id, {
			onDelete: "cascade",
		}),
		departmentId: text("department_id").references(() => department.id, {
			onDelete: "cascade",
		}),
		isDefault: boolean("is_default").default(false).notNull(),
		...timestamps,
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("geofence_assign_org_idx").on(t.organizationId),
		index("geofence_assign_site_idx").on(t.workSiteId),
		index("geofence_assign_emp_idx").on(t.employeeId),
		index("geofence_assign_dept_idx").on(t.departmentId),
	]
);

// ─── 7. geofence_check_in ─────────────────────────────────────────────────────
// Per-check-in GPS evidence (one per geofenced punch). Raw lat/lon are subject
// to the retention policy: after gpsRetentionDays they are scrubbed to the
// derived verdict and `coordsPurgedAt` is stamped (§11).

export const geofenceCheckIn = pgTable(
	"geofence_check_in",
	{
		id: cuid(),
		organizationId: orgRef(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employeeProfile.id, { onDelete: "restrict" }),
		attendancePunchId: text("attendance_punch_id").references(
			() => attendancePunch.id,
			{ onDelete: "set null" }
		),
		attendanceEventId: text("attendance_event_id").references(
			() => attendanceEvent.id,
			{ onDelete: "set null" }
		),
		latitude: numeric("latitude", { precision: 10, scale: 7 }),
		longitude: numeric("longitude", { precision: 10, scale: 7 }),
		accuracyMeters: integer("accuracy_meters"),
		matchedWorkSiteId: text("matched_work_site_id").references(
			() => geofenceLocation.id,
			{ onDelete: "set null" }
		),
		distanceMeters: integer("distance_meters"),
		status: geofenceCheckStatusEnum("status").notNull(),
		mockLocationFlag: boolean("mock_location_flag").default(false).notNull(),
		impossibleTravelFlag: boolean("impossible_travel_flag")
			.default(false)
			.notNull(),
		reason: text("reason"),
		userAgent: text("user_agent"),
		platform: text("platform"),
		// Reserved for a future optional selfie capture — not collected in v1.
		selfieUrl: text("selfie_url"),
		capturedAt: timestamp("captured_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		coordsPurgedAt: timestamp("coords_purged_at", { withTimezone: true }),
		...timestamps,
	},
	(t) => [
		index("geofence_checkin_org_idx").on(t.organizationId),
		index("geofence_checkin_emp_idx").on(t.employeeId),
		index("geofence_checkin_status_idx").on(t.status),
		index("geofence_checkin_punch_idx").on(t.attendancePunchId),
	]
);

// ─── 8. attendance_exception (the review queue) ───────────────────────────────
// "The queue" = attendance_exception WHERE status='open'. An exception may spawn
// an attendance_correction (existing Phase 7 flow) via `correctionId`.

export const attendanceException = pgTable(
	"attendance_exception",
	{
		id: cuid(),
		organizationId: orgRef(),
		// Nullable for unmapped punches (no employee resolved yet).
		employeeId: text("employee_id").references(() => employeeProfile.id, {
			onDelete: "set null",
		}),
		attendancePunchId: text("attendance_punch_id").references(
			() => attendancePunch.id,
			{ onDelete: "set null" }
		),
		attendanceEventId: text("attendance_event_id").references(
			() => attendanceEvent.id,
			{ onDelete: "set null" }
		),
		attendanceRecordId: text("attendance_record_id").references(
			() => attendanceRecord.id,
			{ onDelete: "set null" }
		),
		geofenceCheckInId: text("geofence_check_in_id").references(
			() => geofenceCheckIn.id,
			{ onDelete: "set null" }
		),
		deviceId: text("device_id").references(() => attendanceDevice.id, {
			onDelete: "set null",
		}),
		type: attendanceExceptionTypeEnum("type").notNull(),
		severity: attendanceExceptionSeverityEnum("severity")
			.default("warning")
			.notNull(),
		status: attendanceExceptionStatusEnum("status").default("open").notNull(),
		detail: text("detail").notNull(),
		resolutionAction: text("resolution_action"),
		resolvedBy: text("resolved_by").references(() => user.id, {
			onDelete: "set null",
		}),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		resolutionNote: text("resolution_note"),
		correctionId: text("correction_id").references(
			() => attendanceCorrection.id,
			{ onDelete: "set null" }
		),
		...timestamps,
	},
	(t) => [
		index("att_exception_org_status_idx").on(t.organizationId, t.status),
		index("att_exception_emp_idx").on(t.employeeId),
		index("att_exception_type_idx").on(t.type),
		index("att_exception_severity_idx").on(t.severity),
	]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const attendanceDeviceRelations = relations(
	attendanceDevice,
	({ one, many }) => ({
		workSite: one(geofenceLocation, {
			fields: [attendanceDevice.workSiteId],
			references: [geofenceLocation.id],
		}),
		mappings: many(attendanceDeviceEmployeeMap),
		syncRuns: many(attendanceDeviceSyncRun),
		punches: many(attendancePunch),
	})
);

export const attendanceDeviceEmployeeMapRelations = relations(
	attendanceDeviceEmployeeMap,
	({ one }) => ({
		device: one(attendanceDevice, {
			fields: [attendanceDeviceEmployeeMap.deviceId],
			references: [attendanceDevice.id],
		}),
		employee: one(employeeProfile, {
			fields: [attendanceDeviceEmployeeMap.employeeId],
			references: [employeeProfile.id],
		}),
	})
);

export const attendanceDeviceSyncRunRelations = relations(
	attendanceDeviceSyncRun,
	({ one, many }) => ({
		device: one(attendanceDevice, {
			fields: [attendanceDeviceSyncRun.deviceId],
			references: [attendanceDevice.id],
		}),
		punches: many(attendancePunch),
	})
);

export const attendancePunchRelations = relations(
	attendancePunch,
	({ one }) => ({
		device: one(attendanceDevice, {
			fields: [attendancePunch.deviceId],
			references: [attendanceDevice.id],
		}),
		syncRun: one(attendanceDeviceSyncRun, {
			fields: [attendancePunch.syncRunId],
			references: [attendanceDeviceSyncRun.id],
		}),
		employee: one(employeeProfile, {
			fields: [attendancePunch.employeeId],
			references: [employeeProfile.id],
		}),
		createdAttendanceEvent: one(attendanceEvent, {
			fields: [attendancePunch.createdAttendanceEventId],
			references: [attendanceEvent.id],
		}),
		geofenceCheckIn: one(geofenceCheckIn, {
			fields: [attendancePunch.id],
			references: [geofenceCheckIn.attendancePunchId],
		}),
	})
);

export const geofenceLocationRelations = relations(
	geofenceLocation,
	({ many }) => ({
		assignments: many(geofenceAssignment),
		devices: many(attendanceDevice),
	})
);

export const geofenceAssignmentRelations = relations(
	geofenceAssignment,
	({ one }) => ({
		workSite: one(geofenceLocation, {
			fields: [geofenceAssignment.workSiteId],
			references: [geofenceLocation.id],
		}),
		employee: one(employeeProfile, {
			fields: [geofenceAssignment.employeeId],
			references: [employeeProfile.id],
		}),
		department: one(department, {
			fields: [geofenceAssignment.departmentId],
			references: [department.id],
		}),
	})
);

export const geofenceCheckInRelations = relations(
	geofenceCheckIn,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [geofenceCheckIn.employeeId],
			references: [employeeProfile.id],
		}),
		attendancePunch: one(attendancePunch, {
			fields: [geofenceCheckIn.attendancePunchId],
			references: [attendancePunch.id],
		}),
		matchedWorkSite: one(geofenceLocation, {
			fields: [geofenceCheckIn.matchedWorkSiteId],
			references: [geofenceLocation.id],
		}),
	})
);

export const attendanceExceptionRelations = relations(
	attendanceException,
	({ one }) => ({
		employee: one(employeeProfile, {
			fields: [attendanceException.employeeId],
			references: [employeeProfile.id],
		}),
		attendancePunch: one(attendancePunch, {
			fields: [attendanceException.attendancePunchId],
			references: [attendancePunch.id],
		}),
		device: one(attendanceDevice, {
			fields: [attendanceException.deviceId],
			references: [attendanceDevice.id],
		}),
		correction: one(attendanceCorrection, {
			fields: [attendanceException.correctionId],
			references: [attendanceCorrection.id],
		}),
	})
);
