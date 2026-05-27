/**
 * Attendance seed — creates 2+ weeks of realistic attendance data for
 * Atlas Shipping demo org. Requires seed-hr-core.ts to have run first.
 *
 * Usage:
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-attendance.ts
 */

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { createDb } from "../packages/db/src/index";
import {
	attendanceCorrection,
	attendanceEvent,
	attendanceRecord,
	attendanceSetting,
	employeeProfile,
	employeeWorkInfo,
	holiday,
	organization,
	shift,
	user,
} from "../packages/db/src/schema";

const db = createDb();

function toDate(dateStr: string): Date {
	return new Date(`${dateStr}T00:00:00`);
}

function toTimestamp(dateStr: string, time: string): Date {
	return new Date(`${dateStr}T${time}:00-04:00`);
}

function minutesBetween(a: Date, b: Date): number {
	return Math.round((b.getTime() - a.getTime()) / 60_000);
}

function isWeekend(dateStr: string): boolean {
	const dow = new Date(dateStr).getDay();
	return dow === 0 || dow === 6;
}

function classifyDay(dateStr: string, isHol: boolean): string {
	const dow = new Date(dateStr).getDay();
	if (isHol) {
		return "holiday";
	}
	if (dow === 6) {
		return "saturday";
	}
	if (dow === 0) {
		return "sunday";
	}
	return "weekday";
}

interface DaySeed {
	approvedOt?: boolean;
	breakEvents?: { clockIn: string; clockOut: string }[];
	clockIn: string;
	clockOut: string | null;
	dateStr: string;
	dayType?: "weekday" | "saturday" | "sunday" | "holiday";
	earlyMin?: number;
	employeeId: string;
	isHoliday?: boolean;
	lateMin?: number;
	notes?: string;
	otMinutes?: number;
	payrollStatus?: "pending" | "approved" | "payroll_locked";
	shiftId: string;
	status?: "present" | "half_day" | "absent" | "holiday" | "conflict";
	validated?: boolean;
}

function generateDates(startDate: string, endDate: string): string[] {
	const dates: string[] = [];
	const start = new Date(startDate);
	const end = new Date(endDate);
	for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
		dates.push(dt.toISOString().slice(0, 10));
	}
	return dates;
}

function pushAndGet(arr: DaySeed[], item: DaySeed): DaySeed {
	arr.push(item);
	return item;
}

async function loadOrgData() {
	const orgs = await db
		.select()
		.from(organization)
		.where(eq(organization.slug, "atlas-shipping"))
		.limit(1);

	const org = orgs.at(0);
	if (!org) {
		console.error("Atlas Shipping org not found. Run seed-dev.ts first.");
		process.exit(1);
	}

	const orgId = org.id;
	console.log(`Org: Atlas Shipping (${orgId})`);

	const employees = await db
		.select({
			id: employeeProfile.id,
			email: employeeProfile.email,
			firstName: employeeProfile.firstName,
			lastName: employeeProfile.lastName,
			shiftId: employeeWorkInfo.shiftId,
		})
		.from(employeeProfile)
		.leftJoin(
			employeeWorkInfo,
			eq(employeeProfile.id, employeeWorkInfo.employeeId)
		)
		.where(eq(employeeProfile.organizationId, orgId));

	if (employees.length === 0) {
		console.error("No employees found. Run seed-hr-core.ts first.");
		process.exit(1);
	}

	const empByEmail = new Map(employees.map((e) => [e.email, e]));
	console.log(`Found ${employees.length} employees`);

	const shifts = await db
		.select()
		.from(shift)
		.where(eq(shift.organizationId, orgId));
	const dayShift = shifts.find((s) => s.name === "Day Shift");

	if (!dayShift) {
		console.error("Day Shift not found. Run seed-hr-core.ts first.");
		process.exit(1);
	}

	const holidayRows = await db
		.select()
		.from(holiday)
		.where(eq(holiday.organizationId, orgId));
	const holidayDates = new Set(
		holidayRows.map((h) => {
			const sd = h.startDate;
			return sd instanceof Date ? sd.toISOString().slice(0, 10) : String(sd);
		})
	);

	const users = await db.select().from(user).limit(5);
	const adminUserId = users.at(0)?.id;

	return { orgId, empByEmail, dayShift, holidayDates, adminUserId };
}

