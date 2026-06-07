// Idempotent helper — ensures the CRM test users (sales_admin, sales_rep) exist
// in the Atlas Shipping org WITHOUT re-running seed-dev.ts. Mirrors
// seed-pm-user.ts (Phase 14C precedent for a new role).
//
// Run:  export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-crm-users.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { auth } from "../packages/auth/src/index";
import { createDb } from "../packages/db/src/index";
import { member, organization, user } from "../packages/db/src/schema/auth";

const db = createDb();
const PASSWORD = "HeimdallTest2026!";
const BASE = process.env.BETTER_AUTH_URL || "http://localhost:3000";

const USERS = [
	{
		email: "salesadmin@atlas-shipping.com",
		name: "Priya Ramnarine",
		role: "sales_admin",
	},
	{
		email: "salesrep@atlas-shipping.com",
		name: "Kevin Adams",
		role: "sales_rep",
	},
];

async function ensureUser(email: string, name: string): Promise<string> {
	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);
	if (existing) {
		return existing.id;
	}
	const req = new Request(`${BASE}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: BASE },
		body: JSON.stringify({ email, password: PASSWORD, name }),
	});
	await auth.handler(req);
	const [created] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);
	if (!created) {
		throw new Error(`Failed to create ${email}.`);
	}
	return created.id;
}

async function main() {
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, "atlas-shipping"))
		.limit(1);
	if (!org) {
		process.stderr.write("Atlas org not found — run seed-dev.ts first.\n");
		process.exit(1);
	}
	for (const u of USERS) {
		const userId = await ensureUser(u.email, u.name);
		const [existingMember] = await db
			.select({ id: member.id, role: member.role })
			.from(member)
			.where(and(eq(member.userId, userId), eq(member.organizationId, org.id)))
			.limit(1);
		if (existingMember) {
			if (existingMember.role !== u.role) {
				await db
					.update(member)
					.set({ role: u.role })
					.where(eq(member.id, existingMember.id));
			}
		} else {
			await db.insert(member).values({
				id: createId(),
				organizationId: org.id,
				userId,
				role: u.role,
				createdAt: new Date(),
			});
		}
		process.stdout.write(`✓ ${u.email} → ${u.role}\n`);
	}
	process.exit(0);
}

main().catch((e) => {
	process.stderr.write(`${e}\n`);
	process.exit(1);
});
