/**
 * CRM router — Phase 17C.
 *
 * Lead → Customer → Deal coordination layer (per crm-implementation-plan.md).
 * Two-layer authz: AC gate (authorizedProcedure("crm_*", action)) + handler
 * lateral scope. seesAllCrm roles see everything; a manager sees their team's
 * leads/deals (own + direct reports), a sales_rep sees only what they own.
 *
 * Redaction surfaces:
 *   - money (deal.value, lead.estimatedValue) nulled for !canSeeCrmMoney;
 *   - private notes (visibility='private') stripped for !canReadPrivateCrmNotes.
 *
 * Transactional flows: lead.convert (→ customer + contact + optional deal) and
 * deal.handoff (→ crm_customer_project_link + stamp). Audit on every mutation.
 *
 * GUARDRAIL: writes target ONLY crm_* tables (+ shared audit_event). The
 * customer↔project link's projectId stays a soft ref — this router never writes
 * a project/payroll/etc row.
 */

import { db } from "@Heimdallone/db";
import {
	crmActivity,
	crmContact,
	crmCustomer,
	crmCustomerProjectLink,
	crmDeal,
	crmLead,
	crmNote,
	crmPipelineStage,
} from "@Heimdallone/db/schema/crm";
import { employeeProfile } from "@Heimdallone/db/schema/hr-core";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { type AnyColumn, and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import {
	getDirectReportIds,
	resolveCurrentEmployee,
} from "../utils/employee-scope";
import {
	canReadPrivateCrmNotes,
	canSeeCrmMoney,
	seesAllCrm,
} from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

const STALLED_DAYS = 30;
const STALLED_MS = STALLED_DAYS * 24 * 60 * 60 * 1000;

const num = (v: unknown): number | null => (v == null ? null : Number(v));

// ── lateral owner scope: null = all, [] = none, [ids] = own/team owners ──
async function ownerScope(context: unknown): Promise<string[] | null> {
	if (seesAllCrm(role(context))) {
		return null;
	}
	const me = await resolveCurrentEmployee(
		orgId(context as never),
		actorId(context as never)
	);
	if (!me) {
		return [];
	}
	if (role(context) === "manager") {
		const reports = await getDirectReportIds(me.id, orgId(context as never));
		return [me.id, ...reports];
	}
	// sales_rep (or any other non-all viewer) → own only
	return [me.id];
}

// ── name maps for denormalised list fields ──
async function employeeNameMap(
	ids: (string | null)[]
): Promise<Map<string, string>> {
	const real = [...new Set(ids.filter((x): x is string => Boolean(x)))];
	const map = new Map<string, string>();
	if (real.length === 0) {
		return map;
	}
	const rows = await db
		.select({
			id: employeeProfile.id,
			first: employeeProfile.firstName,
			last: employeeProfile.lastName,
		})
		.from(employeeProfile)
		.where(inArray(employeeProfile.id, real));
	for (const r of rows) {
		map.set(r.id, `${r.first}${r.last ? ` ${r.last}` : ""}`);
	}
	return map;
}

const ACTIVE = (col: AnyColumn) => isNull(col);

// ═══════════════════════════════════════════════════════════════
// PIPELINE STAGES
// ═══════════════════════════════════════════════════════════════

const stagesList = authorizedProcedure("crm_pipeline", "read").handler(
	async ({ context }) => {
		const rows = await db
			.select()
			.from(crmPipelineStage)
			.where(
				and(
					eq(crmPipelineStage.organizationId, orgId(context)),
					ACTIVE(crmPipelineStage.deletedAt)
				)
			)
			.orderBy(crmPipelineStage.position);
		return rows;
	}
);

const stagesCreate = authorizedProcedure("crm_pipeline", "manage")
	.input(
		z.object({
			name: z.string().min(1),
			position: z.number().int().default(0),
			defaultProbabilityPct: z
				.number()
				.int()
				.min(0)
				.max(100)
				.nullable()
				.optional(),
			isWon: z.boolean().default(false),
			isLost: z.boolean().default(false),
		})
	)
	.handler(async ({ context, input }) => {
		const id = createId();
		await db.insert(crmPipelineStage).values({
			id,
			organizationId: orgId(context),
			name: input.name,
			position: input.position,
			defaultProbabilityPct: input.defaultProbabilityPct ?? null,
			isWon: input.isWon,
			isLost: input.isLost,
		});
		await audit(context, "crm_pipeline_stage", id, "create");
		return { id };
	});

const stagesUpdate = authorizedProcedure("crm_pipeline", "manage")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).optional(),
			position: z.number().int().optional(),
			defaultProbabilityPct: z
				.number()
				.int()
				.min(0)
				.max(100)
				.nullable()
				.optional(),
		})
	)
	.handler(async ({ context, input }) => {
		await assertOwned(crmPipelineStage, input.id, orgId(context));
		const patch: Record<string, unknown> = {};
		if (input.name !== undefined) {
			patch.name = input.name;
		}
		if (input.position !== undefined) {
			patch.position = input.position;
		}
		if (input.defaultProbabilityPct !== undefined) {
			patch.defaultProbabilityPct = input.defaultProbabilityPct;
		}
		await db
			.update(crmPipelineStage)
			.set(patch)
			.where(
				and(
					eq(crmPipelineStage.id, input.id),
					eq(crmPipelineStage.organizationId, orgId(context))
				)
			);
		await audit(context, "crm_pipeline_stage", input.id, "update");
		return { id: input.id };
	});

