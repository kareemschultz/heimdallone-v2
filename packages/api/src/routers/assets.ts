// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: large router file with many similar handlers
// biome-ignore-all lint/style/noNonNullAssertion: tenant-verify helpers eliminate the null after a NOT_FOUND check

/**
 * Assets oRPC router — Phase 12C.
 *
 * Scope (per docs/architecture/assets-implementation-plan.md):
 *
 *   categories     list / create / update / archive asset categories
 *   assets         inventory: list / getById / create / update / retire / writeOff
 *   assignments    custody: listByAsset / listByEmployee / assign / return
 *   requests       self-service: list / getById / createSelf / createForEmployee /
 *                  approve / reject / cancel / fulfill
 *
 * Hard guardrails enforced in this file:
 *   - asset.status + asset.currentAssigneeId are DERIVED caches; only assign /
 *     return / retire / writeOff mutate them, always inside the same transaction
 *     that writes the authoritative asset_assignment row.
 *   - An asset has at most ONE open assignment (DB partial unique is the backstop;
 *     re-checked in performAssign for a friendly error).
 *   - purchaseCost is finance data: redacted server-side (NOT just in the UI) for
 *     every role that is not finance/audit (see redactAsset).
 *   - Employee self-service (createSelf / cancel / own custody) is gated by the
 *     asset:request action the employee role actually holds — never a manage-only
 *     gate (the offboarding documents.markUploaded dead-branch lesson).
 *   - Every FK input is tenant-verified before use; manager reads are scoped to
 *     direct reports; employee reads are scoped to self (IDOR-class risk).
 *   - Assignment history is never deleted — return sets returnedAt, preserving it.
 */

import { db } from "@Heimdallone/db";
import {
	asset,
	assetAssignment,
	assetCategory,
	assetRequest,
} from "@Heimdallone/db/schema/assets";
import {
	employeeProfile,
	employeeWorkInfo,
} from "@Heimdallone/db/schema/hr-core";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import {
	and,
	asc,
	count,
	desc,
	eq,
	getTableColumns,
	ilike,
	inArray,
	isNotNull,
	isNull,
	or,
} from "drizzle-orm";
import { z } from "zod";

import { authorizedProcedure } from "../index";
import { createAuditEvent } from "../utils/audit";
import { resolveCurrentEmployee } from "../utils/employee-scope";
// canRequestAsset is intentionally not imported here: employee self-service
// request procedures gate on the asset:request AC action directly (the source of
// truth). The helper lives in role-helpers.ts / rbac.ts for UI affordance gating.
import {
	canAssignAssets,
	canManageAssets,
	canReturnAssets,
	canViewAssetCosts,
	canViewAssets,
} from "../utils/role-helpers";

const orgId = (ctx: { organizationId: string }) => ctx.organizationId;
const actorId = (ctx: { session: { user: { id: string } } }) =>
	ctx.session.user.id;
const role = (ctx: unknown) => (ctx as { memberRole: string }).memberRole;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ─── Zod enums matching schema ───────────────────────────────────────────────

const ASSET_STATUS = z.enum(["available", "in_use", "retired"]);
const RETURN_CONDITION = z.enum(["healthy", "minor_damage", "major_damage"]);
const REQUEST_STATUS = z.enum([
	"requested",
	"approved",
	"rejected",
	"cancelled",
]);

// ────────────────────────────────────────────────────────────────────
// Display + redaction helpers
// ────────────────────────────────────────────────────────────────────

/** Build a human display name; null when the person has no name on file. */
function formatName(first: string | null, last: string | null): string | null {
	const parts = [first, last].filter((p): p is string => Boolean(p));
	return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Server-side purchaseCost redaction. Finance/audit roles see the cost; everyone
 * else gets null. Applied at EVERY site that returns an asset row, so a non-
 * finance caller can never read the value over the wire (mirrors the recruitment
 * offer-compensation redaction). UI gating alone is not sufficient.
 */
function redactAsset<T extends { purchaseCost?: unknown }>(
	row: T,
	callerRole: string
): T {
	if (canViewAssetCosts(callerRole)) {
		return row;
	}
	return { ...row, purchaseCost: null };
}

// ────────────────────────────────────────────────────────────────────
// Tenant-verification helpers — every FK input is checked here
// ────────────────────────────────────────────────────────────────────

async function verifyCategory(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(assetCategory)
		.where(
			and(
				eq(assetCategory.id, id),
				eq(assetCategory.organizationId, orgIdValue),
				isNull(assetCategory.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Asset category not found.",
		});
	}
	return row;
}

async function verifyAsset(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(asset)
		.where(
			and(
				eq(asset.id, id),
				eq(asset.organizationId, orgIdValue),
				isNull(asset.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Asset not found." });
	}
	return row;
}

async function verifyAssignment(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(assetAssignment)
		.where(
			and(
				eq(assetAssignment.id, id),
				eq(assetAssignment.organizationId, orgIdValue),
				isNull(assetAssignment.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Assignment record not found.",
		});
	}
	return row;
}

async function verifyRequest(orgIdValue: string, id: string) {
	const [row] = await db
		.select()
		.from(assetRequest)
		.where(
			and(
				eq(assetRequest.id, id),
				eq(assetRequest.organizationId, orgIdValue),
				isNull(assetRequest.deletedAt)
			)
		)
		.limit(1);
	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "Asset request not found.",
		});
	}
	return row;
}

