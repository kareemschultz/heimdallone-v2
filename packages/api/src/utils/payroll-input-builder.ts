import { db } from "@Heimdallone/db";
import {
	attendanceEvent,
	attendanceRecord,
	attendanceSetting,
} from "@Heimdallone/db/schema/attendance";
import {
	attendanceException,
	attendancePunch,
	geofenceCheckIn,
} from "@Heimdallone/db/schema/biometric";
import {
	contract,
	department,
	employeeProfile,
	employeeStatutory,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import { leaveRequest, leaveType } from "@Heimdallone/db/schema/leave";
import {
	loan,
	loanInstallment,
	payItem,
	payItemAssignment,
	payPeriod,
	payrollSetting,
	reimbursement,
} from "@Heimdallone/db/schema/payroll";
import { toCents } from "@Heimdallone/payroll-engine/money";
import type {
	AttendanceInput,
	ContractInput,
	CountryPayrollProfileInput,
	EmployeeInput,
	LeaveInput,
	PayItemInput,
	PayrollInput,
	PayrollSettingInput,
	ScheduleRuleInput,
} from "@Heimdallone/payroll-engine/types";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
	mapCountryPayrollProfile,
	NONE_COUNTRY_PROFILE,
	resolveProfileById,
	resolvePublishedProfileForOrgAsOf,
} from "./payroll-profile-resolver";
import {
	type ResolvedScheduleRule,
	resolveScheduleConfig,
} from "./shift-rule-resolver";

// Map a resolved schedule rule → the engine's optional ScheduleRuleInput (the
// read seam). Pure projection; no calculation.
function buildScheduleRuleInput(r: ResolvedScheduleRule): ScheduleRuleInput {
	return {
		ruleId: r.ruleId,
		source: r.source,
		standardDailyMinutes: r.standardDailyMinutes,
		standardWeeklyMinutes: r.standardWeeklyMinutes,
		overtimeThresholdDailyMinutes: r.overtimeThresholdDailyMinutes,
		overtimeThresholdWeeklyMinutes: r.overtimeThresholdWeeklyMinutes,
		isSplitShift: r.isSplitShift,
		hasNightDifferential: r.hasNightDifferential,
		nightDiffMultiplier: r.nightDiffMultiplier,
		weekdayOvertimeMultiplier: r.weekdayOvertimeMultiplier,
		saturdayMultiplier: r.saturdayMultiplier,
		sundayMultiplier: r.sundayMultiplier,
		publicHolidayMultiplier: r.publicHolidayMultiplier,
		capDailyPaidMinutes: r.capDailyPaidMinutes,
	};
}

// Short, plain-language labels for the exception-summary message (Phase 11G CP2).
const EXCEPTION_SHORT_LABEL: Record<string, string> = {
	unmapped_punch: "unmapped punch",
	duplicate_punch: "duplicate punch",
	missing_clock_out: "missing clock-out",
	outside_geofence: "outside geofence",
	low_gps_accuracy: "GPS accuracy",
	clock_drift: "device clock drift",
	spoofing_suspected: "location check",
	device_error: "device error",
	out_of_window: "out of shift window",
};