// ═══════════════════════════════════════════════════════════════
// shared helpers
// ═══════════════════════════════════════════════════════════════

async function audit(
	context: unknown,
	entityType: string,
	entityId: string,
	action: "create" | "update" | "delete",
	metadata?: Record<string, unknown>
) {
	await createAuditEvent(db as never, {
		organizationId: orgId(context as never),
		entityType,
		entityId,
		action,
		actorId: actorId(context as never),
		metadata,
	});
}

// Tenant-verify a row exists in the org (NOT_FOUND otherwise). Returns the row.
// Generic across the crm_* tables (all share id + organizationId + deletedAt).
async function assertOwned(
	// biome-ignore lint/suspicious/noExplicitAny: generic crm_* tenant-verify.
	table: any,
	id: string,
	oid: string
): Promise<Record<string, unknown>> {
	const [row] = await db
		.select()
		.from(table)
		.where(and(eq(table.id, id), eq(table.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Record not found." });
	}
	return row as Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMERS (org-shared account list)
// ═══════════════════════════════════════════════════════════════

const customersList = authorizedProcedure("crm_customer", "read")
	.input(
		z
			.object({
				status: z.enum(["prospect", "active", "inactive"]).optional(),
				search: z.string().optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const conds = [
			eq(crmCustomer.organizationId, orgId(context)),
			ACTIVE(crmCustomer.deletedAt),
		];
		if (input?.status) {
			conds.push(eq(crmCustomer.status, input.status));
		}
		const rows = await db
			.select()
			.from(crmCustomer)
			.where(and(...conds))
			.orderBy(desc(crmCustomer.updatedAt))
			.limit(500);
		const names = await employeeNameMap(rows.map((r) => r.ownerEmployeeId));
		const q = input?.search?.toLowerCase();
		return rows
			.filter((r) => !q || r.name.toLowerCase().includes(q))
			.map((r) => ({
				...r,
				ownerName: r.ownerEmployeeId
					? (names.get(r.ownerEmployeeId) ?? null)
					: null,
			}));
	});

const customersGetById = authorizedProcedure("crm_customer", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const row = await assertOwned(crmCustomer, input.id, orgId(context));
		return row;
	});

const customerInput = z.object({
	name: z.string().min(1),
	type: z.enum(["company", "individual"]).default("company"),
	status: z.enum(["prospect", "active", "inactive"]).default("prospect"),
	website: z.string().nullable().optional(),
	phone: z.string().nullable().optional(),
	email: z.string().nullable().optional(),
	industry: z.string().nullable().optional(),
	ownerEmployeeId: z.string().nullable().optional(),
	sourceKey: z
		.enum([
			"web_form",
			"referral",
			"campaign",
			"manual",
			"import",
			"event",
			"other",
		])
		.nullable()
		.optional(),
});

const customersCreate = authorizedProcedure("crm_customer", "create")
	.input(customerInput)
	.handler(async ({ context, input }) => {
		const id = createId();
		await db.insert(crmCustomer).values({
			id,
			organizationId: orgId(context),
			name: input.name,
			type: input.type,
			status: input.status,
			website: input.website ?? null,
			phone: input.phone ?? null,
			email: input.email ?? null,
			industry: input.industry ?? null,
			ownerEmployeeId: input.ownerEmployeeId ?? null,
			sourceKey: input.sourceKey ?? null,
		});
		await audit(context, "crm_customer", id, "create");
		return { id };
	});

const customersUpdate = authorizedProcedure("crm_customer", "update")
	.input(customerInput.partial().extend({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await assertOwned(crmCustomer, input.id, orgId(context));
		const { id, ...rest } = input;
		await db
			.update(crmCustomer)
			.set(rest)
			.where(
				and(
					eq(crmCustomer.id, id),
					eq(crmCustomer.organizationId, orgId(context))
				)
			);
		await audit(context, "crm_customer", id, "update");
		return { id };
	});

const customersArchive = authorizedProcedure("crm_customer", "archive")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await assertOwned(crmCustomer, input.id, orgId(context));
		await db
			.update(crmCustomer)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(crmCustomer.id, input.id),
					eq(crmCustomer.organizationId, orgId(context))
				)
			);
		await audit(context, "crm_customer", input.id, "delete");
		return { id: input.id };
	});

