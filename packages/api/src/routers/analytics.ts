/**
 * Analytics router — Phase 18C.
 *
 * Cross-module EXECUTIVE aggregation layer. Analytics READS from every module's
 * tables (employee_profile, contract, payslip, helpdesk_request, project,
 * crm_deal, …) — all SELECT-only — and OWNS NOTHING (no analytics_* table). KPIs
 * are read models computed at read time.
 *
 * GUARDRAIL: there are ZERO db writes in this file (no insert/update/delete) and
 * not even an audit_event — reads are not audited (consistent with other read
 * surfaces). Grep-proven in 18I.
 *
 * Two-layer authz: AC gate (authorizedProcedure("analytics", …)) + handler
 * scope. seesAllAnalytics roles (owner/admin/hr_admin/payroll_admin/auditor) see
 * the whole org; managers are scoped to their own + direct reports' departments
 * (dimensions with a department) and their own + reports' employees (helpdesk /
 * CRM, which carry an employee owner/requester rather than a department).
 *
 * Money note: every role holding `analytics` ALSO holds `finance:read`
 * (owner/admin/hr_admin/payroll_admin/manager/auditor), so payroll cost +
 * pipeline value are not separately redacted here — the analytics audience is a
 * subset of the finance audience.
 */

import { db } from "@Heimdallone/db";
import { crmDeal, crmPipelineStage } from "@Heimdallone/db/schema/crm";
import { helpdeskRequest } from "@Heimdallone/db/schema/helpdesk";
import {
	contract,
	department,
	employeeProfile,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import { payslip } from "@Heimdallone/db/schema/payroll";
import { project } from "@Heimdallone/db/schema/projects";
import { and, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import {
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";
import { seesAllAnalytics } from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const num = (v: unknown): number => Number(v ?? 0);

// Helpdesk request statuses that count as "open" (still needs work).
const OPEN_HELPDESK_STATUSES = [
	"new",
	"open",
	"in_progress",
	"waiting_on_employee",
	"waiting_on_approval",
] as const;

function toDate(s: string): Date {
	return new Date(`${s}T00:00:00.000Z`);
}

// ── CSV (mirrors the payroll/finance injection-safe encoder) ──
const CSV_FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const CSV_NEEDS_QUOTE = /[",\n\r]/;
function csvCell(value: unknown): string {
	let s = String(value ?? "");
	if (CSV_FORMULA_TRIGGER.test(s)) {
		s = `'${s}`;
	}
	s = s.replace(/"/g, '""');
	if (CSV_NEEDS_QUOTE.test(s)) {
		return `"${s}"`;
	}
	return s;
}
function csvRows(rows: unknown[][]): string {
	return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// ── scope: whole-org vs manager (department + employee scoped) ──
type Scope =
	| { all: true }
	| { all: false; deptIds: string[]; empIds: string[] };

async function analyticsScope(context: unknown): Promise<Scope> {
	if (seesAllAnalytics(role(context))) {
		return { all: true };
	}
	const oid = orgId(context as never);
	const me = await resolveCurrentEmployee(oid, actorId(context as never));
	if (!me) {
		return { all: false, deptIds: [], empIds: [] };
	}
	const reportIds = await getDirectReportIds(me.id, oid);
	const empIds = [me.id, ...reportIds];
	const rows = await db
		.select({ d: employeeWorkInfo.departmentId })
		.from(employeeWorkInfo)
		.where(inArray(employeeWorkInfo.employeeId, empIds));
	const depts = new Set<string>();
	for (const r of rows) {
		if (r.d) {
			depts.add(r.d);
		}
	}
	return { all: false, deptIds: [...depts], empIds };
}

const dateRangeInput = z.object({
	from: z.string(), // YYYY-MM-DD inclusive
	to: z.string(), // YYYY-MM-DD inclusive
});

const SCALAR = sql<number>`count(*)::int`;

// ─── individual metric reads (each SELECT-only) ───

async function readHeadcount(oid: string, scope: Scope): Promise<number> {
	const conds = [
		eq(employeeProfile.organizationId, oid),
		eq(employeeProfile.isActive, true),
	];
	if (!scope.all) {
		if (scope.deptIds.length === 0) {
			return scope.empIds.length === 0 ? 0 : await countScopedEmployees(scope);
		}
		const rows = await db
			.select({ n: SCALAR })
			.from(employeeProfile)
			.innerJoin(
				employeeWorkInfo,
				eq(employeeProfile.id, employeeWorkInfo.employeeId)
			)
			.where(
				and(...conds, inArray(employeeWorkInfo.departmentId, scope.deptIds))
			);
		return num(rows[0]?.n);
	}
	const rows = await db
		.select({ n: SCALAR })
		.from(employeeProfile)
		.where(and(...conds));
	return num(rows[0]?.n);
}

async function countScopedEmployees(scope: {
	empIds: string[];
}): Promise<number> {
	const rows = await db
		.select({ n: SCALAR })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.isActive, true),
				inArray(employeeProfile.id, scope.empIds)
			)
		);
	return num(rows[0]?.n);
}

async function readActiveContracts(oid: string, scope: Scope): Promise<number> {
	const conds = [
		eq(contract.organizationId, oid),
		eq(contract.status, "active"),
	];
	if (!scope.all) {
		if (scope.deptIds.length === 0) {
			return 0;
		}
		conds.push(inArray(contract.departmentId, scope.deptIds));
	}
	const rows = await db
		.select({ n: SCALAR })
		.from(contract)
		.where(and(...conds));
	return num(rows[0]?.n);
}

async function readPayrollCost(
	oid: string,
	scope: Scope,
	from: string,
	to: string
): Promise<{ gross: number; employer: number; currency: string }> {
	const window = [
		eq(payslip.organizationId, oid),
		eq(payslip.isReversed, false),
		lte(payslip.periodStart, toDate(to)),
		gte(payslip.periodEnd, toDate(from)),
	];
	const select = {
		gross: sql<string>`coalesce(sum(${payslip.grossPay}),0)`,
		employer: sql<string>`coalesce(sum(${payslip.totalEmployerContributions}),0)`,
		currency: sql<string>`max(${payslip.currency})`,
	};
	if (!scope.all) {
		if (scope.deptIds.length === 0) {
			return { gross: 0, employer: 0, currency: "GYD" };
		}
		const r = await db
			.select(select)
			.from(payslip)
			.innerJoin(
				employeeWorkInfo,
				eq(payslip.employeeId, employeeWorkInfo.employeeId)
			)
			.where(
				and(...window, inArray(employeeWorkInfo.departmentId, scope.deptIds))
			);
		return {
			gross: num(r[0]?.gross),
			employer: num(r[0]?.employer),
			currency: r[0]?.currency ?? "GYD",
		};
	}
	const r = await db
		.select(select)
		.from(payslip)
		.where(and(...window));
	return {
		gross: num(r[0]?.gross),
		employer: num(r[0]?.employer),
		currency: r[0]?.currency ?? "GYD",
	};
}

function helpdeskScopeCond(scope: Scope) {
	if (scope.all) {
		return;
	}
	if (scope.empIds.length === 0) {
		return sql`false`;
	}
	return or(
		inArray(helpdeskRequest.requesterEmployeeId, scope.empIds),
		inArray(helpdeskRequest.targetEmployeeId, scope.empIds)
	);
}

async function readHelpdesk(
	oid: string,
	scope: Scope
): Promise<{ open: number; overdue: number }> {
	const base = [
		eq(helpdeskRequest.organizationId, oid),
		inArray(helpdeskRequest.status, [...OPEN_HELPDESK_STATUSES]),
	];
	const scopeCond = helpdeskScopeCond(scope);
	if (scopeCond) {
		base.push(scopeCond);
	}
	const openRows = await db
		.select({ n: SCALAR })
		.from(helpdeskRequest)
		.where(and(...base));
	const overdueRows = await db
		.select({ n: SCALAR })
		.from(helpdeskRequest)
		.where(
			and(
				...base,
				lt(helpdeskRequest.resolutionDueAt, new Date()),
				isNull(helpdeskRequest.resolvedAt)
			)
		);
	return { open: num(openRows[0]?.n), overdue: num(overdueRows[0]?.n) };
}

async function readProjects(
	oid: string,
	scope: Scope
): Promise<{ active: number; atRisk: number }> {
	const base = [
		eq(project.organizationId, oid),
		isNull(project.deletedAt),
		eq(project.isArchived, false),
	];
	if (!scope.all) {
		if (scope.deptIds.length === 0) {
			return { active: 0, atRisk: 0 };
		}
		base.push(inArray(project.departmentId, scope.deptIds));
	}
	const activeRows = await db
		.select({ n: SCALAR })
		.from(project)
		.where(and(...base, eq(project.status, "active")));
	// At-risk read model: on-hold, or active-but-past-target. (Health is derived;
	// this is the dashboard heuristic, documented — see Phase 18A §6.)
	const atRiskRows = await db
		.select({ n: SCALAR })
		.from(project)
		.where(
			and(
				...base,
				or(
					eq(project.status, "on_hold"),
					and(
						eq(project.status, "active"),
						lt(project.targetEndDate, new Date())
					)
				)
			)
		);
	return { active: num(activeRows[0]?.n), atRisk: num(atRiskRows[0]?.n) };
}

function dealScopeCond(scope: Scope) {
	if (scope.all) {
		return;
	}
	if (scope.empIds.length === 0) {
		return sql`false`;
	}
	return inArray(crmDeal.ownerEmployeeId, scope.empIds);
}

async function readDeals(
	oid: string,
	scope: Scope
): Promise<{ open: number; value: number }> {
	const base = [
		eq(crmDeal.organizationId, oid),
		eq(crmDeal.status, "open"),
		isNull(crmDeal.deletedAt),
	];
	const scopeCond = dealScopeCond(scope);
	if (scopeCond) {
		base.push(scopeCond);
	}
	const rows = await db
		.select({
			n: SCALAR,
			value: sql<string>`coalesce(sum(${crmDeal.value}),0)`,
		})
		.from(crmDeal)
		.where(and(...base));
	return { open: num(rows[0]?.n), value: num(rows[0]?.value) };
}

// ═══════════════════════════════════════════════════════════════
// EXECUTIVE (analytics:read)
// ═══════════════════════════════════════════════════════════════

const executiveSummary = authorizedProcedure("analytics", "read")
	.input(dateRangeInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context as never);
		const scope = await analyticsScope(context);
		const [headcount, activeContracts, pay, helpdesk, projects, deals] =
			await Promise.all([
				readHeadcount(oid, scope),
				readActiveContracts(oid, scope),
				readPayrollCost(oid, scope, input.from, input.to),
				readHelpdesk(oid, scope),
				readProjects(oid, scope),
				readDeals(oid, scope),
			]);
		return {
			headcount,
			activeContracts,
			payrollCost: pay.gross,
			employerContributions: pay.employer,
			openHelpdesk: helpdesk.open,
			overdueHelpdesk: helpdesk.overdue,
			activeProjects: projects.active,
			atRiskProjects: projects.atRisk,
			openDeals: deals.open,
			pipelineValue: deals.value,
			currency: pay.currency,
			scoped: !scope.all,
		};
	});

const executiveHeadcountTrend = authorizedProcedure("analytics", "read")
	.input(z.object({ months: z.number().int().min(1).max(36).default(12) }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context as never);
		const scope = await analyticsScope(context);
		const now = new Date();
		const buckets: { period: string; count: number }[] = [];
		for (let i = input.months - 1; i >= 0; i--) {
			const monthEnd = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 23, 59, 59)
			);
			const conds = [
				eq(employeeProfile.organizationId, oid),
				eq(employeeProfile.isActive, true),
				lte(employeeProfile.createdAt, monthEnd),
			];
			if (!scope.all) {
				if (scope.empIds.length === 0) {
					buckets.push({ period: monthKey(monthEnd), count: 0 });
					continue;
				}
				conds.push(inArray(employeeProfile.id, scope.empIds));
			}
			const rows = await db
				.select({ n: SCALAR })
				.from(employeeProfile)
				.where(and(...conds));
			buckets.push({ period: monthKey(monthEnd), count: num(rows[0]?.n) });
		}
		return buckets;
	});

