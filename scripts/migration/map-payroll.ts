// biome-ignore-all lint: one-shot payroll mappers (Phase 21B).
//
// Decision (owner-approved): historical v1 payslips are PRESERVED as historical
// records; v2's payroll-engine computes going forward. Any v2≠v1 number becomes
// a reconciliation report (21C), never a silent overwrite. v1 had a payroll UTC
// bug (visible as is_reversal payslips + GL reversals) — we do NOT clone it.

import { coverFields, type Mapper } from "./types-v1";

const m = (v2: string | null, status: any, note?: string) => ({
	v2,
	status,
	note,
});

const periodMapper: Mapper = {
	v1Table: "payroll_periods",
	v2Target: "pay_period",
	classification: "direct_map",
	reason: "pay periods",
	selectSql: 'SELECT * FROM "payroll_periods"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("pay_period.id", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			name: m("pay_period.name", "mapped"),
			period_start: m("pay_period.start_date", "mapped"),
			period_end: m("pay_period.end_date", "mapped"),
			pay_frequency: m("pay_period.frequency", "mapped"),
			status: m("pay_period.status", "mapped"),
			rules_version: m("country_payroll_profile (selection)", "manual_review"),
			total_scheduled_days: m("pay_period.scheduled_days", "mapped"),
			finalized_at: m("pay_period.finalized_at", "mapped"),
			journal_entry_id: m("(GL link)", "manual_review", "depends on GL build"),
			last_run_started_at: m(null, "dropped", "run telemetry"),
		};
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [`${rows.length} pay periods`],
		};
	},
};

const componentMapper: Mapper = {
	v1Table: "payroll_components",
	v2Target: "pay_item",
	classification: "transform_map",
	reason: "earning/deduction component -> pay item",
	selectSql: 'SELECT * FROM "payroll_components"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("pay_item.id", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			name: m("pay_item.name", "mapped"),
			component_type: m(
				"pay_item.kind",
				"mapped",
				"earning/deduction -> v2 pay_item kind"
			),
			default_amount_cents: m(
				"pay_item.default_amount",
				"mapped",
				"cents preserved"
			),
			active: m("pay_item.is_active", "mapped"),
		};
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [`${rows.length} pay components`],
		};
	},
};

const empComponentMapper: Mapper = {
	v1Table: "employee_payroll_components",
	v2Target: "pay_item_assignment",
	classification: "transform_map",
	reason: "per-employee component amount",
	selectSql: 'SELECT * FROM "employee_payroll_components"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("pay_item_assignment.id", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			employee_id: m("pay_item_assignment.employee_id", "mapped"),
			component_id: m("pay_item_assignment.pay_item_id", "mapped"),
			amount_cents: m("pay_item_assignment.amount", "mapped"),
		};
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [`${rows.length} component assignments`],
		};
	},
};

const structureMapper: Mapper = {
	v1Table: "salary_structures",
	v2Target: "pay_item (group) + country profile",
	classification: "transform_map",
	reason: "named structure -> pay item set + country profile selection",
	selectSql: 'SELECT * FROM "salary_structures"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("(structure ref)", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			name: m("pay_item group label", "mapped"),
			pay_frequency: m("pay_period.frequency", "mapped"),
			rules_version: m(
				"country_payroll_profile selection",
				"manual_review",
				"maps v1 rules_version -> v2 country profile year"
			),
			is_archived: m("is_active (inverse)", "mapped"),
		};
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [
				`${rows.length} salary structures — no 1:1 v2 table; resolves to pay_item set`,
			],
		};
	},
};

const structureAssignmentMapper: Mapper = {
	v1Table: "salary_structure_assignments",
	v2Target: "pay_item_assignment",
	classification: "transform_map",
	reason: "structure assignment -> per-employee pay setup",
	selectSql: 'SELECT * FROM "salary_structure_assignments"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("pay_item_assignment.id", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			employee_id: m("pay_item_assignment.employee_id", "mapped"),
			salary_structure_id: m("(structure ref)", "mapped"),
			from_date: m("pay_item_assignment.effective_from", "mapped"),
			to_date: m("pay_item_assignment.effective_to", "mapped"),
			compensation_type: m(
				"pay_item_assignment.basis",
				"mapped",
				"salaried/hourly"
			),
			rate_cents: m("pay_item_assignment.amount", "mapped"),
			transport_allowance_cents: m("pay_item_assignment (transport)", "mapped"),
			other_allowances_json: m(
				"pay_item_assignment (multiple)",
				"manual_review",
				"jsonb of extra allowances — expand into pay items"
			),
			status: m("pay_item_assignment.status", "mapped"),
		};
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [`${rows.length} structure assignments`],
		};
	},
};

