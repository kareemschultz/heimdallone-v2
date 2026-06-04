import { Link } from "@tanstack/react-router";

import { canViewAssets } from "@/lib/rbac";
import { linkedKindLabel } from "./labels";
import type { HelpdeskLinkedEntity } from "./types";

/**
 * Read-only cross-module context. The helpdesk only LINKS to these records — it
 * never mutates them, so there are no action buttons here. The only deep link is
 * to the Assets module (which enforces its own RBAC); everything else is shown as
 * a safe reference label.
 */
export function RequestLinkedContext({
	entities,
	role,
}: {
	entities: HelpdeskLinkedEntity[];
	role: string;
}) {
	if (entities.length === 0) {
		return null;
	}
	return (
		<>
			<h3 className="hd-section-title">Linked records</h3>
			<div className="hd-linked-panel">
				{entities.map((e) => (
					<div className="hd-linked-item" key={`${e.kind}-${e.id}`}>
						<span className="hd-linked-kind">{linkedKindLabel(e.kind)}</span>
						{e.kind === "asset" && canViewAssets(role) ? (
							<Link
								className="asset-name-link"
								params={{ id: e.id }}
								to="/app/assets/inventory/$id"
							>
								{e.label ?? "View in Assets"}
							</Link>
						) : (
							<span>{e.label ?? "Linked record"}</span>
						)}
					</div>
				))}
				<p className="hd-linked-note">
					Linked for context only. Any changes must be made in the source
					module.
				</p>
			</div>
		</>
	);
}
