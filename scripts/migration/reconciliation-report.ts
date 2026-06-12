// biome-ignore-all lint: one-shot reconciliation report generator (Phase 21C).
//
// PII-SAFE by construction: emits classifications, DELTAS (in cents), counts,
// and opaque IDs only — never absolute salary amounts, names, emails, or bank
// data. (A delta of 0 or 2 cents reveals nothing about a salary.)

import type { AttendanceAudit } from "./reconcile-attendance";
import type {
	PayslipReconResult,
	ReconClassification,
} from "./reconcile-payslips";

export type StatutoryFieldStatus = {
	field: string;
	present: number;
	total: number;
	status: "mapped" | "manual_review";
	note?: string;
};

export type TenantReconSummary = {
	tenantId: string;
	name: string;
	payslips: number;
	exact: number;
	rounding: number;
	review: number;
	blocked: number;
	v1Bug: number;
};

export type ReconciliationResult = {
	generatedAt: string;
	v1Url: string;
	scratchDb: string | null;
	scratchCounts: Record<string, number> | null;
	tenants: TenantReconSummary[];
	payslips: PayslipReconResult[];
	componentSummary: {
		component: string;
		counts: Record<ReconClassification, number>;
	}[];
	attendance: AttendanceAudit;
	statutory: StatutoryFieldStatus[];
	readiness: "ready" | "ready_with_manual_review" | "blocked";
	blockers: string[];
	next21D: string[];
};

const CLASS_ORDER: ReconClassification[] = [
	"exact_match",
	"acceptable_rounding",
	"requires_manual_review",
	"v1_bug_corrected",
	"mapping_gap",
	"v2_engine_gap",
];

/** Machine report: deltas + classifications + opaque IDs only (no absolute money). */
export function toJson(r: ReconciliationResult): string {
	const payslips = r.payslips.map((p) => ({
		payslipId: p.payslipId,
		tenantId: p.tenantId,
		employeeId: p.employeeId,
		periodId: p.periodId,
		isReversal: p.isReversal,
		overall: p.overall,
		checks: p.checks.map((c) => ({
			component: c.component,
			deltaCents: c.deltaCents,
			classification: c.classification,
			note: c.note,
		})),
	}));
	return JSON.stringify(
		{
			generatedAt: r.generatedAt,
			v1Url: r.v1Url,
			scratchDb: r.scratchDb,
			scratchCounts: r.scratchCounts,
			tenants: r.tenants,
			componentSummary: r.componentSummary,
			attendance: r.attendance,
			statutory: r.statutory,
			readiness: r.readiness,
			blockers: r.blockers,
			next21D: r.next21D,
			payslips,
		},
		null,
		2
	);
}

