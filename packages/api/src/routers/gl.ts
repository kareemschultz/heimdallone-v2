/**
 * General Ledger router — Phase 21D-E.
 *
 * Minimal double-entry payroll-GL: a per-tenant chart of accounts + journal
 * entries/lines, with draft → posted → reversed lifecycle. Receives payroll
 * postings and the migrated opening chart/balances.
 *
 * COORDINATION GUARDRAIL: the GL LINKS to payroll read-only and NEVER owns it.
 * gl_journal_line.linkedPayslipId is a SOFT text ref (no FK). This router writes
 * ONLY gl_account / gl_journal_entry / gl_journal_line (+ shared audit_event) —
 * ZERO writes to payslip / payroll_run / payroll status. Reversal is a NEW v2 GL
 * entry, never a replay of v1's bug-reversal churn.
 *
 * App-layer invariants (the schema has no CHECK constraints, by house style):
 *   - every journal balances (Σ debits == Σ credits), each line is one-sided,
 *   - posted/reversed entries are IMMUTABLE — edit/delete is refused, only
 *     reversal may change posted books,
 *   - lines may only target postable, non-archived accounts in the same tenant.
 *
 * Org-wide (company books) — tenant scope + AC gate, no employee scoping.
 * Two-layer authz: AC gate (account/journal) + tenant-verified handler queries.
 */

import { db } from "@Heimdallone/db";
import {
	glAccount,
	glJournalEntry,
	glJournalLine,
} from "@Heimdallone/db/schema/gl";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import {
	assertEntryMutable,
	centsToAmount,
	parseAmountToCents,
	validateJournalLines,
} from "../utils/gl-logic";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;

const accountTypeEnum = z.enum([
	"asset",
	"liability",
	"equity",
	"income",
	"expense",
]);
const journalSourceEnum = z.enum([
	"payroll",
	"manual",
	"opening_balance",
	"adjustment",
]);
const dateStr = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const amount = z.union([z.string(), z.number()]);

function toDate(s: string): Date {
	return new Date(`${s}T00:00:00.000Z`);
}

const lineInput = z.object({
	accountId: z.string(),
	debit: amount.default(0),
	credit: amount.default(0),
	description: z.string().max(500).nullable().optional(),
	linkedPayslipId: z.string().nullable().optional(),
});

// Tenant-verify every account id referenced by lines is postable + not archived.
async function assertPostableAccounts(
	oid: string,
	accountIds: string[]
): Promise<void> {
	const unique = [...new Set(accountIds)];
	const rows = await db
		.select({
			id: glAccount.id,
			isPostable: glAccount.isPostable,
			isArchived: glAccount.isArchived,
		})
		.from(glAccount)
		.where(
			and(eq(glAccount.organizationId, oid), inArray(glAccount.id, unique))
		);
	const byId = new Map(rows.map((r) => [r.id, r]));
	for (const id of unique) {
		const a = byId.get(id);
		if (!a) {
			throw new ORPCError("NOT_FOUND", {
				message: `Account ${id} not found in org.`,
			});
		}
		if (!a.isPostable) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Account ${id} is a header (non-postable) account.`,
			});
		}
		if (a.isArchived) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Account ${id} is archived.`,
			});
		}
	}
}

// ─────────────────────────── Chart of accounts ───────────────────────────

const accountsList = authorizedProcedure("account", "read")
	.input(z.object({ includeArchived: z.boolean().default(false) }).optional())
	.handler(async ({ context, input }) => {
		const conditions = [eq(glAccount.organizationId, orgId(context))];
		if (!input?.includeArchived) {
			conditions.push(eq(glAccount.isArchived, false));
		}
		return await db
			.select()
			.from(glAccount)
			.where(and(...conditions))
			.orderBy(asc(glAccount.code));
	});

const accountsGetById = authorizedProcedure("account", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const [row] = await db
			.select()
			.from(glAccount)
			.where(
				and(
					eq(glAccount.id, input.id),
					eq(glAccount.organizationId, orgId(context))
				)
			)
			.limit(1);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Account not found." });
		}
		return row;
	});

