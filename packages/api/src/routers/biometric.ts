import { db } from "@Heimdallone/db";
import {
	attendanceDevice,
	attendanceDeviceEmployeeMap,
	attendanceDeviceSyncRun,
	attendanceException,
	attendancePunch,
	employeeProfile,
	geofenceAssignment,
	geofenceCheckIn,
	geofenceLocation,
} from "@Heimdallone/db/schema/index";
import { createHash, randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure, publicProcedure } from "../index";
import {
	containsBiometricTemplate,
	getAdapter,
	listAdapters,
} from "../utils/attendance-adapters";
import { createAuditEvent } from "../utils/audit";
import { processPendingPunches } from "../utils/biometric-processor";
import {
	canReadAllEmployees,
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";
import { evaluateCheckIn, resolveWorkSiteForEmployee } from "../utils/geofence";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const MAX_INGEST_ROWS = 5000;

// ── Secrets ───────────────────────────────────────────────────────────────────

function hashKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}
function generateIngestKey(): string {
	return randomBytes(24).toString("base64url");
}

type DeviceRow = typeof attendanceDevice.$inferSelect;

/** Strip secrets (apiKeyHash, credentialRef) before returning a device to a client. */
function publicDevice(row: DeviceRow) {
	const { apiKeyHash: _a, credentialRef: _c, ...rest } = row;
	return { ...rest, hasIngestKey: row.apiKeyHash !== null };
}

// ── Idempotency ─────────────────────────────────────────────────────────────

function punchKey(p: {
	deviceId: string | null;
	deviceUserId: string | null;
	employeeId: string | null;
	punchTime: Date;
	source: string;
}): string {
	const epoch = Math.floor(p.punchTime.getTime() / 1000);
	if (p.deviceId) {
		return `dev|${p.deviceId}|${p.deviceUserId ?? "nouser"}|${epoch}`;
	}
	return `${p.source}|${p.employeeId ?? "noemp"}|${epoch}`;
}

// ── Tenant/FK verification helpers ──────────────────────────────────────────

