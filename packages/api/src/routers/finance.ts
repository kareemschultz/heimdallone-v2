/**
 * Finance router — Phase 16C.
 *
 * Costing + budgeting COORDINATION layer. Finance READS payroll actuals
 * (payslip / payslip_line_item), approved project time (project_time_entry),
 * contract rates and departments — all SELECT-only — and OWNS exactly one table:
 * finance_budget.
 *
 * GUARDRAIL: the ONLY db writes in this file target finance_budget (+ the shared
 * audit_event). There are ZERO writes to payroll / payslip / attendance /
 * project / contract / employee. Cost reports are READ MODELS computed at read
 * time, never a second ledger; this router never mutates payrollStatus, never
 * re-runs payroll, never writes a payslip. (Grep-proven in 16I.)
 *
 * Two-layer authz: AC gate (authorizedProcedure("finance", …)) + handler scope.
 * Managers may VIEW cost reports but are DEPARTMENT-SCOPED in the handler (own +
 * direct reports' departments). Payroll managers + auditor see all departments.
 */

import { db } from "@Heimdallone/db";
import { financeBudget } from "@Heimdallone/db/schema/finance";
import {
	contract,
	department,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import {
	payrollSetting,
	payslip,
	payslipLineItem,
} from "@Heimdallone/db/schema/payroll";
import { project, projectTimeEntry } from "@Heimdallone/db/schema/projects";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent, diffChanges } from "../utils/audit";
import {
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";
import { canManageBudgets, seesAllFinance } from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

// Average paid work-days per month for monthly→hourly rate derivation
// (≈ 260 work-days / 12). Used only for the project-costing ESTIMATE.
const MONTHLY_WORK_DAYS = 21.67;

const num = (v: unknown): number => Number(v ?? 0);

const dateRangeInput = z.object({
	from: z.string(), // YYYY-MM-DD inclusive
	to: z.string(), // YYYY-MM-DD inclusive
});

function toDate(s: string): Date {
	return new Date(`${s}T00:00:00.000Z`);
}

// ── CSV (mirrors the payroll router's injection-safe encoder) ──
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

// ── department scope: null = all, [] = none, [ids] = manager scope ──
async function financeDeptScope(context: unknown): Promise<string[] | null> {
	if (seesAllFinance(role(context))) {
		return null;
	}
	const me = await resolveCurrentEmployee(
		orgId(context as never),
		actorId(context as never)
	);
	if (!me) {
		return [];
	}
	const reportIds = await getDirectReportIds(me.id, orgId(context as never));
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
	return [...depts];
}

// payslip rows in [from,to] (period intersects), org-scoped, generated &
// NOT reversed. We count every non-reversed generated payslip (draft/confirmed/
// paid) as labour cost for its period — a generated payslip IS a calculated
// cost, and this matches the existing payroll cost-by-department report (which
// also counts payslips regardless of draft/confirmed status). Reversed payslips
// are excluded (they net out). Returns the base WHERE conditions array.
function payslipWindow(oid: string, from: string, to: string) {
	return [
		eq(payslip.organizationId, oid),
		eq(payslip.isReversed, false),
		lte(payslip.periodStart, toDate(to)),
		gte(payslip.periodEnd, toDate(from)),
	];
}

// ═══════════════════════════════════════════════════════════════
// COST REPORTS (finance:read)
// ═══════════════════════════════════════════════════════════════

const costReportsSummary = authorizedProcedure("finance", "read")
	.input(dateRangeInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await financeDeptScope(context);
		if (scope && scope.length === 0) {
			return emptySummary(await reportCurrency(oid));
		}
		const conds = payslipWindow(oid, input.from, input.to);
		let q = db
			.select({
				gross: sql<string>`coalesce(sum(${payslip.grossPay}),0)`,
				deductions: sql<string>`coalesce(sum(${payslip.totalDeductions}),0)`,
				net: sql<string>`coalesce(sum(${payslip.netPay}),0)`,
				employer: sql<string>`coalesce(sum(${payslip.totalEmployerContributions}),0)`,
				employees: sql<number>`count(distinct ${payslip.employeeId})`,
				payslips: sql<number>`count(*)`,
			})
			.from(payslip)
			.$dynamic();
		if (scope) {
			q = q
				.innerJoin(
					employeeWorkInfo,
					eq(payslip.employeeId, employeeWorkInfo.employeeId)
				)
				.where(and(...conds, inArray(employeeWorkInfo.departmentId, scope)));
		} else {
			q = q.where(and(...conds));
		}
		const [r] = await q;
		const gross = num(r?.gross);
		const employer = num(r?.employer);
		return {
			grossPay: gross,
			totalDeductions: num(r?.deductions),
			netPay: num(r?.net),
			totalEmployerContributions: employer,
			totalCost: gross + employer,
			employeeCount: num(r?.employees),
			payslipCount: num(r?.payslips),
			currency: await reportCurrency(oid),
			scoped: scope !== null,
		};
	});