const accountFields = z.object({
	code: z.string().min(1).max(40),
	name: z.string().min(1).max(200),
	type: accountTypeEnum,
	subType: z.string().max(80).nullable().optional(),
	isPostable: z.boolean().default(true),
	parentAccountId: z.string().nullable().optional(),
});

async function assertParentInOrg(
	oid: string,
	parentId: string | null | undefined
): Promise<void> {
	if (!parentId) {
		return;
	}
	const [row] = await db
		.select({ id: glAccount.id })
		.from(glAccount)
		.where(and(eq(glAccount.id, parentId), eq(glAccount.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Parent account not found in org.",
		});
	}
}

const accountsCreate = authorizedProcedure("account", "create")
	.input(accountFields)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await assertParentInOrg(oid, input.parentAccountId);
		const [existing] = await db
			.select({ id: glAccount.id })
			.from(glAccount)
			.where(
				and(eq(glAccount.organizationId, oid), eq(glAccount.code, input.code))
			)
			.limit(1);
		if (existing) {
			throw new ORPCError("CONFLICT", {
				message: `Account code ${input.code} already exists.`,
			});
		}
		const id = createId();
		await db.insert(glAccount).values({
			id,
			organizationId: oid,
			code: input.code,
			name: input.name,
			type: input.type,
			subType: input.subType ?? null,
			isPostable: input.isPostable,
			parentAccountId: input.parentAccountId ?? null,
		});
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "gl_account",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { code: input.code },
		});
		return { id };
	});

const accountsUpdate = authorizedProcedure("account", "update")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).max(200).optional(),
			subType: z.string().max(80).nullable().optional(),
			isPostable: z.boolean().optional(),
			parentAccountId: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [current] = await db
			.select({ id: glAccount.id })
			.from(glAccount)
			.where(and(eq(glAccount.id, input.id), eq(glAccount.organizationId, oid)))
			.limit(1);
		if (!current) {
			throw new ORPCError("NOT_FOUND", { message: "Account not found." });
		}
		if (input.parentAccountId === input.id) {
			throw new ORPCError("BAD_REQUEST", {
				message: "An account cannot be its own parent.",
			});
		}
		await assertParentInOrg(oid, input.parentAccountId);
		const patch: Record<string, unknown> = {};
		if (input.name !== undefined) {
			patch.name = input.name;
		}
		if (input.subType !== undefined) {
			patch.subType = input.subType;
		}
		if (input.isPostable !== undefined) {
			patch.isPostable = input.isPostable;
		}
		if (input.parentAccountId !== undefined) {
			patch.parentAccountId = input.parentAccountId;
		}
		await db
			.update(glAccount)
			.set(patch)
			.where(
				and(eq(glAccount.id, input.id), eq(glAccount.organizationId, oid))
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "gl_account",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const accountsArchive = authorizedProcedure("account", "archive")
	.input(z.object({ id: z.string(), archived: z.boolean().default(true) }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [current] = await db
			.select({ id: glAccount.id })
			.from(glAccount)
			.where(and(eq(glAccount.id, input.id), eq(glAccount.organizationId, oid)))
			.limit(1);
		if (!current) {
			throw new ORPCError("NOT_FOUND", { message: "Account not found." });
		}
		await db
			.update(glAccount)
			.set({ isArchived: input.archived })
			.where(
				and(eq(glAccount.id, input.id), eq(glAccount.organizationId, oid))
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "gl_account",
			entityId: input.id,
			action: input.archived ? "archive" : "restore",
			actorId: actorId(context),
		});
		return { id: input.id, isArchived: input.archived };
	});