// ═══════════════════════════════════════════════════════════════
// CONTACTS
// ═══════════════════════════════════════════════════════════════

const contactsList = authorizedProcedure("crm_contact", "read")
	.input(z.object({ customerId: z.string().optional() }).optional())
	.handler(async ({ context, input }) => {
		const conds = [
			eq(crmContact.organizationId, orgId(context)),
			ACTIVE(crmContact.deletedAt),
		];
		if (input?.customerId) {
			conds.push(eq(crmContact.customerId, input.customerId));
		}
		return await db
			.select()
			.from(crmContact)
			.where(and(...conds))
			.orderBy(desc(crmContact.isPrimary), crmContact.lastName)
			.limit(500);
	});

const contactInput = z.object({
	customerId: z.string().nullable().optional(),
	firstName: z.string().min(1),
	lastName: z.string().nullable().optional(),
	email: z.string().nullable().optional(),
	phone: z.string().nullable().optional(),
	jobTitle: z.string().nullable().optional(),
	isPrimary: z.boolean().default(false),
	ownerEmployeeId: z.string().nullable().optional(),
});

const contactsCreate = authorizedProcedure("crm_contact", "create")
	.input(contactInput)
	.handler(async ({ context, input }) => {
		// Tenant-verify the parent customer (cross-tenant FK guard — 17C review).
		if (input.customerId) {
			await assertOwned(crmCustomer, input.customerId, orgId(context));
		}
		const id = createId();
		await db.insert(crmContact).values({
			id,
			organizationId: orgId(context),
			customerId: input.customerId ?? null,
			firstName: input.firstName,
			lastName: input.lastName ?? null,
			email: input.email ? input.email.toLowerCase().trim() : null,
			phone: input.phone ?? null,
			jobTitle: input.jobTitle ?? null,
			isPrimary: input.isPrimary,
			ownerEmployeeId: input.ownerEmployeeId ?? null,
		});
		await audit(context, "crm_contact", id, "create");
		return { id };
	});

const contactsUpdate = authorizedProcedure("crm_contact", "update")
	.input(contactInput.partial().extend({ id: z.string() }))
	.handler(async ({ context, input }) => {
		await assertOwned(crmContact, input.id, orgId(context));
		if (input.customerId) {
			await assertOwned(crmCustomer, input.customerId, orgId(context));
		}
		const { id, email, ...rest } = input;
		await db
			.update(crmContact)
			.set({
				...rest,
				...(email === undefined
					? {}
					: { email: email ? email.toLowerCase().trim() : null }),
			})
			.where(
				and(
					eq(crmContact.id, id),
					eq(crmContact.organizationId, orgId(context))
				)
			);
		await audit(context, "crm_contact", id, "update");
		return { id };
	});

// ═══════════════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════════════

const leadsList = authorizedProcedure("crm_lead", "read")
	.input(
		z
			.object({
				status: z
					.enum(["new", "contacted", "qualified", "unqualified", "converted"])
					.optional(),
				mine: z.boolean().optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const conds = [
			eq(crmLead.organizationId, orgId(context)),
			ACTIVE(crmLead.deletedAt),
		];
		if (input?.status) {
			conds.push(eq(crmLead.status, input.status));
		}
		const scope = await ownerScope(context);
		if (scope) {
			if (scope.length === 0) {
				return [];
			}
			conds.push(inArray(crmLead.ownerEmployeeId, scope));
		}
		const rows = await db
			.select()
			.from(crmLead)
			.where(and(...conds))
			.orderBy(desc(crmLead.createdAt))
			.limit(500);
		const names = await employeeNameMap(rows.map((r) => r.ownerEmployeeId));
		const r = role(context);
		return rows.map((row) => ({
			...row,
			estimatedValue: canSeeCrmMoney(r) ? num(row.estimatedValue) : null,
			ownerName: row.ownerEmployeeId
				? (names.get(row.ownerEmployeeId) ?? null)
				: null,
		}));
	});

const leadsGetById = authorizedProcedure("crm_lead", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const row = await assertOwned(crmLead, input.id, orgId(context));
		await assertOwnerScope(context, row.ownerEmployeeId as string | null);
		const r = role(context);
		return {
			...row,
			estimatedValue: canSeeCrmMoney(r) ? num(row.estimatedValue) : null,
		};
	});

