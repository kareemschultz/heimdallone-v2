/**
 * General Ledger (minimal payroll-GL) — Phase 21D-E schema.
 *
 * The v2 home for v1's GL (`accounts` / `journal_entries` / `journal_lines` —
 * 11 / 13 / 53 live rows, all payroll postings + UTC-bug reversals). v2 had
 * `journal`/`account` AC resources declared but UNCONSUMED (Finance Phase 16
 * deferred GL). This is the minimal double-entry ledger to receive payroll
 * postings and the migrated opening chart.
 *
 * COORDINATION GUARDRAIL (mirrors Finance/Projects/Helpdesk): the GL LINKS to
 * payroll read-only and NEVER owns it. `gl_journal_line.linkedPayslipId` is a
 * SOFT text ref (NOT a FK to payslip) — posting a payroll journal reads payslip
 * actuals but the ledger never mutates a payslip/payroll_run. Per the migration
 * decision we port v1's chart + clean opening balances, NOT the bug-reversal
 * churn — reversals are a v2 GL operation, not replayed v1 history.
 */

import { relations } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { cuid, orgRef, timestamps } from "./hr-core";

export const glAccountTypeEnum = pgEnum("gl_account_type", [
	"asset",
	"liability",
	"equity",
	"income",
	"expense",
]);

export const glJournalSourceEnum = pgEnum("gl_journal_source", [
	"payroll",
	"manual",
	"opening_balance",
	"adjustment",
]);

export const glJournalStatusEnum = pgEnum("gl_journal_status", [
	"draft",
	"posted",
	"reversed",
]);

export const glAccount = pgTable(
	"gl_account",
	{
		id: cuid(),
		organizationId: orgRef(),
		code: text("code").notNull(),
		name: text("name").notNull(),
		type: glAccountTypeEnum("type").notNull(),
		subType: text("sub_type"),
		isPostable: boolean("is_postable").default(true).notNull(),
		isArchived: boolean("is_archived").default(false).notNull(),
		// Self-ref for a chart hierarchy; SET NULL so archiving a parent doesn't
		// cascade-delete children.
		parentAccountId: text("parent_account_id"),
		...timestamps,
	},
	(t) => [
		unique("gl_account_org_code_uq").on(t.organizationId, t.code),
		index("gl_account_org_type_idx").on(t.organizationId, t.type),
	]
);

export const glJournalEntry = pgTable(
	"gl_journal_entry",
	{
		id: cuid(),
		organizationId: orgRef(),
		reference: text("reference").notNull(),
		description: text("description"),
		entryDate: date("entry_date", { mode: "date" }).notNull(),
		source: glJournalSourceEnum("source").default("manual").notNull(),
		status: glJournalStatusEnum("status").default("draft").notNull(),
		// Reversal links are SOFT self-refs (no FK cycle): the entry this one
		// reverses, and the entry that reverses this one.
		reversesEntryId: text("reverses_entry_id"),
		reversedByEntryId: text("reversed_by_entry_id"),
		postedAt: timestamp("posted_at"),
		postedByUserId: text("posted_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps,
	},
	(t) => [
		unique("gl_journal_entry_org_ref_uq").on(t.organizationId, t.reference),
		index("gl_journal_entry_org_date_idx").on(t.organizationId, t.entryDate),
		index("gl_journal_entry_org_status_idx").on(t.organizationId, t.status),
	]
);

export const glJournalLine = pgTable(
	"gl_journal_line",
	{
		id: cuid(),
		organizationId: orgRef(),
		journalEntryId: text("journal_entry_id")
			.notNull()
			.references(() => glJournalEntry.id, { onDelete: "cascade" }),
		accountId: text("account_id")
			.notNull()
			.references(() => glAccount.id, { onDelete: "restrict" }),
		debitAmount: numeric("debit_amount", { precision: 14, scale: 2 })
			.default("0")
			.notNull(),
		creditAmount: numeric("credit_amount", { precision: 14, scale: 2 })
			.default("0")
			.notNull(),
		description: text("description"),
		// SOFT ref (NOT a FK): the payslip a payroll journal line derives from.
		// The GL reads payroll, never owns it — deleting/reversing a payslip must
		// not cascade into the ledger.
		linkedPayslipId: text("linked_payslip_id"),
		...timestamps,
	},
	(t) => [
		index("gl_journal_line_entry_idx").on(t.journalEntryId),
		index("gl_journal_line_account_idx").on(t.accountId),
	]
);

export const glJournalEntryRelations = relations(
	glJournalEntry,
	({ many, one }) => ({
		lines: many(glJournalLine),
		postedBy: one(user, {
			fields: [glJournalEntry.postedByUserId],
			references: [user.id],
		}),
	})
);

export const glJournalLineRelations = relations(glJournalLine, ({ one }) => ({
	entry: one(glJournalEntry, {
		fields: [glJournalLine.journalEntryId],
		references: [glJournalEntry.id],
	}),
	account: one(glAccount, {
		fields: [glJournalLine.accountId],
		references: [glAccount.id],
	}),
}));
