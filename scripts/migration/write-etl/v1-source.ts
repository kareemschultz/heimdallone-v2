// biome-ignore-all lint: live v1-readonly loader for the write-ETL (Phase 21K).
//
// Reads the REAL v1 database (read-only) and produces the V1TenantSource[] the
// write-ETL transformers consume — the live-run swap for synthetic-source.ts.
// v1 is opened strictly read-only (openV1ReadOnly forces the session read-only);
// this module NEVER writes v1. Unmappable rows (bad wage type / unresolvable pay
// frequency / imbalanced journal / notification for a non-migrated user) are
// pre-filtered into a PII-free failures list instead of crashing the load.

import type { Client } from "pg";
import { resolvePayFrequency } from "../../../packages/payroll-engine/src/pay-frequency";
import { v1Rows } from "../v1-readonly";
import type {
	V1Account,
	V1Contract,
	V1Employee,
	V1Journal,
	V1Notification,
	V1RosterEntry,
	V1Shift,
	V1TenantSource,
} from "./transformers";

export interface MappingFailure {
	id: string;
	kind: string;
	reason: string;
	tenantSlug: string;
}

// v1 compensation_type → v2 wageType. "salary" is v2 "monthly".
const WAGE_MAP: Record<string, "daily" | "monthly" | "hourly"> = {
	hourly: "hourly",
	daily: "daily",
	salary: "monthly",
	monthly: "monthly",
};
const VALID_OVERRIDES = new Set(["none", "custom_hours", "day_off", "swap"]);
const VALID_JOURNAL_SOURCES = new Set([
	"payroll",
	"manual",
	"opening_balance",
	"adjustment",
]);
const VALID_ACCOUNT_TYPES = new Set([
	"asset",
	"liability",
	"equity",
	"income",
	"expense",
]);

/** Normalise a v1 date/timestamp value to a YYYY-MM-DD string. */
function ymd(v: unknown): string {
	if (v instanceof Date) {
		return v.toISOString().slice(0, 10);
	}
	return String(v ?? "").slice(0, 10);
}

function centsToAmount(c: unknown): string {
	return (Number(c ?? 0) / 100).toFixed(2);
}

async function loadEmployees(
	c: Client,
	oid: string
): Promise<{ employees: V1Employee[]; userIds: Set<string> }> {
	const rows = await v1Rows<any>(
		c,
		`SELECT e.id, e.email, e.first_name, e.last_name, e.user_id,
		        u.id AS u_id, u.name AS u_name, u.email AS u_email
		 FROM employees e
		 LEFT JOIN "user" u ON u.id = e.user_id
		 WHERE e.tenant_id = $1 AND e.deleted_at IS NULL`,
		[oid]
	);
	const userIds = new Set<string>();
	const employees = rows.map((r) => {
		const user =
			r.u_id && r.u_email
				? {
						id: r.u_id as string,
						name: (r.u_name as string) ?? r.u_email,
						email: r.u_email as string,
					}
				: null;
		if (user) {
			userIds.add(user.id);
		}
		// employee_profile.email is NOT NULL; some v1 employees have no email.
		// Synthesize a deterministic, obviously-non-deliverable placeholder so the
		// load stays faithful (real emails preserved; missing ones clearly marked).
		const email =
			(r.email as string) && String(r.email).trim() !== ""
				? (r.email as string)
				: `migrated-${r.id}@migrated.invalid`;
		return {
			id: r.id as string,
			email,
			firstName: (r.first_name as string) ?? "Unknown",
			lastName: (r.last_name as string) ?? null,
			user,
		} satisfies V1Employee;
	});
	return { employees, userIds };
}

async function loadContracts(
	c: Client,
	oid: string,
	slug: string,
	empIds: Set<string>,
	failures: MappingFailure[]
): Promise<V1Contract[]> {
	const rows = await v1Rows<any>(
		c,
		`SELECT a.id, a.employee_id, a.rate_cents, a.compensation_type, a.from_date,
		        s.name AS structure_name, s.pay_frequency
		 FROM salary_structure_assignments a
		 JOIN salary_structures s ON s.id = a.salary_structure_id
		 WHERE a.tenant_id = $1 AND a.status = 'active' AND a.deleted_at IS NULL
		 ORDER BY a.employee_id, a.from_date DESC`,
		[oid]
	);
	const seen = new Set<string>();
	const out: V1Contract[] = [];
	for (const r of rows) {
		const empId = r.employee_id as string;
		if (seen.has(empId)) {
			continue; // one active contract per employee (latest from_date wins)
		}
		if (!empIds.has(empId)) {
			failures.push({
				tenantSlug: slug,
				kind: "contract",
				id: r.id,
				reason: "employee not migrated",
			});
			continue;
		}
		const wageType = WAGE_MAP[String(r.compensation_type)];
		if (!wageType) {
			failures.push({
				tenantSlug: slug,
				kind: "contract",
				id: r.id,
				reason: `unmapped compensation_type`,
			});
			continue;
		}
		if (!resolvePayFrequency(String(r.pay_frequency))) {
			failures.push({
				tenantSlug: slug,
				kind: "contract",
				id: r.id,
				reason: `unmapped pay_frequency`,
			});
			continue;
		}
		seen.add(empId);
		out.push({
			id: r.id as string,
			employeeId: empId,
			name: (r.structure_name as string) ?? "Contract",
			baseSalary: centsToAmount(r.rate_cents),
			currency: "GYD",
			payFrequency: String(r.pay_frequency),
			startDate: ymd(r.from_date),
			wageType,
		});
	}
	return out;
}