// A scoped (rep/manager) caller may only open a record they own / a report owns.
async function assertOwnerScope(
	context: unknown,
	ownerEmployeeId: string | null
) {
	const scope = await ownerScope(context);
	if (!scope) {
		return;
	}
	if (!(ownerEmployeeId && scope.includes(ownerEmployeeId))) {
		throw new ORPCError("FORBIDDEN", { message: "Not in your scope." });
	}
}

// Gate access to a polymorphic sub-resource (note/activity) by its PARENT.
// Leads/deals are owner-scoped (a rep/manager may only touch notes/activities on
// records in their scope); customers/contacts are org-shared (tenant-verify only).
// Without this, the AC gate alone would let a scoped caller read/write notes &
// activities on any record by passing its id (IDOR — flagged by 17C review).
async function assertRelatedScope(
	context: unknown,
	relatedType: "lead" | "customer" | "contact" | "deal",
	relatedId: string
) {
	const oid = orgId(context as never);
	if (relatedType === "lead") {
		const row = await assertOwned(crmLead, relatedId, oid);
		await assertOwnerScope(context, row.ownerEmployeeId as string | null);
		return;
	}
	if (relatedType === "deal") {
		const row = await assertOwned(crmDeal, relatedId, oid);
		await assertOwnerScope(context, row.ownerEmployeeId as string | null);
		return;
	}
	if (relatedType === "customer") {
		await assertOwned(crmCustomer, relatedId, oid);
		return;
	}
	await assertOwned(crmContact, relatedId, oid);
}

const leadInput = z.object({
	name: z.string().min(1),
	companyName: z.string().nullable().optional(),
	contactEmail: z.string().nullable().optional(),
	contactPhone: z.string().nullable().optional(),
	status: z
		.enum(["new", "contacted", "qualified", "unqualified"])
		.default("new"),
	sourceKey: z
		.enum([
			"web_form",
			"referral",
			"campaign",
			"manual",
			"import",
			"event",
			"other",
		])
		.nullable()
		.optional(),
	ownerEmployeeId: z.string().nullable().optional(),
	estimatedValue: z.number().nullable().optional(),
	description: z.string().nullable().optional(),
});

const leadsCreate = authorizedProcedure("crm_lead", "create")
	.input(leadInput)
	.handler(async ({ context, input }) => {
		const id = createId();
		await db.insert(crmLead).values({
			id,
			organizationId: orgId(context),
			name: input.name,
			companyName: input.companyName ?? null,
			contactEmail: input.contactEmail ?? null,
			contactPhone: input.contactPhone ?? null,
			status: input.status,
			sourceKey: input.sourceKey ?? null,
			ownerEmployeeId: input.ownerEmployeeId ?? null,
			estimatedValue:
				input.estimatedValue == null ? null : input.estimatedValue.toFixed(2),
			description: input.description ?? null,
		});
		await audit(context, "crm_lead", id, "create");
		return { id };
	});

