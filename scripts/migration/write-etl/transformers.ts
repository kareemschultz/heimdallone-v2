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
// ── v1 auth identity (21N): both v1 and v2 are Better Auth, so login preservation
// is a faithful copy of user/member/account, NOT a rebuild. user.role is the
// admin-plugin PLATFORM role ("admin" => the cross-tenant platform owner);
// member.role is the per-tenant role (owner/admin/employee). ──
export interface V1User {
	// v2 user.email is NOT NULL UNIQUE — every v1 user carries an email.
	email: string;
	emailVerified: boolean;
	id: string;
	name: string;
	// v1 user.role (admin-plugin platform role). null/"user" for normal users;
	// "admin" marks the platform owner (preserved → cross-tenant access in v2).
	platformRole: string | null;
}
export interface V1Membership {
	// v1 member.role (owner/admin/employee/…) — mapped to a v2 tenant role.
	role: string;
	userId: string;
}
// A v1 Better Auth account row (the sign-in method). credential => email/password
// (password is a Better Auth scrypt hash, carried verbatim — same verifier in v2,
// so NO reset/weakening); google => OAuth link (accountId = Google sub).
export interface V1LoginAccount {
	accessToken: string | null;
	accountId: string;
	id: string;
	idToken: string | null;
	password: string | null;
	providerId: string;
	refreshToken: string | null;
	scope: string | null;
	userId: string;
}
export interface V1Employee {
	// null => no email on file (no-login employee, 21L-B). employee_profile.email
	// is now nullable; we no longer synthesize a fake placeholder address.
	email: string | null;
	firstName: string;
	id: string;
	lastName?: string | null;
	// optional statutory/payroll attributes (21L-A). Absent => no statutory row.
	statutory?: V1Statutory | null;
	// optional login user (v1 had a users table); null => employee without a login
	user?: { id: string; name: string; email: string } | null;
}
// v1 statutory columns, normalised: *_cents → numeric amount strings, ids verbatim.
export interface V1Statutory {
	dependentChildren: number;
	hasSecondJob: boolean;
	medicalExternalPremiumAmount: string;
	medicalInsuranceOnFile: boolean;
	medicalPayrollDeductionAmount: string;
	otherDeductionsAmount: string;
	secondJobPayAmount: string;
	socialSecurityNumber: string | null;
	taxIdentificationNumber: string | null;
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
// v1 work_schedules pay-affecting richness → v2 shift_rule (21J). The shift_rule
// links to the migrated shift by the SAME id (a v1 work_schedule maps to one shift
// + one shift-specific rule). Fields with no clean target (shift window, day
// overrides) stay in the migration_source_work_schedule JSONB.
export interface V1ShiftRule {
	autoDeductBreak: boolean;
	breakMinutes: number | null;
	capDailyPaidMinutes: number | null;
	graceMinutesEarlyOut: number | null;
	graceMinutesLate: number | null;
	hasNightDifferential: boolean;
	id: string; // == migrated shift id
	isArchived: boolean;
	isFlexiTime: boolean;
	isSplitShift: boolean;
	minBreakDeductionMinutes: number | null;
	name: string;
	nightDiffEndMinutes: number | null;
	nightDiffMultiplierDen: number | null;
	nightDiffMultiplierNum: number | null;
	nightDiffStartMinutes: number | null;
	overtimeThresholdDailyMinutes: number | null;
	overtimeThresholdWeeklyMinutes: number | null;
	saturdayShiftEndMinutes: number | null;
	saturdayShiftStartMinutes: number | null;
	splitBreakEndMinutes: number | null;
	splitBreakStartMinutes: number | null;
	standardDailyMinutes: number | null;
	standardWeeklyMinutes: number | null;
	workDays: unknown;
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
	// 21N — preserved login identities for this tenant's members.
	logins: V1LoginAccount[];
	memberships: V1Membership[];
	notifications: V1Notification[];
	rosters: V1RosterEntry[];
	// Optional (21J): work-schedule pay rules. Absent on the synthetic source.
	shiftRules?: V1ShiftRule[];
	shifts: V1Shift[];
	tenant: V1Tenant;
	users: V1User[];
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

export function mapUser(u: V1User) {
	return {
		id: u.id,
		name: u.name,
		email: u.email,
		emailVerified: u.emailVerified,
		// Preserve the admin-plugin platform role verbatim (e.g. "admin" → the
		// cross-tenant platform owner). Better Auth recognises platform admins by
		// adminRoles (default ["admin"]) OR adminUserIds — both faithful.
		role: u.platformRole,
		migratedFromV1: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

// v1 member.role → v2 tenant role. v1 uses owner/admin/employee today; anything
// else is mapped to the least-privilege "employee" and reported (never silently
// elevated). The platform owner's cross-tenant power comes from user.role, not
// from a tenant role — so it is NOT in this map.
export const V1_TO_V2_MEMBER_ROLE: Record<string, string> = {
	owner: "tenant_owner",
	admin: "tenant_admin",
	employee: "employee",
};
export function mapMemberRole(v1Role: string): {
	recognized: boolean;
	role: string;
} {
	const role = V1_TO_V2_MEMBER_ROLE[v1Role];
	return role
		? { role, recognized: true }
		: { role: "employee", recognized: false };
}

export function mapMember(orgId: string, m: V1Membership) {
	return {
		id: createId(),
		organizationId: orgId,
		userId: m.userId,
		role: mapMemberRole(m.role).role,
		createdAt: new Date(),
	};
}

// ── account (the sign-in method — copied verbatim; NB: mapAccount = GL account) ──
export function mapLoginAccount(a: V1LoginAccount) {
	return {
		id: a.id,
		accountId: a.accountId,
		providerId: a.providerId,
		userId: a.userId,
		// Password hash carried verbatim (Better Auth scrypt → same verifier in v2).
		password: a.password ?? null,
		accessToken: a.accessToken ?? null,
		refreshToken: a.refreshToken ?? null,
		idToken: a.idToken ?? null,
		scope: a.scope ?? null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

// ── employeeProfile ──
// `validUserIds`, when provided, guards the employee→user FK: an employee whose
// linked user was not migrated (e.g. not a tenant member) gets a null link rather
// than a dangling reference.
export function mapEmployee(
	e: V1Employee,
	orgId: string,
	validUserIds?: Set<string>
) {
	const linkedUserId = e.user?.id ?? null;
	const userId =
		linkedUserId && (!validUserIds || validUserIds.has(linkedUserId))
			? linkedUserId
			: null;
	return {
		id: e.id,
		organizationId: orgId,
		userId,
		firstName: e.firstName,
		lastName: e.lastName ?? null,
		email: e.email, // may be null (no-login employee, 21L-B)
		isActive: true,
	};
}

// ── employee_statutory (21L-A) ──
export function mapStatutory(s: V1Statutory, employeeId: string) {
	return {
		id: createId(),
		employeeId,
		taxIdentificationNumber: s.taxIdentificationNumber ?? null,
		socialSecurityNumber: s.socialSecurityNumber ?? null,
		dependentChildren: s.dependentChildren,
		hasSecondJob: s.hasSecondJob,
		secondJobPayAmount: s.secondJobPayAmount,
		medicalInsuranceOnFile: s.medicalInsuranceOnFile,
		medicalPayrollDeductionAmount: s.medicalPayrollDeductionAmount,
		medicalExternalPremiumAmount: s.medicalExternalPremiumAmount,
		otherDeductionsAmount: s.otherDeductionsAmount,
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

// ── shift_rule (21J): v1 work_schedules richness → effective-dated shift rule ──
// Only ISO weekday-number arrays are mapped to workDays; any other v1 shape is
// left null and preserved verbatim in migration_source_work_schedule.
function isoWorkDays(v: unknown): number[] | null {
	if (
		Array.isArray(v) &&
		v.every((n) => typeof n === "number" && n >= 1 && n <= 7)
	) {
		return v as number[];
	}
	return null;
}

// Migration anchor: v1 work_schedules carry no effective dates, so the migrated
// rule opens early enough to cover all historical work dates (resolve-by-date).
const SHIFT_RULE_EFFECTIVE_FROM = "2000-01-01";

export function mapShiftRule(s: V1ShiftRule, orgId: string) {
	// Night differential num/den (v1 stored a fraction) → a single decimal rate.
	const den = s.nightDiffMultiplierDen ?? 0;
	const num = s.nightDiffMultiplierNum ?? 0;
	const nightDiffMultiplier = den > 0 ? (num / den).toFixed(2) : null;
	return {
		id: createId(),
		organizationId: orgId,
		shiftId: s.id, // links to the shift migrated from the same work_schedule
		name: s.name,
		effectiveFrom: toDate(SHIFT_RULE_EFFECTIVE_FROM),
		effectiveTo: null,
		isPublished: !s.isArchived,
		standardDailyMinutes: s.standardDailyMinutes,
		standardWeeklyMinutes: s.standardWeeklyMinutes,
		workDays: isoWorkDays(s.workDays),
		overtimeThresholdDailyMinutes: s.overtimeThresholdDailyMinutes,
		overtimeThresholdWeeklyMinutes: s.overtimeThresholdWeeklyMinutes,
		graceMinutesLate: s.graceMinutesLate,
		graceMinutesEarlyOut: s.graceMinutesEarlyOut,
		autoDeductBreak: s.autoDeductBreak,
		breakMinutes: s.breakMinutes,
		minBreakDeductionMinutes: s.minBreakDeductionMinutes,
		isSplitShift: s.isSplitShift,
		splitBreakStartMinutes: s.splitBreakStartMinutes,
		splitBreakEndMinutes: s.splitBreakEndMinutes,
		hasNightDifferential: s.hasNightDifferential,
		nightDiffStartMinutes: s.nightDiffStartMinutes,
		nightDiffEndMinutes: s.nightDiffEndMinutes,
		nightDiffMultiplier,
		saturdayShiftStartMinutes: s.saturdayShiftStartMinutes,
		saturdayShiftEndMinutes: s.saturdayShiftEndMinutes,
		isFlexiTime: s.isFlexiTime,
		capDailyPaidMinutes: s.capDailyPaidMinutes,
	};
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