async function verifyEmployeeInOrg(
	orgIdValue: string,
	employeeId: string
): Promise<void> {
	const [emp] = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.id, employeeId),
				eq(employeeProfile.organizationId, orgIdValue)
			)
		)
		.limit(1);
	if (!emp) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Employee is not in this organization.",
		});
	}
}

/** Employee IDs reporting to the caller's own employee record. */
async function getManagerDirectReportIds(
	orgIdValue: string,
	userId: string
): Promise<string[]> {
	const me = await resolveCurrentEmployee(orgIdValue, userId);
	if (!me) {
		return [];
	}
	const reports = await db
		.select({ id: employeeProfile.id })
		.from(employeeProfile)
		.innerJoin(
			employeeWorkInfo,
			eq(employeeProfile.id, employeeWorkInfo.employeeId)
		)
		.where(
			and(
				eq(employeeWorkInfo.reportingManagerId, me.id),
				eq(employeeProfile.organizationId, orgIdValue)
			)
		);
	return reports.map((r) => r.id);
}

/** True for roles that see every request/custody row in the org (no scoping). */
function seesAllRequests(callerRole: string): boolean {
	return (
		canManageAssets(callerRole) ||
		callerRole === "auditor" ||
		callerRole === "payroll_admin"
	);
}

/**
 * Core assign primitive shared by assignments.assign and requests.fulfill.
 * Runs INSIDE the caller's transaction. Verifies the asset is assignable, writes
 * the open asset_assignment row, and updates the derived caches on asset. The
 * open-assignment partial unique is the backstop against a race → friendly 409.
 * The caller must have already tenant-verified the asset and assignee.
 */
async function performAssign(
	tx: Tx,
	args: {
		organizationId: string;
		assetId: string;
		assignedToId: string;
		assignedByUserId: string;
		returnDueDate: Date | null;
		notes: string | null;
	}
): Promise<string> {
	const [a] = await tx
		.select({ id: asset.id, status: asset.status })
		.from(asset)
		.where(
			and(
				eq(asset.id, args.assetId),
				eq(asset.organizationId, args.organizationId),
				isNull(asset.deletedAt)
			)
		)
		.limit(1);
	if (!a) {
		throw new ORPCError("NOT_FOUND", { message: "Asset not found." });
	}
	if (a.status === "retired") {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Asset is retired and cannot be assigned.",
		});
	}
	if (a.status === "in_use") {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Asset is already assigned.",
		});
	}

	const assignmentId = createId();
	const now = new Date();
	try {
		await tx.insert(assetAssignment).values({
			id: assignmentId,
			organizationId: args.organizationId,
			assetId: args.assetId,
			assignedToId: args.assignedToId,
			assignedByUserId: args.assignedByUserId,
			assignedAt: now,
			returnDueDate: args.returnDueDate,
			notes: args.notes,
		});
	} catch (err: unknown) {
		const cause = (err as { cause?: { code?: string } }).cause;
		if (cause?.code === "23505") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Asset is already assigned.",
			});
		}
		throw err;
	}

	await tx
		.update(asset)
		.set({
			status: "in_use",
			currentAssigneeId: args.assignedToId,
			updatedAt: now,
		})
		.where(
			and(
				eq(asset.id, args.assetId),
				eq(asset.organizationId, args.organizationId)
			)
		);

	return assignmentId;
}

// ════════════════════════════════════════════════════════════════════
// CATEGORIES
// ════════════════════════════════════════════════════════════════════