function monthKey(d: Date): string {
	const y = d.getUTCFullYear();
	const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
	return `${y}-${m}`;
}

const executivePayrollCostTrend = authorizedProcedure("analytics", "read")
	.input(dateRangeInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context as never);
		const scope = await analyticsScope(context);
		const window = [
			eq(payslip.organizationId, oid),
			eq(payslip.isReversed, false),
			lte(payslip.periodStart, toDate(input.to)),
			gte(payslip.periodEnd, toDate(input.from)),
		];
		const periodExpr = sql<string>`to_char(${payslip.periodStart}, 'YYYY-MM')`;
		const select = {
			period: periodExpr,
			total: sql<string>`coalesce(sum(${payslip.grossPay}),0)`,
		};
		if (!scope.all) {
			if (scope.deptIds.length === 0) {
				return [] as { period: string; total: number }[];
			}
			const rows = await db
				.select(select)
				.from(payslip)
				.innerJoin(
					employeeWorkInfo,
					eq(payslip.employeeId, employeeWorkInfo.employeeId)
				)
				.where(
					and(...window, inArray(employeeWorkInfo.departmentId, scope.deptIds))
				)
				.groupBy(periodExpr)
				.orderBy(periodExpr);
			return rows.map((r) => ({ period: r.period, total: num(r.total) }));
		}
		const rows = await db
			.select(select)
			.from(payslip)
			.where(and(...window))
			.groupBy(periodExpr)
			.orderBy(periodExpr);
		return rows.map((r) => ({ period: r.period, total: num(r.total) }));
	});

