import { describe, expect, test } from "bun:test";
import {
	mapAccount,
	mapContract,
	mapEmployee,
	mapJournal,
	mapNotification,
	mapOrganization,
	mapRosterEntry,
	mapStatutory,
	type V1Contract,
	type V1Journal,
	type V1RosterEntry,
	type V1Statutory,
} from "./transformers";

const ORG = "org_test";
const UNMAPPABLE_FREQ_RE = /unmappable pay frequency/;
const INVALID_WAGE_RE = /invalid wage type/;
const UNKNOWN_ACCOUNT_RE = /unknown account code/;

function contract(overrides: Partial<V1Contract>): V1Contract {
	return {
		id: "ctr_1",
		employeeId: "emp_1",
		name: "Test",
		startDate: "2026-01-01",
		wageType: "monthly",
		payFrequency: "monthly",
		baseSalary: "100000.00",
		...overrides,
	};
}

describe("mapContract — pay frequency normalisation (the 21D-B fix)", () => {
	test("v1 'Fortnightly' free-text normalises to the canonical enum", () => {
		expect(
			mapContract(contract({ payFrequency: "Fortnightly" }), ORG).payFrequency
		).toBe("fortnightly");
	});

	test("v1 'Bi-Weekly' alias normalises to fortnightly", () => {
		expect(
			mapContract(contract({ payFrequency: "Bi-Weekly" }), ORG).payFrequency
		).toBe("fortnightly");
	});

	test("'Semi-Monthly' alias normalises to semi_monthly", () => {
		expect(
			mapContract(contract({ payFrequency: "Semi-Monthly" }), ORG).payFrequency
		).toBe("semi_monthly");
	});

	test("monthly stays monthly", () => {
		expect(
			mapContract(contract({ payFrequency: "Monthly" }), ORG).payFrequency
		).toBe("monthly");
	});

	test("throws on an unmappable pay frequency (no silent default)", () => {
		expect(() =>
			mapContract(contract({ payFrequency: "every blue moon" }), ORG)
		).toThrow(UNMAPPABLE_FREQ_RE);
	});

	test("throws on an invalid wage type", () => {
		expect(() =>
			mapContract(
				contract({ wageType: "weekly" as unknown as V1Contract["wageType"] }),
				ORG
			)
		).toThrow(INVALID_WAGE_RE);
	});

	test("defaults currency to GYD and carries org id", () => {
		const row = mapContract(contract({}), ORG);
		expect(row.salaryCurrency).toBe("GYD");
		expect(row.organizationId).toBe(ORG);
		expect(row.status).toBe("active");
	});
});

describe("mapJournal — must balance, codes resolved to ids", () => {
	const accountIdByCode = new Map([
		["1000", "acc_cash"],
		["5000", "acc_wage"],
	]);
	const balanced: V1Journal = {
		id: "jnl_1",
		reference: "J-1",
		entryDate: "2026-01-01",
		source: "payroll",
		lines: [
			{ accountCode: "5000", debit: 1000, credit: 0 },
			{ accountCode: "1000", debit: 0, credit: 1000 },
		],
	};

	test("balanced journal maps to a posted entry + resolved-id lines", () => {
		const { entry, lines } = mapJournal(balanced, ORG, accountIdByCode);
		expect(entry.status).toBe("posted");
		expect(entry.organizationId).toBe(ORG);
		expect(lines).toHaveLength(2);
		expect(lines[0]?.accountId).toBe("acc_wage");
		expect(lines[0]?.debitAmount).toBe("1000.00");
		expect(lines[1]?.accountId).toBe("acc_cash");
		expect(lines[1]?.creditAmount).toBe("1000.00");
	});

	test("unbalanced journal is rejected (no v1 bug cloned into v2)", () => {
		const unbalanced: V1Journal = {
			...balanced,
			lines: [
				{ accountCode: "5000", debit: 1000, credit: 0 },
				{ accountCode: "1000", debit: 0, credit: 999 },
			],
		};
		expect(() => mapJournal(unbalanced, ORG, accountIdByCode)).toThrow();
	});

	test("line referencing an unknown account code is rejected", () => {
		const orphan: V1Journal = {
			...balanced,
			lines: [
				{ accountCode: "9999", debit: 1000, credit: 0 },
				{ accountCode: "1000", debit: 0, credit: 1000 },
			],
		};
		expect(() => mapJournal(orphan, ORG, accountIdByCode)).toThrow(
			UNKNOWN_ACCOUNT_RE
		);
	});
});