const categoriesList = authorizedProcedure("asset", "read")
	.input(z.object({}).optional())
	.handler(async ({ context }) => {
		if (!canViewAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const cats = await db
			.select()
			.from(assetCategory)
			.where(
				and(
					eq(assetCategory.organizationId, oid),
					isNull(assetCategory.deletedAt)
				)
			)
			.orderBy(asc(assetCategory.name));
		// Asset counts per category (non-deleted assets only).
		const counts = await db
			.select({ categoryId: asset.categoryId, value: count() })
			.from(asset)
			.where(and(eq(asset.organizationId, oid), isNull(asset.deletedAt)))
			.groupBy(asset.categoryId);
		const countMap = new Map(
			counts.map((c) => [c.categoryId, Number(c.value)])
		);
		return cats.map((c) => ({ ...c, assetCount: countMap.get(c.id) ?? 0 }));
	});

const categoriesCreate = authorizedProcedure("asset", "manage")
	.input(
		z.object({
			name: z.string().min(1).max(120),
			description: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const id = createId();
		try {
			await db.insert(assetCategory).values({
				id,
				organizationId: orgId(context),
				name: input.name,
				description: input.description ?? null,
			});
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505") {
				throw new ORPCError("CONFLICT", {
					message: `A category named "${input.name}" already exists.`,
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "asset_category",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const categoriesUpdate = authorizedProcedure("asset", "manage")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).max(120).optional(),
			description: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyCategory(orgId(context), input.id);
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (input.name !== undefined) {
			patch.name = input.name;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		try {
			await db
				.update(assetCategory)
				.set(patch)
				.where(
					and(
						eq(assetCategory.id, input.id),
						eq(assetCategory.organizationId, orgId(context))
					)
				);
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505") {
				throw new ORPCError("CONFLICT", {
					message: "A category with this name already exists.",
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "asset_category",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

const categoriesArchive = authorizedProcedure("asset", "manage")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canManageAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		await verifyCategory(orgId(context), input.id);
		// Soft-delete. Assets keep their categoryId (FK is set-null only on hard
		// delete) — archived categories never block; orphaned assets show their
		// (archived) category name, and assets with a null category read as
		// "Uncategorised" in the UI.
		await db
			.update(assetCategory)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(assetCategory.id, input.id),
					eq(assetCategory.organizationId, orgId(context))
				)
			);
		await createAuditEvent(db as never, {
			organizationId: orgId(context),
			entityType: "asset_category",
			entityId: input.id,
			action: "archive",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// ASSETS (inventory)
// ════════════════════════════════════════════════════════════════════

const assetsList = authorizedProcedure("asset", "read")
	.input(
		z.object({
			status: ASSET_STATUS.optional(),
			categoryId: z.string().optional(),
			currentAssigneeId: z.string().optional(),
			search: z.string().optional(),
			assignedState: z.enum(["assigned", "unassigned"]).optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		if (!canViewAssets(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const filters = [eq(asset.organizationId, oid), isNull(asset.deletedAt)];
		if (input.status) {
			filters.push(eq(asset.status, input.status));
		}
		if (input.categoryId) {
			filters.push(eq(asset.categoryId, input.categoryId));
		}
		if (input.currentAssigneeId) {
			filters.push(eq(asset.currentAssigneeId, input.currentAssigneeId));
		}
		if (input.assignedState === "assigned") {
			filters.push(isNotNull(asset.currentAssigneeId));
		} else if (input.assignedState === "unassigned") {
			filters.push(isNull(asset.currentAssigneeId));
		}
		if (input.search) {
			const term = `%${input.search}%`;
			const searchClause = or(
				ilike(asset.name, term),
				ilike(asset.trackingId, term)
			);
			if (searchClause) {
				filters.push(searchClause);
			}
		}

		const offset = (input.page - 1) * input.pageSize;
		const [rows, totalRows] = await Promise.all([
			db
				.select({
					...getTableColumns(asset),
					categoryName: assetCategory.name,
					assigneeFirstName: employeeProfile.firstName,
					assigneeLastName: employeeProfile.lastName,
				})
				.from(asset)
				.leftJoin(assetCategory, eq(asset.categoryId, assetCategory.id))
				.leftJoin(
					employeeProfile,
					eq(asset.currentAssigneeId, employeeProfile.id)
				)
				.where(and(...filters))
				.orderBy(asc(asset.name))
				.limit(input.pageSize)
				.offset(offset),
			db
				.select({ value: count() })
				.from(asset)
				.where(and(...filters)),
		]);

		const data = rows.map((row) => {
			const { assigneeFirstName, assigneeLastName, ...rest } = row;
			return redactAsset(
				{
					...rest,
					currentAssigneeName: rest.currentAssigneeId
						? formatName(assigneeFirstName, assigneeLastName)
						: null,
				},
				callerRole
			);
		});

		return {
			data,
			total: Number(totalRows[0]?.value ?? 0),
			page: input.page,
		};
	});

const assetsGetById = authorizedProcedure("asset", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		if (!canViewAssets(callerRole)) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		await verifyAsset(oid, input.id);
		const [row] = await db
			.select({
				...getTableColumns(asset),
				categoryName: assetCategory.name,
				assigneeFirstName: employeeProfile.firstName,
				assigneeLastName: employeeProfile.lastName,
			})
			.from(asset)
			.leftJoin(assetCategory, eq(asset.categoryId, assetCategory.id))
			.leftJoin(
				employeeProfile,
				eq(asset.currentAssigneeId, employeeProfile.id)
			)
			.where(and(eq(asset.id, input.id), eq(asset.organizationId, oid)))
			.limit(1);
		const { assigneeFirstName, assigneeLastName, ...rest } = row!;
		return redactAsset(
			{
				...rest,
				currentAssigneeName: rest.currentAssigneeId
					? formatName(assigneeFirstName, assigneeLastName)
					: null,
			},
			callerRole
		);
	});

const assetsCreate = authorizedProcedure("asset", "create")
	.input(
		z.object({
			name: z.string().min(1).max(200),
			trackingId: z.string().min(1).max(120),
			categoryId: z.string().optional(),
			description: z.string().optional(),
			purchaseDate: z.string().optional(),
			purchaseCost: z.string().optional(),
			expiryDate: z.string().optional(),
			notifyBeforeDays: z.number().int().min(0).optional(),
			lotNumber: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		if (input.categoryId) {
			await verifyCategory(oid, input.categoryId);
		}
		const id = createId();
		try {
			await db.insert(asset).values({
				id,
				organizationId: oid,
				categoryId: input.categoryId ?? null,
				name: input.name,
				trackingId: input.trackingId,
				description: input.description ?? null,
				purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
				purchaseCost: input.purchaseCost ?? null,
				expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
				notifyBeforeDays: input.notifyBeforeDays ?? null,
				lotNumber: input.lotNumber ?? null,
			});
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505") {
				throw new ORPCError("CONFLICT", {
					message: `An asset with tracking ID "${input.trackingId}" already exists.`,
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset",
			entityId: id,
			action: "create",
			actorId: actorId(context),
		});
		return { id };
	});

const assetsUpdate = authorizedProcedure("asset", "manage")
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).max(200).optional(),
			trackingId: z.string().min(1).max(120).optional(),
			categoryId: z.string().nullable().optional(),
			description: z.string().nullable().optional(),
			purchaseDate: z.string().nullable().optional(),
			purchaseCost: z.string().nullable().optional(),
			expiryDate: z.string().nullable().optional(),
			notifyBeforeDays: z.number().int().min(0).nullable().optional(),
			lotNumber: z.string().nullable().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canManageAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		await verifyAsset(oid, input.id);
		if (input.categoryId) {
			await verifyCategory(oid, input.categoryId);
		}
		// status + currentAssigneeId are derived caches owned by assign/return/
		// retire — they are intentionally NOT patchable here.
		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (input.name !== undefined) {
			patch.name = input.name;
		}
		if (input.trackingId !== undefined) {
			patch.trackingId = input.trackingId;
		}
		if (input.categoryId !== undefined) {
			patch.categoryId = input.categoryId;
		}
		if (input.description !== undefined) {
			patch.description = input.description;
		}
		if (input.purchaseDate !== undefined) {
			patch.purchaseDate = input.purchaseDate
				? new Date(input.purchaseDate)
				: null;
		}
		if (input.purchaseCost !== undefined) {
			patch.purchaseCost = input.purchaseCost;
		}
		if (input.expiryDate !== undefined) {
			patch.expiryDate = input.expiryDate ? new Date(input.expiryDate) : null;
		}
		if (input.notifyBeforeDays !== undefined) {
			patch.notifyBeforeDays = input.notifyBeforeDays;
		}
		if (input.lotNumber !== undefined) {
			patch.lotNumber = input.lotNumber;
		}
		try {
			await db
				.update(asset)
				.set(patch)
				.where(and(eq(asset.id, input.id), eq(asset.organizationId, oid)));
		} catch (err: unknown) {
			const cause = (err as { cause?: { code?: string } }).cause;
			if (cause?.code === "23505") {
				throw new ORPCError("CONFLICT", {
					message: "An asset with this tracking ID already exists.",
				});
			}
			throw err;
		}
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
		});
		return { id: input.id };
	});

/** Guard: refuse to retire/write-off an asset that is still in someone's custody. */
async function assertNoOpenAssignment(
	orgIdValue: string,
	assetId: string
): Promise<void> {
	const [open] = await db
		.select({ id: assetAssignment.id })
		.from(assetAssignment)
		.where(
			and(
				eq(assetAssignment.assetId, assetId),
				eq(assetAssignment.organizationId, orgIdValue),
				isNull(assetAssignment.returnedAt),
				isNull(assetAssignment.deletedAt)
			)
		)
		.limit(1);
	if (open) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message:
				"This asset is currently assigned. Return it before retiring it.",
		});
	}
}

const assetsRetire = authorizedProcedure("asset", "manage")
	.input(z.object({ id: z.string(), reason: z.string().optional() }))
	.handler(async ({ context, input }) => {
		if (!canManageAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const a = await verifyAsset(oid, input.id);
		if (a.status === "retired") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Asset is already retired.",
			});
		}
		await assertNoOpenAssignment(oid, input.id);
		await db
			.update(asset)
			.set({ status: "retired", updatedAt: new Date() })
			.where(and(eq(asset.id, input.id), eq(asset.organizationId, oid)));
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "retire", reason: input.reason },
		});
		return { id: input.id };
	});

/**
 * Disposal / write-off. Gated by the more-privileged asset:write_off action
 * (owner/admin only — hr_admin uses retire). v1 behaviour is identical to retire
 * (status → retired); the full disposal ledger (date, proceeds, accounting) is
 * deferred per the implementation plan §1. The distinction is the permission +
 * the audit transition, so a future ledger can hang off write-off events.
 */
const assetsWriteOff = authorizedProcedure("asset", "write_off")
	.input(z.object({ id: z.string(), reason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const a = await verifyAsset(oid, input.id);
		if (a.status === "retired") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Asset is already retired.",
			});
		}
		await assertNoOpenAssignment(oid, input.id);
		await db
			.update(asset)
			.set({ status: "retired", updatedAt: new Date() })
			.where(and(eq(asset.id, input.id), eq(asset.organizationId, oid)));
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "write_off", reason: input.reason },
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// ASSIGNMENTS (custody)
// ════════════════════════════════════════════════════════════════════