const executivePipelineByStage = authorizedProcedure("analytics", "read")
	.input(z.object({}).optional())
	.handler(async ({ context }) => {
		const oid = orgId(context as never);
		const scope = await analyticsScope(context);
		const base = [
			eq(crmDeal.organizationId, oid),
			eq(crmDeal.status, "open"),
			isNull(crmDeal.deletedAt),
		];
		const scopeCond = dealScopeCond(scope);
		if (scopeCond) {
			base.push(scopeCond);
		}
		const rows = await db
			.select({
				stage: crmPipelineStage.name,
				position: crmPipelineStage.position,
				count: SCALAR,
				value: sql<string>`coalesce(sum(${crmDeal.value}),0)`,
			})
			.from(crmDeal)
			.innerJoin(crmPipelineStage, eq(crmDeal.stageId, crmPipelineStage.id))
			.where(and(...base))
			.groupBy(crmPipelineStage.name, crmPipelineStage.position)
			.orderBy(crmPipelineStage.position);
		return rows.map((r) => ({
			stage: r.stage,
			count: num(r.count),
			value: num(r.value),
		}));
	});

const executiveWorkforceMix = authorizedProcedure("analytics", "read")
	.input(z.object({}).optional())
	.handler(async ({ context }) => {
		const oid = orgId(context as never);
		const scope = await analyticsScope(context);
		const conds = [
			eq(employeeProfile.organizationId, oid),
			eq(employeeProfile.isActive, true),
		];
		if (!scope.all) {
			if (scope.deptIds.length === 0) {
				return [] as { department: string; count: number }[];
			}
			conds.push(inArray(employeeWorkInfo.departmentId, scope.deptIds));
		}
		const rows = await db
			.select({
				department: sql<string>`coalesce(${department.name}, 'Unassigned')`,
				count: SCALAR,
			})
			.from(employeeProfile)
			.innerJoin(
				employeeWorkInfo,
				eq(employeeProfile.id, employeeWorkInfo.employeeId)
			)
			.leftJoin(department, eq(employeeWorkInfo.departmentId, department.id))
			.where(and(...conds))
			.groupBy(department.name);
		return rows.map((r) => ({ department: r.department, count: num(r.count) }));
	});

