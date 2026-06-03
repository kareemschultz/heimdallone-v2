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
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import { leaveRequest, leaveType } from "@Heimdallone/db/schema/leave";
import {
	countryPayrollProfile,
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
} from "@Heimdallone/payroll-engine/types";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";

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
	periodId: string
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
	const countryProfileInput = await buildCountryProfile(organizationId);
	const settingsInput = buildSettings(settings);

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

	return {
		id: emp?.id ?? employeeId,
		organizationId,
		firstName: emp?.firstName ?? "Unknown",
		lastName: emp?.lastName ?? "",
		employeeCode: emp?.badgeId ?? "",
		departmentId: workInfo?.departmentId ?? null,
		departmentName: dept?.name ?? null,
		dependentChildren: 0,
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
	organizationId: string
): Promise<CountryPayrollProfileInput> {
	const profile = await db
		.select()
		.from(countryPayrollProfile)
		.where(
			and(
				eq(countryPayrollProfile.organizationId, organizationId),
				eq(countryPayrollProfile.isActive, true)
			)
		)
		.limit(1)
		.then((r) => r[0]);

	if (!profile) {
		return {
			countryCode: "NONE",
			effectiveYear: 0,
			taxBrackets: [],
			personalAllowanceFormula: "",
			personalAllowanceThreshold: 0,
			childAllowancePerChild: 0,
			overtimeAllowanceCap: 0,
			insurancePremiumCapAmount: 0,
			employeeNISRate: 0,
			employerNISRate: 0,
			nisMaxEarnings: 0,
		};
	}

	const brackets = profile.taxBrackets as Array<{
		min: number;
		max: number | null;
		rate: number;
		fixedAmount: number;
	}>;

	return {
		countryCode: profile.countryCode,
		effectiveYear: profile.effectiveYear,
		taxBrackets: brackets.map((b) => ({
			min: toCents(b.min),
			max: b.max === null ? null : toCents(b.max),
			rate: b.rate,
			fixedAmount: toCents(b.fixedAmount),
		})),
		personalAllowanceFormula: profile.personalAllowanceFormula,
		personalAllowanceThreshold: toCents(
			Number(profile.personalAllowanceThreshold ?? 0)
		),
		childAllowancePerChild: toCents(
			Number(profile.childAllowancePerChild ?? 0)
		),
		overtimeAllowanceCap: toCents(Number(profile.overtimeAllowanceCap ?? 0)),
		insurancePremiumCapAmount: toCents(
			Number(profile.insurancePremiumCapAmount ?? 0)
		),
		// Phase 8J.3 fix #2: DB stores NIS rates as percent (e.g. "5.60" for 5.6%)
		// but the engine's percentOfCents() multiplies cents by a decimal
		// (so 5.6% must be 0.056). Without this divide-by-100, NIS deductions
		// land at ~560% of base — a money-correctness bug.
		employeeNISRate: Number(profile.employeeNISRate) / 100,
		employerNISRate: Number(profile.employerNISRate) / 100,
		nisMaxEarnings: toCents(Number(profile.nisMaxEarnings ?? 0)),
	};
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