const assignmentsListByAsset = authorizedProcedure("asset", "read")
	.input(z.object({ assetId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canViewAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		await verifyAsset(oid, input.assetId);
		const rows = await db
			.select({
				...getTableColumns(assetAssignment),
				assigneeFirstName: employeeProfile.firstName,
				assigneeLastName: employeeProfile.lastName,
			})
			.from(assetAssignment)
			.leftJoin(
				employeeProfile,
				eq(assetAssignment.assignedToId, employeeProfile.id)
			)
			.where(
				and(
					eq(assetAssignment.assetId, input.assetId),
					eq(assetAssignment.organizationId, oid),
					isNull(assetAssignment.deletedAt)
				)
			)
			.orderBy(desc(assetAssignment.assignedAt));
		return rows.map((row) => {
			const { assigneeFirstName, assigneeLastName, ...rest } = row;
			return {
				...rest,
				assignedToName: formatName(assigneeFirstName, assigneeLastName),
			};
		});
	});

/**
 * Open custody held by an employee. Powers the employee "My assets" self-service
 * view, the employee-profile assets tab, and the read-only offboarding custody
 * panel. Self-scoped: an employee may only call this for themselves; a manager
 * for their direct reports; HR/auditor/payroll for anyone in the org.
 */
const assignmentsListByEmployee = authorizedProcedure("asset", "read")
	.input(z.object({ employeeId: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		const isSelf = me?.id === input.employeeId;

		if (!isSelf) {
			if (
				canManageAssets(callerRole) ||
				callerRole === "auditor" ||
				callerRole === "payroll_admin"
			) {
				// org-wide read allowed
			} else if (callerRole === "manager") {
				const reportIds = await getManagerDirectReportIds(
					oid,
					actorId(context)
				);
				if (!reportIds.includes(input.employeeId)) {
					throw new ORPCError("FORBIDDEN", {
						message: "You can only view assets for your direct reports.",
					});
				}
			} else {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only view your own assets.",
				});
			}
		}

		await verifyEmployeeInOrg(oid, input.employeeId);

		return await db
			.select({
				id: assetAssignment.id,
				assetId: assetAssignment.assetId,
				assignedAt: assetAssignment.assignedAt,
				returnDueDate: assetAssignment.returnDueDate,
				notes: assetAssignment.notes,
				assetName: asset.name,
				trackingId: asset.trackingId,
				assetStatus: asset.status,
				categoryName: assetCategory.name,
			})
			.from(assetAssignment)
			.innerJoin(asset, eq(assetAssignment.assetId, asset.id))
			.leftJoin(assetCategory, eq(asset.categoryId, assetCategory.id))
			.where(
				and(
					eq(assetAssignment.assignedToId, input.employeeId),
					eq(assetAssignment.organizationId, oid),
					isNull(assetAssignment.returnedAt),
					isNull(assetAssignment.deletedAt)
				)
			)
			.orderBy(desc(assetAssignment.assignedAt));
	});

