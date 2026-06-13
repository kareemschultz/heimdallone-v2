// biome-ignore-all lint: synthetic write-ETL fixtures (Phase 21E dry-run).
//
// CLEARLY-FAKE, hand-authored v1-shaped data so the write-ETL can be proven
// end-to-end against a scratch v2 schema WITHOUT touching the live v1 database
// (and without ever committing real client PII). Names/emails/ids are obviously
// synthetic. The live run swaps this provider for the v1-readonly loader; the
// transformers + orchestrator are identical.
//
// Two tenants mirror the real cutover ORDER: Foreign Links (pilot, small) is
// migrated FIRST, then Netsurf (operational, fortnightly payroll).

import type { V1TenantSource } from "./transformers";

export const foreignLinksSource: V1TenantSource = {
	tenant: {
		id: "org_fl_synthetic",
		name: "Foreign Links (SYNTHETIC)",
		slug: "foreign-links-synthetic",
	},
	employees: [
		{
			id: "emp_fl_1",
			firstName: "Ada",
			lastName: "Pilot",
			email: "ada.pilot@example.test",
			user: {
				id: "usr_fl_1",
				name: "Ada Pilot",
				email: "ada.pilot@example.test",
			},
		},
		{
			id: "emp_fl_2",
			firstName: "Ben",
			lastName: "Sample",
			email: "ben.sample@example.test",
			user: null,
		},
	],
	contracts: [
		{
			id: "ctr_fl_1",
			employeeId: "emp_fl_1",
			name: "Pilot — Monthly",
			startDate: "2026-01-01",
			wageType: "monthly",
			payFrequency: "Monthly",
			baseSalary: "300000.00",
		},
	],
	shifts: [{ id: "shf_fl_1", name: "Office Day" }],
	rosters: [
		{
			id: "ros_fl_1",
			employeeId: "emp_fl_1",
			date: "2026-06-01",
			shiftId: "shf_fl_1",
			isApproved: true,
		},
		{
			id: "ros_fl_2",
			employeeId: "emp_fl_2",
			date: "2026-06-01",
			overrideType: "day_off",
		},
	],
	accounts: [
		{ id: "acc_fl_cash", code: "1000", name: "Cash", type: "asset" },
		{
			id: "acc_fl_wage",
			code: "5000",
			name: "Wages Expense",
			type: "expense",
		},
	],
	journals: [
		{
			id: "jnl_fl_1",
			reference: "FL-OPEN-0001",
			description: "Opening balance",
			entryDate: "2026-01-01",
			source: "opening_balance",
			lines: [
				{ accountCode: "1000", debit: 500_000, credit: 0 },
				{ accountCode: "5000", debit: 0, credit: 500_000 },
			],
		},
	],
	notifications: [
		{
			id: "ntf_fl_1",
			userId: "usr_fl_1",
			type: "system.welcome",
			title: "Welcome to Heimdallone v2",
			isRead: false,
		},
	],
};

// 2026-06-01 is a Monday — these fortnightly contracts exercise the 21D-B fix.
export const netsurfSource: V1TenantSource = {
	tenant: {
		id: "org_ns_synthetic",
		name: "Netsurf Group (SYNTHETIC)",
		slug: "netsurf-synthetic",
	},
	employees: [
		{
			id: "emp_ns_1",
			firstName: "Cara",
			lastName: "Fortnight",
			email: "cara.fortnight@example.test",
			user: {
				id: "usr_ns_1",
				name: "Cara Fortnight",
				email: "cara.fortnight@example.test",
			},
		},
		{
			id: "emp_ns_2",
			firstName: "Dale",
			lastName: "Shiftwork",
			email: "dale.shiftwork@example.test",
			user: {
				id: "usr_ns_2",
				name: "Dale Shiftwork",
				email: "dale.shiftwork@example.test",
			},
		},
	],
	contracts: [
		{
			id: "ctr_ns_1",
			employeeId: "emp_ns_1",
			name: "Operations — Fortnightly",
			startDate: "2025-07-01",
			wageType: "monthly",
			// v1 free-text spelling that must normalise to the v2 "fortnightly" enum.
			payFrequency: "Fortnightly",
			baseSalary: "180000.00",
		},
		{
			id: "ctr_ns_2",
			employeeId: "emp_ns_2",
			name: "Field — Bi-Weekly",
			startDate: "2025-09-15",
			wageType: "daily",
			// alias spelling → fortnightly
			payFrequency: "Bi-Weekly",
			baseSalary: "6000.00",
		},
	],
	shifts: [
		{ id: "shf_ns_day", name: "Day Shift" },
		{ id: "shf_ns_night", name: "Night Shift" },
	],
	rosters: [
		{
			id: "ros_ns_1",
			employeeId: "emp_ns_1",
			date: "2026-06-01",
			shiftId: "shf_ns_day",
			isApproved: true,
		},
		{
			id: "ros_ns_2",
			employeeId: "emp_ns_1",
			date: "2026-06-02",
			shiftId: "shf_ns_night",
			overrideType: "custom_hours",
			customStartMinutes: 1200,
			customEndMinutes: 1380,
			isApproved: false,
		},
		{
			id: "ros_ns_3",
			employeeId: "emp_ns_2",
			date: "2026-06-01",
			shiftId: "shf_ns_day",
			isApproved: true,
		},
	],
	accounts: [
		{ id: "acc_ns_cash", code: "1000", name: "Cash", type: "asset" },
		{ id: "acc_ns_nis", code: "2100", name: "NIS Payable", type: "liability" },
		{
			id: "acc_ns_paye",
			code: "2200",
			name: "PAYE Payable",
			type: "liability",
		},
		{
			id: "acc_ns_wage",
			code: "5000",
			name: "Wages Expense",
			type: "expense",
		},
	],
	journals: [
		{
			id: "jnl_ns_1",
			reference: "NS-PAY-2026-06A",
			description: "Fortnightly payroll posting (period 2026-06A)",
			entryDate: "2026-06-14",
			source: "payroll",
			lines: [
				{
					accountCode: "5000",
					debit: 200_000,
					credit: 0,
					description: "Gross wages",
					linkedPayslipId: "pay_ns_synthetic_1",
				},
				{ accountCode: "2100", debit: 0, credit: 11_200, description: "NIS" },
				{ accountCode: "2200", debit: 0, credit: 25_000, description: "PAYE" },
				{
					accountCode: "1000",
					debit: 0,
					credit: 163_800,
					description: "Net pay",
				},
			],
		},
	],
	notifications: [
		{
			id: "ntf_ns_1",
			userId: "usr_ns_1",
			type: "payroll.payslip_ready",
			title: "Your payslip is ready",
			entityType: "payslip",
			entityId: "pay_ns_synthetic_1",
			isRead: false,
		},
		{
			id: "ntf_ns_2",
			userId: "usr_ns_2",
			type: "roster.published",
			title: "Your roster was updated",
			isRead: true,
		},
	],
};

// Cutover order: Foreign Links pilot FIRST, then Netsurf operational.
export const SYNTHETIC_TENANTS: V1TenantSource[] = [
	foreignLinksSource,
	netsurfSource,
];