export async function buildPayrollInput(
	organizationId: string,
	employeeId: string,
	periodId: string,
	options?: {
		/**
		 * Profile pinned on the payroll run (21G-C). When set, the statutory rule
		 * is resolved by id so a run reproduces its original ruleset; when absent
		 * (ad-hoc preview / projection), the rule is resolved by the period's pay
		 * date.
		 */
		pinnedProfileId?: string | null;
	}
): Promise<PayrollInput> {
	const [emp, workInfo, activeContract, period, settings] = await Promise.all([
		db
			.select()
			.from(employeeProfile)
			.where(
				and(
					eq(employeeProfile.id, employeeId),
					eq(employeeProfile.organizationId, organizationId)
				)
			)
			.limit(1)
			.then((r) => r[0]),
		db
			.select()
			.from(employeeWorkInfo)
			.where(eq(employeeWorkInfo.employeeId, employeeId))
			.limit(1)
			.then((r) => r[0]),
		db
			.select()
			.from(contract)
			.where(
				and(
					eq(contract.employeeId, employeeId),
					eq(contract.organizationId, organizationId),
					eq(contract.status, "active")
				)
			)
			.limit(1)
			.then((r) => r[0]),
		db
			.select()
			.from(payPeriod)
			.where(
				and(
					eq(payPeriod.id, periodId),
					eq(payPeriod.organizationId, organizationId)
				)
			)
			.limit(1)
			.then((r) => r[0]),
		db
			.select()
			.from(payrollSetting)
			.where(eq(payrollSetting.organizationId, organizationId))
			.limit(1)
			.then((r) => r[0]),
	]);

	const employee = await buildEmployeeInput(
		emp,
		workInfo,
		employeeId,
		organizationId
	);
	const contractInput = buildContractInput(activeContract);
	const periodInput = buildPeriodInput(period);
	// Phase 21J: resolve the effective schedule rule for this employee's shift on
	// the PAY DATE (period end) — effective-dating keeps historical runs on the
	// rule that was in force. Read-only: roster/schedule rules NEVER mutate payroll.
	// With no shift_rule configured the resolver returns the org fallback and the
	// engine ignores this field, so output is byte-identical (reconcile stays 46/46).
	const scheduleRule = period
		? buildScheduleRuleInput(
				await resolveScheduleConfig(
					organizationId,
					workInfo?.shiftId ?? null,
					period.endDate
				)
			)
		: undefined;
	const attendance = period
		? await buildAttendanceInput(
				organizationId,
				employeeId,
				period.startDate,
				period.endDate
			)
		: emptyAttendance();
	const leave = period
		? await buildLeaveInput(
				organizationId,
				employeeId,
				period.startDate,
				period.endDate
			)
		: { paidLeaveDays: 0, unpaidLeaveDays: 0, pendingLeaveDays: 0 };
	const payItems = await buildPayItemInputs(
		organizationId,
		employeeId,
		workInfo?.departmentId ?? null
	);
	const loans = await buildLoanInputs(organizationId, employeeId, period);
	const reimbursements = await buildReimbursementInputs(
		organizationId,
		employeeId
	);
	const countryProfileInput = await buildCountryProfile(
		organizationId,
		period,
		options?.pinnedProfileId
	);
	const settingsInput = buildSettings(settings);

	// Tenant policy: when overtime is not "premium", no OT is paid AND no OT is
	// surfaced on the payslip. Zero the aggregates here (defense-in-depth with the
	// engine's suppression) so `overtimeHours` (= totalApprovedOvertimeMinutes/60)
	// reads 0 regardless of whether any record was flagged approved.
	if (settingsInput.overtimeHandling !== "premium") {
		attendance.totalApprovedOvertimeMinutes = 0;
		attendance.overtimeByDayType = {
			weekday: 0,
			saturday: 0,
			sunday: 0,
			holiday: 0,
		};
	}

	// Org policy: do open attendance exceptions block payroll? (default true)
	const [attSetting] = await db
		.select({ block: attendanceSetting.blockPayrollOnOpenExceptions })
		.from(attendanceSetting)
		.where(eq(attendanceSetting.organizationId, organizationId))
		.limit(1);

	return {
		employee,
		contract: contractInput,
		period: periodInput,
		attendance,
		leave,
		holidays: { count: 0, dates: [] },
		payItems,
		loans,
		reimbursements,
		countryProfile: countryProfileInput,
		settings: settingsInput,
		scheduleRule,
		flags: { blockPayrollOnOpenExceptions: attSetting?.block ?? true },
	};
}

