import { ac, roles } from "@Heimdallone/auth/permissions";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL:
		typeof window === "undefined"
			? process.env.VITE_SERVER_URL || "http://localhost:3000"
			: "",
	plugins: [
		organizationClient({
			ac,
			roles,
		}),
		adminClient(),
	],
});
