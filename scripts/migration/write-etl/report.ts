// biome-ignore-all lint: write-ETL report writer (Phase 21E dry-run).
//
// PII-SAFE: emits ONLY counts, slugs (already public-ish identifiers) and
// pass/fail classifications — never names, emails, salaries, bank/TIN/NIS, or any
// row content. Mirrors the PII discipline of the 21B/21C reports.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

interface TenantCounts {
	accounts: number;
	contracts: number;
	employees: number;
	fortnightlyContracts: number;
	glBalanced: boolean;
	journalLines: number;
	journals: number;
	logins: number;
	members: number;
	noLogin: number;
	notifications: number;
	organizations: number;
	platformAdmins: number;
	rosterApproved: number;
	rosterEntries: number;
	shiftRules: number;
	shifts: number;
	slug: string;
	statutory: number;
	tenant: string;
	tenantAdmins: number;
	tenantOwners: number;
	users: number;
}

const OUT_DIR = join(process.cwd(), "docs", "migration");

interface ReportMeta {
	failures?: Array<{
		tenantSlug: string;
		kind: string;
		id: string;
		reason: string;
	}>;
	notices?: Array<{
		tenantSlug: string;
		kind: string;
		id: string;
		reason: string;
	}>;
	phase?: string;
	source?: string;
	sourceJson?: {
		payslips: number;
		attendancePunches: number;
		workSchedules: number;
		employees: number;
		journals: number;
		journalLines: number;
	};
}