async function buildEmployeeInput(
	emp: typeof employeeProfile.$inferSelect | undefined,
	workInfo: typeof employeeWorkInfo.$inferSelect | undefined,
	employeeId: string,
	organizationId: string
): Promise<EmployeeInput> {
	const dept = workInfo?.departmentId
		? await db
				.select({ name: department.name })
				.from(department)
				.where(
					and(
						eq(department.id, workInfo.departmentId),
						eq(department.organizationId, organizationId)
					)
				)
				.limit(1)
				.then((r) => r[0])
		: null;

	// Dependent children drive the country rule's child allowance. Sourced from
	// the employee_statutory satellite (21L-A); absent row → 0 (no allowance).
	const [statutory] = await db
		.select({ dependentChildren: employeeStatutory.dependentChildren })
		.from(employeeStatutory)
		.where(eq(employeeStatutory.employeeId, employeeId))
		.limit(1);

	return {
		id: emp?.id ?? employeeId,
		organizationId,
		firstName: emp?.firstName ?? "Unknown",
		lastName: emp?.lastName ?? "",
		employeeCode: emp?.badgeId ?? "",
		departmentId: workInfo?.departmentId ?? null,
		departmentName: dept?.name ?? null,
		dependentChildren: statutory?.dependentChildren ?? 0,
	};
}

function buildContractInput(
	activeContract: typeof contract.$inferSelect | undefined
): ContractInput {
	return {
		id: activeContract?.id ?? "",
		baseSalary: activeContract ? Number(activeContract.baseSalary) : 0,
		wageType:
			(activeContract?.wageType as ContractInput["wageType"]) ?? "monthly",
		payFrequency: activeContract?.payFrequency ?? "monthly",
		salaryCurrency: activeContract?.salaryCurrency ?? "GYD",
		filingStatusId: activeContract?.filingStatusId ?? null,
		deductLeaveFromBasicPay: activeContract?.deductLeaveFromBasicPay ?? true,
	};
}

function buildPeriodInput(period: typeof payPeriod.$inferSelect | undefined) {
	return {
		startDate: period ? formatDate(period.startDate) : "",
		endDate: period ? formatDate(period.endDate) : "",
		workingDays: period?.workingDays ?? 22,
		expectedHours: period ? Number(period.expectedHours) : 176,
	};
}

async function buildLoanInputs(
	organizationId: string,
	employeeId: string,
	period: typeof payPeriod.$inferSelect | undefined
) {
	if (!period) {
		return { dueInstallments: [] };
	}

	const rows = await db
		.select({
			loanId: loanInstallment.loanId,
			installmentId: loanInstallment.id,
			loanTitle: loan.title,
			amount: loanInstallment.amount,
			sequenceNumber: loanInstallment.sequenceNumber,
			totalInstallments: loan.totalInstallments,
		})
		.from(loanInstallment)
		.innerJoin(loan, eq(loanInstallment.loanId, loan.id))
		.where(
			and(
				eq(loan.employeeId, employeeId),
				eq(loan.organizationId, organizationId),
				eq(loan.status, "active"),
				eq(loanInstallment.status, "pending"),
				lte(loanInstallment.dueDate, period.endDate)
			)
		);

	return {
		dueInstallments: rows.map((i) => ({
			loanId: i.loanId,
			installmentId: i.installmentId,
			loanTitle: i.loanTitle,
			amount: Number(i.amount),
			sequenceNumber: i.sequenceNumber,
			totalInstallments: i.totalInstallments,
		})),
	};
}

async function buildReimbursementInputs(
	organizationId: string,
	employeeId: string
) {
	const rows = await db
		.select({
			id: reimbursement.id,
			title: reimbursement.title,
			amount: reimbursement.amount,
		})
		.from(reimbursement)
		.where(
			and(
				eq(reimbursement.employeeId, employeeId),
				eq(reimbursement.organizationId, organizationId),
				eq(reimbursement.status, "approved")
			)
		);

	return {
		approved: rows.map((r) => ({
			id: r.id,
			title: r.title,
			amount: Number(r.amount),
		})),
	};
}