async function verifyAttendanceDevice(id: string, org: string) {
	const [row] = await db
		.select()
		.from(attendanceDevice)
		.where(
			and(
				eq(attendanceDevice.id, id),
				eq(attendanceDevice.organizationId, org),
				isNull(attendanceDevice.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Device not found." });
	}
	return row;
}

async function verifyEmployeeInOrg(id: string, org: string) {
	const [row] = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(eq(employeeProfile.id, id), eq(employeeProfile.organizationId, org))
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Employee not found." });
	}
	return row;
}

async function verifyGeofenceLocation(id: string, org: string) {
	const [row] = await db
		.select()
		.from(geofenceLocation)
		.where(
			and(
				eq(geofenceLocation.id, id),
				eq(geofenceLocation.organizationId, org),
				isNull(geofenceLocation.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Work site not found." });
	}
	return row;
}

async function verifyAttendanceException(id: string, org: string) {
	const [row] = await db
		.select()
		.from(attendanceException)
		.where(
			and(
				eq(attendanceException.id, id),
				eq(attendanceException.organizationId, org)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Exception not found." });
	}
	return row;
}

// ── Manager scoping ─────────────────────────────────────────────────────────

async function scopedEmployeeIds(
	org: string,
	userId: string,
	memberRole: string
): Promise<string[] | "all"> {
	if (canReadAllEmployees(memberRole)) {
		return "all";
	}
	const cur = await resolveCurrentEmployee(org, userId);
	if (!cur) {
		return [];
	}
	if (memberRole === "manager") {
		const reports = await getDirectReportIds(cur.id);
		return [cur.id, ...reports];
	}
	return [cur.id];
}

function assertEmployeeVisible(
	employeeId: string | null,
	scope: string[] | "all"
): void {
	if (scope === "all") {
		return;
	}
	if (!(employeeId && scope.includes(employeeId))) {
		throw new ORPCError("FORBIDDEN", {
			message: "This record is outside your team scope.",
		});
	}
}

// ── Zod enums ────────────────────────────────────────────────────────────────

const vendorEnum = z.enum(["zkteco", "ngteco", "generic", "other"]);
const deviceTypeEnum = z.enum([
	"zkteco",
	"anviz",
	"cosec",
	"dahua",
	"generic",
	"virtual_kiosk",
]);
const modeEnum = z.enum([
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
const directionEnum = z.enum(["in", "out", "alternate", "system"]);
const punchDirectionEnum = z.enum(["in", "out", "unknown"]);
const verifyModeEnum = z.enum([
	"fingerprint",
	"face",
	"card",
	"password",
	"mobile_gps",
	"manual",
	"unknown",
]);

// Maps a (vendor, mode) to an adapter provider key.
function providerKeyForDevice(vendor: string, mode: string): string {
	if (vendor === "zkteco") {
		if (mode === "zkteco_adms_push_planned") {
			return "zkteco_adms";
		}
		if (mode === "zkteco_tcp_planned") {
			return "zkteco_tcp";
		}
	}
	if (vendor === "ngteco") {
		if (mode === "ngteco_cloud_export") {
			return "ngteco_cloud";
		}
		if (mode === "usb_export_import") {
			return "ngteco_kseries";
		}
		return "ngteco_app";
	}
	if (mode === "api_ingest") {
		return "generic_api";
	}
	if (mode === "excel_import") {
		return "generic_excel";
	}
	return "generic_csv";
}

// ════════════════════════════ DEVICES ════════════════════════════

const devicesList = authorizedProcedure("attendance_device", "read")
	.input(z.object({ includeInactive: z.boolean().optional() }).optional())
	.handler(async ({ context, input }) => {
		const conds = [
			eq(attendanceDevice.organizationId, orgId(context)),
			isNull(attendanceDevice.deletedAt),
		];
		const rows = await db
			.select()
			.from(attendanceDevice)
			.where(and(...conds))
			.orderBy(desc(attendanceDevice.createdAt));
		const visible = input?.includeInactive
			? rows
			: rows.filter((r) => r.status !== "inactive");
		return visible.map(publicDevice);
	});

const devicesGetById = authorizedProcedure("attendance_device", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const row = await verifyAttendanceDevice(input.id, orgId(context));
		const adapter = getAdapter(providerKeyForDevice(row.vendor, row.mode));
		return {
			device: publicDevice(row),
			adapter: {
				providerKey: adapter.providerKey,
				displayName: adapter.displayName,
				status: adapter.status,
				connection: adapter.getConnectionStatus(),
				supportedModes: adapter.supportedModes,
				capabilities: adapter.capabilities,
			},
		};
	});

const devicesCreate = authorizedProcedure("attendance_device", "manage")
	.input(
		z.object({
			name: z.string().min(1),
			vendor: vendorEnum.default("generic"),
			deviceType: deviceTypeEnum.default("generic"),
			model: z.string().optional(),
			modelFamily: z.string().optional(),
			serialNumber: z.string().optional(),
			mode: modeEnum.default("csv_import"),
			host: z.string().optional(),
			port: z.number().int().optional(),
			timeZone: z.string().default("America/Guyana"),
			workSiteId: z.string().optional(),
			direction: directionEnum.default("alternate"),
			supportedPunchMethods: z.array(z.string()).optional(),
			networkCapabilities: z.array(z.string()).optional(),
			capacityUsers: z.number().int().optional(),
			capacityLogs: z.number().int().optional(),
			supportsOfflineLogs: z.boolean().optional(),
			supportsShiftRules: z.boolean().optional(),
			supportsCloudSync: z.boolean().optional(),
			supportsMobileApp: z.boolean().optional(),
			supportsGpsPunch: z.boolean().optional(),
			requiresSubscriptionForAdvancedFeatures: z.boolean().optional(),
			notes: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (input.workSiteId) {
			await verifyGeofenceLocation(input.workSiteId, orgId(context));
		}
		// Generate a one-time ingest key only for API-ingest devices.
		let ingestApiKey: string | undefined;
		let apiKeyHash: string | null = null;
		if (input.mode === "api_ingest") {
			ingestApiKey = generateIngestKey();
			apiKeyHash = hashKey(ingestApiKey);
		}
		const id = createId();
		try {
			await db.insert(attendanceDevice).values({
				id,
				organizationId: orgId(context),
				name: input.name,
				vendor: input.vendor,
				deviceType: input.deviceType,
				model: input.model,
				modelFamily: input.modelFamily,
				serialNumber: input.serialNumber,
				mode: input.mode,
				host: input.host,
				port: input.port,
				timeZone: input.timeZone,
				workSiteId: input.workSiteId,
				direction: input.direction,
				apiKeyHash,
				supportedPunchMethods: input.supportedPunchMethods ?? [],
				networkCapabilities: input.networkCapabilities ?? [],
				capacityUsers: input.capacityUsers,
				capacityLogs: input.capacityLogs,
				supportsOfflineLogs: input.supportsOfflineLogs ?? false,
				supportsShiftRules: input.supportsShiftRules ?? false,
				supportsCloudSync: input.supportsCloudSync ?? false,
				supportsMobileApp: input.supportsMobileApp ?? false,
				supportsGpsPunch: input.supportsGpsPunch ?? false,
				requiresSubscriptionForAdvancedFeatures:
					input.requiresSubscriptionForAdvancedFeatures ?? false,
				notes: input.notes,
			});
		} catch (err) {
			if (
				String((err as { cause?: unknown })?.cause ?? err).includes("23505")
			) {
				throw new ORPCError("CONFLICT", {
					message: "A device with this serial number already exists.",
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_device",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		// ingestApiKey is returned ONCE here and never persisted in plaintext.
		return { id, ingestApiKey };
	});

const devicesUpdate = authorizedProcedure("attendance_device", "manage")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).optional(),
			model: z.string().optional(),
			modelFamily: z.string().optional(),
			timeZone: z.string().optional(),
			workSiteId: z.string().nullable().optional(),
			direction: directionEnum.optional(),
			isScheduled: z.boolean().optional(),
			scheduleIntervalMinutes: z.number().int().nullable().optional(),
			status: z.enum(["active", "inactive", "error"]).optional(),
			clockOffsetSeconds: z.number().int().optional(),
			notes: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		await verifyAttendanceDevice(input.id, orgId(context));
		if (input.workSiteId) {
			await verifyGeofenceLocation(input.workSiteId, orgId(context));
		}
		const { id, ...rest } = input;
		await db
			.update(attendanceDevice)
			.set(rest)
			.where(eq(attendanceDevice.id, id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_device",
			entityId: id,
			action: "update",
			actorId: actorId(context),
		});
		return { id };
	});

const devicesRotateIngestKey = authorizedProcedure(
	"attendance_device",
	"manage"
)
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await verifyAttendanceDevice(input.id, orgId(context));
		const ingestApiKey = generateIngestKey();
		await db
			.update(attendanceDevice)
			.set({ apiKeyHash: hashKey(ingestApiKey) })
			.where(eq(attendanceDevice.id, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_device",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { action: "rotate_ingest_key" },
		});
		return { id: input.id, ingestApiKey };
	});

const devicesArchive = authorizedProcedure("attendance_device", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await verifyAttendanceDevice(input.id, orgId(context));
		await db
			.update(attendanceDevice)
			.set({ deletedAt: new Date(), status: "inactive" })
			.where(eq(attendanceDevice.id, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_device",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const devicesTestConnection = authorizedProcedure("attendance_device", "sync")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const row = await verifyAttendanceDevice(input.id, orgId(context));
		const adapter = getAdapter(providerKeyForDevice(row.vendor, row.mode));
		// No real network call — planned live integrations report honestly.
		return adapter.getConnectionStatus();
	});

const adaptersList = authorizedProcedure("attendance_device", "read").handler(
	() =>
		listAdapters().map((a) => ({
			providerKey: a.providerKey,
			displayName: a.displayName,
			vendor: a.vendor,
			status: a.status,
			supportedModes: a.supportedModes,
			capabilities: a.capabilities,
		}))
);

// ════════════════════════════ MAPPINGS ════════════════════════════

const mappingsList = authorizedProcedure("attendance_device", "read")
	.input(z.object({ deviceId: z.string() }))
	.handler(async ({ context, input }) => {
		await verifyAttendanceDevice(input.deviceId, orgId(context));
		return await db
			.select({
				id: attendanceDeviceEmployeeMap.id,
				deviceId: attendanceDeviceEmployeeMap.deviceId,
				deviceUserId: attendanceDeviceEmployeeMap.deviceUserId,
				deviceUserSerial: attendanceDeviceEmployeeMap.deviceUserSerial,
				employeeId: attendanceDeviceEmployeeMap.employeeId,
				employeeFirstName: employeeProfile.firstName,
				employeeLastName: employeeProfile.lastName,
			})
			.from(attendanceDeviceEmployeeMap)
			.leftJoin(
				employeeProfile,
				eq(attendanceDeviceEmployeeMap.employeeId, employeeProfile.id)
			)
			.where(
				and(
					eq(attendanceDeviceEmployeeMap.deviceId, input.deviceId),
					eq(attendanceDeviceEmployeeMap.organizationId, orgId(context)),
					isNull(attendanceDeviceEmployeeMap.deletedAt)
				)
			);
	});

const mappingsCreate = authorizedProcedure("attendance_device", "manage")
	.input(
		z.object({
			deviceId: z.string(),
			deviceUserId: z.string().min(1),
			deviceUserSerial: z.number().int().optional(),
			employeeId: z.string(),
			enrollmentNote: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		await verifyAttendanceDevice(input.deviceId, orgId(context));
		await verifyEmployeeInOrg(input.employeeId, orgId(context));
		const id = createId();
		try {
			await db.insert(attendanceDeviceEmployeeMap).values({
				id,
				organizationId: orgId(context),
				deviceId: input.deviceId,
				deviceUserId: input.deviceUserId,
				deviceUserSerial: input.deviceUserSerial,
				employeeId: input.employeeId,
				enrollmentNote: input.enrollmentNote,
			});
		} catch (err) {
			if (
				String((err as { cause?: unknown })?.cause ?? err).includes("23505")
			) {
				throw new ORPCError("CONFLICT", {
					message: "This device user id is already mapped on this device.",
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_device_employee_map",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const mappingsDelete = authorizedProcedure("attendance_device", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [row] = await db
			.select()
			.from(attendanceDeviceEmployeeMap)
			.where(
				and(
					eq(attendanceDeviceEmployeeMap.id, input.id),
					eq(attendanceDeviceEmployeeMap.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Mapping not found." });
		}
		await db
			.update(attendanceDeviceEmployeeMap)
			.set({ deletedAt: new Date() })
			.where(eq(attendanceDeviceEmployeeMap.id, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_device_employee_map",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════ SYNC RUNS ════════════════════════════

const syncRunsList = authorizedProcedure("attendance_device", "read")
	.input(
		z
			.object({
				deviceId: z.string().optional(),
				limit: z.number().int().max(200).optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const conds = [eq(attendanceDeviceSyncRun.organizationId, orgId(context))];
		if (input?.deviceId) {
			conds.push(eq(attendanceDeviceSyncRun.deviceId, input.deviceId));
		}
		return await db
			.select()
			.from(attendanceDeviceSyncRun)
			.where(and(...conds))
			.orderBy(desc(attendanceDeviceSyncRun.startedAt))
			.limit(input?.limit ?? 50);
	});

const syncRunsGetById = authorizedProcedure("attendance_device", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [row] = await db
			.select()
			.from(attendanceDeviceSyncRun)
			.where(
				and(
					eq(attendanceDeviceSyncRun.id, input.id),
					eq(attendanceDeviceSyncRun.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Sync run not found." });
		}
		return row;
	});

// ════════════════════════════ PUNCHES ════════════════════════════

const punchesList = authorizedProcedure("attendance_punch", "read")
	.input(
		z
			.object({
				status: z
					.enum(["pending", "processed", "unmapped", "duplicate", "error"])
					.optional(),
				deviceId: z.string().optional(),
				limit: z.number().int().max(500).optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);
		const conds = [
			eq(attendancePunch.organizationId, orgId(context)),
			isNull(attendancePunch.deletedAt),
		];
		if (input?.status) {
			conds.push(eq(attendancePunch.processingStatus, input.status));
		}
		if (input?.deviceId) {
			conds.push(eq(attendancePunch.deviceId, input.deviceId));
		}
		if (scope !== "all") {
			if (scope.length === 0) {
				return [];
			}
			conds.push(inArray(attendancePunch.employeeId, scope));
		}
		return await db
			.select({
				id: attendancePunch.id,
				deviceId: attendancePunch.deviceId,
				deviceUserId: attendancePunch.deviceUserId,
				employeeId: attendancePunch.employeeId,
				employeeFirstName: employeeProfile.firstName,
				employeeLastName: employeeProfile.lastName,
				punchTime: attendancePunch.punchTime,
				direction: attendancePunch.direction,
				verifyMode: attendancePunch.verifyMode,
				source: attendancePunch.source,
				processingStatus: attendancePunch.processingStatus,
				errorReason: attendancePunch.errorReason,
			})
			.from(attendancePunch)
			.leftJoin(
				employeeProfile,
				eq(attendancePunch.employeeId, employeeProfile.id)
			)
			.where(and(...conds))
			.orderBy(desc(attendancePunch.punchTime))
			.limit(input?.limit ?? 100);
	});

const punchesImportRows = authorizedProcedure("attendance_punch", "import")
	.input(
		z.object({
			deviceId: z.string(),
			providerKey: z.string().optional(),
			csv: z.string(),
			process: z.boolean().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const device = await verifyAttendanceDevice(input.deviceId, orgId(context));
		const adapter = getAdapter(
			input.providerKey ?? providerKeyForDevice(device.vendor, device.mode)
		);
		const { punches, errors } = adapter.parseImportRows(input.csv);

		const runId = createId();
		await db.insert(attendanceDeviceSyncRun).values({
			id: runId,
			organizationId: orgId(context),
			deviceId: input.deviceId,
			mode: "csv_import",
			punchesFetched: punches.length,
			status: "running",
			triggeredByUserId: actorId(context),
		});

		let created = 0;
		let duplicate = 0;
		if (punches.length > 0) {
			const candidates = punches.map((p) => ({
				id: createId(),
				organizationId: orgId(context),
				deviceId: input.deviceId,
				syncRunId: runId,
				deviceUserId: p.deviceUserId,
				punchTime: p.punchTime,
				rawPunchTime: p.punchTime.toISOString(),
				direction: p.direction,
				verifyMode: p.verifyMode,
				source: "import" as const,
				processingStatus: "pending" as const,
				idempotencyKey: punchKey({
					deviceId: input.deviceId,
					deviceUserId: p.deviceUserId,
					employeeId: null,
					punchTime: p.punchTime,
					source: "import",
				}),
			}));
			const keys = candidates.map((c) => c.idempotencyKey);
			const existing = await db
				.select({ k: attendancePunch.idempotencyKey })
				.from(attendancePunch)
				.where(
					and(
						eq(attendancePunch.organizationId, orgId(context)),
						inArray(attendancePunch.idempotencyKey, keys)
					)
				);
			const seen = new Set(existing.map((e) => e.k));
			const fresh = candidates.filter((c) => !seen.has(c.idempotencyKey));
			duplicate = candidates.length - fresh.length;
			created = fresh.length;
			if (fresh.length > 0) {
				await db.insert(attendancePunch).values(fresh);
			}
		}

		await db
			.update(attendanceDeviceSyncRun)
			.set({
				finishedAt: new Date(),
				punchesCreated: created,
				punchesDuplicate: duplicate,
				punchesError: errors.length,
				status: errors.length > 0 ? "partial" : "success",
				errorSummary: errors.length > 0 ? errors.slice(0, 20).join("; ") : null,
			})
			.where(eq(attendanceDeviceSyncRun.id, runId));

		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_device_sync_run",
			entityId: runId,
			action: "create",
			actorId: actorId(context),
			metadata: {
				mode: "csv_import",
				created,
				duplicate,
				errors: errors.length,
			},
		});

		let processSummary: Awaited<
			ReturnType<typeof processPendingPunches>
		> | null = null;
		if (input.process) {
			processSummary = await processPendingPunches(orgId(context));
		}
		return {
			runId,
			created,
			duplicate,
			errors,
			processed: processSummary,
		};
	});

const processorRun = authorizedProcedure("attendance_punch", "process").handler(
	async ({ context }) => {
		const summary = await processPendingPunches(orgId(context));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "attendance_punch",
			entityId: orgId(context),
			action: "update",
			actorId: actorId(context),
			metadata: { action: "process_punches", ...summary },
		});
		return summary;
	}
);

// ════════════════════════════ INGEST (device API-key auth) ════════════════════

// Public: NOT session-based. A device / external sync-agent authenticates with
// its deviceId + ingest API key (verified against the stored hash). The org is
// derived from the device row. Never logs the key; never returns secrets.
const ingestSubmit = publicProcedure
	.input(
		z.object({
			deviceId: z.string(),
			apiKey: z.string(),
			punches: z
				.array(
					z
						.object({
							deviceUserId: z.string().min(1),
							timestamp: z.string(),
							direction: punchDirectionEnum.optional(),
							verifyMode: verifyModeEnum.optional(),
						})
						.passthrough()
				)
				.max(MAX_INGEST_ROWS),
		})
	)
	.handler(async ({ input }) => {
		const [device] = await db
			.select()
			.from(attendanceDevice)
			.where(
				and(
					eq(attendanceDevice.id, input.deviceId),
					eq(attendanceDevice.apiKeyHash, hashKey(input.apiKey)),
					isNull(attendanceDevice.deletedAt)
				)
			)
			.limit(1);
		if (!device) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Invalid device id or ingest key.",
			});
		}

		// Privacy guard — reject any payload carrying biometric template material.
		for (const p of input.punches) {
			if (containsBiometricTemplate(p as Record<string, unknown>)) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Biometric template data is not accepted. Send punch events only.",
				});
			}
		}

		const org = device.organizationId;
		const runId = createId();
		await db.insert(attendanceDeviceSyncRun).values({
			id: runId,
			organizationId: org,
			deviceId: device.id,
			mode: "api_ingest",
			punchesFetched: input.punches.length,
			status: "running",
		});

		let created = 0;
		let duplicate = 0;
		let errored = 0;
		const candidates: (typeof attendancePunch.$inferInsert)[] = [];
		for (const p of input.punches) {
			const t = new Date(
				p.timestamp.includes("T") ? p.timestamp : p.timestamp.replace(" ", "T")
			);
			if (Number.isNaN(t.getTime())) {
				errored += 1;
				continue;
			}
			candidates.push({
				id: createId(),
				organizationId: org,
				deviceId: device.id,
				syncRunId: runId,
				deviceUserId: p.deviceUserId,
				punchTime: t,
				rawPunchTime: p.timestamp,
				direction: p.direction ?? "unknown",
				verifyMode: p.verifyMode ?? "unknown",
				source: "biometric",
				processingStatus: "pending",
				idempotencyKey: punchKey({
					deviceId: device.id,
					deviceUserId: p.deviceUserId,
					employeeId: null,
					punchTime: t,
					source: "biometric",
				}),
			});
		}
		if (candidates.length > 0) {
			const keys = candidates.map((c) => c.idempotencyKey);
			const existing = await db
				.select({ k: attendancePunch.idempotencyKey })
				.from(attendancePunch)
				.where(
					and(
						eq(attendancePunch.organizationId, org),
						inArray(attendancePunch.idempotencyKey, keys)
					)
				);
			const seen = new Set(existing.map((e) => e.k));
			const fresh = candidates.filter((c) => !seen.has(c.idempotencyKey));
			duplicate = candidates.length - fresh.length;
			created = fresh.length;
			if (fresh.length > 0) {
				await db.insert(attendancePunch).values(fresh);
			}
		}

		await db
			.update(attendanceDeviceSyncRun)
			.set({
				finishedAt: new Date(),
				punchesCreated: created,
				punchesDuplicate: duplicate,
				punchesError: errored,
				status: errored > 0 ? "partial" : "success",
			})
			.where(eq(attendanceDeviceSyncRun.id, runId));
		await db
			.update(attendanceDevice)
			.set({ lastSyncCursor: new Date(), lastSyncStatus: "success" })
			.where(eq(attendanceDevice.id, device.id));

		return { runId, created, duplicate, errored };
	});

// ════════════════════════════ GEOFENCES ════════════════════════════

const LAT_MAX = 90;
const LON_MAX = 180;
const RADIUS_MAX = 100_000;

const geofencesList = authorizedProcedure("geofence", "read")
	.input(z.object({ includeInactive: z.boolean().optional() }).optional())
	.handler(async ({ context, input }) => {
		const rows = await db
			.select()
			.from(geofenceLocation)
			.where(
				and(
					eq(geofenceLocation.organizationId, orgId(context)),
					isNull(geofenceLocation.deletedAt)
				)
			)
			.orderBy(desc(geofenceLocation.createdAt));
		return input?.includeInactive ? rows : rows.filter((r) => r.isActive);
	});

const geofencesGetById = authorizedProcedure("geofence", "read")
	.input(z.object({ id: z.string() }))
	.handler(
		async ({ context, input }) =>
			await verifyGeofenceLocation(input.id, orgId(context))
	);

const geofencesCreate = authorizedProcedure("geofence", "manage")
	.input(
		z.object({
			name: z.string().min(1),
			address: z.string().optional(),
			latitude: z.number().min(-LAT_MAX).max(LAT_MAX),
			longitude: z.number().min(-LON_MAX).max(LON_MAX),
			radiusMeters: z.number().int().min(10).max(RADIUS_MAX).default(150),
			accuracyThresholdMeters: z
				.number()
				.int()
				.min(5)
				.max(RADIUS_MAX)
				.default(100),
			allowOutsideWithReason: z.boolean().default(true),
			notes: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const id = createId();
		try {
			await db.insert(geofenceLocation).values({
				id,
				organizationId: orgId(context),
				name: input.name,
				address: input.address,
				latitude: String(input.latitude),
				longitude: String(input.longitude),
				radiusMeters: input.radiusMeters,
				accuracyThresholdMeters: input.accuracyThresholdMeters,
				allowOutsideWithReason: input.allowOutsideWithReason,
				notes: input.notes,
			});
		} catch (err) {
			if (
				String((err as { cause?: unknown })?.cause ?? err).includes("23505")
			) {
				throw new ORPCError("CONFLICT", {
					message: "A work site with this name already exists.",
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "geofence_location",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const geofencesUpdate = authorizedProcedure("geofence", "manage")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).optional(),
			address: z.string().nullable().optional(),
			latitude: z.number().min(-LAT_MAX).max(LAT_MAX).optional(),
			longitude: z.number().min(-LON_MAX).max(LON_MAX).optional(),
			radiusMeters: z.number().int().min(10).max(RADIUS_MAX).optional(),
			accuracyThresholdMeters: z
				.number()
				.int()
				.min(5)
				.max(RADIUS_MAX)
				.optional(),
			allowOutsideWithReason: z.boolean().optional(),
			isActive: z.boolean().optional(),
			notes: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		await verifyGeofenceLocation(input.id, orgId(context));
		const { id, latitude, longitude, ...rest } = input;
		await db
			.update(geofenceLocation)
			.set({
				...rest,
				...(latitude === undefined ? {} : { latitude: String(latitude) }),
				...(longitude === undefined ? {} : { longitude: String(longitude) }),
			})
			.where(eq(geofenceLocation.id, id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "geofence_location",
			entityId: id,
			action: "update",
			actorId: actorId(context),
		});
		return { id };
	});

const geofencesArchive = authorizedProcedure("geofence", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await verifyGeofenceLocation(input.id, orgId(context));
		await db
			.update(geofenceLocation)
			.set({ deletedAt: new Date(), isActive: false })
			.where(eq(geofenceLocation.id, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "geofence_location",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const assignmentsList = authorizedProcedure("geofence", "read")
	.input(z.object({ workSiteId: z.string().optional() }).optional())
	.handler(async ({ context, input }) => {
		const conds = [
			eq(geofenceAssignment.organizationId, orgId(context)),
			isNull(geofenceAssignment.deletedAt),
		];
		if (input?.workSiteId) {
			conds.push(eq(geofenceAssignment.workSiteId, input.workSiteId));
		}
		return await db
			.select()
			.from(geofenceAssignment)
			.where(and(...conds));
	});

const assignmentsCreate = authorizedProcedure("geofence", "manage")
	.input(
		z.object({
			workSiteId: z.string(),
			scope: z.enum(["organization", "department", "employee"]),
			employeeId: z.string().optional(),
			departmentId: z.string().optional(),
			isDefault: z.boolean().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		await verifyGeofenceLocation(input.workSiteId, orgId(context));
		if (input.scope === "employee") {
			if (!input.employeeId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "employeeId is required for an employee-scoped assignment.",
				});
			}
			await verifyEmployeeInOrg(input.employeeId, orgId(context));
		}
		if (input.scope === "department" && !input.departmentId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "departmentId is required for a department-scoped assignment.",
			});
		}
		const id = createId();
		await db.insert(geofenceAssignment).values({
			id,
			organizationId: orgId(context),
			workSiteId: input.workSiteId,
			scope: input.scope,
			employeeId: input.scope === "employee" ? input.employeeId : null,
			departmentId: input.scope === "department" ? input.departmentId : null,
			isDefault: input.isDefault ?? false,
		});
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "geofence_assignment",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const assignmentsDelete = authorizedProcedure("geofence", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [row] = await db
			.select()
			.from(geofenceAssignment)
			.where(
				and(
					eq(geofenceAssignment.id, input.id),
					eq(geofenceAssignment.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Assignment not found." });
		}
		await db
			.update(geofenceAssignment)
			.set({ deletedAt: new Date() })
			.where(eq(geofenceAssignment.id, input.id));
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "geofence_assignment",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════ CHECK-INS (self-service) ════════════════════════

const checkInsCreateSelf = authorizedProcedure("geofence", "check_in")
	.input(
		z.object({
			latitude: z.number().min(-LAT_MAX).max(LAT_MAX),
			longitude: z.number().min(-LON_MAX).max(LON_MAX),
			accuracyMeters: z.number().int().min(0).optional(),
			direction: punchDirectionEnum.default("unknown"),
			outsideReason: z.string().optional(),
			mockLocationFlag: z.boolean().optional(),
			userAgent: z.string().optional(),
			platform: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		// Self-scope: the punch ALWAYS belongs to the caller. No employeeId input.
		const me = await resolveCurrentEmployee(orgId(context), actorId(context));
		if (!me) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "You don't have an employee profile in this organization.",
			});
		}
		const site = await resolveWorkSiteForEmployee(orgId(context), me.id);
		const verdict = evaluateCheckIn({
			site,
			lat: input.latitude,
			lon: input.longitude,
			accuracyMeters: input.accuracyMeters ?? null,
		});

		// Soft-block: outside the fence requires a reason (unless the site permits
		// silent outside check-ins). NEVER trust a client "I'm inside" claim — the
		// verdict above is computed server-side.
		if (
			verdict.status === "outside" &&
			site?.allowOutsideWithReason &&
			!input.outsideReason
		) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"You appear to be outside your work site. Add a reason to check in here.",
			});
		}

		const now = new Date();
		const punchId = createId();
		await db.insert(attendancePunch).values({
			id: punchId,
			organizationId: orgId(context),
			employeeId: me.id,
			punchTime: now,
			rawPunchTime: now.toISOString(),
			direction: input.direction,
			verifyMode: "mobile_gps",
			source: "mobile",
			processingStatus: "pending",
			idempotencyKey: punchKey({
				deviceId: null,
				deviceUserId: null,
				employeeId: me.id,
				punchTime: now,
				source: "mobile",
			}),
		});

		const checkInId = createId();
		await db.insert(geofenceCheckIn).values({
			id: checkInId,
			organizationId: orgId(context),
			employeeId: me.id,
			attendancePunchId: punchId,
			latitude: String(input.latitude),
			longitude: String(input.longitude),
			accuracyMeters: input.accuracyMeters,
			matchedWorkSiteId: verdict.matchedWorkSiteId,
			distanceMeters: verdict.distanceMeters,
			status: verdict.status,
			mockLocationFlag: input.mockLocationFlag ?? false,
			reason: input.outsideReason,
			userAgent: input.userAgent,
			platform: input.platform,
			capturedAt: now,
		});

		// Exceptions for review.
		if (verdict.status === "outside") {
			await db.insert(attendanceException).values({
				id: createId(),
				organizationId: orgId(context),
				employeeId: me.id,
				attendancePunchId: punchId,
				geofenceCheckInId: checkInId,
				type: "outside_geofence",
				severity: "warning",
				status: "open",
				detail: `Checked in ${verdict.distanceMeters ?? "?"}m from the assigned work site. Reason: ${input.outsideReason ?? "none"}.`,
			});
		} else if (verdict.status === "low_accuracy") {
			await db.insert(attendanceException).values({
				id: createId(),
				organizationId: orgId(context),
				employeeId: me.id,
				attendancePunchId: punchId,
				geofenceCheckInId: checkInId,
				type: "low_gps_accuracy",
				severity: "warning",
				status: "open",
				detail: `GPS accuracy ${input.accuracyMeters ?? "?"}m exceeded the site threshold.`,
			});
		}
		if (input.mockLocationFlag) {
			await db.insert(attendanceException).values({
				id: createId(),
				organizationId: orgId(context),
				employeeId: me.id,
				attendancePunchId: punchId,
				geofenceCheckInId: checkInId,
				type: "spoofing_suspected",
				severity: "warning",
				status: "open",
				detail: "Device reported a mock location during check-in.",
			});
		}

		return {
			punchId,
			checkInId,
			status: verdict.status,
			distanceMeters: verdict.distanceMeters,
			withinGeofence: verdict.withinGeofence,
		};
	});

const checkInsListSelf = authorizedProcedure("geofence", "read")
	.input(z.object({ limit: z.number().int().max(100).optional() }).optional())
	.handler(async ({ context, input }) => {
		const me = await resolveCurrentEmployee(orgId(context), actorId(context));
		if (!me) {
			return [];
		}
		return await db
			.select()
			.from(geofenceCheckIn)
			.where(
				and(
					eq(geofenceCheckIn.organizationId, orgId(context)),
					eq(geofenceCheckIn.employeeId, me.id)
				)
			)
			.orderBy(desc(geofenceCheckIn.capturedAt))
			.limit(input?.limit ?? 30);
	});

// ════════════════════════════ EXCEPTIONS ════════════════════════════

const exceptionsList = authorizedProcedure("attendance_exception", "read")
	.input(
		z
			.object({
				status: z
					.enum(["open", "in_review", "resolved", "dismissed"])
					.optional(),
				severity: z.enum(["info", "warning", "blocker"]).optional(),
				limit: z.number().int().max(500).optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);
		const conds = [eq(attendanceException.organizationId, orgId(context))];
		if (input?.status) {
			conds.push(eq(attendanceException.status, input.status));
		}
		if (input?.severity) {
			conds.push(eq(attendanceException.severity, input.severity));
		}
		if (scope !== "all") {
			if (scope.length === 0) {
				return [];
			}
			conds.push(inArray(attendanceException.employeeId, scope));
		}
		return await db
			.select({
				id: attendanceException.id,
				type: attendanceException.type,
				severity: attendanceException.severity,
				status: attendanceException.status,
				detail: attendanceException.detail,
				employeeId: attendanceException.employeeId,
				employeeFirstName: employeeProfile.firstName,
				employeeLastName: employeeProfile.lastName,
				deviceId: attendanceException.deviceId,
				attendancePunchId: attendanceException.attendancePunchId,
				geofenceCheckInId: attendanceException.geofenceCheckInId,
				resolutionNote: attendanceException.resolutionNote,
				createdAt: attendanceException.createdAt,
				resolvedAt: attendanceException.resolvedAt,
			})
			.from(attendanceException)
			.leftJoin(
				employeeProfile,
				eq(attendanceException.employeeId, employeeProfile.id)
			)
			.where(and(...conds))
			.orderBy(desc(attendanceException.createdAt))
			.limit(input?.limit ?? 100);
	});

const exceptionsGetById = authorizedProcedure("attendance_exception", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const row = await verifyAttendanceException(input.id, orgId(context));
		const scope = await scopedEmployeeIds(
			orgId(context),
			actorId(context),
			role(context)
		);
		assertEmployeeVisible(row.employeeId, scope);
		return row;
	});

async function transitionException(
	context: { organizationId: string; session: { user: { id: string } } },
	memberRole: string,
	id: string,
	next: "in_review" | "resolved" | "dismissed",
	note: string | undefined,
	requireNote: boolean
) {
	const row = await verifyAttendanceException(id, orgId(context));
	const scope = await scopedEmployeeIds(
		orgId(context),
		actorId(context),
		memberRole
	);
	assertEmployeeVisible(row.employeeId, scope);
	if (requireNote && (!note || note.trim() === "")) {
		throw new ORPCError("BAD_REQUEST", { message: "A note is required." });
	}
	await db
		.update(attendanceException)
		.set({
			status: next,
			resolutionNote: note ?? row.resolutionNote,
			resolutionAction: next,
			resolvedBy: next === "in_review" ? null : actorId(context),
			resolvedAt: next === "in_review" ? null : new Date(),
		})
		.where(eq(attendanceException.id, id));
	await createAuditEvent(db as never, {
		organizationId: orgId(context),
		entityType: "attendance_exception",
		entityId: id,
		action: "update",
		actorId: actorId(context),
		metadata: { action: next },
	});
	return { id };
}

const exceptionsAcknowledge = authorizedProcedure(
	"attendance_exception",
	"resolve"
)
	.input(z.object({ id: z.string(), note: z.string().optional() }))
	.handler(({ context, input }) =>
		transitionException(
			context,
			role(context),
			input.id,
			"in_review",
			input.note,
			false
		)
	);

const exceptionsResolve = authorizedProcedure("attendance_exception", "resolve")
	.input(z.object({ id: z.string(), note: z.string().min(1) }))
	.handler(({ context, input }) =>
		transitionException(
			context,
			role(context),
			input.id,
			"resolved",
			input.note,
			true
		)
	);

const exceptionsDismiss = authorizedProcedure("attendance_exception", "resolve")
	.input(z.object({ id: z.string(), note: z.string().min(1) }))
	.handler(({ context, input }) =>
		transitionException(
			context,
			role(context),
			input.id,
			"dismissed",
			input.note,
			true
		)
	);

export const biometricRouter = {
	devices: {
		list: devicesList,
		getById: devicesGetById,
		create: devicesCreate,
		update: devicesUpdate,
		rotateIngestKey: devicesRotateIngestKey,
		archive: devicesArchive,
		testConnection: devicesTestConnection,
		adapters: adaptersList,
	},
	mappings: {
		list: mappingsList,
		create: mappingsCreate,
		delete: mappingsDelete,
	},
	syncRuns: {
		list: syncRunsList,
		getById: syncRunsGetById,
	},
	punches: {
		list: punchesList,
		importRows: punchesImportRows,
	},
	processor: {
		run: processorRun,
	},
	ingest: {
		submit: ingestSubmit,
	},
	geofences: {
		list: geofencesList,
		getById: geofencesGetById,
		create: geofencesCreate,
		update: geofencesUpdate,
		archive: geofencesArchive,
	},
	assignments: {
		list: assignmentsList,
		create: assignmentsCreate,
		delete: assignmentsDelete,
	},
	checkIns: {
		createSelf: checkInsCreateSelf,
		listSelf: checkInsListSelf,
	},
	exceptions: {
		list: exceptionsList,
		getById: exceptionsGetById,
		acknowledge: exceptionsAcknowledge,
		resolve: exceptionsResolve,
		dismiss: exceptionsDismiss,
	},
};
