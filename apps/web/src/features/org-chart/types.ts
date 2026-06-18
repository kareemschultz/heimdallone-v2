// Display types for the org chart (Phase org-chart). The API returns a flat node
// list (hrCore.employees.orgChart); the UI assembles the tree.

export interface OrgFlatNode {
	departmentName: string | null;
	firstName: string;
	id: string;
	isActive: boolean;
	jobPositionName: string | null;
	lastName: string | null;
	profileImageUrl: string | null;
	reportingManagerId: string | null;
}

export interface OrgTreeNode extends OrgFlatNode {
	children: OrgTreeNode[];
}

/** Build a forest from the flat node list. A node is a root when it has no
 *  manager OR its manager is not in the visible set (e.g. a manager-scoped view
 *  where the caller's own manager is excluded). */
export function buildForest(flat: OrgFlatNode[]): OrgTreeNode[] {
	const byId = new Map<string, OrgTreeNode>();
	for (const n of flat) {
		byId.set(n.id, { ...n, children: [] });
	}
	const roots: OrgTreeNode[] = [];
	for (const node of byId.values()) {
		const parent = node.reportingManagerId
			? byId.get(node.reportingManagerId)
			: null;
		if (parent) {
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}
	return roots;
}

export function fullName(n: OrgFlatNode): string {
	return `${n.firstName}${n.lastName ? ` ${n.lastName}` : ""}`;
}

export function initials(n: OrgFlatNode): string {
	const a = n.firstName?.[0] ?? "";
	const b = n.lastName?.[0] ?? "";
	return (a + b).toUpperCase() || "?";
}
