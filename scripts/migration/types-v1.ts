// biome-ignore-all lint: one-shot migration ETL types/registry (Phase 21B).
//
// Shared types for the v1 -> v2 dry-run ETL framework, plus the authoritative
// classification of every v1 table. The dry-run NEVER writes; this file only
// declares how each v1 table is intended to land in v2.

export type Classification =
	| "direct_map" // copy with field renames only
	| "transform_map" // reshape (e.g. salary structure -> pay items)
	| "requires_new_v2_feature" // v2 has no home yet (roster / GL / notifications)
	| "archive_only" // keep as historical record, not live data
	| "ignore_defer"; // do not migrate (transient / edge-sync / empty scaffold)

export type FieldStatus =
	| "mapped" // has a clean v2 destination
	| "unmapped" // v1 column with NO known v2 destination (surfaced for review)
	| "manual_review" // maps but affects payroll/leave correctness — confirm by hand
	| "dropped"; // intentionally not carried (e.g. edge-sync columns)

export type FieldMap = {
	v1: string;
	v2: string | null;
	status: FieldStatus;
	note?: string;
};

export type UnmappableRecord = { id: string; reason: string };

export type TableInspection = {
	v1Table: string;
	v2Target: string | null;
	classification: Classification;
	reason: string;
	rowCount: number;
	fields: FieldMap[];
	unmappable: UnmappableRecord[];
	notes: string[];
};

/**
 * A detailed mapper for a priority table. `inspect` runs over real (read-only)
 * v1 rows and reports per-field coverage + records that cannot map.
 */
export type Mapper = {
	v1Table: string;
	v2Target: string | null;
	classification: Classification;
	reason: string;
	/** read-only SELECT used to pull rows for inspection */
	selectSql: string;
	inspect: (rows: any[]) => {
		fields: FieldMap[];
		unmappable: UnmappableRecord[];
		notes: string[];
	};
};

/** Columns present on EVERY v1 table that v2 deliberately drops (central, not edge-sync). */
export const EDGE_SYNC_COLUMNS = ["sync_version", "source_node_id"] as const;

/** Boilerplate v1 columns that are handled generically (timestamps / soft-delete). */
const HOUSEKEEPING_COLUMNS = new Set<string>([
	"created_at",
	"updated_at",
	"deleted_at",
]);

/**
 * Data-driven field coverage. Given real v1 rows and a dictionary of KNOWN
 * column mappings, returns a FieldMap per actual v1 column. Any column NOT in
 * the dictionary surfaces as `unmapped` so the dry-run reports the unknown — an
 * honest "I did not anticipate this column" rather than silent loss.
 */
export function coverFields(
	rows: any[],
	known: Record<
		string,
		{ v2: string | null; status: FieldStatus; note?: string }
	>
): FieldMap[] {
	const keys = rows.length > 0 ? Object.keys(rows[0]) : Object.keys(known);
	const out: FieldMap[] = [];
	for (const col of keys) {
		if ((EDGE_SYNC_COLUMNS as readonly string[]).includes(col)) {
			out.push({
				v1: col,
				v2: null,
				status: "dropped",
				note: "edge-sync metadata (v2 is central)",
			});
			continue;
		}
		const k = known[col];
		if (k) {
			out.push({ v1: col, v2: k.v2, status: k.status, note: k.note });
		} else if (HOUSEKEEPING_COLUMNS.has(col)) {
			out.push({
				v1: col,
				v2: col,
				status: "mapped",
				note: "housekeeping timestamp",
			});
		} else {
			out.push({
				v1: col,
				v2: null,
				status: "unmapped",
				note: "no known v2 destination — review",
			});
		}
	}
	return out;
}

/** Transient v1 tables that are never migrated. */
export const IGNORE_TABLES = new Set<string>([
	"session",
	"verification",
	"__drizzle_migrations",
]);

/**
 * Authoritative plan for every v1 table. Tables with a dedicated Mapper get
 * field-level inspection; the rest are classified here (count-only).
 *
 * Decisions baked in (owner-approved, Phase 21A/21B):
 *  - GL  -> requires_new_v2_feature (minimal v2 payroll-GL; do NOT clone bug churn)
 *  - roster -> requires_new_v2_feature (per-date roster table, 21D)
 *  - notifications -> requires_new_v2_feature (build subsystem; history optional)
 *  - edge-sync columns -> dropped
 *  - empty scaffold modules -> ignore_defer (no data contract)
 */
export const V1_TABLE_PLAN: Record<
	string,
	{ v2Target: string | null; classification: Classification; reason: string }