describe("mapRosterEntry — overrides preserved, custom hours gated", () => {
	function roster(overrides: Partial<V1RosterEntry>): V1RosterEntry {
		return {
			id: "ros_1",
			employeeId: "emp_1",
			date: "2026-06-01",
			...overrides,
		};
	}

	test("custom_hours carries start/end minutes", () => {
		const row = mapRosterEntry(
			roster({
				overrideType: "custom_hours",
				customStartMinutes: 1200,
				customEndMinutes: 1380,
			}),
			ORG
		);
		expect(row.overrideType).toBe("custom_hours");
		expect(row.customStartMinutes).toBe(1200);
		expect(row.customEndMinutes).toBe(1380);
	});

	test("non-custom override drops stray custom minutes (clean intent)", () => {
		const row = mapRosterEntry(
			roster({
				overrideType: "day_off",
				customStartMinutes: 1200,
				customEndMinutes: 1380,
			}),
			ORG
		);
		expect(row.customStartMinutes).toBeNull();
		expect(row.customEndMinutes).toBeNull();
	});

	test("defaults overrideType to none and isApproved to false", () => {
		const row = mapRosterEntry(roster({}), ORG);
		expect(row.overrideType).toBe("none");
		expect(row.isApproved).toBe(false);
	});
});

describe("mapNotification — isRead becomes a readAt timestamp", () => {
	test("isRead true sets readAt", () => {
		const row = mapNotification(
			{ id: "n1", userId: "u1", type: "x", title: "t", isRead: true },
			ORG
		);
		expect(row.readAt).toBeInstanceOf(Date);
	});

	test("isRead false leaves readAt null (unread inbox item)", () => {
		const row = mapNotification(
			{ id: "n1", userId: "u1", type: "x", title: "t", isRead: false },
			ORG
		);
		expect(row.readAt).toBeNull();
	});

	test("soft entity refs are carried through untouched", () => {
		const row = mapNotification(
			{
				id: "n1",
				userId: "u1",
				type: "payroll.payslip_ready",
				title: "t",
				entityType: "payslip",
				entityId: "pay_1",
			},
			ORG
		);
		expect(row.entityType).toBe("payslip");
		expect(row.entityId).toBe("pay_1");
	});
});

describe("mapOrganization / mapEmployee / mapAccount — tenant scoping", () => {
	test("organization keeps its id + slug", () => {
		const row = mapOrganization({ id: ORG, name: "N", slug: "n" });
		expect(row.id).toBe(ORG);
		expect(row.slug).toBe("n");
	});

	test("employee without a login user maps userId to null", () => {
		const row = mapEmployee(
			{ id: "emp_1", firstName: "A", email: "a@b.test", user: null },
			ORG
		);
		expect(row.userId).toBeNull();
		expect(row.organizationId).toBe(ORG);
	});

	test("account defaults to postable, non-archived", () => {
		const row = mapAccount(
			{ id: "acc_1", code: "1000", name: "Cash", type: "asset" },
			ORG
		);
		expect(row.isPostable).toBe(true);
		expect(row.isArchived).toBe(false);
	});

	test("no-login employee maps a null email (21L-B, no fake placeholder)", () => {
		const row = mapEmployee(
			{ id: "emp_2", firstName: "B", email: null, user: null },
			ORG
		);
		expect(row.email).toBeNull();
		expect(row.userId).toBeNull();
	});
});

describe("mapStatutory — TIN/NIS + payroll attributes (21L-A)", () => {
	const S: V1Statutory = {
		taxIdentificationNumber: "TIN123",
		socialSecurityNumber: "NIS456",
		dependentChildren: 3,
		hasSecondJob: true,
		secondJobPayAmount: "1500.00",
		medicalInsuranceOnFile: true,
		medicalPayrollDeductionAmount: "200.00",
		medicalExternalPremiumAmount: "50.00",
		otherDeductionsAmount: "0.00",
	};

	test("carries identifiers + dependent children + scopes to the employee", () => {
		const row = mapStatutory(S, "emp_1");
		expect(row.employeeId).toBe("emp_1");
		expect(row.taxIdentificationNumber).toBe("TIN123");
		expect(row.socialSecurityNumber).toBe("NIS456");
		expect(row.dependentChildren).toBe(3);
	});

	test("preserves numeric amount strings + second-job flag", () => {
		const row = mapStatutory(S, "emp_1");
		expect(row.hasSecondJob).toBe(true);
		expect(row.secondJobPayAmount).toBe("1500.00");
		expect(row.medicalPayrollDeductionAmount).toBe("200.00");
	});

	test("null identifiers stay null (missing TIN/NIS)", () => {
		const row = mapStatutory(
			{ ...S, taxIdentificationNumber: null, socialSecurityNumber: null },
			"emp_1"
		);
		expect(row.taxIdentificationNumber).toBeNull();
		expect(row.socialSecurityNumber).toBeNull();
	});
});
