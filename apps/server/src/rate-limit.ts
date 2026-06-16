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

const IPV4_MAPPED_PREFIX = /^::ffff:/;
const PRIVATE_172 = /^172\.(1[6-9]|2\d|3[01])\./;

// Loopback + RFC1918/RFC4193 private ranges. A TCP peer in one of these is our
// own infra (docker network / localhost) and cannot be forged by an external
// client, since external traffic can only reach us through the proxy.
function isInternalPeer(addr: string): boolean {
	const a = addr.replace(IPV4_MAPPED_PREFIX, ""); // unwrap IPv4-mapped IPv6
	if (a === "127.0.0.1" || a === "::1" || a === "localhost") {
		return true;
	}
	if (a.startsWith("10.") || a.startsWith("192.168.")) {
		return true;
	}
	if (PRIVATE_172.test(a)) {
		return true;
	}
	// IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
	return a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80");
}

function peerAddr(c: Context): string {
	try {
		return getConnInfo(c).remote.address ?? "unknown";
	} catch {
		return "unknown";
	}
}

/**
 * Resolve the limiter key for a request, or `null` to EXEMPT it.
 *
 * Behind a trusted reverse proxy (TRUST_PROXY=true, e.g. Pangolin/Traefik) the
 * real end-user IP is the left-most X-Forwarded-For entry, so each browser
 * client gets its own bucket. When XFF is ABSENT we do NOT fail open on the
 * header alone (it is attacker-controllable): we exempt ONLY when the actual TCP
 * peer is an internal/loopback address (genuine docker/health traffic), and
 * otherwise key on the peer address so a direct, non-proxied caller is still
 * limited per source IP. Without TRUST_PROXY the raw TCP peer is always used.
 */
function clientIp(c: Context): string | null {
	if (TRUST_PROXY) {
		const first = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
		if (first) {
			return first;
		}
		const peer = peerAddr(c);
		return isInternalPeer(peer) ? null : peer;
	}
	return peerAddr(c);
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