> = {
	// --- org / auth (direct) ---
	organization: {
		v2Target: "organization",
		classification: "direct_map",
		reason: "Better-Auth org -> v2 organization",
	},
	user: {
		v2Target: "user",
		classification: "direct_map",
		reason: "Better-Auth user",
	},
	member: {
		v2Target: "member",
		classification: "direct_map",
		reason: "Better-Auth membership",
	},
	account: {
		v2Target: "account",
		classification: "direct_map",
		reason: "Better-Auth credential account",
	},
	invitation: {
		v2Target: "invitation",
		classification: "direct_map",
		reason: "Better-Auth invitation",
	},

	// --- HR core ---
	employees: {
		v2Target: "employee_profile (+work_info/+bank_details)",
		classification: "transform_map",
		reason: "split into profile/work_info/bank + statutory field review",
	},
	departments: {
		v2Target: "department",
		classification: "direct_map",
		reason: "department master",
	},
	job_titles: {
		v2Target: "job_position / job_role",
		classification: "transform_map",
		reason: "v2 splits position vs role",
	},
	public_holidays: {
		v2Target: "holiday",
		classification: "direct_map",
		reason: "holiday calendar",
	},

	// --- shifts / roster ---
	work_schedules: {
		v2Target: "shift / shift_schedule",
		classification: "transform_map",
		reason: "weekly pattern",
	},
	employee_shift_assignments: {
		v2Target: "shift_schedule",
		classification: "transform_map",
		reason: "employee->shift link",
	},
	shift_roster_entries: {
		v2Target: null,
		classification: "requires_new_v2_feature",
		reason:
			"per-date roster w/ override+approval — v2 has weekly patterns only (21D)",
	},

	// --- attendance ---
	attendance_punches: {
		v2Target: "attendance_punch",
		classification: "direct_map",
		reason: "raw punches",
	},
	punch_correction_requests: {
		v2Target: "attendance_correction",
		classification: "direct_map",
		reason: "correction workflow",
	},
	attendance_devices: {
		v2Target: "attendance_device",
		classification: "direct_map",
		reason: "device registry",
	},
	attendance_device_users: {
		v2Target: "attendance_device_employee_map",
		classification: "transform_map",
		reason: "device<->employee binding",
	},

	// --- payroll ---
	payroll_periods: {
		v2Target: "pay_period",
		classification: "direct_map",
		reason: "pay periods",
	},
	payroll_components: {
		v2Target: "pay_item",
		classification: "transform_map",
		reason: "component -> pay item",
	},
	employee_payroll_components: {
		v2Target: "pay_item_assignment",
		classification: "transform_map",
		reason: "component assignment",
	},
	salary_structures: {
		v2Target: "pay_item (group)",
		classification: "transform_map",
		reason: "structure -> pay item set + country profile",
	},
	salary_structure_assignments: {
		v2Target: "pay_item_assignment",
		classification: "transform_map",
		reason: "structure assignment",
	},
	payslips: {
		v2Target: "payslip",
		classification: "archive_only",
		reason: "historical payslips preserved as-is; v2 engine computes forward",
	},
	payslip_line_items: {
		v2Target: "payslip_line_item",
		classification: "archive_only",
		reason: "historical payslip detail",
	},

	// --- leave ---
	leave_policies: {
		v2Target: "leave_policy_template",
		classification: "transform_map",
		reason: "leave policy",
	},
	leave_balances: {
		v2Target: "leave_balance",
		classification: "direct_map",
		reason: "balances",
	},
	leave_requests: {
		v2Target: "leave_request",
		classification: "direct_map",
		reason: "requests",
	},

	// --- statutory / config ---
	tenant_statutory_rules: {
		v2Target: "country_payroll_profile",
		classification: "transform_map",
		reason: "statutory rules -> country profile",
	},
	tenant_config: {
		v2Target: "payroll_setting / org settings",
		classification: "transform_map",
		reason: "per-tenant config",
	},

	// --- GL (decision pending: minimal v2 build) ---
	accounts: {
		v2Target: null,
		classification: "requires_new_v2_feature",
		reason: "GL chart of accounts — v2 GL deferred (21D minimal build)",
	},
	journal_entries: {
		v2Target: null,
		classification: "requires_new_v2_feature",
		reason: "GL journals — minimal v2 GL; do NOT clone bug-reversal churn",
	},
	journal_lines: {
		v2Target: null,
		classification: "requires_new_v2_feature",
		reason: "GL journal lines — depends on GL build",
	},

	// --- offboarding ---
	resignation_requests: {
		v2Target: "offboarding_case",
		classification: "transform_map",
		reason: "resignation -> offboarding",
	},

	// --- notifications (build subsystem) ---
	notifications: {
		v2Target: null,
		classification: "requires_new_v2_feature",
		reason: "in-app notifications — v2 has no store (21D); history optional",
	},

	// --- audit ---
	audit_logs: {
		v2Target: "audit_event",
		classification: "archive_only",
		reason: "historical audit trail",
	},

	// --- transient ---
	session: {
		v2Target: null,
		classification: "ignore_defer",
		reason: "transient auth sessions",
	},
	verification: {
		v2Target: null,
		classification: "ignore_defer",
		reason: "transient verification tokens",
	},
};