const assignmentsAssign = authorizedProcedure("asset", "assign")
	.input(
		z.object({
			assetId: z.string(),
			assignedToId: z.string(),
			returnDueDate: z.string().optional(),
			notes: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canAssignAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		await verifyAsset(oid, input.assetId);
		await verifyEmployeeInOrg(oid, input.assignedToId);

		const assignmentId = await db.transaction((tx) =>
			performAssign(tx, {
				organizationId: oid,
				assetId: input.assetId,
				assignedToId: input.assignedToId,
				assignedByUserId: actorId(context),
				returnDueDate: input.returnDueDate
					? new Date(input.returnDueDate)
					: null,
				notes: input.notes ?? null,
			})
		);

		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset_assignment",
			entityId: assignmentId,
			action: "create",
			actorId: actorId(context),
			metadata: { assetId: input.assetId, assignedToId: input.assignedToId },
		});
		return { id: assignmentId, assetId: input.assetId };
	});

const assignmentsReturn = authorizedProcedure("asset", "return")
	.input(
		z.object({
			assignmentId: z.string(),
			returnCondition: RETURN_CONDITION,
			notes: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		if (!canReturnAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const assignment = await verifyAssignment(oid, input.assignmentId);
		if (assignment.returnedAt !== null) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Asset is not currently assigned.",
			});
		}
		// Condition drives the asset's next state: a major-damage return auto-
		// retires the asset so a broken item can't be reassigned; healthy/minor
		// returns it to the available pool. currentAssigneeId is always cleared.
		const nextStatus =
			input.returnCondition === "major_damage" ? "retired" : "available";
		const now = new Date();

		await db.transaction(async (tx) => {
			await tx
				.update(assetAssignment)
				.set({
					returnedAt: now,
					returnCondition: input.returnCondition,
					returnReceivedByUserId: actorId(context),
					notes: input.notes ?? assignment.notes,
					updatedAt: now,
				})
				.where(
					and(
						eq(assetAssignment.id, input.assignmentId),
						eq(assetAssignment.organizationId, oid)
					)
				);
			await tx
				.update(asset)
				.set({ status: nextStatus, currentAssigneeId: null, updatedAt: now })
				.where(
					and(eq(asset.id, assignment.assetId), eq(asset.organizationId, oid))
				);
		});

		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset_assignment",
			entityId: input.assignmentId,
			action: "update",
			actorId: actorId(context),
			metadata: {
				transition: "return",
				returnCondition: input.returnCondition,
				assetStatus: nextStatus,
			},
		});
		return { id: input.assignmentId, assetStatus: nextStatus };
	});