const leadsUpdate = authorizedProcedure("crm_lead", "update")
	.input(leadInput.partial().extend({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const existing = await assertOwned(crmLead, input.id, orgId(context));
		await assertOwnerScope(context, existing.ownerEmployeeId as string | null);
		if (existing.status === "converted") {
			throw new ORPCError("BAD_REQUEST", {
				message: "A converted lead is read-only.",
			});
		}
		const { id, estimatedValue, ...rest } = input;
		await db
			.update(crmLead)
			.set({
				...rest,
				...(estimatedValue === undefined
					? {}
					: {
							estimatedValue:
								estimatedValue == null ? null : estimatedValue.toFixed(2),
						}),
			})
			.where(
				and(eq(crmLead.id, id), eq(crmLead.organizationId, orgId(context)))
			);
		await audit(context, "crm_lead", id, "update");
		return { id };
	});

// Transactional lead → customer (+ contact + optional deal) conversion.
const leadsConvert = authorizedProcedure("crm_lead", "convert")
	.input(
		z.object({
			id: z.string(),
			createDeal: z.boolean().default(true),
			dealTitle: z.string().optional(),
			dealValue: z.number().nullable().optional(),
			stageId: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const lead = await assertOwned(crmLead, input.id, oid);
		await assertOwnerScope(context, lead.ownerEmployeeId as string | null);
		if (lead.status === "converted") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Lead already converted.",
			});
		}
		const owner = (lead.ownerEmployeeId as string | null) ?? null;
		const customerId = createId();
		const contactId = createId();
		let dealId: string | null = null;

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one atomic conversion (customer + contact + optional deal + mark converted) — keep it in a single transaction.
		await db.transaction(async (tx) => {
			await tx.insert(crmCustomer).values({
				id: customerId,
				organizationId: oid,
				name: (lead.companyName as string) || (lead.name as string),
				type: "company",
				status: "active",
				email: (lead.contactEmail as string | null) ?? null,
				phone: (lead.contactPhone as string | null) ?? null,
				ownerEmployeeId: owner,
				sourceKey: (lead.sourceKey as never) ?? null,
			});
			await tx.insert(crmContact).values({
				id: contactId,
				organizationId: oid,
				customerId,
				firstName: (lead.name as string) || "Contact",
				email: lead.contactEmail
					? (lead.contactEmail as string).toLowerCase().trim()
					: null,
				phone: (lead.contactPhone as string | null) ?? null,
				isPrimary: true,
				ownerEmployeeId: owner,
			});
			if (input.createDeal) {
				dealId = createId();
				let stageId = input.stageId ?? null;
				if (!stageId) {
					const [firstStage] = await tx
						.select({ id: crmPipelineStage.id })
						.from(crmPipelineStage)
						.where(
							and(
								eq(crmPipelineStage.organizationId, oid),
								ACTIVE(crmPipelineStage.deletedAt)
							)
						)
						.orderBy(crmPipelineStage.position)
						.limit(1);
					stageId = firstStage?.id ?? null;
				}
				if (!stageId) {
					throw new ORPCError("BAD_REQUEST", {
						message: "No pipeline stage exists — create one first.",
					});
				}
				await tx.insert(crmDeal).values({
					id: dealId,
					organizationId: oid,
					customerId,
					primaryContactId: contactId,
					title:
						input.dealTitle ||
						`${(lead.companyName as string) || lead.name} deal`,
					stageId,
					value:
						input.dealValue == null
							? ((lead.estimatedValue as string | null) ?? null)
							: input.dealValue.toFixed(2),
					currency: "GYD",
					status: "open",
					ownerEmployeeId: owner,
					lastActivityAt: new Date(),
				});
			}
			await tx
				.update(crmLead)
				.set({
					status: "converted",
					convertedCustomerId: customerId,
					convertedContactId: contactId,
					convertedDealId: dealId,
					convertedAt: new Date(),
					convertedByUserId: actorId(context),
				})
				.where(and(eq(crmLead.id, input.id), eq(crmLead.organizationId, oid)));
		});

		await audit(context, "crm_lead", input.id, "update", {
			converted: true,
			customerId,
			dealId,
		});
		return { customerId, contactId, dealId };
	});

// ═══════════════════════════════════════════════════════════════
// DEALS
// ═══════════════════════════════════════════════════════════════

const dealsList = authorizedProcedure("crm_deal", "read")
	.input(
		z
			.object({
				status: z.enum(["open", "won", "lost"]).optional(),
				stageId: z.string().optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const conds = [
			eq(crmDeal.organizationId, orgId(context)),
			ACTIVE(crmDeal.deletedAt),
		];
		if (input?.status) {
			conds.push(eq(crmDeal.status, input.status));
		}
		if (input?.stageId) {
			conds.push(eq(crmDeal.stageId, input.stageId));
		}
		const scope = await ownerScope(context);
		if (scope) {
			if (scope.length === 0) {
				return [];
			}
			conds.push(inArray(crmDeal.ownerEmployeeId, scope));
		}
		const rows = await db
			.select()
			.from(crmDeal)
			.where(and(...conds))
			.orderBy(desc(crmDeal.updatedAt))
			.limit(500);
		const ownerNames = await employeeNameMap(
			rows.map((r) => r.ownerEmployeeId)
		);
		const custNames = await customerNameMap(
			orgId(context),
			rows.map((r) => r.customerId)
		);
		const stageNames = await stageNameMap(orgId(context));
		const r = role(context);
		const now = Date.now();
		return rows.map((row) => ({
			...row,
			value: canSeeCrmMoney(r) ? num(row.value) : null,
			ownerName: row.ownerEmployeeId
				? (ownerNames.get(row.ownerEmployeeId) ?? null)
				: null,
			customerName: custNames.get(row.customerId) ?? null,
			stageName: stageNames.get(row.stageId) ?? null,
			isStalled:
				row.status === "open" &&
				row.lastActivityAt != null &&
				now - new Date(row.lastActivityAt).getTime() > STALLED_MS,
		}));
	});

async function customerNameMap(
	oid: string,
	ids: string[]
): Promise<Map<string, string>> {
	const real = [...new Set(ids)];
	const map = new Map<string, string>();
	if (real.length === 0) {
		return map;
	}
	const rows = await db
		.select({ id: crmCustomer.id, name: crmCustomer.name })
		.from(crmCustomer)
		.where(
			and(eq(crmCustomer.organizationId, oid), inArray(crmCustomer.id, real))
		);
	for (const r of rows) {
		map.set(r.id, r.name);
	}
	return map;
}

async function stageNameMap(oid: string): Promise<Map<string, string>> {
	const rows = await db
		.select({ id: crmPipelineStage.id, name: crmPipelineStage.name })
		.from(crmPipelineStage)
		.where(eq(crmPipelineStage.organizationId, oid));
	const map = new Map<string, string>();
	for (const r of rows) {
		map.set(r.id, r.name);
	}
	return map;
}

const dealsGetById = authorizedProcedure("crm_deal", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const row = await assertOwned(crmDeal, input.id, orgId(context));
		await assertOwnerScope(context, row.ownerEmployeeId as string | null);
		const r = role(context);
		return { ...row, value: canSeeCrmMoney(r) ? num(row.value) : null };
	});