async function buildCountryProfile(
	organizationId: string,
	period: typeof payPeriod.$inferSelect | undefined,
	pinnedProfileId?: string | null
): Promise<CountryPayrollProfileInput> {
	// 1. Honor a run's pinned profile (21G-C): a run computed under one ruleset
	//    reproduces it even after a newer profile ships. A dangling pin (profile
	//    since deleted) falls through to resolve-by-date rather than failing.
	if (pinnedProfileId) {
		const pinned = await resolveProfileById(organizationId, pinnedProfileId);
		if (pinned) {
			return mapCountryPayrollProfile(pinned);
		}
	}

	// 2. No pin (ad-hoc preview / projection / pre-21G run): resolve the statutory
	//    rule in force on the period's PAY DATE (fallback to period end), never on
	//    a mutable "current" flag — so a 2024 period resolves the 2024 rule.
	const asOf = period?.payDate ?? period?.endDate ?? null;
	if (!asOf) {
		return NONE_COUNTRY_PROFILE;
	}
	const resolved = await resolvePublishedProfileForOrgAsOf({
		organizationId,
		asOf,
	});
	return resolved ? mapCountryPayrollProfile(resolved) : NONE_COUNTRY_PROFILE;
}

function buildSettings(
	settings: typeof payrollSetting.$inferSelect | undefined
): PayrollSettingInput {
	return {
		overtimeMultipliers: {
			weekday: Number(settings?.weekdayOvertimeMultiplier ?? 1.5),
			saturday: Number(settings?.saturdayMultiplier ?? 1.5),
			sunday: Number(settings?.sundayMultiplier ?? 2.0),
			publicHoliday: Number(settings?.publicHolidayMultiplier ?? 2.0),
			nightShift: Number(settings?.nightShiftMultiplier ?? 1.0),
		},
		standardHoursPerDay: Number(settings?.standardHoursPerDay ?? 8),
		lunchDeductionMinutes: settings?.lunchDeductionMinutes ?? 0,
		minimumNetPayThreshold: settings?.minimumNetPayThreshold
			? toCents(Number(settings.minimumNetPayThreshold))
			: null,
		overtimeHandling: settings?.overtimeHandling ?? "premium",
	};
}

async function buildAttendanceInput(
	organizationId: string,
	employeeId: string,
	periodStart: Date,
	periodEnd: Date
): Promise<AttendanceInput> {
	const records = await db
		.select({
			workedMinutes: attendanceRecord.workedMinutes,
			overtimeMinutes: attendanceRecord.overtimeMinutes,
			dayType: attendanceRecord.dayType,
			status: attendanceRecord.status,
			isValidated: attendanceRecord.isValidated,
			isOvertimeApproved: attendanceRecord.isOvertimeApproved,
			payrollStatus: attendanceRecord.payrollStatus,
		})
		.from(attendanceRecord)
		.where(
			and(
				eq(attendanceRecord.employeeId, employeeId),
				eq(attendanceRecord.organizationId, organizationId),
				gte(attendanceRecord.date, periodStart),
				lte(attendanceRecord.date, periodEnd)
			)
		);

	const agg = aggregateAttendance(records);
	const review = await buildExceptionReview(
		organizationId,
		employeeId,
		periodStart,
		periodEnd
	);
	return { ...agg, ...review };
}

interface ExceptionReview {
	exceptionSummary: string;
	openExceptionBlockers: number;
	openExceptionWarnings: number;
	unprocessedPunches: number;
}