function emptySummary(currency: string) {
	return {
		grossPay: 0,
		totalDeductions: 0,
		netPay: 0,
		totalEmployerContributions: 0,
		totalCost: 0,
		employeeCount: 0,
		payslipCount: 0,
		currency,
		scoped: true,
	};
}

async function reportCurrency(oid: string): Promise<string> {
	const [s] = await db
		.select({ c: payrollSetting.defaultCurrency })
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, oid))
		.limit(1);
	return s?.c ?? "GYD";
}

const costReportsByDepartment = authorizedProcedure("finance", "read")
	.input(dateRangeInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await financeDeptScope(context);
		if (scope && scope.length === 0) {
			return [] as DepartmentCostRow[];
		}
		const conds = payslipWindow(oid, input.from, input.to);
		if (scope) {
			conds.push(inArray(employeeWorkInfo.departmentId, scope));
		}
		const rows = await db
			.select({
				departmentId: employeeWorkInfo.departmentId,
				departmentName: department.name,
				gross: sql<string>`coalesce(sum(${payslip.grossPay}),0)`,
				employer: sql<string>`coalesce(sum(${payslip.totalEmployerContributions}),0)`,
				employees: sql<number>`count(distinct ${payslip.employeeId})`,
			})
			.from(payslip)
			.innerJoin(
				employeeWorkInfo,
				eq(payslip.employeeId, employeeWorkInfo.employeeId)
			)
			.leftJoin(department, eq(employeeWorkInfo.departmentId, department.id))
			.where(and(...conds))
			.groupBy(employeeWorkInfo.departmentId, department.name);
		return rows.map((r) => {
			const gross = num(r.gross);
			const employer = num(r.employer);
			return {
				departmentId: r.departmentId,
				departmentName: r.departmentName ?? "Unassigned",
				grossPay: gross,
				totalEmployerContributions: employer,
				totalCost: gross + employer,
				employeeCount: num(r.employees),
			} satisfies DepartmentCostRow;
		});
	});

interface DepartmentCostRow {
	departmentId: string | null;
	departmentName: string;
	employeeCount: number;
	grossPay: number;
	totalCost: number;
	totalEmployerContributions: number;
}

const costReportsByCostType = authorizedProcedure("finance", "read")
	.input(dateRangeInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await financeDeptScope(context);
		if (scope && scope.length === 0) {
			return [] as { type: string; amount: number }[];
		}
		const conds = payslipWindow(oid, input.from, input.to);
		let q = db
			.select({
				type: payslipLineItem.type,
				amount: sql<string>`coalesce(sum(${payslipLineItem.amount}),0)`,
			})
			.from(payslipLineItem)
			.innerJoin(payslip, eq(payslipLineItem.payslipId, payslip.id))
			.$dynamic();
		if (scope) {
			q = q
				.innerJoin(
					employeeWorkInfo,
					eq(payslip.employeeId, employeeWorkInfo.employeeId)
				)
				.where(and(...conds, inArray(employeeWorkInfo.departmentId, scope)));
		} else {
			q = q.where(and(...conds));
		}
		const rows = await q.groupBy(payslipLineItem.type);
		return rows.map((r) => ({ type: r.type, amount: num(r.amount) }));
	});