async function loadShifts(c: Client, oid: string): Promise<V1Shift[]> {
	const rows = await v1Rows<any>(
		c,
		`SELECT id, name FROM work_schedules WHERE tenant_id = $1`,
		[oid]
	);
	return rows.map((r) => ({
		id: r.id as string,
		name: (r.name as string) ?? "Schedule",
	}));
}

async function loadRosters(
	c: Client,
	oid: string,
	empIds: Set<string>,
	shiftIds: Set<string>
): Promise<V1RosterEntry[]> {
	const rows = await v1Rows<any>(
		c,
		`SELECT id, employee_id, date, work_schedule_id, override_type, note, is_approved,
		        custom_shift_start_minutes, custom_shift_end_minutes
		 FROM shift_roster_entries WHERE tenant_id = $1`,
		[oid]
	);
	return rows
		.filter((r) => empIds.has(r.employee_id as string))
		.map((r) => {
			const ov = String(r.override_type ?? "none");
			const shiftId = r.work_schedule_id as string | null;
			return {
				id: r.id as string,
				employeeId: r.employee_id as string,
				date: ymd(r.date),
				shiftId: shiftId && shiftIds.has(shiftId) ? shiftId : null,
				overrideType: (VALID_OVERRIDES.has(ov)
					? ov
					: "none") as V1RosterEntry["overrideType"],
				note: (r.note as string) ?? null,
				isApproved: Boolean(r.is_approved),
				customStartMinutes: r.custom_shift_start_minutes ?? null,
				customEndMinutes: r.custom_shift_end_minutes ?? null,
			} satisfies V1RosterEntry;
		});
}

async function loadAccounts(
	c: Client,
	oid: string,
	slug: string,
	failures: MappingFailure[]
): Promise<{ accounts: V1Account[]; codeById: Map<string, string> }> {
	const rows = await v1Rows<any>(
		c,
		`SELECT id, code, name, type FROM accounts WHERE tenant_id = $1`,
		[oid]
	);
	const codeById = new Map<string, string>();
	const accounts: V1Account[] = [];
	for (const r of rows) {
		codeById.set(r.id as string, r.code as string);
		if (!VALID_ACCOUNT_TYPES.has(String(r.type))) {
			failures.push({
				tenantSlug: slug,
				kind: "account",
				id: r.id,
				reason: "unmapped account type",
			});
			continue;
		}
		accounts.push({
			id: r.id as string,
			code: r.code as string,
			name: (r.name as string) ?? r.code,
			type: String(r.type) as V1Account["type"],
		});
	}
	return { accounts, codeById };
}

async function loadJournals(
	c: Client,
	oid: string,
	slug: string,
	codeById: Map<string, string>,
	failures: MappingFailure[]
): Promise<V1Journal[]> {
	const entries = await v1Rows<any>(
		c,
		`SELECT id, reference, description, entry_date, source FROM journal_entries WHERE tenant_id = $1`,
		[oid]
	);
	const lineRows = await v1Rows<any>(
		c,
		`SELECT journal_entry_id, account_id, debit_cents, credit_cents, description, payslip_id
		 FROM journal_lines WHERE tenant_id = $1`,
		[oid]
	);
	const linesByEntry = new Map<string, any[]>();
	for (const l of lineRows) {
		const arr = linesByEntry.get(l.journal_entry_id as string) ?? [];
		arr.push(l);
		linesByEntry.set(l.journal_entry_id as string, arr);
	}
	const out: V1Journal[] = [];
	for (const e of entries) {
		const raw = linesByEntry.get(e.id as string) ?? [];
		const lines = raw.map((l) => ({
			accountCode: codeById.get(l.account_id as string) ?? "",
			debit: Number(l.debit_cents ?? 0) / 100,
			credit: Number(l.credit_cents ?? 0) / 100,
			description: (l.description as string) ?? null,
			linkedPayslipId: (l.payslip_id as string) ?? null,
		}));
		if (lines.some((l) => l.accountCode === "")) {
			failures.push({
				tenantSlug: slug,
				kind: "journal",
				id: e.id,
				reason: "line references unknown account",
			});
			continue;
		}
		// Each line must be single-sided (exactly one of debit/credit non-zero) —
		// the GL invariant validateJournalLines enforces. Exclude v1 rows with a
		// zero-zero or dual-amount line rather than crashing the load.
		const badLine = lines.some(
			(l) =>
				(l.debit === 0 && l.credit === 0) || (l.debit !== 0 && l.credit !== 0)
		);
		if (badLine) {
			failures.push({
				tenantSlug: slug,
				kind: "journal",
				id: e.id,
				reason: "line not single-sided (v1 quirk — excluded)",
			});
			continue;
		}
		const debit = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100);
		const credit = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100);
		if (debit !== credit) {
			failures.push({
				tenantSlug: slug,
				kind: "journal",
				id: e.id,
				reason: "imbalanced (v1 bug — excluded)",
			});
			continue;
		}
		const source = String(e.source ?? "manual");
		out.push({
			id: e.id as string,
			reference: e.reference as string,
			description: (e.description as string) ?? null,
			entryDate: ymd(e.entry_date),
			currency: "GYD",
			source: (VALID_JOURNAL_SOURCES.has(source)
				? source
				: "manual") as V1Journal["source"],
			lines,
		});
	}
	return out;
}