// Bulk chart-of-accounts import (migration). Upsert by (org, code): inserts new
// accounts, updates name/type/subType/postable of existing ones. Parent links
// are resolved by CODE so a whole chart can be imported in one call.
const accountsImport = authorizedProcedure("account", "create")
	.input(
		z.object({
			accounts: z
				.array(
					z.object({
						code: z.string().min(1).max(40),
						name: z.string().min(1).max(200),
						type: accountTypeEnum,
						subType: z.string().max(80).nullable().optional(),
						isPostable: z.boolean().default(true),
						parentCode: z.string().nullable().optional(),
					})
				)
				.min(1)
				.max(2000),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const result = await db.transaction(async (tx) => {
			const existing = await tx
				.select({ id: glAccount.id, code: glAccount.code })
				.from(glAccount)
				.where(eq(glAccount.organizationId, oid));
			const idByCode = new Map(existing.map((r) => [r.code, r.id]));
			let created = 0;
			let updated = 0;
			// Pass 1: upsert all accounts (without parent links).
			for (const a of input.accounts) {
				const found = idByCode.get(a.code);
				if (found) {
					await tx
						.update(glAccount)
						.set({
							name: a.name,
							type: a.type,
							subType: a.subType ?? null,
							isPostable: a.isPostable,
						})
						.where(
							and(eq(glAccount.id, found), eq(glAccount.organizationId, oid))
						);
					updated += 1;
				} else {
					const id = createId();
					await tx.insert(glAccount).values({
						id,
						organizationId: oid,
						code: a.code,
						name: a.name,
						type: a.type,
						subType: a.subType ?? null,
						isPostable: a.isPostable,
					});
					idByCode.set(a.code, id);
					created += 1;
				}
			}
			// Pass 2: resolve parent links by code (now every code has an id).
			for (const a of input.accounts) {
				if (!a.parentCode) {
					continue;
				}
				const childId = idByCode.get(a.code);
				const parentId = idByCode.get(a.parentCode);
				if (childId && parentId && childId !== parentId) {
					await tx
						.update(glAccount)
						.set({ parentAccountId: parentId })
						.where(
							and(eq(glAccount.id, childId), eq(glAccount.organizationId, oid))
						);
				}
			}
			return { created, updated };
		});
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "gl_account",
			entityId: oid,
			action: "create",
			actorId: actorId(context),
			metadata: { import: true, ...result, total: input.accounts.length },
		});
		return result;
	});

// ─────────────────────────── Journals ───────────────────────────

const journalsList = authorizedProcedure("journal", "read")
	.input(
		z
			.object({
				status: z.enum(["draft", "posted", "reversed"]).optional(),
				source: journalSourceEnum.optional(),
				from: dateStr.optional(),
				to: dateStr.optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const conditions = [eq(glJournalEntry.organizationId, oid)];
		if (input?.status) {
			conditions.push(eq(glJournalEntry.status, input.status));
		}
		if (input?.source) {
			conditions.push(eq(glJournalEntry.source, input.source));
		}
		if (input?.from) {
			conditions.push(gte(glJournalEntry.entryDate, toDate(input.from)));
		}
		if (input?.to) {
			conditions.push(lte(glJournalEntry.entryDate, toDate(input.to)));
		}
		return await db
			.select({
				id: glJournalEntry.id,
				reference: glJournalEntry.reference,
				description: glJournalEntry.description,
				entryDate: glJournalEntry.entryDate,
				currency: glJournalEntry.currency,
				source: glJournalEntry.source,
				status: glJournalEntry.status,
				postedAt: glJournalEntry.postedAt,
				totalDebit: sql<string>`coalesce(sum(${glJournalLine.debitAmount}), 0)`,
			})
			.from(glJournalEntry)
			.leftJoin(
				glJournalLine,
				eq(glJournalLine.journalEntryId, glJournalEntry.id)
			)
			.where(and(...conditions))
			.groupBy(glJournalEntry.id)
			.orderBy(desc(glJournalEntry.entryDate), desc(glJournalEntry.reference));
	});

const journalsGetById = authorizedProcedure("journal", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [entry] = await db
			.select()
			.from(glJournalEntry)
			.where(
				and(
					eq(glJournalEntry.id, input.id),
					eq(glJournalEntry.organizationId, oid)
				)
			)
			.limit(1);
		if (!entry) {
			throw new ORPCError("NOT_FOUND", { message: "Journal entry not found." });
		}
		const lines = await db
			.select({
				id: glJournalLine.id,
				accountId: glJournalLine.accountId,
				accountCode: glAccount.code,
				accountName: glAccount.name,
				debitAmount: glJournalLine.debitAmount,
				creditAmount: glJournalLine.creditAmount,
				description: glJournalLine.description,
				linkedPayslipId: glJournalLine.linkedPayslipId,
			})
			.from(glJournalLine)
			.innerJoin(glAccount, eq(glJournalLine.accountId, glAccount.id))
			.where(
				and(
					eq(glJournalLine.journalEntryId, input.id),
					eq(glJournalLine.organizationId, oid)
				)
			)
			.orderBy(asc(glAccount.code));
		return { entry, lines };
	});

