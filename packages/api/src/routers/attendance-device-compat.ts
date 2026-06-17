/**
 * Attendance device v1-compat ingest (Phase 21V interim shim).
 *
 * The on-site Raspberry Pi bridge still posts the *v1* attendance routes
 * (`/rpc/attendance/devices/{recordBatchFromDevice,heartbeat,recordDeviceUsers}`)
 * with `Authorization: Bearer <device key>` headers and the v1 punch shape
 * (employeeExternalId / deviceTimestamp / punchType). v2's native ingest lives at
 * `/rpc/biometric/ingest/submit` with a different (body-auth, deviceUserId)
 * shape, so the Pi's posts 404 today.
 *
 * Rather than require an on-site re-point of the Pi, this shim accepts the v1
 * posts verbatim, authenticates the device by its bearer key (sha256-hex hash —
 * byte-identical to BOTH v1 and v2's native ingest), translates the v1 punch
 * shape into v2 `attendance_punch` rows, and runs the SAME punch processor. The
 * idempotency key matches `biometric.ts` `punchKey`, so re-sends + the historical
 * backfill all dedupe to no-ops (no double-count).
 *
 * GUARDRAIL: device-key authenticated (NOT an unauthenticated public write);
 * NEVER logs the key; writes ONLY attendance_punch + sync-run rows and runs the
 * processor; never touches payroll. Remove once the Pi is re-pointed to the
 * native v2 endpoint (Phase 21V proper).
 */

import { db } from "@Heimdallone/db";
import {
	attendanceDevice,
	attendanceDeviceSyncRun,
	attendancePunch,
} from "@Heimdallone/db/schema/biometric";
import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure } from "../index";
import { processPendingPunches } from "../utils/biometric-processor";

const MAX_COMPAT_ROWS = 1000;
const SECONDS_PER_MS = 1000;

// sha256-hex — byte-identical to v1's device key hash AND v2's native ingest
// (`biometric.ts` hashKey), so the Pi's EXISTING key authenticates unchanged.
function hashIngestKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}

// v1 punchType → v2 direction (mirror of the migration transformer
// DIRECTION_BY_TYPE; break_* carry no in/out semantics in v2).
const DIRECTION_BY_TYPE: Record<string, "in" | "out" | "unknown"> = {
	in: "in",
	overtime_in: "in",
	out: "out",
	overtime_out: "out",
	break_start: "unknown",
	break_end: "unknown",
};

// MUST match biometric.ts punchKey so a live re-send and the historical backfill
// of the same punch dedupe to a no-op.
function punchKey(
	deviceId: string,
	deviceUserId: string | null,
	punchTime: Date
): string {
	const epoch = Math.floor(punchTime.getTime() / SECONDS_PER_MS);
	return `dev|${deviceId}|${deviceUserId ?? "nouser"}|${epoch}`;
}

interface CompatContext {
	reqHeaders: Headers;
}

const BEARER_RE = /^Bearer\s+(.+)$/i;

// Authenticate the device from the `Authorization: Bearer <key>` header. The Pi
// also sends the v1 `X-Heimdall-Device-Id`, but v2 resolves purely by the key
// hash (the v1 id is meaningless here), so the Pi needs no change. Returns the
// active v2 device row or throws.
async function authenticateDevice(reqHeaders: Headers) {
	const authz = reqHeaders.get("authorization") ?? "";
	const match = BEARER_RE.exec(authz.trim());
	if (!match) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Missing device bearer token.",
		});
	}
	const key = match[1].trim();
	const [device] = await db
		.select()
		.from(attendanceDevice)
		.where(
			and(
				eq(attendanceDevice.apiKeyHash, hashIngestKey(key)),
				isNull(attendanceDevice.deletedAt)
			)
		)
		.limit(1);
	if (!device) {
		throw new ORPCError("UNAUTHORIZED", { message: "Invalid device key." });
	}
	if (device.status !== "active") {
		throw new ORPCError("FORBIDDEN", {
			message: "This device is not active.",
		});
	}
	return device;
}

function parseDeviceTimestamp(value: string): Date {
	return new Date(value.includes("T") ? value : value.replace(" ", "T"));
}

const recordBatchFromDevice = publicProcedure
	.input(
		z.object({
			punches: z
				.array(
					z
						.object({
							employeeExternalId: z.string().min(1),
							deviceTimestamp: z.string(),
							punchType: z.string(),
							deviceSideId: z.union([z.number(), z.string()]).optional(),
						})
						.passthrough()
				)
				.max(MAX_COMPAT_ROWS),
		})
	)
	.handler(async ({ input, context }) => {
		const device = await authenticateDevice(
			(context as CompatContext).reqHeaders
		);
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

		let errored = 0;
		const candidates: (typeof attendancePunch.$inferInsert)[] = [];
		for (const p of input.punches) {
			const t = parseDeviceTimestamp(p.deviceTimestamp);
			if (Number.isNaN(t.getTime())) {
				errored += 1;
				continue;
			}
			candidates.push({
				id: createId(),
				organizationId: org,
				deviceId: device.id,
				syncRunId: runId,
				deviceUserId: p.employeeExternalId,
				punchTime: t,
				rawPunchTime: p.deviceTimestamp,
				direction: DIRECTION_BY_TYPE[p.punchType] ?? "unknown",
				verifyMode: "unknown",
				source: "biometric",
				processingStatus: "pending",
				idempotencyKey: punchKey(device.id, p.employeeExternalId, t),
				rawPayload: {
					v1PunchType: p.punchType,
					v1DeviceSideId: p.deviceSideId ?? null,
				},
			});
		}

		let created = 0;
		let duplicate = 0;
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

		// Best-effort processing — a processor hiccup must not fail the ingest
		// (the punches are already durably staged + idempotent).
		let processed: Awaited<ReturnType<typeof processPendingPunches>> | null =
			null;
		try {
			processed = await processPendingPunches(org);
		} catch {
			processed = null;
		}

		return { runId, created, duplicate, errored, processed };
	});

const heartbeat = publicProcedure
	.input(z.object({}).passthrough().optional())
	.handler(async ({ context }) => {
		const device = await authenticateDevice(
			(context as CompatContext).reqHeaders
		);
		await db
			.update(attendanceDevice)
			.set({ lastSyncCursor: new Date(), lastSyncStatus: "success" })
			.where(eq(attendanceDevice.id, device.id));
		return { ok: true, pendingSync: false };
	});

const recordDeviceUsers = publicProcedure
	.input(z.object({}).passthrough().optional())
	.handler(async ({ context }) => {
		// The v2 device→employee map is owned in-app
		// (attendance_device_employee_map). Accept the v1 user-list push as a
		// no-op so the Pi stops 404ing; we never auto-create maps from
		// device-reported names (privacy + correctness).
		await authenticateDevice((context as CompatContext).reqHeaders);
		return { ok: true };
	});

export const attendanceDeviceCompat = {
	recordBatchFromDevice,
	heartbeat,
	recordDeviceUsers,
};