const dealInput = z.object({
	customerId: z.string(),
	primaryContactId: z.string().nullable().optional(),
	title: z.string().min(1),
	stageId: z.string(),
	value: z.number().nullable().optional(),
	probabilityPct: z.number().int().min(0).max(100).nullable().optional(),
	expectedCloseDate: z.string().nullable().optional(),
	ownerEmployeeId: z.string().nullable().optional(),
});

const dealsCreate = authorizedProcedure("crm_deal", "create")
	.input(dealInput)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		await assertOwned(crmCustomer, input.customerId, oid);
		await assertOwned(crmPipelineStage, input.stageId, oid);
		const id = createId();
		await db.insert(crmDeal).values({
			id,
			organizationId: oid,
			customerId: input.customerId,
			primaryContactId: input.primaryContactId ?? null,
			title: input.title,
			stageId: input.stageId,
			value: input.value == null ? null : input.value.toFixed(2),
			currency: "GYD",
			probabilityPct: input.probabilityPct ?? null,
			expectedCloseDate: input.expectedCloseDate
				? new Date(input.expectedCloseDate)
				: null,
			status: "open",
			ownerEmployeeId: input.ownerEmployeeId ?? null,
			lastActivityAt: new Date(),
		});
		await audit(context, "crm_deal", id, "create");
		return { id };
	});

const dealsUpdate = authorizedProcedure("crm_deal", "update")
	.input(dealInput.partial().extend({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const existing = await assertOwned(crmDeal, input.id, oid);
		await assertOwnerScope(context, existing.ownerEmployeeId as string | null);
		const { id, value, expectedCloseDate, ...rest } = input;
		await db
			.update(crmDeal)
			.set({
				...rest,
				...(value === undefined
					? {}
					: { value: value == null ? null : value.toFixed(2) }),
				...(expectedCloseDate === undefined
					? {}
					: {
							expectedCloseDate: expectedCloseDate
								? new Date(expectedCloseDate)
								: null,
						}),
			})
			.where(and(eq(crmDeal.id, id), eq(crmDeal.organizationId, oid)));
		await audit(context, "crm_deal", id, "update");
		return { id };
	});

// Move a deal to a stage; if the target stage is won/lost, set status (lost
// requires a reason — the stage-gate pattern).
const dealsAdvanceStage = authorizedProcedure("crm_deal", "advance_stage")
	.input(
		z.object({
			id: z.string(),
			stageId: z.string(),
			lostReason: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const existing = await assertOwned(crmDeal, input.id, oid);
		await assertOwnerScope(context, existing.ownerEmployeeId as string | null);
		const stage = await assertOwned(crmPipelineStage, input.stageId, oid);
		let status: "open" | "won" | "lost" = "open";
		if (stage.isWon) {
			status = "won";
		} else if (stage.isLost) {
			status = "lost";
		}
		if (status === "lost" && !input.lostReason?.trim()) {
			throw new ORPCError("BAD_REQUEST", {
				message: "A lost reason is required.",
			});
		}
		await db
			.update(crmDeal)
			.set({
				stageId: input.stageId,
				status,
				lostReason: status === "lost" ? (input.lostReason ?? null) : null,
				lastActivityAt: new Date(),
			})
			.where(and(eq(crmDeal.id, input.id), eq(crmDeal.organizationId, oid)));
		await audit(context, "crm_deal", input.id, "update", {
			stage: stage.name,
			status,
		});
		return { id: input.id, status };
	});

// Won → Project handoff: writes a crm_customer_project_link (intent) + stamps
// the deal. projectId stays NULL (the soft seam) — Projects back-fills later.
const dealsHandoff = authorizedProcedure("crm_deal", "handoff")
	.input(z.object({ id: z.string(), note: z.string().optional() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const deal = await assertOwned(crmDeal, input.id, oid);
		await assertOwnerScope(context, deal.ownerEmployeeId as string | null);
		if (deal.status !== "won") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Only a won deal can be handed off.",
			});
		}
		if (deal.handedOffProjectLinkId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "This deal already has a handoff.",
			});
		}
		const linkId = createId();
		await db.transaction(async (tx) => {
			await tx.insert(crmCustomerProjectLink).values({
				id: linkId,
				organizationId: oid,
				customerId: deal.customerId as string,
				dealId: deal.id as string,
				projectId: null,
				handoffStatus: "intended",
				handoffNote: input.note ?? null,
				handedOffByUserId: actorId(context),
				handedOffAt: new Date(),
			});
			await tx
				.update(crmDeal)
				.set({ handedOffProjectLinkId: linkId })
				.where(and(eq(crmDeal.id, input.id), eq(crmDeal.organizationId, oid)));
		});
		await audit(context, "crm_customer_project_link", linkId, "create", {
			dealId: input.id,
		});
		return { id: linkId };
	});