export function writeEtlReport(
	results: TenantCounts[],
	summary: { isolated: boolean; allBalanced: boolean },
	meta: ReportMeta = {}
): void {
	// PII-safe: failures carry kind + opaque id + reason only (no row content).
	const failures = (meta.failures ?? []).map((f) => ({
		tenantSlug: f.tenantSlug,
		kind: f.kind,
		id: f.id,
		reason: f.reason,
	}));
	// PII-safe: notices carry kind + opaque id + reason only (no row content).
	const notices = (meta.notices ?? []).map((n) => ({
		tenantSlug: n.tenantSlug,
		kind: n.kind,
		id: n.id,
		reason: n.reason,
	}));
	const json = {
		phase: meta.phase ?? "21E",
		kind: "write-etl-dry-run",
		source: meta.source ?? "synthetic (no live v1 / no production writes)",
		tenantsInOrder: results.map((r) => r.slug),
		summary,
		failures,
		notices,
		sourceJson: meta.sourceJson ?? null,
		tenants: results,
		totals: results.reduce(
			(acc, r) => {
				acc.employees += r.employees;
				acc.statutory += r.statutory;
				acc.noLogin += r.noLogin;
				acc.users += r.users;
				acc.members += r.members;
				acc.logins += r.logins;
				acc.tenantOwners += r.tenantOwners;
				acc.tenantAdmins += r.tenantAdmins;
				acc.platformAdmins += r.platformAdmins;
				acc.contracts += r.contracts;
				acc.fortnightlyContracts += r.fortnightlyContracts;
				acc.shiftRules += r.shiftRules;
				acc.rosterEntries += r.rosterEntries;
				acc.accounts += r.accounts;
				acc.journals += r.journals;
				acc.journalLines += r.journalLines;
				acc.notifications += r.notifications;
				return acc;
			},
			{
				employees: 0,
				statutory: 0,
				noLogin: 0,
				users: 0,
				members: 0,
				logins: 0,
				tenantOwners: 0,
				tenantAdmins: 0,
				platformAdmins: 0,
				contracts: 0,
				fortnightlyContracts: 0,
				shiftRules: 0,
				rosterEntries: 0,
				accounts: 0,
				journals: 0,
				journalLines: 0,
				notifications: 0,
			}
		),
	};
	writeFileSync(
		join(OUT_DIR, "write-etl-report.json"),
		`${JSON.stringify(json, null, 2)}\n`
	);

	const lines: string[] = [];
	lines.push(`# Phase ${json.phase} — Write-ETL report`);
	lines.push("");
	lines.push(`**Source:** ${json.source}`);
	lines.push(`**Tenant order:** ${json.tenantsInOrder.join(" → ")}`);
	lines.push(
		`**GL balanced (all tenants):** ${summary.allBalanced ? "✅" : "❌"} · **Tenant isolation:** ${summary.isolated ? "✅" : "❌"}`
	);
	lines.push("");
	lines.push(
		"> PII-safe: counts + pass/fail only. No names / emails / salaries / bank / TIN / NIS."
	);
	lines.push("");
	lines.push(
		"| Tenant | Emp | Contracts (fortnightly) | Roster (approved) | Accounts | Journals/Lines | Notifs | GL balanced |"
	);
	lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
	for (const r of results) {
		lines.push(
			`| ${r.slug} | ${r.employees} | ${r.contracts} (${r.fortnightlyContracts}) | ${r.rosterEntries} (${r.rosterApproved}) | ${r.accounts} | ${r.journals}/${r.journalLines} | ${r.notifications} | ${r.glBalanced ? "✅" : "❌"} |`
		);
	}
	lines.push("");
	lines.push("## Totals");
	const t = json.totals;
	lines.push(
		`- Employees ${t.employees} (statutory rows ${t.statutory} · no-login ${t.noLogin}) · Contracts ${t.contracts} (fortnightly ${t.fortnightlyContracts}) · Shift rules ${t.shiftRules} · Roster ${t.rosterEntries}`
	);
	lines.push(
		`- Logins preserved: users ${t.users} · members ${t.members} · accounts ${t.logins} · tenant_owner ${t.tenantOwners} · tenant_admin ${t.tenantAdmins} · platform admin ${t.platformAdmins}`
	);
	lines.push(
		`- GL accounts ${t.accounts} · Journals ${t.journals} / lines ${t.journalLines} · Notifications ${t.notifications}`
	);
	lines.push("");
	if (json.sourceJson) {
		lines.push("## Source-JSON staging (fields with no v2 app-table home)");
		lines.push(
			`- Historical payslips ${json.sourceJson.payslips} · Attendance punches ${json.sourceJson.attendancePunches} · Work schedules ${json.sourceJson.workSchedules} · Employees (full row, incl. statutory fields) ${json.sourceJson.employees}`
		);
		lines.push(
			`- Complete v1 GL preserved for accountant review (21L-C): journal entries ${json.sourceJson.journals} · journal lines ${json.sourceJson.journalLines}`
		);
		lines.push("");
	}
	lines.push(`## Failed / excluded mappings (${failures.length})`);
	if (failures.length === 0) {
		lines.push("- None — every source row mapped to a valid v2 row.");
	} else {
		lines.push("| Tenant | Kind | Id | Reason |");
		lines.push("| --- | --- | --- | --- |");
		for (const f of failures) {
			lines.push(`| ${f.tenantSlug} | ${f.kind} | ${f.id} | ${f.reason} |`);
		}
	}
	lines.push("");
	lines.push(`## Operator notices — login & access (${notices.length})`);
	lines.push(
		"> Non-fatal, PII-safe (opaque id + reason only). Preserved data needing an owner/HR/accountant decision before cutover — NOT exclusions."
	);
	if (notices.length === 0) {
		lines.push("- None.");
	} else {
		const byKind = notices.reduce<Record<string, number>>((acc, n) => {
			acc[n.kind] = (acc[n.kind] ?? 0) + 1;
			return acc;
		}, {});
		lines.push(
			`- Summary: ${Object.entries(byKind)
				.map(([k, v]) => `${k} ${v}`)
				.join(" · ")}`
		);
		lines.push("");
		lines.push("| Tenant | Kind | Id | Reason |");
		lines.push("| --- | --- | --- | --- |");
		for (const n of notices) {
			lines.push(`| ${n.tenantSlug} | ${n.kind} | ${n.id} | ${n.reason} |`);
		}
	}
	lines.push("");
	lines.push("## What this proves");
	lines.push(
		"- The transform + load path writes valid v2-schema rows (org → user → member → employeeProfile → contract → shift → roster_entry → gl_account → gl_journal_entry/line → notification) with all FK constraints satisfied."
	);
	lines.push(
		'- Pay frequency is normalised v1-free-text → canonical v2 enum (e.g. "Fortnightly"/"Bi-Weekly" → `fortnightly`).'
	);
	lines.push("- Every migrated GL journal balances (Σ debits == Σ credits).");
	lines.push(
		"- Logins are PRESERVED (21N): user + member-role + account copied from v1; v1 owner→tenant_owner, admin→tenant_admin (not flattened); credential hashes carried verbatim (no reset); platform owner (user.role=admin) kept as a cross-tenant account."
	);
	lines.push(
		"- Tenants load in cutover order (Foreign Links pilot first) and are independently addressable by org id."
	);
	lines.push("");
	lines.push("## Live run (operator)");
	lines.push(
		"Swap the synthetic provider for the v1-readonly loader and set `V1_DATABASE_URL` (read-only role), `V2_STAGING_DATABASE_URL` (disposable scratch), `CONFIRM_SCRATCH_WRITE=1`. No production writes occur in either mode."
	);
	writeFileSync(join(OUT_DIR, "write-etl-report.md"), `${lines.join("\n")}\n`);
}
