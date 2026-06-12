/**
 * Notification subsystem — Phase 21D-F.
 *
 * A reusable, per-tenant, per-user in-app inbox. Other modules EMIT notifications
 * by calling createNotification / createNotifications (server-side, not an AC-gated
 * user action); users read/manage their own inbox through the notifications router.
 *
 * entityType/entityId are SOFT cross-module links (text, not FKs) — a notification
 * may point at any module's record and survive that record being archived. A
 * `channel` is reserved on the input for future delivery transports (email/push);
 * today only the in-app inbox is persisted.
 */
import { notification } from "@Heimdallone/db/schema/notification";
import { createId } from "@paralleldrive/cuid2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type AnyDb = NodePgDatabase<Record<string, unknown>>;

export interface NotificationInput {
	body?: string | null;
	entityId?: string | null;
	/** Soft cross-module link (not a FK). */
	entityType?: string | null;
	organizationId: string;
	title: string;
	/** Stable machine type, e.g. "leave.approved", "helpdesk.assigned". */
	type: string;
	userId: string;
}

function toRow(input: NotificationInput) {
	return {
		id: createId(),
		organizationId: input.organizationId,
		userId: input.userId,
		type: input.type,
		title: input.title,
		body: input.body ?? null,
		entityType: input.entityType ?? null,
		entityId: input.entityId ?? null,
	};
}

/** Emit one notification. Safe to call from any module/handler (pass db or a tx). */
export async function createNotification(
	db: AnyDb,
	input: NotificationInput
): Promise<string> {
	const row = toRow(input);
	await db.insert(notification).values(row);
	return row.id;
}

/** Emit many notifications in one insert (fan-out to a team / approvers). */
export async function createNotifications(
	db: AnyDb,
	inputs: NotificationInput[]
): Promise<number> {
	if (inputs.length === 0) {
		return 0;
	}
	await db.insert(notification).values(inputs.map(toRow));
	return inputs.length;
}