const handoffsForCustomer = authorizedProcedure("crm_customer", "read")
	.input(z.object({ customerId: z.string() }))
	.handler(async ({ context, input }) =>
		db
			.select()
			.from(crmCustomerProjectLink)
			.where(
				and(
					eq(crmCustomerProjectLink.organizationId, orgId(context)),
					eq(crmCustomerProjectLink.customerId, input.customerId),
					ACTIVE(crmCustomerProjectLink.deletedAt)
				)
			)
			.orderBy(desc(crmCustomerProjectLink.handedOffAt))
	);

// ═══════════════════════════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════════════════════════

const relatedSchema = z.object({
	relatedType: z.enum(["lead", "customer", "contact", "deal"]),
	relatedId: z.string(),
});

const activitiesList = authorizedProcedure("crm_activity", "read")
	.input(
		z
			.object({
				relatedType: z.enum(["lead", "customer", "contact", "deal"]).optional(),
				relatedId: z.string().optional(),
				openOnly: z.boolean().optional(),
			})
			.optional()
	)
	.handler(async ({ context, input }) => {
		const conds = [
			eq(crmActivity.organizationId, orgId(context)),
			ACTIVE(crmActivity.deletedAt),
		];
		if (input?.relatedType && input?.relatedId) {
			// Gate by the parent record's owner scope (IDOR — 17C review).
			await assertRelatedScope(context, input.relatedType, input.relatedId);
			conds.push(eq(crmActivity.relatedType, input.relatedType));
			conds.push(eq(crmActivity.relatedId, input.relatedId));
		} else {
			// No parent given (e.g. the "my open follow-ups" feed): a scoped caller
			// only sees activities assigned within their own/team scope.
			const scope = await ownerScope(context);
			if (scope) {
				if (scope.length === 0) {
					return [];
				}
				conds.push(inArray(crmActivity.assignedToEmployeeId, scope));
			}
		}
		if (input?.openOnly) {
			conds.push(isNull(crmActivity.completedAt));
		}
		const rows = await db
			.select()
			.from(crmActivity)
			.where(and(...conds))
			.orderBy(desc(crmActivity.createdAt))
			.limit(500);
		const names = await employeeNameMap(
			rows.map((r) => r.assignedToEmployeeId)
		);
		const now = Date.now();
		return rows.map((r) => ({
			...r,
			assigneeName: r.assignedToEmployeeId
				? (names.get(r.assignedToEmployeeId) ?? null)
				: null,
			isOverdue:
				r.completedAt == null &&
				r.dueAt != null &&
				new Date(r.dueAt).getTime() < now,
		}));
	});