const executiveAttentionFeed = authorizedProcedure("analytics", "read")
	.input(z.object({}).optional())
	.handler(async ({ context }) => {
		const oid = orgId(context as never);
		const scope = await analyticsScope(context);
		const [helpdesk, projects, deals] = await Promise.all([
			readHelpdesk(oid, scope),
			readProjects(oid, scope),
			readDeals(oid, scope),
		]);
		const feed: { source: string; label: string; count: number }[] = [];
		if (helpdesk.overdue > 0) {
			feed.push({
				source: "helpdesk",
				label: "Overdue helpdesk requests",
				count: helpdesk.overdue,
			});
		}
		if (projects.atRisk > 0) {
			feed.push({
				source: "projects",
				label: "Projects at risk or overdue",
				count: projects.atRisk,
			});
		}
		if (helpdesk.open > 0) {
			feed.push({
				source: "helpdesk",
				label: "Open helpdesk requests",
				count: helpdesk.open,
			});
		}
		if (deals.open > 0) {
			feed.push({
				source: "crm",
				label: "Open deals in pipeline",
				count: deals.open,
			});
		}
		return feed;
	});

// ═══════════════════════════════════════════════════════════════
// EXPORT (analytics:export)
// ═══════════════════════════════════════════════════════════════

const exportSummaryCsv = authorizedProcedure("analytics", "export")
	.input(dateRangeInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context as never);
		const scope = await analyticsScope(context);
		const [headcount, activeContracts, pay, helpdesk, projects, deals] =
			await Promise.all([
				readHeadcount(oid, scope),
				readActiveContracts(oid, scope),
				readPayrollCost(oid, scope, input.from, input.to),
				readHelpdesk(oid, scope),
				readProjects(oid, scope),
				readDeals(oid, scope),
			]);
		const rows: unknown[][] = [
			["Metric", "Value"],
			["Headcount", headcount],
			["Active contracts", activeContracts],
			[`Payroll cost (${pay.currency})`, pay.gross],
			[`Employer contributions (${pay.currency})`, pay.employer],
			["Open helpdesk", helpdesk.open],
			["Overdue helpdesk", helpdesk.overdue],
			["Active projects", projects.active],
			["At-risk projects", projects.atRisk],
			["Open deals", deals.open],
			[`Pipeline value (${pay.currency})`, deals.value],
		];
		return {
			filename: `executive-summary-${input.from}-to-${input.to}.csv`,
			content: csvRows(rows),
		};
	});

export const analyticsRouter = {
	executive: {
		summary: executiveSummary,
		headcountTrend: executiveHeadcountTrend,
		payrollCostTrend: executivePayrollCostTrend,
		pipelineByStage: executivePipelineByStage,
		workforceMix: executiveWorkforceMix,
		attentionFeed: executiveAttentionFeed,
	},
	export: {
		summaryCsv: exportSummaryCsv,
	},
};