const payslipMapper: Mapper = {
	v1Table: "payslips",
	v2Target: "payslip (historical)",
	classification: "archive_only",
	reason: "preserve historical payslips as-is; v2 engine computes forward",
	selectSql: 'SELECT * FROM "payslips"',
	inspect(rows) {
		// payslip carries the full Guyana breakdown inline + a snapshot_json.
		const passthrough = [
			"gross_pay_cents",
			"base_pay_cents",
			"overtime_pay_cents",
			"saturday_pay_cents",
			"sunday_pay_cents",
			"public_holiday_pay_cents",
			"transport_allowance_cents",
			"nis_employee_cents",
			"nis_employer_cents",
			"paye_cents",
			"personal_allowance_cents",
			"chargeable_income_cents",
			"medical_life_cents",
			"child_allowance_cents",
			"other_deductions_cents",
			"net_pay_cents",
			"days_worked",
			"days_absent",
			"regular_minutes",
			"overtime_minutes",
			"saturday_minutes",
			"sunday_minutes",
			"public_holiday_minutes",
			"quarters_board_lodging_cents",
			"taxable_allowances_in_kind_cents",
			"non_taxable_allowances_in_kind_cents",
		];
		const known: Record<string, any> = {
			id: m("payslip.id", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			employee_id: m("payslip.employee_id", "mapped"),
			payroll_period_id: m("payslip.pay_period_id", "mapped"),
			salary_structure_assignment_id: m("(historical ref)", "manual_review"),
			status: m("payslip.status", "mapped"),
			is_reversal: m(
				"payslip.is_reversal",
				"manual_review",
				"v1 UTC-bug reversals — flag, do not replay"
			),
			reversed_payslip_id: m("payslip.reversed_payslip_id", "manual_review"),
			rules_version: m("payslip.rules_version", "mapped"),
			snapshot_json: m(
				"payslip.snapshot",
				"mapped",
				"full historical snapshot — preserve verbatim"
			),
			journal_entry_id: m("(GL link)", "manual_review", "depends on GL build"),
			finalized_at: m("payslip.finalized_at", "mapped"),
			finalized_by_user_id: m("payslip.finalized_by", "mapped"),
		};
		for (const c of passthrough) {
			known[c] = m(`payslip.${c}`, "mapped", "historical amount preserved");
		}
		const reversals = rows.filter((r) => r.is_reversal).length;
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [
				`${rows.length} payslips preserved as historical records`,
				`${reversals} are reversal payslips (v1 UTC-bug corrections) — preserve as history, NOT replayed`,
				"v2 payroll-engine recomputes forward; v1≠v2 -> reconciliation report (21C)",
			],
		};
	},
};

const lineItemMapper: Mapper = {
	v1Table: "payslip_line_items",
	v2Target: "payslip_line_item (historical)",
	classification: "archive_only",
	reason: "historical payslip detail (note: v1 keeps detail inline on payslip)",
	selectSql: 'SELECT * FROM "payslip_line_items"',
	inspect(rows) {
		const known: Record<string, any> = {
			id: m("payslip_line_item.id", "mapped"),
			tenant_id: m("organization_id", "mapped"),
			payslip_id: m("payslip_line_item.payslip_id", "mapped"),
			component_id: m("payslip_line_item.pay_item_id", "mapped"),
			name_snapshot: m("payslip_line_item.label", "mapped"),
			component_type_snapshot: m("payslip_line_item.kind", "mapped"),
			amount_cents: m("payslip_line_item.amount", "mapped"),
		};
		return {
			fields: coverFields(rows, known),
			unmappable: [],
			notes: [
				`${rows.length} line items`,
				rows.length === 0
					? "EMPTY in v1 — payslip breakdown is stored INLINE on payslips + snapshot_json, not in this table"
					: "",
			].filter(Boolean),
		};
	},
};

export const payrollMappers: Mapper[] = [
	periodMapper,
	componentMapper,
	empComponentMapper,
	structureMapper,
	structureAssignmentMapper,
	payslipMapper,
	lineItemMapper,
];