function buildSeeds(
	empByEmail: Map<string, { id: string }>,
	dayShiftId: string,
	holidayDates: Set<string>
): DaySeed[] {
	const maya = empByEmail.get("maya.persaud@atlas-shipping.com");
	const rohan = empByEmail.get("rohan.gopaul@atlas-shipping.com");
	const shanice = empByEmail.get("shanice.powell@atlas-shipping.com");
	const devon = empByEmail.get("devon.ali@atlas-shipping.com");
	const kareena = empByEmail.get("kareena.ramnath@atlas-shipping.com");
	const andre = empByEmail.get("andre.sealey@atlas-shipping.com");

	if (!(maya && rohan && shanice && devon && kareena && andre)) {
		console.error("Missing expected employees.");
		process.exit(1);
	}

	const seeds: DaySeed[] = [];
	const allDates = generateDates("2026-05-12", "2026-05-27");

	for (const dateStr of allDates) {
		if (isWeekend(dateStr)) {
			continue;
		}

		const isHol = holidayDates.has(dateStr);
		const dt = classifyDay(dateStr, isHol) as DaySeed["dayType"];

		if (isHol) {
			for (const emp of [maya, rohan, shanice, devon, kareena, andre]) {
				seeds.push({
					employeeId: emp.id,
					shiftId: dayShiftId,
					dateStr,
					clockIn: "08:00",
					clockOut: "08:00",
					status: "holiday",
					isHoliday: true,
					dayType: "holiday",
					validated: true,
					payrollStatus: "approved",
				});
			}
			continue;
		}

		const payroll = (ds: string) =>
			(ds < "2026-05-20" ? "approved" : "pending") as const;

		addMayaRecord(seeds, maya.id, dayShiftId, dateStr, dt, payroll(dateStr));
		addRohanRecord(seeds, rohan.id, dayShiftId, dateStr, dt, payroll(dateStr));
		addShaniceRecord(
			seeds,
			shanice.id,
			dayShiftId,
			dateStr,
			dt,
			payroll(dateStr)
		);
		addDevonRecord(seeds, devon.id, dayShiftId, dateStr, dt, payroll(dateStr));
		addKareenaRecord(
			seeds,
			kareena.id,
			dayShiftId,
			dateStr,
			dt,
			payroll(dateStr)
		);
		addAndreRecord(seeds, andre.id, dayShiftId, dateStr, dt, payroll(dateStr));
	}

	return seeds;
}

function addMayaRecord(
	seeds: DaySeed[],
	empId: string,
	shiftId: string,
	dateStr: string,
	dt: DaySeed["dayType"],
	ps: "approved" | "pending"
) {
	const rec = pushAndGet(seeds, {
		employeeId: empId,
		shiftId,
		dateStr,
		clockIn: "07:55",
		clockOut: "17:05",
		validated: true,
		payrollStatus: ps,
		dayType: dt,
	});

	if (dateStr === "2026-05-14") {
		rec.clockOut = "18:30";
		rec.otMinutes = 90;
		rec.approvedOt = true;
		rec.notes = "Covered late shipment processing";
	}

	if (dateStr === "2026-05-15") {
		rec.breakEvents = [{ clockIn: "12:00", clockOut: "13:00" }];
	}
}

function addRohanRecord(
	seeds: DaySeed[],
	empId: string,
	shiftId: string,
	dateStr: string,
	dt: DaySeed["dayType"],
	ps: "approved" | "pending"
) {
	const rec = pushAndGet(seeds, {
		employeeId: empId,
		shiftId,
		dateStr,
		clockIn: "08:22",
		clockOut: "17:00",
		lateMin: 7,
		validated: true,
		payrollStatus: ps,
		dayType: dt,
	});

	if (dateStr === "2026-05-13") {
		rec.clockIn = "08:45";
		rec.lateMin = 30;
		rec.notes = "Traffic delay, reported to manager";
	}
}

function addShaniceRecord(
	seeds: DaySeed[],
	empId: string,
	shiftId: string,
	dateStr: string,
	dt: DaySeed["dayType"],
	ps: "approved" | "pending"
) {
	const rec = pushAndGet(seeds, {
		employeeId: empId,
		shiftId,
		dateStr,
		clockIn: "07:50",
		clockOut: "17:00",
		validated: dateStr < "2026-05-22",
		payrollStatus: ps,
		dayType: dt,
	});

	if (dateStr === "2026-05-16") {
		rec.clockOut = "19:00";
		rec.otMinutes = 120;
		rec.approvedOt = false;
		rec.notes = "OT pending approval";
	}
}

