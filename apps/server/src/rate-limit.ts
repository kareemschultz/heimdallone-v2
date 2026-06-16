import type { Context, Next } from "hono";
import { getConnInfo } from "hono/bun";

/**
 * Simple in-memory fixed-window rate limiter, keyed per client IP + bucket.
 *
 * NOTE: state is PER-INSTANCE — for multi-instance / serverless production this
 * MUST be backed by a shared store (Redis / Upstash). This is a first-line
 * brute-force / abuse guard for a single-instance deploy, not a distributed
 * quota. See docs/operations/production-hardening.md.
 *
 * Client identity: by default the real TCP peer address is used. `X-Forwarded-
 * For` is attacker-controlled, so it is consulted ONLY when TRUST_PROXY=true
 * (i.e. the server genuinely sits behind a trusted reverse proxy that rewrites
 * XFF). Without that flag a spoofed XFF cannot be used to evade or target the
 * limiter. When behind a load balancer you MUST set TRUST_PROXY=true, else all
 * traffic appears to originate from the proxy IP (one shared bucket).
 */
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 50_000;
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const store = new Map<string, { count: number; resetAt: number }>();

/**
 * Resolve the limiter key for a request, or `null` to EXEMPT it.
 *
 * Behind a trusted reverse proxy (TRUST_PROXY=true, e.g. Pangolin/Traefik) the
 * real end-user IP is the left-most X-Forwarded-For entry, so each browser
 * client gets its own bucket. A request that arrives WITHOUT an XFF header in
 * that mode did not pass through the proxy — it is internal traffic (SSR fetches
 * from the web container, health probes, docker network) and is exempted, so a
 * single SSR origin IP can't throttle the whole tenant. Without TRUST_PROXY the
 * raw TCP peer is used (single-instance, no proxy).
 */
function clientIp(c: Context): string | null {
	if (TRUST_PROXY) {
		const first = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
		return first ?? null;
	}
	try {
		const addr = getConnInfo(c).remote.address;
		if (addr) {
			return addr;
		}
	} catch {
		// runtime without connection info — fall through
	}
	return "unknown";
}

function evict(now: number): void {
	for (const [k, v] of store) {
		if (v.resetAt <= now) {
			store.delete(k);
		}
	}
	// Hard cap: if the expired-sweep didn't free enough, drop oldest-inserted
	// (Map preserves insertion order) until back under the cap.
	while (store.size > MAX_BUCKETS) {
		const oldest = store.keys().next().value;
		if (oldest === undefined) {
			break;
		}
		store.delete(oldest);
	}
}

export function rateLimit(opts: { max: number; bucket: string }) {
	return async (c: Context, next: Next) => {
		const ip = clientIp(c);
		// Exempt internal/non-proxied traffic (SSR, health probes, docker net).
		if (ip === null) {
			await next();
			return;
		}
		const key = `${opts.bucket}:${ip}`;
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
		if (store.size > MAX_BUCKETS) {
			evict(now);
		}
		await next();
	};
}
