import type { BadgeTone } from "./labels";

/**
 * A pill badge for the CRM module. Always renders its text label (never
 * colour-only) so meaning is accessible without relying on the tone colour.
 */
export function Badge({
	tone,
	children,
}: {
	tone: BadgeTone;
	children: string;
}) {
	return <span className={`crm-badge tone-${tone}`}>{children}</span>;
}