// ════════════════════════════════════════════════════════════════════
// REQUESTS (employee self-service)
// ════════════════════════════════════════════════════════════════════

const requestsList = authorizedProcedure("asset", "read")
	.input(
		z.object({
			status: REQUEST_STATUS.optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(50),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const filters = [
			eq(assetRequest.organizationId, oid),
			isNull(assetRequest.deletedAt),
		];
		if (input.status) {
			filters.push(eq(assetRequest.status, input.status));
		}

		// Lateral scope: HR/auditor/payroll see all; managers see own + direct
		// reports; everyone else (employee/recruiter) sees only their own.
		if (!seesAllRequests(callerRole)) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			if (callerRole === "manager") {
				const reportIds = await getManagerDirectReportIds(
					oid,
					actorId(context)
				);
				const scope = me ? [me.id, ...reportIds] : reportIds;
				if (scope.length === 0) {
					return { data: [], total: 0, page: input.page };
				}
				filters.push(inArray(assetRequest.employeeId, scope));
			} else {
				if (!me) {
					return { data: [], total: 0, page: input.page };
				}
				filters.push(eq(assetRequest.employeeId, me.id));
			}
		}

		const offset = (input.page - 1) * input.pageSize;
		const [rows, totalRows] = await Promise.all([
			db
				.select({
					...getTableColumns(assetRequest),
					employeeFirstName: employeeProfile.firstName,
					employeeLastName: employeeProfile.lastName,
					categoryName: assetCategory.name,
				})
				.from(assetRequest)
				.leftJoin(
					employeeProfile,
					eq(assetRequest.employeeId, employeeProfile.id)
				)
				.leftJoin(assetCategory, eq(assetRequest.categoryId, assetCategory.id))
				.where(and(...filters))
				.orderBy(desc(assetRequest.createdAt))
				.limit(input.pageSize)
				.offset(offset),
			db
				.select({ value: count() })
				.from(assetRequest)
				.where(and(...filters)),
		]);

		const data = rows.map((row) => {
			const { employeeFirstName, employeeLastName, ...rest } = row;
			return {
				...rest,
				employeeName: formatName(employeeFirstName, employeeLastName),
			};
		});
		return { data, total: Number(totalRows[0]?.value ?? 0), page: input.page };
	});

