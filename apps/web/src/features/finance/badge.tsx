import type { BadgeTone } from "./labels";

/**
 * A pill badge for the Finance module. Always renders its text label (never
 * colour-only) so the meaning is accessible without relying on the tone colour.
 */
export function Badge({
	tone,
	children,
}: {
	tone: BadgeTone;
	children: string;
}) {
	return <span className={`fn-badge tone-${tone}`}>{children}</span>;
}