// Insert an entry + its (balanced, tenant-verified) lines inside a tx.
async function insertEntryWithLines(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	oid: string,
	entry: {
		reference: string;
		description?: string | null;
		entryDate: Date;
		currency: string;
		source: "payroll" | "manual" | "opening_balance" | "adjustment";
		status: "draft" | "posted";
		postedByUserId?: string | null;
	},
	lines: z.infer<typeof lineInput>[]
): Promise<string> {
	const entryId = createId();
	await tx.insert(glJournalEntry).values({
		id: entryId,
		organizationId: oid,
		reference: entry.reference,
		description: entry.description ?? null,
		entryDate: entry.entryDate,
		currency: entry.currency,
		source: entry.source,
		status: entry.status,
		postedAt: entry.status === "posted" ? new Date() : null,
		postedByUserId:
			entry.status === "posted" ? (entry.postedByUserId ?? null) : null,
	});
	await tx.insert(glJournalLine).values(
		lines.map((l) => ({
			id: createId(),
			organizationId: oid,
			journalEntryId: entryId,
			accountId: l.accountId,
			debitAmount: centsToAmount(parseAmountToCents(l.debit)),
			creditAmount: centsToAmount(parseAmountToCents(l.credit)),
			description: l.description ?? null,
			linkedPayslipId: l.linkedPayslipId ?? null,
		}))
	);
	return entryId;
}

const journalsCreate = authorizedProcedure("journal", "post")
	.input(
		z.object({
			reference: z.string().min(1).max(80),
			description: z.string().max(500).nullable().optional(),
			entryDate: dateStr,
			currency: z.string().min(1).max(8).default("GYD"),
			source: journalSourceEnum.default("manual"),
			post: z.boolean().default(false),
			lines: z.array(lineInput).min(2),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		validateJournalLines(input.lines);
		await assertPostableAccounts(
			oid,
			input.lines.map((l) => l.accountId)
		);
		const [dupe] = await db
			.select({ id: glJournalEntry.id })
			.from(glJournalEntry)
			.where(
				and(
					eq(glJournalEntry.organizationId, oid),
					eq(glJournalEntry.reference, input.reference)
				)
			)
			.limit(1);
		if (dupe) {
			throw new ORPCError("CONFLICT", {
				message: `Journal reference ${input.reference} already exists.`,
			});
		}
		const entryId = await db.transaction((tx) =>
			insertEntryWithLines(
				tx,
				oid,
				{
					reference: input.reference,
					description: input.description,
					entryDate: toDate(input.entryDate),
					currency: input.currency,
					source: input.source,
					status: input.post ? "posted" : "draft",
					postedByUserId: actorId(context),
				},
				input.lines
			)
		);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "gl_journal_entry",
			entityId: entryId,
			action: "create",
			actorId: actorId(context),
			metadata: { reference: input.reference, posted: input.post },
		});
		return { id: entryId };
	});

const journalsPost = authorizedProcedure("journal", "post")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [entry] = await db
			.select()
			.from(glJournalEntry)
			.where(
				and(
					eq(glJournalEntry.id, input.id),
					eq(glJournalEntry.organizationId, oid)
				)
			)
			.limit(1);
		if (!entry) {
			throw new ORPCError("NOT_FOUND", { message: "Journal entry not found." });
		}
		assertEntryMutable(entry.status);
		const lines = await db
			.select({
				accountId: glJournalLine.accountId,
				debit: glJournalLine.debitAmount,
				credit: glJournalLine.creditAmount,
			})
			.from(glJournalLine)
			.where(
				and(
					eq(glJournalLine.journalEntryId, input.id),
					eq(glJournalLine.organizationId, oid)
				)
			);
		validateJournalLines(lines);
		await assertPostableAccounts(
			oid,
			lines.map((l) => l.accountId)
		);
		await db
			.update(glJournalEntry)
			.set({
				status: "posted",
				postedAt: new Date(),
				postedByUserId: actorId(context),
			})
			.where(
				and(
					eq(glJournalEntry.id, input.id),
					eq(glJournalEntry.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "gl_journal_entry",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { posted: true },
		});
		return { id: input.id, status: "posted" as const };
	});