const requestsGetById = authorizedProcedure("asset", "read")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);

		if (!seesAllRequests(callerRole)) {
			const me = await resolveCurrentEmployee(oid, actorId(context));
			const isOwn = me?.id === req.employeeId;
			if (!isOwn) {
				if (callerRole === "manager") {
					const reportIds = await getManagerDirectReportIds(
						oid,
						actorId(context)
					);
					if (!reportIds.includes(req.employeeId)) {
						throw new ORPCError("FORBIDDEN", {
							message: "You do not have access to this request.",
						});
					}
				} else {
					throw new ORPCError("FORBIDDEN", {
						message: "You can only view your own requests.",
					});
				}
			}
		}
		return req;
	});

/**
 * Employee self-service: submit a request for an asset. Gated by asset:request —
 * the action the employee role actually holds — NOT a manage gate. The requester
 * is always the caller's own employee record (no employeeId input), so this can
 * never be used to request on behalf of someone else.
 */
const requestsCreateSelf = authorizedProcedure("asset", "request")
	.input(
		z.object({
			categoryId: z.string().optional(),
			description: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		if (!me) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must have an employee profile to request an asset.",
			});
		}
		if (input.categoryId) {
			await verifyCategory(oid, input.categoryId);
		}
		const id = createId();
		await db.insert(assetRequest).values({
			id,
			organizationId: oid,
			employeeId: me.id,
			requestedByUserId: actorId(context),
			categoryId: input.categoryId ?? null,
			description: input.description ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset_request",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { employeeId: me.id, self: true },
		});
		return { id };
	});

/**
 * Manager/HR raises a request on behalf of an employee. Gated by asset:request,
 * but the handler restricts WHO may target WHOM: HR/admin for anyone, managers
 * only for their direct reports. Employees/recruiters (who also hold
 * asset:request) cannot reach this branch — it always 403s for them.
 */
const requestsCreateForEmployee = authorizedProcedure("asset", "request")
	.input(
		z.object({
			employeeId: z.string(),
			categoryId: z.string().optional(),
			description: z.string().optional(),
		})
	)
	.handler(async ({ context, input }) => {
		const callerRole = role(context);
		const oid = orgId(context);
		if (!canManageAssets(callerRole)) {
			if (callerRole === "manager") {
				const reportIds = await getManagerDirectReportIds(
					oid,
					actorId(context)
				);
				if (!reportIds.includes(input.employeeId)) {
					throw new ORPCError("FORBIDDEN", {
						message: "You can only raise requests for your direct reports.",
					});
				}
			} else {
				throw new ORPCError("FORBIDDEN", {
					message: "You can only request an asset for yourself.",
				});
			}
		}
		await verifyEmployeeInOrg(oid, input.employeeId);
		if (input.categoryId) {
			await verifyCategory(oid, input.categoryId);
		}
		const id = createId();
		await db.insert(assetRequest).values({
			id,
			organizationId: oid,
			employeeId: input.employeeId,
			requestedByUserId: actorId(context),
			categoryId: input.categoryId ?? null,
			description: input.description ?? null,
		});
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset_request",
			entityId: id,
			action: "create",
			actorId: actorId(context),
			metadata: { employeeId: input.employeeId, self: false },
		});
		return { id };
	});

