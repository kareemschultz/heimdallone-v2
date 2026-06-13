// biome-ignore-all lint: write-ETL transformers (Phase 21E dry-run).
//
// PURE v1-shape → v2-insert mappers. No DB, no env: unit-verifiable. Each mapper
// takes a v1-shaped source row + the resolved v2 parent ids and returns a plain
// row object ready for a drizzle insert. The migration "intent capture" lives
// here — v1 quirks are normalised to v2's clean model (e.g. pay frequency via the
// canonical resolver; GL journals must balance) rather than copied verbatim.

import { createId } from "@paralleldrive/cuid2";
import { validateJournalLines } from "../../../packages/api/src/utils/gl-logic";
import { resolvePayFrequency } from "../../../packages/payroll-engine/src/pay-frequency";

// ── v1-shaped source types (subset we migrate; clearly the INTENT, not all v1) ──
export interface V1Tenant {
	id: string;
	name: string;
	slug: string;
}
export interface V1Employee {
	email: string;
	firstName: string;
	id: string;
	lastName?: string | null;
	// optional login user (v1 had a users table); null => employee without a login
	user?: { id: string; name: string; email: string } | null;
}
export interface V1Contract {
	baseSalary: string;
	currency?: string;
	employeeId: string;
	id: string;
	name: string;
	// v1 free-text frequency (e.g. "fortnightly", "Bi-Weekly") — normalised below.
	payFrequency: string;
	startDate: string; // YYYY-MM-DD
	wageType: "daily" | "monthly" | "hourly";
}
export interface V1Shift {
	id: string;
	name: string;
}
export interface V1RosterEntry {
	customEndMinutes?: number | null;
	customStartMinutes?: number | null;
	date: string; // YYYY-MM-DD
	employeeId: string;
	id: string;
	isApproved?: boolean;
	note?: string | null;
	overrideType?: "none" | "custom_hours" | "day_off" | "swap";
	shiftId?: string | null;
}
export interface V1Account {
	code: string;
	id: string;
	name: string;
	parentCode?: string | null;
	type: "asset" | "liability" | "equity" | "income" | "expense";
}
export interface V1JournalLine {
	accountCode: string;
	credit: number;
	debit: number;
	description?: string | null;
	linkedPayslipId?: string | null;
}
export interface V1Journal {
	currency?: string;
	description?: string | null;
	entryDate: string; // YYYY-MM-DD
	id: string;
	lines: V1JournalLine[];
	reference: string;
	source?: "payroll" | "manual" | "opening_balance" | "adjustment";
}
export interface V1Notification {
	body?: string | null;
	entityId?: string | null;
	entityType?: string | null;
	id: string;
	isRead?: boolean;
	title: string;
	type: string;
	userId: string; // maps to a migrated v2 user id
}
export interface V1TenantSource {
	accounts: V1Account[];
	contracts: V1Contract[];
	employees: V1Employee[];
	journals: V1Journal[];
	notifications: V1Notification[];
	rosters: V1RosterEntry[];
	shifts: V1Shift[];
	tenant: V1Tenant;
}

function toDate(s: string): Date {
	return new Date(`${s}T00:00:00.000Z`);
}

// ── organization / user / member ──
export function mapOrganization(t: V1Tenant) {
	return {
		id: t.id,
		name: t.name,
		slug: t.slug,
		createdAt: new Date(),
	};
}

export function mapUser(u: { id: string; name: string; email: string }) {
	return {
		id: u.id,
		name: u.name,
		email: u.email,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

export function mapMember(orgId: string, userId: string, role: string) {
	return {
		id: createId(),
		organizationId: orgId,
		userId,
		role,
		createdAt: new Date(),
	};
}

// ── employeeProfile ──
export function mapEmployee(e: V1Employee, orgId: string) {
	return {
		id: e.id,
		organizationId: orgId,
		userId: e.user?.id ?? null,
		firstName: e.firstName,
		lastName: e.lastName ?? null,
		email: e.email,
		isActive: true,
	};
}

// ── contract (the fortnightly fix lands here: v1 free-text freq → v2 enum) ──
const VALID_WAGE = new Set(["daily", "monthly", "hourly"]);
export function mapContract(c: V1Contract, orgId: string) {
	const freq = resolvePayFrequency(c.payFrequency);
	if (!freq) {
		throw new Error(
			`contract ${c.id}: unmappable pay frequency "${c.payFrequency}"`
		);
	}
	if (!VALID_WAGE.has(c.wageType)) {
		throw new Error(`contract ${c.id}: invalid wage type "${c.wageType}"`);
	}
	return {
		id: c.id,
		organizationId: orgId,
		employeeId: c.employeeId,
		contractName: c.name,
		startDate: toDate(c.startDate),
		wageType: c.wageType,
		payFrequency: freq, // normalised to the canonical v2 enum value
		baseSalary: c.baseSalary,
		salaryCurrency: c.currency ?? "GYD",
		status: "active" as const,
	};
}

// ── shift ──
export function mapShift(s: V1Shift, orgId: string) {
	return { id: s.id, organizationId: orgId, name: s.name, isActive: true };
}

// ── roster_entry ──
export function mapRosterEntry(r: V1RosterEntry, orgId: string) {
	const override = r.overrideType ?? "none";
	return {
		id: r.id,
		organizationId: orgId,
		employeeId: r.employeeId,
		date: toDate(r.date),
		shiftId: r.shiftId ?? null,
		overrideType: override,
		customStartMinutes:
			override === "custom_hours" ? (r.customStartMinutes ?? null) : null,
		customEndMinutes:
			override === "custom_hours" ? (r.customEndMinutes ?? null) : null,
		note: r.note ?? null,
		isApproved: r.isApproved ?? false,
	};
}

// ── gl_account ──
export function mapAccount(a: V1Account, orgId: string) {
	return {
		id: a.id,
		organizationId: orgId,
		code: a.code,
		name: a.name,
		type: a.type,
		isPostable: true,
		isArchived: false,
	};
}

// ── gl_journal_entry + lines (validated balanced; codes resolved to ids) ──
export function mapJournal(
	j: V1Journal,
	orgId: string,
	accountIdByCode: Map<string, string>
) {
	// Reuse the router's invariant: the journal MUST balance to migrate.
	validateJournalLines(
		j.lines.map((l) => ({
			accountId: l.accountCode,
			debit: l.debit,
			credit: l.credit,
		}))
	);
	const entry = {
		id: j.id,
		organizationId: orgId,
		reference: j.reference,
		description: j.description ?? null,
		entryDate: toDate(j.entryDate),
		currency: j.currency ?? "GYD",
		source: j.source ?? "opening_balance",
		status: "posted" as const,
		postedAt: new Date(),
	};
	const lines = j.lines.map((l) => {
		const accountId = accountIdByCode.get(l.accountCode);
		if (!accountId) {
			throw new Error(
				`journal ${j.reference}: line references unknown account code ${l.accountCode}`
			);
		}
		return {
			id: createId(),
			organizationId: orgId,
			journalEntryId: j.id,
			accountId,
			debitAmount: l.debit.toFixed(2),
			creditAmount: l.credit.toFixed(2),
			description: l.description ?? null,
			linkedPayslipId: l.linkedPayslipId ?? null,
		};
	});
	return { entry, lines };
}

// ── notification ──
export function mapNotification(n: V1Notification, orgId: string) {
	return {
		id: n.id,
		organizationId: orgId,
		userId: n.userId,
		type: n.type,
		title: n.title,
		body: n.body ?? null,
		entityType: n.entityType ?? null,
		entityId: n.entityId ?? null,
		readAt: n.isRead ? new Date() : null,
	};
}