export function toMarkdown(r: ReconciliationResult): string {
	const L: string[] = [];
	L.push("# v1 → v2 Payroll/Attendance Reconciliation Report");
	L.push("");
	L.push(`**Generated:** ${r.generatedAt}`);
	L.push(`**v1 source (read-only):** \`${r.v1Url}\``);
	L.push(
		`**Scratch DB:** ${r.scratchDb ? `\`${r.scratchDb}\`` : "_not run this pass (reconciliation is DB-free; staging is opt-in)_"}`
	);
	L.push("");
	L.push(
		"> Reconciliation runs v1's OWN payslip inputs through v2's statutory rules and compares"
	);
	L.push(
		"> against v1's computed results. No writes to v1 or production v2. Amounts are shown as"
	);
	L.push(
		"> DELTAS only (PII-safe). Earnings (gross/overtime/Saturday) are roster-derived → blocked on 21D."
	);
	L.push("");

	L.push(`## 1. Cutover readiness: **${r.readiness.toUpperCase()}**`);
	L.push("");
	if (r.blockers.length) {
		L.push("Blockers / caveats:");
		for (const b of r.blockers) {
			L.push(`- ${b}`);
		}
	} else {
		L.push("_No statutory-layer blockers._");
	}
	L.push("");

	// tenant summary
	L.push("## 2. Per-tenant payslip reconciliation");
	L.push("");
	L.push(
		"| Tenant | Payslips | Exact | Rounding | Review | Blocked | v1-bug (reversal) |"
	);
	L.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
	for (const t of r.tenants) {
		L.push(
			`| ${t.name} | ${t.payslips} | ${t.exact} | ${t.rounding} | ${t.review} | ${t.blocked} | ${t.v1Bug} |`
		);
	}
	L.push("");

	// component summary
	L.push("## 3. Statutory component parity (across all reconciled payslips)");
	L.push("");
	L.push(
		"| Component | Exact | Rounding | Manual review | v2 engine gap | Mapping gap |"
	);
	L.push("| --- | ---: | ---: | ---: | ---: | ---: |");
	for (const c of r.componentSummary) {
		L.push(
			`| ${c.component} | ${c.counts.exact_match} | ${c.counts.acceptable_rounding} | ${c.counts.requires_manual_review} | ${c.counts.v2_engine_gap} | ${c.counts.mapping_gap} |`
		);
	}
	L.push("");

	// mismatch examples (delta only, opaque ids)
	const mismatches = r.payslips
		.flatMap((p) => p.checks.map((c) => ({ p, c })))
		.filter(
			({ c }) =>
				c.classification === "requires_manual_review" ||
				c.classification === "v2_engine_gap"
		)
		.slice(0, 15);
	L.push(
		"## 4. Mismatch examples (review / engine gap) — delta only, PII-safe"
	);
	L.push("");
	if (mismatches.length === 0) {
		L.push(
			"_None — all reconciled statutory components match (exact or within rounding)._"
		);
	} else {
		L.push("| payslip id | component | delta (cents) | note |");
		L.push("| --- | --- | ---: | --- |");
		for (const { p, c } of mismatches) {
			L.push(
				`| ${p.payslipId} | ${c.component} | ${c.deltaCents} | ${c.note ?? ""} |`
			);
		}
	}
	L.push("");

	// attendance
	L.push("## 5. Attendance mapping audit");
	L.push("");
	L.push(`Total punches: **${r.attendance.totalPunches}**`);
	L.push("");
	L.push("| Field | Present / Total | Note |");
	L.push("| --- | --- | --- |");
	for (const f of r.attendance.fieldCoverage) {
		L.push(`| ${f.field} | ${f.present}/${f.total} | ${f.note ?? ""} |`);
	}
	L.push("");
	L.push(
		`**Roster/work-schedule blocker:** ${r.attendance.rosterGap.rosterEntries} roster entries + ${r.attendance.rosterGap.workSchedules} work schedules. ${r.attendance.rosterGap.note}`
	);
	L.push("");

	// statutory fields
	L.push("## 6. Statutory / payroll field status (employees)");
	L.push("");
	L.push("| Field | Present / Total | Status | Note |");
	L.push("| --- | --- | --- | --- |");
	for (const s of r.statutory) {
		L.push(
			`| ${s.field} | ${s.present}/${s.total} | ${s.status} | ${s.note ?? ""} |`
		);
	}
	L.push("");

	// next 21D
	L.push("## 7. Feature builds required before cutover (21D)");
	L.push("");
	for (const x of r.next21D) {
		L.push(`- ${x}`);
	}
	L.push("");
	L.push("---");
	L.push("");
	L.push(
		"_Next: Phase 21D — minimal v2 feature builds (per-date roster, payroll-GL, notifications,"
	);
	L.push(
		"scheduling-rules) that unblock write-migration, then 21E dry-run cutover on a scratch DB._"
	);
	L.push("");
	return L.join("\n");
}

export function emptyCounts(): Record<ReconClassification, number> {
	const o = {} as Record<ReconClassification, number>;
	for (const k of CLASS_ORDER) {
		o[k] = 0;
	}
	return o;
}
