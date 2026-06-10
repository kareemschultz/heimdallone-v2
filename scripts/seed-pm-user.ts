// Idempotent helper — ensures the project_manager test user exists in the
// existing Atlas Shipping org WITHOUT re-running the (non-idempotent) seed-dev.ts.
//
// Phase 14C added the `project_manager` role; seed-dev.ts now lists pm@ too, but
// re-running seed-dev recreates the owner + org. This script only adds the one
// user + membership, so it's safe to run against a live seeded DB.
//
// Run:  export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-pm-user.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { auth } from "../packages/auth/src/index";
import { createDb } from "../packages/db/src/index";
import { member, organization, user } from "../packages/db/src/schema/auth";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();
const PASSWORD = process.env.TEST_PASSWORD ?? "HeimdallTest2026!";
const EMAIL = "pm@atlas-shipping.com";
const NAME = "Nadia Khan";
const ROLE = "project_manager";
const BASE = process.env.BETTER_AUTH_URL || "http://localhost:3000";

async function ensureUser(): Promise<string> {
	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, EMAIL))
		.limit(1);
	if (existing) {
		return existing.id;
	}
	const req = new Request(`${BASE}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: BASE },
		body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: NAME }),
	});
	await auth.handler(req);
	const [created] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, EMAIL))
		.limit(1);
	if (!created) {
		throw new Error("Failed to create pm@ user.");
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
	const userId = await ensureUser();
	const [existingMember] = await db
		.select({ id: member.id, role: member.role })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, org.id)))
		.limit(1);
	if (existingMember) {
		if (existingMember.role !== ROLE) {
			await db
				.update(member)
				.set({ role: ROLE })
				.where(eq(member.id, existingMember.id));
		}
		process.stdout.write(`pm@ already a member — role ensured = ${ROLE}.\n`);
		process.exit(0);
	}
	await db.insert(member).values({
		id: createId(),
		organizationId: org.id,
		userId,
		role: ROLE,
		createdAt: new Date(),
	});
	process.stdout.write(`pm@ added to Atlas Shipping as ${ROLE}.\n`);
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`seed-pm-user failed: ${err}\n`);
	process.exit(1);
});
