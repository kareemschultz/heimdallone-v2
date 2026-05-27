import { auditEvent } from "@Heimdallone/db/schema/hr-core";
import { createId } from "@paralleldrive/cuid2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export async function createAuditEvent(
	db: NodePgDatabase<Record<string, unknown>>,
	event: {
		organizationId: string;
		entityType: string;
		entityId: string;
		action: "create" | "update" | "delete" | "archive" | "restore";
		actorId: string | null;
		changes?: { field: string; oldValue: unknown; newValue: unknown }[];
		metadata?: Record<string, unknown>;
	}
): Promise<void> {
	await db.insert(auditEvent).values({
		id: createId(),
		organizationId: event.organizationId,
		entityType: event.entityType,
		entityId: event.entityId,
		action: event.action,
		actorId: event.actorId,
		changes: event.changes ?? null,
		metadata: event.metadata ?? null,
	});
}

export function diffChanges<T extends Record<string, unknown>>(
	before: T,
	after: Partial<T>
): { field: string; oldValue: unknown; newValue: unknown }[] {
	const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];
	for (const key of Object.keys(after)) {
		const oldVal = before[key];
		const newVal = after[key as keyof T];
		if (oldVal !== newVal) {
			changes.push({ field: key, oldValue: oldVal, newValue: newVal });
		}
	}
	return changes;
}