// Delete is allowed ONLY for draft entries (posted/reversed are immutable).
const journalsRemove = authorizedProcedure("journal", "post")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [entry] = await db
			.select({ id: glJournalEntry.id, status: glJournalEntry.status })
			.from(glJournalEntry)
			.where(
				and(
					eq(glJournalEntry.id, input.id),
					eq(glJournalEntry.organizationId, oid)
				)
			)
			.limit(1);
		if (!entry) {
			throw new ORPCError("NOT_FOUND", { message: "Journal entry not found." });
		}
		assertEntryMutable(entry.status);
		// Lines cascade via FK; this removes a DRAFT only.
		await db
			.delete(glJournalEntry)
			.where(
				and(
					eq(glJournalEntry.id, input.id),
					eq(glJournalEntry.organizationId, oid)
				)
			);
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "gl_journal_entry",
			entityId: input.id,
			action: "delete",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// Reverse a POSTED entry: create a balanced counter-entry (debit/credit flipped),
// link both ways, mark the original reversed. Never touches payroll.
const journalsReverse = authorizedProcedure("journal", "reverse")
	.input(
		z.object({
			id: z.string(),
			entryDate: dateStr.optional(),
			reference: z.string().min(1).max(80).optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const [entry] = await db
			.select()
			.from(glJournalEntry)
			.where(
				and(
					eq(glJournalEntry.id, input.id),
					eq(glJournalEntry.organizationId, oid)
				)
			)
			.limit(1);
		if (!entry) {
			throw new ORPCError("NOT_FOUND", { message: "Journal entry not found." });
		}
		if (entry.status !== "posted") {
			throw new ORPCError("CONFLICT", {
				message: `Only a posted entry can be reversed (this is ${entry.status}).`,
			});
		}
		const lines = await db
			.select()
			.from(glJournalLine)
			.where(
				and(
					eq(glJournalLine.journalEntryId, input.id),
					eq(glJournalLine.organizationId, oid)
				)
			);
		const reference = input.reference ?? `${entry.reference}-REV`;
		const [dupe] = await db
			.select({ id: glJournalEntry.id })
			.from(glJournalEntry)
			.where(
				and(
					eq(glJournalEntry.organizationId, oid),
					eq(glJournalEntry.reference, reference)
				)
			)
			.limit(1);
		if (dupe) {
			throw new ORPCError("CONFLICT", {
				message: `Reversal reference ${reference} already exists.`,
			});
		}
		const reversalId = await db.transaction(async (tx) => {
			const newId = createId();
			await tx.insert(glJournalEntry).values({
				id: newId,
				organizationId: oid,
				reference,
				description: `Reversal of ${entry.reference}`,
				entryDate: input.entryDate ? toDate(input.entryDate) : new Date(),
				currency: entry.currency,
				source: entry.source,
				status: "posted",
				postedAt: new Date(),
				postedByUserId: actorId(context),
				reversesEntryId: entry.id,
			});
			await tx.insert(glJournalLine).values(
				lines.map((l) => ({
					id: createId(),
					organizationId: oid,
					journalEntryId: newId,
					accountId: l.accountId,
					// Flip debit ↔ credit.
					debitAmount: l.creditAmount,
					creditAmount: l.debitAmount,
					description: `Reversal: ${l.description ?? ""}`.trim(),
					linkedPayslipId: l.linkedPayslipId,
				}))
			);
			await tx
				.update(glJournalEntry)
				.set({ status: "reversed", reversedByEntryId: newId })
				.where(
					and(
						eq(glJournalEntry.id, entry.id),
						eq(glJournalEntry.organizationId, oid)
					)
				);
			return newId;
		});
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "gl_journal_entry",
			entityId: entry.id,
			action: "update",
			actorId: actorId(context),
			metadata: { reversedBy: reversalId, reference },
		});
		return { id: entry.id, reversalId };
	});