async function loadNotifications(
	c: Client,
	oid: string,
	userIds: Set<string>
): Promise<V1Notification[]> {
	const rows = await v1Rows<any>(
		c,
		`SELECT id, user_id, type, title, body, entity_id, entity_type, read_at
		 FROM notifications WHERE tenant_id = $1`,
		[oid]
	);
	return rows
		.filter((r) => userIds.has(r.user_id as string))
		.map((r) => ({
			id: r.id as string,
			userId: r.user_id as string,
			type: String(r.type ?? "system"),
			title: (r.title as string) ?? "Notification",
			body: (r.body as string) ?? null,
			entityId: (r.entity_id as string) ?? null,
			entityType: (r.entity_type as string) ?? null,
			isRead: r.read_at !== null,
		}));
}

/**
 * Load all v1 tenants as V1TenantSource[], Foreign Links pilot FIRST then
 * Netsurf (the cutover order). Read-only; unmappable rows are recorded in
 * `failures` and excluded, never fatal.
 */
export async function loadV1Tenants(
	c: Client
): Promise<{ tenants: V1TenantSource[]; failures: MappingFailure[] }> {
	const failures: MappingFailure[] = [];
	// Foreign Links (flas) first, then everything else.
	const orgs = await v1Rows<any>(
		c,
		`SELECT id, name, slug FROM organization
		 ORDER BY (slug LIKE 'flas%') DESC, slug`
	);
	const tenants: V1TenantSource[] = [];
	for (const o of orgs) {
		const oid = o.id as string;
		const slug = o.slug as string;
		const { employees, userIds } = await loadEmployees(c, oid);
		const empIds = new Set(employees.map((e) => e.id));
		const contracts = await loadContracts(c, oid, slug, empIds, failures);
		const shifts = await loadShifts(c, oid);
		const shiftIds = new Set(shifts.map((s) => s.id));
		const rosters = await loadRosters(c, oid, empIds, shiftIds);
		const { accounts, codeById } = await loadAccounts(c, oid, slug, failures);
		const journals = await loadJournals(c, oid, slug, codeById, failures);
		const notifications = await loadNotifications(c, oid, userIds);
		tenants.push({
			tenant: { id: oid, name: o.name as string, slug },
			employees,
			contracts,
			shifts,
			rosters,
			accounts,
			journals,
			notifications,
		});
	}
	return { tenants, failures };
}

/**
 * Stage v1 rows that have NO v2 app-table home into the scratch
 * migration_source_* JSONB tables (preserved as source for later mapping):
 * historical payslips, attendance punches, and the richer v1 work_schedules.
 */
export async function stageSourceJson(
	v1: Client,
	scratch: import("pg").Pool
): Promise<{
	payslips: number;
	attendancePunches: number;
	workSchedules: number;
}> {
	const counts = { payslips: 0, attendancePunches: 0, workSchedules: 0 };
	const jobs: Array<{ table: string; sql: string; key: keyof typeof counts }> =
		[
			{
				table: "migration_source_payslip",
				sql: "SELECT * FROM payslips",
				key: "payslips",
			},
			{
				table: "migration_source_attendance_punch",
				sql: "SELECT * FROM attendance_punches",
				key: "attendancePunches",
			},
			{
				table: "migration_source_work_schedule",
				sql: "SELECT * FROM work_schedules",
				key: "workSchedules",
			},
		];
	for (const job of jobs) {
		const rows = await v1Rows<any>(v1, job.sql);
		// reset this table then bulk-insert (scratch only)
		await scratch.query(`DELETE FROM "${job.table}"`);
		for (const r of rows) {
			await scratch.query(
				`INSERT INTO "${job.table}" (id, tenant_id, payload) VALUES ($1, $2, $3)
				 ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`,
				[r.id, r.tenant_id ?? null, JSON.stringify(r)]
			);
		}
		counts[job.key] = rows.length;
	}
	return counts;
}
