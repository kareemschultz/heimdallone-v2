// One-off, owner-authorized QA login bootstrap (Phase 21X production stabilization).
//
// Creates a single QA tester account so the maintainer can drive the LIVE app in
// a real browser at mobile widths and see the authenticated UX. It is NOT a demo
// seed: it writes exactly one auth user + one membership per existing org and no
// other data. Password is generated here and written ONLY to a gitignored file
// (.qa-cred); it is never printed to stdout/logs.
//
// Safety: requires CONFIRM_QA_USER=1 and refuses to touch the v1 database. The
// account is tenant_owner of every org purely so QA can switch tenants and see
// all module surfaces; remove it with REMOVE=1 after QA (see bottom).
//
// Run (host, prod DB host rewritten to localhost):
//   export $(grep -v '^#' deploy/.env.v2 | sed 's/postgres-central/localhost/' | xargs) \
//     && CONFIRM_QA_USER=1 bun run scripts/create-qa-user.ts

import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { auth } from "../packages/auth/src/index";
import { createDb } from "../packages/db/src/index";
import { member, organization, user } from "../packages/db/src/schema/auth";

const EMAIL = "qa+platform@heimdallone.com";
const NAME = "QA Platform Tester";
const ROLE = "tenant_owner";
const CRED_FILE = ".qa-cred";
const BASE = process.env.BETTER_AUTH_URL || "http://localhost:3000";

function assertNotV1(): void {
	const url = process.env.DATABASE_URL ?? "";
	if (url.includes("karetech_erp")) {
		throw new Error("Refusing to run against the v1 database (karetech_erp).");
	}
	if (process.env.CONFIRM_QA_USER !== "1") {
		throw new Error("Set CONFIRM_QA_USER=1 to confirm this production write.");
	}
}

const db = createDb();

async function findUserId(): Promise<string | null> {
	const [row] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, EMAIL))
		.limit(1);
	return row?.id ?? null;
}

async function removeQaUser(): Promise<void> {
	const userId = await findUserId();
	if (!userId) {
		process.stdout.write("QA user not present — nothing to remove.\n");
		return;
	}
	await db.delete(member).where(eq(member.userId, userId));
	await db.delete(user).where(eq(user.id, userId));
	process.stdout.write("QA user + memberships removed.\n");
}

async function ensureUser(): Promise<string> {
	const existing = await findUserId();
	if (existing) {
		process.stdout.write("QA user already exists — password unchanged.\n");
		return existing;
	}
	const password = randomBytes(18).toString("base64url");
	const req = new Request(`${BASE}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: BASE },
		body: JSON.stringify({ email: EMAIL, password, name: NAME }),
	});
	const res = await auth.handler(req);
	if (!res.ok) {
		throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
	}
	const created = await findUserId();
	if (!created) {
		throw new Error("User row not found after sign-up.");
	}
	writeFileSync(CRED_FILE, `${EMAIL}\n${password}\n`, { mode: 0o600 });
	chmodSync(CRED_FILE, 0o600);
	process.stdout.write(
		`QA user created; credential written to ${CRED_FILE}.\n`
	);
	return created;
}

// Owner explicitly granted unlimited access: set the Better Auth admin-plugin
// platform role so this account is a full platform superuser (cross-tenant), in
// addition to tenant_owner membership in every org.
async function ensurePlatformAdmin(userId: string): Promise<void> {
	await db
		.update(user)
		.set({ role: "admin", emailVerified: true })
		.where(eq(user.id, userId));
	process.stdout.write("Platform admin role granted (user.role=admin).\n");
}

async function ensureMemberships(userId: string): Promise<void> {
	const orgs = await db
		.select({ id: organization.id, name: organization.name })
		.from(organization);
	for (const org of orgs) {
		const [existing] = await db
			.select({ id: member.id, role: member.role })
			.from(member)
			.where(and(eq(member.userId, userId), eq(member.organizationId, org.id)))
			.limit(1);
		if (existing) {
			if (existing.role !== ROLE) {
				await db
					.update(member)
					.set({ role: ROLE })
					.where(eq(member.id, existing.id));
			}
			process.stdout.write(`  membership ensured: ${org.name} (${ROLE})\n`);
			continue;
		}
		await db.insert(member).values({
			id: createId(),
			organizationId: org.id,
			userId,
			role: ROLE,
			createdAt: new Date(),
		});
		process.stdout.write(`  membership added: ${org.name} (${ROLE})\n`);
	}
}

async function main() {
	assertNotV1();
	if (process.env.REMOVE === "1") {
		await removeQaUser();
		process.exit(0);
	}
	const userId = await ensureUser();
	await ensurePlatformAdmin(userId);
	await ensureMemberships(userId);
	process.stdout.write("Done.\n");
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`create-qa-user failed: ${err}\n`);
	process.exit(1);
});