// Bulk journal import (migration). Each entry carries its own balanced lines and
// is imported at its given status (historical postings / opening balances land
// posted). Account ids must already exist (import the chart first).
const journalsImport = authorizedProcedure("journal", "post")
	.input(
		z.object({
			entries: z
				.array(
					z.object({
						reference: z.string().min(1).max(80),
						description: z.string().max(500).nullable().optional(),
						entryDate: dateStr,
						currency: z.string().min(1).max(8).default("GYD"),
						source: journalSourceEnum.default("opening_balance"),
						status: z.enum(["draft", "posted"]).default("posted"),
						lines: z.array(lineInput).min(2),
					})
				)
				.min(1)
				.max(1000),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		// Validate ALL entries up front (balance + accounts) — all-or-nothing.
		for (const e of input.entries) {
			validateJournalLines(e.lines);
		}
		await assertPostableAccounts(
			oid,
			input.entries.flatMap((e) => e.lines.map((l) => l.accountId))
		);
		const existing = await db
			.select({ reference: glJournalEntry.reference })
			.from(glJournalEntry)
			.where(eq(glJournalEntry.organizationId, oid));
		const seen = new Set(existing.map((r) => r.reference));
		let imported = 0;
		let skipped = 0;
		await db.transaction(async (tx) => {
			for (const e of input.entries) {
				if (seen.has(e.reference)) {
					skipped += 1;
					continue;
				}
				seen.add(e.reference);
				await insertEntryWithLines(
					tx,
					oid,
					{
						reference: e.reference,
						description: e.description,
						entryDate: toDate(e.entryDate),
						currency: e.currency,
						source: e.source,
						status: e.status,
						postedByUserId: actorId(context),
					},
					e.lines
				);
				imported += 1;
			}
		});
		await createAuditEvent(db, {
			organizationId: oid,
			entityType: "gl_journal_entry",
			entityId: oid,
			action: "create",
			actorId: actorId(context),
			metadata: {
				import: true,
				imported,
				skipped,
				total: input.entries.length,
			},
		});
		return { imported, skipped };
	});

// Trial balance: net debit/credit per account over POSTED entries (the ledger's
// proof). Read model — computed, never stored.
const journalsTrialBalance = authorizedProcedure("journal", "read")
	.input(
		z.object({ from: dateStr.optional(), to: dateStr.optional() }).optional()
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const conditions = [
			eq(glJournalEntry.organizationId, oid),
			eq(glJournalEntry.status, "posted"),
		];
		if (input?.from) {
			conditions.push(gte(glJournalEntry.entryDate, toDate(input.from)));
		}
		if (input?.to) {
			conditions.push(lte(glJournalEntry.entryDate, toDate(input.to)));
		}
		const rows = await db
			.select({
				accountId: glAccount.id,
				accountCode: glAccount.code,
				accountName: glAccount.name,
				accountType: glAccount.type,
				totalDebit: sql<string>`coalesce(sum(${glJournalLine.debitAmount}), 0)`,
				totalCredit: sql<string>`coalesce(sum(${glJournalLine.creditAmount}), 0)`,
			})
			.from(glJournalLine)
			.innerJoin(
				glJournalEntry,
				eq(glJournalLine.journalEntryId, glJournalEntry.id)
			)
			.innerJoin(glAccount, eq(glJournalLine.accountId, glAccount.id))
			.where(and(...conditions))
			.groupBy(glAccount.id)
			.orderBy(asc(glAccount.code));
		let debitCents = 0;
		let creditCents = 0;
		for (const r of rows) {
			debitCents += Math.round(Number(r.totalDebit) * 100);
			creditCents += Math.round(Number(r.totalCredit) * 100);
		}
		return {
			rows,
			totalDebit: centsToAmount(debitCents),
			totalCredit: centsToAmount(creditCents),
			balanced: debitCents === creditCents,
		};
	});

export const glRouter = {
	accounts: {
		list: accountsList,
		getById: accountsGetById,
		create: accountsCreate,
		update: accountsUpdate,
		archive: accountsArchive,
		import: accountsImport,
	},
	journals: {
		list: journalsList,
		getById: journalsGetById,
		create: journalsCreate,
		post: journalsPost,
		remove: journalsRemove,
		reverse: journalsReverse,
		import: journalsImport,
		trialBalance: journalsTrialBalance,
	},
};
