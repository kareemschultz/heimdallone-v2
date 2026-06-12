// biome-ignore-all lint: one-shot employee mapper (Phase 21B).
//
// v1 `employees` -> v2 employee_profile + employee_work_info + employee_bank_details.
// This is the highest payroll-correctness risk: Guyana statutory inputs
// (TIN/NIS/qualifying children/second job/medical) MUST land in v2 or net pay
// silently changes. Those are flagged `manual_review`, not silently mapped.

import { coverFields, type Mapper } from "./types-v1";

const KNOWN: Record<string, { v2: string | null; status: any; note?: string }> =
	{
		id: { v2: "employee_profile.id", status: "mapped" },
		tenant_id: { v2: "organization_id", status: "mapped" },
		employee_number: {
			v2: "employee_profile.employee_number",
			status: "mapped",
		},
		user_id: {
			v2: "employee_profile.user_id",
			status: "mapped",
			note: "auth link (nullable)",
		},
		first_name: { v2: "employee_profile.first_name", status: "mapped" },
		last_name: { v2: "employee_profile.last_name", status: "mapped" },
		email: { v2: "employee_profile.email", status: "mapped" },
		phone: { v2: "employee_profile.phone", status: "mapped" },
		date_of_birth: { v2: "employee_profile.date_of_birth", status: "mapped" },
		date_of_joining: {
			v2: "employee_work_info.joining_date",
			status: "mapped",
		},
		date_of_leaving: {
			v2: "employee_work_info.leaving_date",
			status: "mapped",
		},
		status: {
			v2: "employee_profile.status",
			status: "mapped",
			note: "active/left -> v2 status enum",
		},
		company_id: {
			v2: "(company/branch)",
			status: "manual_review",
			note: "v2 has no company sub-entity yet — confirm",
		},
		department_id: { v2: "employee_work_info.department_id", status: "mapped" },
		job_title_id: {
			v2: "employee_work_info.job_position_id",
			status: "mapped",
		},
		reports_to_employee_id: {
			v2: "employee_work_info.reports_to",
			status: "mapped",
			note: "manager-scope hierarchy",
		},
		attendance_device_id: {
			v2: "attendance_device_employee_map",
			status: "mapped",
		},
		kiosk_pin_hash: {
			v2: "(device/kiosk auth)",
			status: "manual_review",
			note: "biometric/kiosk PIN — confirm v2 home",
		},
		tin_number: {
			v2: "employee_work_info.tin",
			status: "manual_review",
			note: "PAYE — confirm column exists",
		},
		nis_number: {
			v2: "employee_work_info.nis",
			status: "manual_review",
			note: "NIS — confirm column exists",
		},
		bank_account_number: {
			v2: "employee_bank_details.account_number",
			status: "mapped",
		},
		bank_code: { v2: "employee_bank_details.bank_code", status: "mapped" },
		qualifying_children: {
			v2: "(tax allowance input)",
			status: "manual_review",
			note: "income-tax child allowance — confirm v2 home or ADD",
		},
		medical_insurance_on_file: {
			v2: "(medical deduction)",
			status: "manual_review",
			note: "confirm v2 home",
		},
		medical_payroll_deduct_cents: {
			v2: "pay_item_assignment (medical)",
			status: "manual_review",
			note: "deduction amount — confirm",
		},
		medical_external_premium_cents: {
			v2: "(medical premium)",
			status: "manual_review",
			note: "confirm v2 home",
		},
		has_second_job: {
			v2: "(second-job tax flag)",
			status: "manual_review",
			note: "second-job tax treatment — confirm/ADD",
		},
		second_job_pay_cents: {
			v2: "(second-job income)",
			status: "manual_review",
			note: "drives second-job tax — confirm/ADD",
		},
		other_deductions_cents: {
			v2: "pay_item_assignment (other)",
			status: "manual_review",
			note: "misc deduction — confirm",
		},
	};

export const employeeMapper: Mapper = {
	v1Table: "employees",
	v2Target: "employee_profile (+work_info/+bank_details)",
	classification: "transform_map",
	reason:
		"split into profile/work_info/bank; statutory fields need manual review",
	selectSql: 'SELECT * FROM "employees"',
	inspect(rows) {
		const fields = coverFields(rows, KNOWN);
		const unmappable: { id: string; reason: string }[] = [];
		let noAuthLink = 0;
		let noEmail = 0;
		for (const r of rows) {
			if (!(r.first_name || r.last_name)) {
				unmappable.push({
					id: r.id,
					reason: "no name (cannot form employee_profile)",
				});
			}
			if (!r.user_id) {
				noAuthLink++;
			}
			if (!r.email) {
				noEmail++;
			}
		}
		const notes = [
			`${rows.length} employees`,
			`${noAuthLink} have NO user_id (no auth login link — will migrate as profile-only)`,
			`${noEmail} have NO email`,
			"Statutory fields (TIN/NIS/qualifying_children/second_job/medical) flagged manual_review — confirm v2 home before payroll cutover",
		];
		return { fields, unmappable, notes };
	},
};