function addDevonRecord(
	seeds: DaySeed[],
	empId: string,
	shiftId: string,
	dateStr: string,
	dt: DaySeed["dayType"],
	ps: "approved" | "pending"
) {
	if (dateStr === "2026-05-19") {
		seeds.push({
			employeeId: empId,
			shiftId,
			dateStr,
			clockIn: "08:00",
			clockOut: "08:00",
			status: "absent",
			validated: true,
			payrollStatus: "approved",
			dayType: dt,
			notes: "Absent — no leave submitted",
		});
		return;
	}

	const rec = pushAndGet(seeds, {
		employeeId: empId,
		shiftId,
		dateStr,
		clockIn: "08:00",
		clockOut: "17:00",
		validated: true,
		payrollStatus: ps,
		dayType: dt,
	});

	if (dateStr === "2026-05-20") {
		rec.clockOut = null;
		rec.status = "conflict";
		rec.validated = false;
		rec.notes = "Missing clock-out exception";
	}

	if (dateStr === "2026-05-21") {
		rec.clockOut = "15:30";
		rec.earlyMin = 90;
		rec.notes = "Left early for appointment";
	}
}

function addKareenaRecord(
	seeds: DaySeed[],
	empId: string,
	shiftId: string,
	dateStr: string,
	dt: DaySeed["dayType"],
	ps: "approved" | "pending"
) {
	const rec = pushAndGet(seeds, {
		employeeId: empId,
		shiftId,
		dateStr,
		clockIn: "08:00",
		clockOut: "17:00",
		validated: true,
		payrollStatus: ps,
		dayType: dt,
	});

	if (dateStr === "2026-05-14") {
		rec.clockOut = "12:00";
		rec.status = "half_day";
	}
}

function addAndreRecord(
	seeds: DaySeed[],
	empId: string,
	shiftId: string,
	dateStr: string,
	dt: DaySeed["dayType"],
	ps: "approved" | "pending"
) {
	seeds.push({
		employeeId: empId,
		shiftId,
		dateStr,
		clockIn: "08:05",
		clockOut: "18:00",
		otMinutes: 55,
		approvedOt: dateStr < "2026-05-20",
		validated: true,
		payrollStatus: ps,
		dayType: dt,
	});
}

const MIN_MINUTES = 495;
const BREAK_DEDUCTION = 60;

function resolveClockOut(seed: DaySeed): Date | null {
	if (!seed.clockOut) {
		return null;
	}
	if (seed.clockOut === seed.clockIn) {
		return null;
	}
	return toTimestamp(seed.dateStr, seed.clockOut);
}

function buildRecordValues(
	seed: DaySeed,
	orgId: string,
	netWorked: number,
	breakDed: number,
	adminUserId: string | undefined
) {
	const ot = seed.otMinutes ?? Math.max(0, netWorked - MIN_MINUTES);
	const payable = computePayable(seed.status, netWorked);
	const approvedOt = seed.approvedOt ?? false;

	return {
		id: createId(),
		organizationId: orgId,
		employeeId: seed.employeeId,
		date: toDate(seed.dateStr),
		shiftId: seed.shiftId,
		firstClockIn: seed.clockIn,
		lastClockOut: seed.clockOut,
		workedMinutes: netWorked,
		minimumMinutes: MIN_MINUTES,
		payableMinutes: payable + (approvedOt ? ot : 0),
		overtimeMinutes: ot,
		approvedOvertimeMinutes: approvedOt ? ot : 0,
		lateMinutes: seed.lateMin ?? 0,
		earlyLeaveMinutes: seed.earlyMin ?? 0,
		breakDeductedMinutes: breakDed,
		status: seed.status ?? "present",
		dayType: seed.dayType ?? "weekday",
		isValidated: seed.validated ?? false,
		validatedBy: seed.validated ? adminUserId : null,
		validatedAt: seed.validated ? new Date() : null,
		isOvertimeApproved: approvedOt,
		overtimeApprovedBy: approvedOt && adminUserId ? adminUserId : null,
		isHoliday: seed.isHoliday ?? false,
		payrollStatus: seed.payrollStatus ?? "pending",
		notes: seed.notes,
	};
}