// Open biometric/geofence/attendance exceptions + unprocessed punches attributed
// to this employee within the pay period. These NEVER change worked minutes —
// they surface as payroll blockers/warnings so HR resolves them before
// finalization (Phase 11G CP2). Scope by linked punch time → event date →
// the exception's createdAt fallback.
async function buildExceptionReview(
	organizationId: string,
	employeeId: string,
	periodStart: Date,
	periodEnd: Date
): Promise<ExceptionReview> {
	const excRows = await db
		.select({
			severity: attendanceException.severity,
			type: attendanceException.type,
			punchTime: attendancePunch.punchTime,
			eventDate: attendanceEvent.eventDate,
			capturedAt: geofenceCheckIn.capturedAt,
			createdAt: attendanceException.createdAt,
		})
		.from(attendanceException)
		.leftJoin(
			attendancePunch,
			eq(attendanceException.attendancePunchId, attendancePunch.id)
		)
		.leftJoin(
			attendanceEvent,
			eq(attendanceException.attendanceEventId, attendanceEvent.id)
		)
		.leftJoin(
			geofenceCheckIn,
			eq(attendanceException.geofenceCheckInId, geofenceCheckIn.id)
		)
		.where(
			and(
				eq(attendanceException.organizationId, organizationId),
				eq(attendanceException.employeeId, employeeId),
				inArray(attendanceException.status, ["open", "in_review"])
			)
		);

	let openExceptionBlockers = 0;
	let openExceptionWarnings = 0;
	const typeLabels = new Set<string>();
	// Compare on DATE granularity. periodStart/End are date-mode (local midnight)
	// while when is a timestamp; a same-day exception at e.g. 18:00 would otherwise
	// test as `> periodEnd` (midnight) and be wrongly dropped from the last day.
	const startKey = formatDate(periodStart);
	const endKey = formatDate(periodEnd);
	for (const e of excRows) {
		const when = e.punchTime ?? e.eventDate ?? e.capturedAt ?? e.createdAt;
		const whenKey = formatDate(when);
		if (whenKey < startKey || whenKey > endKey) {
			continue;
		}
		if (e.severity === "blocker") {
			openExceptionBlockers += 1;
		} else if (e.severity === "warning") {
			openExceptionWarnings += 1;
		} else {
			continue; // info severity does not affect payroll readiness
		}
		typeLabels.add(EXCEPTION_SHORT_LABEL[e.type] ?? e.type);
	}

	const unprocessed = await db
		.select({ id: attendancePunch.id })
		.from(attendancePunch)
		.where(
			and(
				eq(attendancePunch.organizationId, organizationId),
				eq(attendancePunch.employeeId, employeeId),
				inArray(attendancePunch.processingStatus, ["pending", "error"]),
				gte(attendancePunch.punchTime, periodStart),
				lte(attendancePunch.punchTime, periodEnd),
				isNull(attendancePunch.deletedAt)
			)
		);

	return {
		openExceptionBlockers,
		openExceptionWarnings,
		unprocessedPunches: unprocessed.length,
		exceptionSummary: [...typeLabels].join(", "),
	};
}

function aggregateAttendance(
	records: Array<{
		workedMinutes: number;
		overtimeMinutes: number;
		dayType: string;
		status: string;
		isValidated: boolean;
		isOvertimeApproved: boolean;
		payrollStatus: string;
	}>
): AttendanceInput {
	let totalWorkedMinutes = 0;
	let totalApprovedOvertimeMinutes = 0;
	const overtimeByDayType = { weekday: 0, saturday: 0, sunday: 0, holiday: 0 };
	let daysPresent = 0;
	let daysHalfDay = 0;
	let daysAbsent = 0;
	let daysHoliday = 0;
	let pendingItems = 0;

	for (const r of records) {
		totalWorkedMinutes += r.workedMinutes;
		if (r.isOvertimeApproved && r.payrollStatus === "approved") {
			totalApprovedOvertimeMinutes += r.overtimeMinutes;
			const dtype = r.dayType as keyof typeof overtimeByDayType;
			if (dtype in overtimeByDayType) {
				overtimeByDayType[dtype] += r.overtimeMinutes;
			}
		}
		if (r.status === "present") {
			daysPresent++;
		} else if (r.status === "half_day") {
			daysHalfDay++;
		} else if (r.status === "absent") {
			daysAbsent++;
		} else if (r.status === "holiday") {
			daysHoliday++;
		}
		if (!r.isValidated || r.payrollStatus === "pending") {
			pendingItems++;
		}
	}

	return {
		totalWorkedMinutes,
		totalApprovedOvertimeMinutes,
		overtimeByDayType,
		daysPresent,
		daysHalfDay,
		daysAbsent,
		daysHoliday,
		pendingItems,
		isComplete: records.length > 0,
	};
}

