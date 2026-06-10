/**
 * Refuse to run a seed script against a production database.
 *
 * Seeds write demo/test data and (for the user seeds) create auth users with a
 * well-known dev password. They must never touch a production DB. Call this at
 * the top of every seed's executable path. Override only for an intentional
 * staging bootstrap with ALLOW_DESTRUCTIVE_SEED=1.
 */
export function assertSeedAllowed(): void {
	if (
		process.env.NODE_ENV === "production" &&
		process.env.ALLOW_DESTRUCTIVE_SEED !== "1"
	) {
		console.error(
			"✗ Refusing to seed: NODE_ENV=production. Seeds write demo data and " +
				"known-credential users. Set ALLOW_DESTRUCTIVE_SEED=1 to override."
		);
		process.exit(1);
	}
}
