// No-op. v1's cached PWA shell references /registerSW.js to register its service
// worker. v2 is not a PWA, so this intentionally does nothing — preventing the
// stale v1 service worker from being re-registered while the kill-switch sw.js
// tears it down.
