import { ChevronDown, ChevronRight } from "lucide-react";
import { fullName, initials, type OrgTreeNode } from "./types";

interface OrgNodeProps {
	expanded: Set<string>;
	matchIds: Set<string> | null;
	node: OrgTreeNode;
	onToggle: (id: string) => void;
	query: string;
}

/** One row in the org tree, rendering its children recursively. Defined at module
 *  scope (not inside the page component) per the React rules. */
export function OrgNode({
	node,
	expanded,
	onToggle,
	matchIds,
	query,
}: OrgNodeProps) {
	const hasChildren = node.children.length > 0;
	const isOpen = expanded.has(node.id);
	// When searching, only render nodes on a path to a match.
	if (matchIds && !matchIds.has(node.id)) {
		return null;
	}
	const isMatch =
		query.length > 0 &&
		fullName(node).toLowerCase().includes(query.toLowerCase());

	return (
		<li className="oc-li">
			<div className={`oc-node ${isMatch ? "match" : ""}`}>
				{hasChildren ? (
					<button
						aria-expanded={isOpen}
						aria-label={isOpen ? "Collapse" : "Expand"}
						className="oc-toggle"
						onClick={() => onToggle(node.id)}
						type="button"
					>
						{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
					</button>
				) : (
					<span className="oc-toggle-spacer" />
				)}
				<span aria-hidden="true" className="oc-avatar">
					{initials(node)}
				</span>
				<span className="oc-info">
					<span className="oc-name">
						{fullName(node)}
						{node.isActive ? null : <span className="oc-badge"> Archived</span>}
					</span>
					<span className="oc-meta">
						{node.jobPositionName ?? "—"}
						{node.departmentName ? ` · ${node.departmentName}` : ""}
						{hasChildren ? ` · ${node.children.length} report(s)` : ""}
					</span>
				</span>
			</div>
			{hasChildren && (isOpen || matchIds) ? (
				<ul className="oc-children">
					{node.children.map((child) => (
						<OrgNode
							expanded={expanded}
							key={child.id}
							matchIds={matchIds}
							node={child}
							onToggle={onToggle}
							query={query}
						/>
					))}
				</ul>
			) : null}
		</li>
	);
}
