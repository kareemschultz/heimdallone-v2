import type { BadgeTone } from "./labels";

/**
 * A pill badge. Always renders its text label (never colour-only) so the meaning
 * is accessible without relying on the tone colour.
 */
export function Badge({
	tone,
	children,
}: {
	tone: BadgeTone;
	children: string;
}) {
	return <span className={`hd-badge tone-${tone}`}>{children}</span>;
}
