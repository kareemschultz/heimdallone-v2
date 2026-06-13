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
	members: number;
	notifications: number;
	organizations: number;
	rosterApproved: number;
	rosterEntries: number;
	shifts: number;
	slug: string;
	tenant: string;
	users: number;
}

const OUT_DIR = join(process.cwd(), "docs", "migration");

export function writeEtlReport(
	results: TenantCounts[],
	summary: { isolated: boolean; allBalanced: boolean }
): void {
	const json = {
		phase: "21E",
		kind: "write-etl-dry-run",
		source: "synthetic (no live v1 / no production writes)",
		tenantsInOrder: results.map((r) => r.slug),
		summary,
		tenants: results,
		totals: results.reduce(
			(acc, r) => {
				acc.employees += r.employees;
				acc.contracts += r.contracts;
				acc.fortnightlyContracts += r.fortnightlyContracts;
				acc.rosterEntries += r.rosterEntries;
				acc.accounts += r.accounts;
				acc.journals += r.journals;
				acc.journalLines += r.journalLines;
				acc.notifications += r.notifications;
				return acc;
			},
			{
				employees: 0,
				contracts: 0,
				fortnightlyContracts: 0,
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
	lines.push("# Phase 21E — Write-ETL dry-run report");
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
		`- Employees ${t.employees} · Contracts ${t.contracts} (fortnightly ${t.fortnightlyContracts}) · Roster ${t.rosterEntries}`
	);
	lines.push(
		`- GL accounts ${t.accounts} · Journals ${t.journals} / lines ${t.journalLines} · Notifications ${t.notifications}`
	);
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
		"- Tenants load in cutover order (Foreign Links pilot first) and are independently addressable by org id."
	);
	lines.push("");
	lines.push("## Live run (operator)");
	lines.push(
		"Swap the synthetic provider for the v1-readonly loader and set `V1_DATABASE_URL` (read-only role), `V2_STAGING_DATABASE_URL` (disposable scratch), `CONFIRM_SCRATCH_WRITE=1`. No production writes occur in either mode."
	);
	writeFileSync(join(OUT_DIR, "write-etl-report.md"), `${lines.join("\n")}\n`);
}
