import { describe, expect, test } from "bun:test";
import {
	directionFor,
	mapAttendanceDevice,
	mapAttendancePunch,
	mapDeviceEmployeeMap,
	punchIdempotencyKey,
	type V1AttPunch,
} from "./transformers-attendance";

const ORG = "org_test";

describe("directionFor — v1 punch_type → v2 direction", () => {
	test("in / overtime_in → in", () => {
		expect(directionFor("in")).toBe("in");
		expect(directionFor("overtime_in")).toBe("in");
	});
	test("out / overtime_out → out", () => {
		expect(directionFor("out")).toBe("out");
		expect(directionFor("overtime_out")).toBe("out");
	});
	test("break_* and unknown → unknown", () => {
		expect(directionFor("break_start")).toBe("unknown");
		expect(directionFor("break_end")).toBe("unknown");
		expect(directionFor("whatever")).toBe("unknown");
	});
});

describe("punchIdempotencyKey — matches the live ingest formula", () => {
	const t = new Date("2026-06-01T13:30:00.000Z");
	const epoch = Math.floor(t.getTime() / 1000);
	test("device punch: dev|deviceId|deviceUserId|epoch", () => {
		expect(punchIdempotencyKey("dev1", "5", t)).toBe(`dev|dev1|5|${epoch}`);
	});
	test("device punch with no user → nouser", () => {
		expect(punchIdempotencyKey("dev1", null, t)).toBe(
			`dev|dev1|nouser|${epoch}`
		);
	});
	test("same punch yields the same key (idempotent)", () => {
		expect(punchIdempotencyKey("dev1", "5", t)).toBe(
			punchIdempotencyKey("dev1", "5", new Date("2026-06-01T13:30:00.000Z"))
		);
	});
});

describe("mapAttendanceDevice — v1 device → v2 zkteco device", () => {
	const v1 = {
		id: "k40-1",
		deviceId: "K40-RECEPTION",
		deviceType: "zkteco_k40",
		locationName: "Reception",
		ipAddress: "10.241.1.109",
		port: 4370,
		isActive: true,
	};
	test("preserves id, vendor zkteco, api_ingest, host/port, status", () => {
		const row = mapAttendanceDevice(v1, ORG);
		expect(row.id).toBe("k40-1");
		expect(row.vendor).toBe("zkteco");
		expect(row.deviceType).toBe("zkteco");
		expect(row.mode).toBe("api_ingest");
		expect(row.host).toBe("10.241.1.109");
		expect(row.port).toBe(4370);
		expect(row.status).toBe("active");
		expect(row.timeZone).toBe("America/Guyana");
	});
	test("keeps v1's (cosmetic) label as model + supports fingerprint/face", () => {
		const row = mapAttendanceDevice(v1, ORG);
		expect(row.model).toBe("zkteco_k40");
		expect(row.supportedPunchMethods).toContain("fingerprint");
		expect(row.supportedPunchMethods).toContain("face");
	});
	test("inactive v1 device → inactive", () => {
		expect(mapAttendanceDevice({ ...v1, isActive: false }, ORG).status).toBe(
			"inactive"
		);
	});
});

describe("mapDeviceEmployeeMap — slot → employee, stable deviceUserId", () => {
	test("mapped user → row with deviceUserId=slot string + serial", () => {
		const row = mapDeviceEmployeeMap(
			{
				id: "u1",
				deviceId: "k40-1",
				slotIndex: 5,
				name: "Sample",
				employeeId: "emp_1",
			},
			ORG
		);
		expect(row?.deviceUserId).toBe("5");
		expect(row?.deviceUserSerial).toBe(5);
		expect(row?.employeeId).toBe("emp_1");
		expect(row?.deviceId).toBe("k40-1");
	});
	test("unmapped slot (no employee) → null (don't guess)", () => {
		expect(
			mapDeviceEmployeeMap(
				{
					id: "u2",
					deviceId: "k40-1",
					slotIndex: 9,
					name: "Enrolled",
					employeeId: null,
				},
				ORG
			)
		).toBeNull();
	});
});

describe("mapAttendancePunch — raw staging, preserved, deduped", () => {
	function punch(overrides: Partial<V1AttPunch>): V1AttPunch {
		return {
			id: "p1",
			employeeId: "emp_1",
			punchAt: "2026-06-01T13:30:00.000Z",
			punchType: "in",
			source: "device",
			deviceId: "k40-1",
			deviceTimestamp: "2026-06-01T13:30:00.000Z",
			...overrides,
		};
	}
	test("carries org/device/employee, direction, source=import, UTC punchTime", () => {
		const row = mapAttendancePunch(punch({}), ORG, "5");
		expect(row.organizationId).toBe(ORG);
		expect(row.deviceId).toBe("k40-1");
		expect(row.employeeId).toBe("emp_1");
		expect(row.deviceUserId).toBe("5");
		expect(row.direction).toBe("in");
		expect(row.source).toBe("import");
		expect(row.punchTime.toISOString()).toBe("2026-06-01T13:30:00.000Z");
	});
	test("preserves the raw v1 punch in rawPayload + rawPunchTime", () => {
		const row = mapAttendancePunch(
			punch({ id: "px", punchType: "overtime_out", source: "device" }),
			ORG,
			"5"
		);
		expect((row.rawPayload as { v1PunchId: string }).v1PunchId).toBe("px");
		expect((row.rawPayload as { v1PunchType: string }).v1PunchType).toBe(
			"overtime_out"
		);
		expect(row.direction).toBe("out");
		expect(row.rawPunchTime).toBe("2026-06-01T13:30:00.000Z");
	});
	test("idempotencyKey matches the live ingest formula", () => {
		const row = mapAttendancePunch(punch({}), ORG, "5");
		const epoch = Math.floor(
			new Date("2026-06-01T13:30:00.000Z").getTime() / 1000
		);
		expect(row.idempotencyKey).toBe(`dev|k40-1|5|${epoch}`);
	});
	test("a punch with no v1 employee stays null (→ processor unmapped queue)", () => {
		expect(
			mapAttendancePunch(punch({ employeeId: null }), ORG, "5").employeeId
		).toBeNull();
	});
});