async function insertOneSeed(
	orgId: string,
	seed: DaySeed,
	adminUserId: string | undefined
): Promise<{ events: number }> {
	const clockInTs = toTimestamp(seed.dateStr, seed.clockIn);
	const clockOutTs = resolveClockOut(seed);
	const dur = clockOutTs ? minutesBetween(clockInTs, clockOutTs) : null;
	let events = 0;

	await db.insert(attendanceEvent).values({
		id: createId(),
		organizationId: orgId,
		employeeId: seed.employeeId,
		eventDate: toDate(seed.dateStr),
		clockIn: clockInTs,
		clockOut: clockOutTs,
		durationMinutes: dur,
		source: "manual",
		notes: seed.notes,
	});
	events++;

	if (seed.breakEvents) {
		for (const brk of seed.breakEvents) {
			await db.insert(attendanceEvent).values({
				id: createId(),
				organizationId: orgId,
				employeeId: seed.employeeId,
				eventDate: toDate(seed.dateStr),
				clockIn: toTimestamp(seed.dateStr, brk.clockIn),
				clockOut: toTimestamp(seed.dateStr, brk.clockOut),
				durationMinutes: minutesBetween(
					toTimestamp(seed.dateStr, brk.clockIn),
					toTimestamp(seed.dateStr, brk.clockOut)
				),
				source: "manual",
			});
			events++;
		}
	}

	const worked = dur ?? 0;
	const breakDed = worked > BREAK_DEDUCTION * 6 ? BREAK_DEDUCTION : 0;
	const netWorked = Math.max(0, worked - breakDed);

	await db
		.insert(attendanceRecord)
		.values(buildRecordValues(seed, orgId, netWorked, breakDed, adminUserId));

	return { events };
}

async function insertAttendance(
	orgId: string,
	seeds: DaySeed[],
	adminUserId: string | undefined
) {
	let eventCount = 0;
	let recordCount = 0;

	for (const seed of seeds) {
		const { events } = await insertOneSeed(orgId, seed, adminUserId);
		eventCount += events;
		recordCount++;
	}

	return { eventCount, recordCount };
}

function computePayable(status: string | undefined, netWorked: number): number {
	if (status === "absent" || status === "holiday") {
		return 0;
	}
	if (status === "half_day") {
		return Math.round(MIN_MINUTES / 2);
	}
	return Math.min(netWorked, MIN_MINUTES);
}

async function insertCorrections(
	orgId: string,
	devonId: string,
	rohanId: string,
	adminUserId: string | undefined
) {
	await db.insert(attendanceCorrection).values({
		id: createId(),
		organizationId: orgId,
		employeeId: devonId,
		category: "forgot_clock_out",
		requestedChanges: {
			date: "2026-05-20",
			clockOut: "17:00",
			reason: "Forgot to clock out, left at normal time",
		},
		reason: "I forgot to clock out on May 20. I left at 5:00 PM as usual.",
		status: "pending",
	});

	await db.insert(attendanceCorrection).values({
		id: createId(),
		organizationId: orgId,
		employeeId: rohanId,
		category: "wrong_time",
		requestedChanges: {
			date: "2026-05-13",
			clockIn: "08:15",
			reason: "Was in the building at 8:15 but badge reader was slow",
		},
		reason:
			"Badge reader took 30 seconds to register. I was actually at my desk by 8:15.",
		status: "approved",
		reviewedBy: adminUserId,
		reviewNote: "Verified with building access logs. Adjusted to 8:15.",
		reviewedAt: new Date(),
	});

	console.log("  Created 2 correction requests (1 pending, 1 approved)");
}

async function main() {
	console.log("\nHeimdallone Attendance Seed");
	console.log("---");

	const { orgId, empByEmail, dayShift, holidayDates, adminUserId } =
		await loadOrgData();

	console.log("\n1. Attendance Settings");
	await db.insert(attendanceSetting).values({
		id: createId(),
		organizationId: orgId,
		enableCheckIn: true,
		graceTimeMinutes: 15,
		overtimeCutoffMinutes: 180,
		breakDeductionMinutes: 60,
		breakDeductionThresholdMinutes: 360,
		enableAutoCheckout: false,
	});
	console.log("  Created attendance settings");

	console.log("\n2. Attendance Events & Records");
	const seeds = buildSeeds(empByEmail, dayShift.id, holidayDates);
	const devon = empByEmail.get("devon.ali@atlas-shipping.com");
	const rohan = empByEmail.get("rohan.gopaul@atlas-shipping.com");

	const { eventCount, recordCount } = await insertAttendance(
		orgId,
		seeds,
		adminUserId
	);
	console.log(`  Created ${eventCount} attendance events`);
	console.log(`  Created ${recordCount} attendance records`);

	console.log("\n3. Correction Requests");
	if (devon && rohan) {
		await insertCorrections(orgId, devon.id, rohan.id, adminUserId);
	}

	console.log("\n---");
	console.log("Attendance seed complete!");
	console.log("  Settings: 1");
	console.log(`  Events: ${eventCount}`);
	console.log(`  Records: ${recordCount}`);
	console.log("  Corrections: 2");
	process.exit(0);
}

main().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
