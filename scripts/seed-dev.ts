/**
 * Dev seed script — creates one demo organization with 9 users across all tenant roles.
 * Uses Better Auth's handler to simulate full HTTP requests with proper cookie signing.
 *
 * Usage:
 *   export $(grep -v '^#' apps/server/.env | xargs)
 *   bun run scripts/seed-dev.ts
 */

import { auth } from "../packages/auth/src/index";

const PASSWORD = "HeimdallTest2026!";
const BASE = process.env.BETTER_AUTH_URL || "http://localhost:3000";

const USERS = [
	{
		email: "owner@atlas-shipping.com",
		name: "Maya Persaud",
		role: "tenant_owner",
	},
	{
		email: "admin@atlas-shipping.com",
		name: "Sasha Bharrat",
		role: "tenant_admin",
	},
	{ email: "hr@atlas-shipping.com", name: "Lia Roberts", role: "hr_admin" },
	{
		email: "payroll@atlas-shipping.com",
		name: "Devon Clarke",
		role: "payroll_admin",
	},
	{
		email: "manager@atlas-shipping.com",
		name: "Andre Sealey",
		role: "manager",
	},
	{
		email: "employee@atlas-shipping.com",
		name: "Rohan Gopaul",
		role: "employee",
	},
	{ email: "auditor@atlas-shipping.com", name: "Priya Singh", role: "auditor" },
	{
		email: "recruiter@atlas-shipping.com",
		name: "Keisha Thompson",
		role: "recruiter",
	},
	{
		email: "helpdesk@atlas-shipping.com",
		name: "Marcus James",
		role: "helpdesk_agent",
	},
] as const;

async function authRequest(
	path: string,
	body: unknown,
	cookie = ""
): Promise<{ json: unknown; cookie: string }> {
	const req = new Request(`${BASE}/api/auth${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Origin: BASE,
			...(cookie ? { Cookie: cookie } : {}),
		},
		body: JSON.stringify(body),
	});

	const res = await auth.handler(req);
	const setCookies = res.headers.getSetCookie?.() ?? [];
	const sessionCookie = setCookies.find((c: string) =>
		c.startsWith("better-auth.session_token=")
	);
	const cookieVal = sessionCookie ? sessionCookie.split(";")[0] : cookie;

	let json: unknown;
	try {
		json = await res.json();
	} catch {
		json = null;
	}

	return { json, cookie: cookieVal };
}

async function main() {
	console.log("\nHeimdallone Dev Seed");
	console.log("---");

	// 1. Create owner
	const ownerDef = USERS[0];
	console.log(`\n1. Creating owner: ${ownerDef.name}`);

	const signup = await authRequest("/sign-up/email", {
		email: ownerDef.email,
		password: PASSWORD,
		name: ownerDef.name,
	});

	const ownerData = signup.json as { user: { id: string } };
	const ownerId = ownerData.user.id;
	const ownerCookie = signup.cookie;
	console.log(`   User ID: ${ownerId}`);
	console.log(`   Cookie: ${ownerCookie ? "acquired" : "MISSING"}`);

	// 2. Create organization
	console.log("\n2. Creating organization: Atlas Shipping");

	const orgResult = await authRequest(
		"/organization/create",
		{ name: "Atlas Shipping", slug: "atlas-shipping" },
		ownerCookie
	);

	const orgData = orgResult.json as {
		id: string;
		members?: Array<{ id: string; role: string }>;
	};
	const orgId = orgData.id;
	console.log(`   Org ID: ${orgId}`);
	console.log(`   Creator role: ${orgData.members?.[0]?.role ?? "unknown"}`);

	// Update cookie if changed
	const activeCookie = orgResult.cookie || ownerCookie;

	// 3. Set active organization
	await authRequest(
		"/organization/set-active",
		{ organizationId: orgId },
		activeCookie
	);
	console.log("   Active org set ✓");

	// 3a. Promote creator's membership from default "owner" to "tenant_owner".
	// Better Auth assigns "owner" by default on /organization/create. Our ACL
	// (packages/auth/src/permissions.ts) ships the custom role "tenant_owner".
	// Without this step, the seeded owner can't pass UI checks that expect
	// "tenant_owner". See docs/reviews/phase-8j1-screenshot-ux-audit.md #1.
	try {
		await auth.api.updateMemberRole({
			body: {
				memberId: orgData.members?.[0]?.id ?? "",
				role: "tenant_owner",
				organizationId: orgId,
			},
			headers: new Headers({ Cookie: activeCookie, Origin: BASE }),
		});
		console.log("   Owner promoted to tenant_owner ✓");
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn(`   Owner role promotion skipped: ${msg}`);
	}

	// 4. Create remaining users and add as members
	console.log("\n3. Creating users and adding as members");

	for (const user of USERS.slice(1)) {
		try {
			const userSignup = await authRequest("/sign-up/email", {
				email: user.email,
				password: PASSWORD,
				name: user.name,
			});

			const userData = userSignup.json as { user: { id: string } };

			// addMember is a server-only API — call it directly with authenticated headers
			await auth.api.addMember({
				body: {
					userId: userData.user.id,
					role: user.role,
					organizationId: orgId,
				},
				headers: new Headers({ Cookie: activeCookie, Origin: BASE }),
			});

			console.log(`   ${user.name} → ${user.role} ✓`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`   ${user.name} → ${user.role} FAILED: ${msg}`);
		}
	}

	// 5. Summary
	console.log("\n---");
	console.log("Seed complete!");
	console.log(`Organization: Atlas Shipping (${orgId})`);
	console.log(`Users: ${USERS.length}`);
	console.log(`Password: ${PASSWORD}`);
	console.log(
		`\nPlatform admin: set PLATFORM_ADMIN_USER_ID=${ownerId} in apps/server/.env`
	);
	console.log("\nAccounts:");
	for (const u of USERS) {
		console.log(`  ${u.email} → ${u.role}`);
	}
	console.log("");

	process.exit(0);
}

main().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