const activitiesCreate = authorizedProcedure("crm_activity", "create")
	.input(
		relatedSchema.extend({
			type: z.enum(["call", "meeting", "email", "task", "follow_up"]),
			subject: z.string().min(1),
			body: z.string().nullable().optional(),
			dueAt: z.string().nullable().optional(),
			assignedToEmployeeId: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		await assertRelatedScope(context, input.relatedType, input.relatedId);
		const id = createId();
		await db.insert(crmActivity).values({
			id,
			organizationId: orgId(context),
			type: input.type,
			subject: input.subject,
			body: input.body ?? null,
			dueAt: input.dueAt ? new Date(input.dueAt) : null,
			relatedType: input.relatedType,
			relatedId: input.relatedId,
			assignedToEmployeeId: input.assignedToEmployeeId ?? null,
			createdByUserId: actorId(context),
		});
		// Touch the deal's lastActivityAt (deal-rotting signal) when related.
		if (input.relatedType === "deal") {
			await db
				.update(crmDeal)
				.set({ lastActivityAt: new Date() })
				.where(
					and(
						eq(crmDeal.id, input.relatedId),
						eq(crmDeal.organizationId, orgId(context))
					)
				);
		}
		await audit(context, "crm_activity", id, "create");
		return { id };
	});

const activitiesComplete = authorizedProcedure("crm_activity", "update")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const act = await assertActivityOwned(input.id, orgId(context));
		// Gate by the activity's parent record scope (IDOR — 17C review).
		await assertRelatedScope(
			context,
			act.relatedType as "lead" | "customer" | "contact" | "deal",
			act.relatedId as string
		);
		await db
			.update(crmActivity)
			.set({ completedAt: new Date() })
			.where(
				and(
					eq(crmActivity.id, input.id),
					eq(crmActivity.organizationId, orgId(context))
				)
			);
		await audit(context, "crm_activity", input.id, "update", {
			completed: true,
		});
		return { id: input.id };
	});

async function assertActivityOwned(
	id: string,
	oid: string
): Promise<{ relatedType: string; relatedId: string }> {
	const [row] = await db
		.select({
			id: crmActivity.id,
			relatedType: crmActivity.relatedType,
			relatedId: crmActivity.relatedId,
		})
		.from(crmActivity)
		.where(and(eq(crmActivity.id, id), eq(crmActivity.organizationId, oid)))
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Activity not found." });
	}
	return { relatedType: row.relatedType, relatedId: row.relatedId };
}

// ═══════════════════════════════════════════════════════════════
// NOTES (private-note redaction surface)
// ═══════════════════════════════════════════════════════════════

const notesList = authorizedProcedure("crm_note", "read")
	.input(relatedSchema)
	.handler(async ({ context, input }) => {
		// Gate by the parent record's owner scope (IDOR — 17C review).
		await assertRelatedScope(context, input.relatedType, input.relatedId);
		const conds = [
			eq(crmNote.organizationId, orgId(context)),
			eq(crmNote.relatedType, input.relatedType),
			eq(crmNote.relatedId, input.relatedId),
			ACTIVE(crmNote.deletedAt),
		];
		// Private notes are stripped at the boundary for roles without the grant.
		if (!canReadPrivateCrmNotes(role(context))) {
			conds.push(eq(crmNote.visibility, "team"));
		}
		return await db
			.select()
			.from(crmNote)
			.where(and(...conds))
			.orderBy(desc(crmNote.createdAt))
			.limit(500);
	});

const notesCreate = authorizedProcedure("crm_note", "create")
	.input(
		relatedSchema.extend({
			body: z.string().min(1),
			visibility: z.enum(["team", "private"]).default("team"),
		})
	)
	.handler(async ({ context, input }) => {
		await assertRelatedScope(context, input.relatedType, input.relatedId);
		const id = createId();
		await db.insert(crmNote).values({
			id,
			organizationId: orgId(context),
			relatedType: input.relatedType,
			relatedId: input.relatedId,
			body: input.body,
			visibility: input.visibility,
			authorUserId: actorId(context),
		});
		await audit(context, "crm_note", id, "create");
		return { id };
	});

// ═══════════════════════════════════════════════════════════════
// ROUTER EXPORT
// ═══════════════════════════════════════════════════════════════

export const crmRouter = {
	stages: {
		list: stagesList,
		create: stagesCreate,
		update: stagesUpdate,
	},
	customers: {
		list: customersList,
		getById: customersGetById,
		create: customersCreate,
		update: customersUpdate,
		archive: customersArchive,
		handoffs: handoffsForCustomer,
	},
	contacts: {
		list: contactsList,
		create: contactsCreate,
		update: contactsUpdate,
	},
	leads: {
		list: leadsList,
		getById: leadsGetById,
		create: leadsCreate,
		update: leadsUpdate,
		convert: leadsConvert,
	},
	deals: {
		list: dealsList,
		getById: dealsGetById,
		create: dealsCreate,
		update: dealsUpdate,
		advanceStage: dealsAdvanceStage,
		handoff: dealsHandoff,
	},
	activities: {
		list: activitiesList,
		create: activitiesCreate,
		complete: activitiesComplete,
	},
	notes: {
		list: notesList,
		create: notesCreate,
	},
};
