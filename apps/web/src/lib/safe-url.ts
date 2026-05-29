/**
 * Returns the URL only if it is an absolute http(s) URL, otherwise undefined.
 *
 * Guards against stored-XSS via `javascript:` / `data:` / `vbscript:` schemes
 * being placed into an anchor `href`. SSR-safe: parses without a base so it
 * never touches `window`. Relative URLs return undefined (callers should then
 * render the value as plain text rather than a link).
 */
export function safeHttpUrl(
	value: string | null | undefined
): string | undefined {
	if (!value) {
		return;
	}
	try {
		const parsed = new URL(value);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return value;
		}
		return;
	} catch {
		return;
	}
}
