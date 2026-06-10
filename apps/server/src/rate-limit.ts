import type { Context, Next } from "hono";

/**
 * Simple in-memory fixed-window rate limiter, keyed per client IP + bucket.
 *
 * NOTE: state is PER-INSTANCE — for multi-instance / serverless production this
 * MUST be backed by a shared store (Redis / Upstash). This is a first-line
 * brute-force / abuse guard for a single-instance deploy, not a distributed
 * quota. See docs/operations/production-hardening.md.
 */
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 50_000;
const store = new Map<string, { count: number; resetAt: number }>();

function clientIp(c: Context): string {
	const fwd = c.req.header("x-forwarded-for");
	if (fwd) {
		return fwd.split(",")[0]?.trim() ?? "unknown";
	}
	return c.req.header("x-real-ip") ?? "unknown";
}

export function rateLimit(opts: { max: number; bucket: string }) {
	return async (c: Context, next: Next) => {
		const key = `${opts.bucket}:${clientIp(c)}`;
		const now = Date.now();
		const entry = store.get(key);
		if (entry && entry.resetAt > now) {
			entry.count += 1;
			if (entry.count > opts.max) {
				const retry = Math.ceil((entry.resetAt - now) / 1000);
				c.header("Retry-After", String(retry));
				return c.json({ error: "Too many requests" }, 429);
			}
		} else {
			store.set(key, { count: 1, resetAt: now + WINDOW_MS });
		}
		// Opportunistic eviction of expired buckets to bound memory.
		if (store.size > MAX_BUCKETS) {
			for (const [k, v] of store) {
				if (v.resetAt <= now) {
					store.delete(k);
				}
			}
		}
		await next();
	};
}