const costReportsTrend = authorizedProcedure("finance", "read")
	.input(dateRangeInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await financeDeptScope(context);
		if (scope && scope.length === 0) {
			return [] as {
				periodStart: string;
				periodEnd: string;
				totalCost: number;
			}[];
		}
		const conds = payslipWindow(oid, input.from, input.to);
		let q = db
			.select({
				periodStart: payslip.periodStart,
				periodEnd: payslip.periodEnd,
				total: sql<string>`coalesce(sum(${payslip.grossPay} + ${payslip.totalEmployerContributions}),0)`,
			})
			.from(payslip)
			.$dynamic();
		if (scope) {
			q = q
				.innerJoin(
					employeeWorkInfo,
					eq(payslip.employeeId, employeeWorkInfo.employeeId)
				)
				.where(and(...conds, inArray(employeeWorkInfo.departmentId, scope)));
		} else {
			q = q.where(and(...conds));
		}
		const rows = await q
			.groupBy(payslip.periodStart, payslip.periodEnd)
			.orderBy(payslip.periodStart);
		return rows.map((r) => ({
			periodStart: ymd(r.periodStart),
			periodEnd: ymd(r.periodEnd),
			totalCost: num(r.total),
		}));
	});

function ymd(d: Date | string): string {
	const dt = typeof d === "string" ? new Date(d) : d;
	return dt.toISOString().slice(0, 10);
}

// ── project / job costing (ESTIMATE — time × contract-derived rate) ──
const costReportsProjectCosting = authorizedProcedure("finance", "read")
	.input(dateRangeInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		// Managers see all-project costing only if they see all finance; otherwise
		// project costing is management-only data → empty for scoped managers.
		if (!seesAllFinance(role(context))) {
			return { isEstimate: true, method: PROJECT_COST_METHOD, projects: [] };
		}
		const entries = await db
			.select({
				projectId: projectTimeEntry.projectId,
				projectName: project.name,
				employeeId: projectTimeEntry.employeeId,
				minutes: projectTimeEntry.minutes,
			})
			.from(projectTimeEntry)
			.innerJoin(project, eq(projectTimeEntry.projectId, project.id))
			.where(
				and(
					eq(projectTimeEntry.organizationId, oid),
					eq(projectTimeEntry.status, "approved"),
					gte(projectTimeEntry.entryDate, toDate(input.from)),
					lte(projectTimeEntry.entryDate, toDate(input.to))
				)
			);
		if (entries.length === 0) {
			return { isEstimate: true, method: PROJECT_COST_METHOD, projects: [] };
		}
		const rateByEmployee = await hourlyRateByEmployee(oid, [
			...new Set(entries.map((e) => e.employeeId)),
		]);
		const acc = new Map<
			string,
			{ name: string; minutes: number; cost: number; people: Set<string> }
		>();
		for (const e of entries) {
			const cur = acc.get(e.projectId) ?? {
				name: e.projectName,
				minutes: 0,
				cost: 0,
				people: new Set<string>(),
			};
			const rate = rateByEmployee.get(e.employeeId) ?? 0;
			cur.minutes += e.minutes;
			cur.cost += (e.minutes / 60) * rate;
			cur.people.add(e.employeeId);
			acc.set(e.projectId, cur);
		}
		const projects = [...acc.entries()]
			.map(([projectId, v]) => ({
				projectId,
				projectName: v.name,
				hours: Math.round((v.minutes / 60) * 100) / 100,
				estimatedCost: Math.round(v.cost * 100) / 100,
				contributorCount: v.people.size,
			}))
			.sort((a, b) => b.estimatedCost - a.estimatedCost);
		return {
			isEstimate: true,
			method: PROJECT_COST_METHOD,
			currency: await reportCurrency(oid),
			projects,
		};
	});

const PROJECT_COST_METHOD =
	"Estimate: approved project hours × an hourly rate derived from each contributor's active contract (not payslip allocation).";