/** Approve a pending request. Does NOT assign an asset — use fulfill for that. */
const requestsApprove = authorizedProcedure("asset", "manage")
	.input(z.object({ id: z.string(), note: z.string().optional() }))
	.handler(async ({ context, input }) => {
		if (!canManageAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (req.status !== "requested") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Only pending requests can be approved. Current status: ${req.status}.`,
			});
		}
		const now = new Date();
		await db
			.update(assetRequest)
			.set({
				status: "approved",
				resolvedByUserId: actorId(context),
				resolvedAt: now,
				resolutionNote: input.note ?? null,
				updatedAt: now,
			})
			.where(
				and(eq(assetRequest.id, input.id), eq(assetRequest.organizationId, oid))
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "approve" },
		});
		return { id: input.id };
	});

/** Reject a pending request. A reason is required and stored as resolutionNote. */
const requestsReject = authorizedProcedure("asset", "manage")
	.input(z.object({ id: z.string(), reason: z.string().min(1) }))
	.handler(async ({ context, input }) => {
		if (!canManageAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (req.status !== "requested") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Only pending requests can be rejected. Current status: ${req.status}.`,
			});
		}
		const now = new Date();
		await db
			.update(assetRequest)
			.set({
				status: "rejected",
				resolvedByUserId: actorId(context),
				resolvedAt: now,
				resolutionNote: input.reason,
				updatedAt: now,
			})
			.where(
				and(eq(assetRequest.id, input.id), eq(assetRequest.organizationId, oid))
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "reject", reason: input.reason },
		});
		return { id: input.id };
	});

/**
 * Fulfil a request by assigning a specific asset to the requester. Gated by
 * asset:assign (fulfilling IS assigning). Transactional: the assignment, the
 * derived caches on asset, and the request resolution all commit together or
 * roll back together. The request is marked approved with fulfilledAssetId set.
 */
const requestsFulfill = authorizedProcedure("asset", "assign")
	.input(z.object({ id: z.string(), assetId: z.string() }))
	.handler(async ({ context, input }) => {
		if (!canAssignAssets(role(context))) {
			throw new ORPCError("FORBIDDEN", { message: "Insufficient permission." });
		}
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		if (req.status !== "requested" && req.status !== "approved") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Only pending or approved requests can be fulfilled. Current status: ${req.status}.`,
			});
		}
		await verifyAsset(oid, input.assetId);
		const now = new Date();

		const assignmentId = await db.transaction(async (tx) => {
			const aid = await performAssign(tx, {
				organizationId: oid,
				assetId: input.assetId,
				assignedToId: req.employeeId,
				assignedByUserId: actorId(context),
				returnDueDate: null,
				notes: null,
			});
			await tx
				.update(assetRequest)
				.set({
					status: "approved",
					fulfilledAssetId: input.assetId,
					resolvedByUserId: actorId(context),
					resolvedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						eq(assetRequest.id, input.id),
						eq(assetRequest.organizationId, oid)
					)
				);
			return aid;
		});

		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: {
				transition: "fulfill",
				assetId: input.assetId,
				assignmentId,
			},
		});
		return { id: input.id, assignmentId };
	});

/** Requester withdraws their own pending request. */
const requestsCancel = authorizedProcedure("asset", "request")
	.input(z.object({ id: z.string() }))
	.handler(async ({ context, input }) => {
		const oid = orgId(context);
		const req = await verifyRequest(oid, input.id);
		const me = await resolveCurrentEmployee(oid, actorId(context));
		const isRequester =
			(me && me.id === req.employeeId) ||
			req.requestedByUserId === actorId(context);
		if (!isRequester) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can only cancel your own request.",
			});
		}
		if (req.status !== "requested") {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Only pending requests can be cancelled.",
			});
		}
		const now = new Date();
		await db
			.update(assetRequest)
			.set({ status: "cancelled", resolvedAt: now, updatedAt: now })
			.where(
				and(eq(assetRequest.id, input.id), eq(assetRequest.organizationId, oid))
			);
		await createAuditEvent(db as never, {
			organizationId: oid,
			entityType: "asset_request",
			entityId: input.id,
			action: "update",
			actorId: actorId(context),
			metadata: { transition: "cancel" },
		});
		return { id: input.id };
	});

// ════════════════════════════════════════════════════════════════════
// Router
// ════════════════════════════════════════════════════════════════════

export const assetsRouter = {
	// Inventory ops live at the router root so the path reads `assets.list`,
	// `assets.retire`, … (the router itself is the "assets" noun). categories /
	// assignments / requests are namespaced sub-resources.
	list: assetsList,
	getById: assetsGetById,
	create: assetsCreate,
	update: assetsUpdate,
	retire: assetsRetire,
	writeOff: assetsWriteOff,
	categories: {
		list: categoriesList,
		create: categoriesCreate,
		update: categoriesUpdate,
		archive: categoriesArchive,
	},
	assignments: {
		listByAsset: assignmentsListByAsset,
		listByEmployee: assignmentsListByEmployee,
		assign: assignmentsAssign,
		return: assignmentsReturn,
	},
	requests: {
		list: requestsList,
		getById: requestsGetById,
		createSelf: requestsCreateSelf,
		createForEmployee: requestsCreateForEmployee,
		approve: requestsApprove,
		reject: requestsReject,
		fulfill: requestsFulfill,
		cancel: requestsCancel,
	},
};
