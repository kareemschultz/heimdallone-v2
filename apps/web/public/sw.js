// Kill-switch service worker.
//
// v1 (the previous app) was a PWA whose Workbox service worker remains
// registered in users' browsers after the v2 cutover. That stale SW intercepts
// navigations and serves v1's cached app shell (the "Loading workspace…" screen
// that calls organization/getSetupStatus, which no longer exists in v2).
//
// v2 is NOT a PWA. This file is served at the same /sw.js URL so the browser,
// on its next service-worker update check, replaces the v1 SW with this one,
// which immediately deletes all caches, unregisters itself, and reloads any
// open pages — after which the site loads cleanly from v2 with no SW.
self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			try {
				const keys = await caches.keys();
				await Promise.all(keys.map((key) => caches.delete(key)));
			} catch {
				// Ignore cache-clearing errors; unregistering is the critical step.
			}
			await self.registration.unregister();
			const clients = await self.clients.matchAll({ type: "window" });
			for (const client of clients) {
				client.navigate(client.url);
			}
		})()
	);
});

// Pass every request straight to the network — never serve from a v1 cache.
self.addEventListener("fetch", () => {
	// No event.respondWith() → browser performs the default network fetch.
});