async function hourlyRateByEmployee(
	oid: string,
	employeeIds: string[]
): Promise<Map<string, number>> {
	const map = new Map<string, number>();
	if (employeeIds.length === 0) {
		return map;
	}
	const [setting] = await db
		.select({ hours: payrollSetting.standardHoursPerDay })
		.from(payrollSetting)
		.where(eq(payrollSetting.organizationId, oid))
		.limit(1);
	const stdHours = num(setting?.hours) || 8;
	const contracts = await db
		.select({
			employeeId: contract.employeeId,
			baseSalary: contract.baseSalary,
			wageType: contract.wageType,
		})
		.from(contract)
		.where(
			and(
				eq(contract.organizationId, oid),
				eq(contract.status, "active"),
				inArray(contract.employeeId, employeeIds)
			)
		);
	for (const c of contracts) {
		const base = num(c.baseSalary);
		let rate = 0;
		if (c.wageType === "hourly") {
			rate = base;
		} else if (c.wageType === "daily") {
			rate = stdHours > 0 ? base / stdHours : 0;
		} else {
			// monthly
			const monthlyHours = stdHours * MONTHLY_WORK_DAYS;
			rate = monthlyHours > 0 ? base / monthlyHours : 0;
		}
		// First active contract wins (employees normally have one).
		if (!map.has(c.employeeId)) {
			map.set(c.employeeId, rate);
		}
	}
	return map;
}

// ═══════════════════════════════════════════════════════════════
// BUDGETS (read: finance:read · mutate: finance:manage_budget)
// ═══════════════════════════════════════════════════════════════

const budgetsList = authorizedProcedure("finance", "read")
	.input(
		z
			.object({
				scope: z.enum(["organization", "department", "project"]).optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		// Department-scope managers the same way budgetsVariance does: they only
		// see department budgets within their own + direct reports' departments —
		// never org-wide totals or other departments' budgets.
		const scope = await financeDeptScope(context);
		if (scope && scope.length === 0) {
			return [];
		}
		const conds = [eq(financeBudget.organizationId, oid)];
		if (input?.scope) {
			conds.push(eq(financeBudget.scope, input.scope));
		}
		const rows = await db
			.select()
			.from(financeBudget)
			.where(and(...conds))
			.orderBy(desc(financeBudget.periodStart));
		const visible = scope
			? rows.filter(
					(b) =>
						b.scope === "department" &&
						b.scopeId !== null &&
						scope.includes(b.scopeId)
				)
			: rows;
		return visible.map(serializeBudget);
	});

const budgetsGetById = authorizedProcedure("finance", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [row] = await db
			.select()
			.from(financeBudget)
			.where(
				and(
					eq(financeBudget.id, input.id),
					eq(financeBudget.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Budget not found." });
		}
		// Same dept-scope check as budgetsList/budgetsVariance — a scoped manager
		// may only open a department budget within their scope.
		const scope = await financeDeptScope(context);
		if (
			scope &&
			(row.scope !== "department" ||
				row.scopeId === null ||
				!scope.includes(row.scopeId))
		) {
			throw new ORPCError("NOT_FOUND", { message: "Budget not found." });
		}
		return serializeBudget(row);
	});

function serializeBudget(row: typeof financeBudget.$inferSelect) {
	return {
		id: row.id,
		scope: row.scope,
		scopeId: row.scopeId,
		label: row.label,
		category: row.category,
		periodStart: ymd(row.periodStart),
		periodEnd: ymd(row.periodEnd),
		currency: row.currency,
		budgetedAmount: num(row.budgetedAmount),
		notes: row.notes,
	};
}

const budgetMutationInput = z.object({
	scope: z.enum(["organization", "department", "project"]),
	scopeId: z.string().nullable().optional(),
	label: z.string().min(1),
	category: z.enum(["labour", "total"]).default("labour"),
	periodStart: z.string(),
	periodEnd: z.string(),
	currency: z.string().min(1),
	budgetedAmount: z.number().nonnegative(),
	notes: z.string().nullable().optional(),
});

// Tenant-verify the soft scopeId against a real department/project in this org.
async function verifyScopeId(
	oid: string,
	scope: "organization" | "department" | "project",
	scopeId: string | null | undefined
): Promise<string | null> {
	if (scope === "organization") {
		return null; // org-wide budgets have no scopeId
	}
	if (!scopeId) {
		throw new ORPCError("BAD_REQUEST", {
			message: `A ${scope} budget requires a ${scope}.`,
		});
	}
	if (scope === "department") {
		const [d] = await db
			.select({ id: department.id })
			.from(department)
			.where(
				and(eq(department.id, scopeId), eq(department.organizationId, oid))
			)
			.limit(1);
		if (!d) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Department not found in this organization.",
			});
		}
		return d.id;
	}
	const [p] = await db
		.select({ id: project.id })
		.from(project)
		.where(and(eq(project.id, scopeId), eq(project.organizationId, oid)))
		.limit(1);
	if (!p) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Project not found in this organization.",
		});
	}
	return p.id;
}