function emptyAttendance(): AttendanceInput {
	return {
		totalWorkedMinutes: 0,
		totalApprovedOvertimeMinutes: 0,
		overtimeByDayType: { weekday: 0, saturday: 0, sunday: 0, holiday: 0 },
		daysPresent: 0,
		daysHalfDay: 0,
		daysAbsent: 0,
		daysHoliday: 0,
		pendingItems: 0,
		isComplete: false,
	};
}

async function buildLeaveInput(
	organizationId: string,
	employeeId: string,
	periodStart: Date,
	periodEnd: Date
): Promise<LeaveInput> {
	const requests = await db
		.select({
			requestedDays: leaveRequest.requestedDays,
			status: leaveRequest.status,
			isPaid: leaveType.isPaid,
		})
		.from(leaveRequest)
		.innerJoin(leaveType, eq(leaveRequest.leaveTypeId, leaveType.id))
		.where(
			and(
				eq(leaveRequest.employeeId, employeeId),
				eq(leaveRequest.organizationId, organizationId),
				lte(leaveRequest.startDate, periodEnd),
				gte(leaveRequest.endDate, periodStart)
			)
		);

	let paidLeaveDays = 0;
	let unpaidLeaveDays = 0;
	let pendingLeaveDays = 0;

	for (const r of requests) {
		const days = Number(r.requestedDays);
		if (r.status === "approved") {
			if (r.isPaid) {
				paidLeaveDays += days;
			} else {
				unpaidLeaveDays += days;
			}
		} else if (r.status === "requested") {
			pendingLeaveDays += days;
		}
	}

	return { paidLeaveDays, unpaidLeaveDays, pendingLeaveDays };
}

async function buildPayItemInputs(
	organizationId: string,
	employeeId: string,
	departmentId: string | null
): Promise<{ allowances: PayItemInput[]; deductions: PayItemInput[] }> {
	const [items, empAssignments, deptAssignments] = await Promise.all([
		db
			.select()
			.from(payItem)
			.where(
				and(
					eq(payItem.organizationId, organizationId),
					eq(payItem.isActive, true)
				)
			),
		db
			.select()
			.from(payItemAssignment)
			.where(eq(payItemAssignment.employeeId, employeeId)),
		departmentId
			? db
					.select()
					.from(payItemAssignment)
					.where(eq(payItemAssignment.departmentId, departmentId))
			: Promise.resolve([]),
	]);

	const allowances: PayItemInput[] = [];
	const deductions: PayItemInput[] = [];

	for (const item of items) {
		const assignment =
			empAssignments.find((a) => a.payItemId === item.id) ??
			deptAssignments.find((a) => a.payItemId === item.id);
		if (assignment?.isExcluded) {
			continue;
		}
		if (!(item.includeAllActive || assignment)) {
			continue;
		}

		const mapped = mapPayItem(item, assignment);
		if (item.type === "allowance") {
			allowances.push(mapped);
		} else {
			deductions.push(mapped);
		}
	}

	return { allowances, deductions };
}

function mapPayItem(
	item: typeof payItem.$inferSelect,
	assignment: typeof payItemAssignment.$inferSelect | undefined
): PayItemInput {
	return {
		payItemId: item.id,
		title: item.title,
		isFixed: item.isFixed,
		fixedAmount: item.fixedAmount ? Number(item.fixedAmount) : null,
		basedOn: item.basedOn,
		rate: item.rate ? Number(item.rate) : null,
		isTaxable: item.isTaxable,
		isPreTax: item.isPreTax,
		isTax: item.isTax,
		isStatutory: item.isStatutory,
		employerRate: item.employerRate ? Number(item.employerRate) : null,
		maxAmount: item.maxAmount ? Number(item.maxAmount) : null,
		overrideAmount: assignment?.overrideAmount
			? Number(assignment.overrideAmount)
			: null,
	};
}

function formatDate(d: Date | string): string {
	if (typeof d === "string") {
		return d;
	}
	return d.toISOString().split("T")[0] ?? "";
}
