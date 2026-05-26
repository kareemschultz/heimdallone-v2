import { ac, roles } from "@Heimdallone/auth/permissions";
import { env } from "@Heimdallone/env/web";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: env.VITE_SERVER_URL,
	plugins: [
		organizationClient({
			ac,
			roles,
		}),
		adminClient(),
	],
});