const budgetsCreate = authorizedProcedure("finance", "manage_budget")
	.input(budgetMutationInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		if (!canManageBudgets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const scopeId = await verifyScopeId(oid, input.scope, input.scopeId);
		const id = createId();
		await db.insert(financeBudget).values({
			id,
			organizationId: oid,
			scope: input.scope,
			scopeId,
			label: input.label,
			category: input.category,
			periodStart: toDate(input.periodStart),
			periodEnd: toDate(input.periodEnd),
			currency: input.currency,
			budgetedAmount: input.budgetedAmount.toFixed(2),
			notes: input.notes ?? null,
			createdBy: actorId(context),
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "finance_budget",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { scope: input.scope, label: input.label },
		});
		return { id };
	});

const budgetsUpdate = authorizedProcedure("finance", "manage_budget")
	.input(budgetMutationInput.partial().extend({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		if (!canManageBudgets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [existing] = await db
			.select()
			.from(financeBudget)
			.where(
				and(
					eq(financeBudget.id, input.id),
					eq(financeBudget.organizationId, oid)
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Budget not found." });
		}
		const nextScope = input.scope ?? existing.scope;
		const scopeId =
			input.scope !== undefined || input.scopeId !== undefined
				? await verifyScopeId(oid, nextScope, input.scopeId ?? existing.scopeId)
				: existing.scopeId;
		const patch: Partial<typeof financeBudget.$inferInsert> = {
			scope: nextScope,
			scopeId,
		};
		if (input.label !== undefined) {
			patch.label = input.label;
		}
		if (input.category !== undefined) {
			patch.category = input.category;
		}
		if (input.periodStart !== undefined) {
			patch.periodStart = toDate(input.periodStart);
		}
		if (input.periodEnd !== undefined) {
			patch.periodEnd = toDate(input.periodEnd);
		}
		if (input.currency !== undefined) {
			patch.currency = input.currency;
		}
		if (input.budgetedAmount !== undefined) {
			patch.budgetedAmount = input.budgetedAmount.toFixed(2);
		}
		if (input.notes !== undefined) {
			patch.notes = input.notes;
		}
		await db
			.update(financeBudget)
			.set(patch)
			.where(
				and(
					eq(financeBudget.id, input.id),
					eq(financeBudget.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "finance_budget",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			changes: diffChanges(existing, patch as never),
		});
		return { id: input.id };
	});

const budgetsRemove = authorizedProcedure("finance", "manage_budget")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		if (!canManageBudgets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const [existing] = await db
			.select({ id: financeBudget.id })
			.from(financeBudget)
			.where(
				and(
					eq(financeBudget.id, input.id),
					eq(financeBudget.organizationId, oid)
				)
			)
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Budget not found." });
		}
		await db
			.delete(financeBudget)
			.where(
				and(
					eq(financeBudget.id, input.id),
					eq(financeBudget.organizationId, oid)
				)
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "finance_budget",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ── budget vs actual variance ──
const budgetsVariance = authorizedProcedure("finance", "read")
	.input(dateRangeInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await financeDeptScope(context);
		// Select budgets overlapping the window.
		const budgets = await db
			.select()
			.from(financeBudget)
			.where(
				and(
					eq(financeBudget.organizationId, oid),
					lte(financeBudget.periodStart, toDate(input.to)),
					gte(financeBudget.periodEnd, toDate(input.from))
				)
			)
			.orderBy(desc(financeBudget.periodStart));

		const results: BudgetVarianceRow[] = [];
		for (const b of budgets) {
			// Manager dept-scope: only department budgets within scope; org/project
			// budgets are all-finance only.
			if (
				scope &&
				(b.scope !== "department" || !b.scopeId || !scope.includes(b.scopeId))
			) {
				continue;
			}
			const actual = await actualCostForBudget(oid, b);
			const budgeted = num(b.budgetedAmount);
			results.push({
				budget: serializeBudget(b),
				actualCost: Math.round(actual * 100) / 100,
				variance: Math.round((budgeted - actual) * 100) / 100,
				pctUsed:
					budgeted > 0 ? Math.round((actual / budgeted) * 1000) / 10 : null,
			});
		}
		return results;
	});

interface BudgetVarianceRow {
	actualCost: number;
	budget: ReturnType<typeof serializeBudget>;
	pctUsed: number | null;
	variance: number;
}

// Actual labour cost over a budget's OWN period, by its scope. SELECT-only.
async function actualCostForBudget(
	oid: string,
	b: typeof financeBudget.$inferSelect
): Promise<number> {
	const from = ymd(b.periodStart);
	const to = ymd(b.periodEnd);
	if (b.scope === "project") {
		if (!b.scopeId) {
			return 0;
		}
		const entries = await db
			.select({
				employeeId: projectTimeEntry.employeeId,
				minutes: projectTimeEntry.minutes,
			})
			.from(projectTimeEntry)
			.where(
				and(
					eq(projectTimeEntry.organizationId, oid),
					eq(projectTimeEntry.projectId, b.scopeId),
					eq(projectTimeEntry.status, "approved"),
					gte(projectTimeEntry.entryDate, toDate(from)),
					lte(projectTimeEntry.entryDate, toDate(to))
				)
			);
		if (entries.length === 0) {
			return 0;
		}
		const rates = await hourlyRateByEmployee(oid, [
			...new Set(entries.map((e) => e.employeeId)),
		]);
		return entries.reduce(
			(sum, e) => sum + (e.minutes / 60) * (rates.get(e.employeeId) ?? 0),
			0
		);
	}
	// organization or department → payslip actuals (gross + employer)
	const conds = payslipWindow(oid, from, to);
	if (b.scope === "department" && b.scopeId) {
		const rows = await db
			.select({
				total: sql<string>`coalesce(sum(${payslip.grossPay} + ${payslip.totalEmployerContributions}),0)`,
			})
			.from(payslip)
			.innerJoin(
				employeeWorkInfo,
				eq(payslip.employeeId, employeeWorkInfo.employeeId)
			)
			.where(and(...conds, eq(employeeWorkInfo.departmentId, b.scopeId)));
		return num(rows[0]?.total);
	}
	const rows = await db
		.select({
			total: sql<string>`coalesce(sum(${payslip.grossPay} + ${payslip.totalEmployerContributions}),0)`,
		})
		.from(payslip)
		.where(and(...conds));
	return num(rows[0]?.total);
}

// ═══════════════════════════════════════════════════════════════
// EXPORT (finance:export)
// ═══════════════════════════════════════════════════════════════

const exportCostCsv = authorizedProcedure("finance", "export")
	.input(
		dateRangeInput.extend({
			report: z.enum(["summary", "byDepartment", "projectCosting"]),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const scope = await financeDeptScope(context);
		const currency = await reportCurrency(oid);
		const stamp = `${input.from}_${input.to}`;

		if (input.report === "byDepartment") {
			const conds = payslipWindow(oid, input.from, input.to);
			if (scope && scope.length === 0) {
				return { filename: `cost-by-department_${stamp}.csv`, csv: "" };
			}
			if (scope) {
				conds.push(inArray(employeeWorkInfo.departmentId, scope));
			}
			const rows = await db
				.select({
					name: department.name,
					gross: sql<string>`coalesce(sum(${payslip.grossPay}),0)`,
					employer: sql<string>`coalesce(sum(${payslip.totalEmployerContributions}),0)`,
				})
				.from(payslip)
				.innerJoin(
					employeeWorkInfo,
					eq(payslip.employeeId, employeeWorkInfo.employeeId)
				)
				.leftJoin(department, eq(employeeWorkInfo.departmentId, department.id))
				.where(and(...conds))
				.groupBy(department.name);
			const body = csvRows([
				[
					"Department",
					"Gross",
					"Employer contributions",
					"Total cost",
					"Currency",
				],
				...rows.map((r) => {
					const gross = num(r.gross);
					const employer = num(r.employer);
					return [
						r.name ?? "Unassigned",
						gross.toFixed(2),
						employer.toFixed(2),
						(gross + employer).toFixed(2),
						currency,
					];
				}),
			]);
			return { filename: `cost-by-department_${stamp}.csv`, csv: body };
		}

		if (input.report === "projectCosting") {
			if (!seesAllFinance(role(context))) {
				return { filename: `project-costing_${stamp}.csv`, csv: "" };
			}
			const entries = await db
				.select({
					projectName: project.name,
					projectId: projectTimeEntry.projectId,
					employeeId: projectTimeEntry.employeeId,
					minutes: projectTimeEntry.minutes,
				})
				.from(projectTimeEntry)
				.innerJoin(project, eq(projectTimeEntry.projectId, project.id))
				.where(
					and(
						eq(projectTimeEntry.organizationId, oid),
						eq(projectTimeEntry.status, "approved"),
						gte(projectTimeEntry.entryDate, toDate(input.from)),
						lte(projectTimeEntry.entryDate, toDate(input.to))
					)
				);
			const rates = await hourlyRateByEmployee(oid, [
				...new Set(entries.map((e) => e.employeeId)),
			]);
			const acc = new Map<
				string,
				{ name: string; minutes: number; cost: number }
			>();
			for (const e of entries) {
				const cur = acc.get(e.projectId) ?? {
					name: e.projectName,
					minutes: 0,
					cost: 0,
				};
				cur.minutes += e.minutes;
				cur.cost += (e.minutes / 60) * (rates.get(e.employeeId) ?? 0);
				acc.set(e.projectId, cur);
			}
			const body = csvRows([
				["Project", "Hours", "Estimated cost", "Currency"],
				...[...acc.values()].map((v) => [
					v.name,
					(v.minutes / 60).toFixed(2),
					v.cost.toFixed(2),
					currency,
				]),
			]);
			return { filename: `project-costing_${stamp}.csv`, csv: body };
		}

		// summary
		const conds = payslipWindow(oid, input.from, input.to);
		let totalGross = 0;
		let totalEmployer = 0;
		if (!(scope && scope.length === 0)) {
			if (scope) {
				const [r] = await db
					.select({
						gross: sql<string>`coalesce(sum(${payslip.grossPay}),0)`,
						employer: sql<string>`coalesce(sum(${payslip.totalEmployerContributions}),0)`,
					})
					.from(payslip)
					.innerJoin(
						employeeWorkInfo,
						eq(payslip.employeeId, employeeWorkInfo.employeeId)
					)
					.where(and(...conds, inArray(employeeWorkInfo.departmentId, scope)));
				totalGross = num(r?.gross);
				totalEmployer = num(r?.employer);
			} else {
				const [r] = await db
					.select({
						gross: sql<string>`coalesce(sum(${payslip.grossPay}),0)`,
						employer: sql<string>`coalesce(sum(${payslip.totalEmployerContributions}),0)`,
					})
					.from(payslip)
					.where(and(...conds));
				totalGross = num(r?.gross);
				totalEmployer = num(r?.employer);
			}
		}
		const body = csvRows([
			["Metric", "Amount", "Currency"],
			["Gross pay", totalGross.toFixed(2), currency],
			["Employer contributions", totalEmployer.toFixed(2), currency],
			["Total labour cost", (totalGross + totalEmployer).toFixed(2), currency],
		]);
		return { filename: `cost-summary_${stamp}.csv`, csv: body };
	});

// ═══════════════════════════════════════════════════════════════
// ROUTER EXPORT
// ═══════════════════════════════════════════════════════════════

export const financeRouter = {
	costReports: {
		summary: costReportsSummary,
		byDepartment: costReportsByDepartment,
		byCostType: costReportsByCostType,
		trend: costReportsTrend,
		projectCosting: costReportsProjectCosting,
	},
	budgets: {
		list: budgetsList,
		getById: budgetsGetById,
		create: budgetsCreate,
		update: budgetsUpdate,
		remove: budgetsRemove,
		variance: budgetsVariance,
	},
	export: {
		costCsv: exportCostCsv,
	},
};
