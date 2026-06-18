import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Network } from "lucide-react";
import { useContext, useMemo, useState } from "react";

import "@/styles/org-chart.css";
import { EmptyState } from "@/components/empty-state";
import { OrgNode } from "@/features/org-chart/org-node";
import {
	buildForest,
	fullName,
	type OrgFlatNode,
} from "@/features/org-chart/types";
import { canViewPayroll } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/org-chart/")({
	component: OrgChartPage,
});

function canViewOrgChart(role: string): boolean {
	// Mirror the nav gate: see-all roles + managers (manager is scoped server-side).
	return canViewPayroll(role) || role === "manager";
}

// All node ids on a path to a name match (matches + their ancestors), so the tree
// can show just the relevant branches when searching.
function computeMatchIds(
	flat: OrgFlatNode[],
	query: string
): Set<string> | null {
	if (!query.trim()) {
		return null;
	}
	const lower = query.toLowerCase();
	const byId = new Map(flat.map((n) => [n.id, n]));
	const keep = new Set<string>();
	for (const n of flat) {
		if (fullName(n).toLowerCase().includes(lower)) {
			let cursor: OrgFlatNode | undefined = n;
			while (cursor && !keep.has(cursor.id)) {
				keep.add(cursor.id);
				cursor = cursor.reportingManagerId
					? byId.get(cursor.reportingManagerId)
					: undefined;
			}
		}
	}
	return keep;
}

function OrgChartPage() {
	const org = useContext(OrgCtx);
	const canView = canViewOrgChart(org.memberRole);
	const [query, setQuery] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [initialised, setInitialised] = useState(false);

	const chart = useQuery(
		orpc.hrCore.employees.orgChart.queryOptions({
			input: {},
			enabled: canView,
		})
	);

	const flat = useMemo(
		() => (chart.data?.nodes as OrgFlatNode[] | undefined) ?? [],
		[chart.data]
	);
	const forest = useMemo(() => buildForest(flat), [flat]);
	const matchIds = useMemo(() => computeMatchIds(flat, query), [flat, query]);

	// Expand the first two levels by default once data arrives.
	if (!initialised && flat.length > 0) {
		const seed = new Set<string>();
		for (const root of buildForest(flat)) {
			seed.add(root.id);
			for (const child of root.children) {
				seed.add(child.id);
			}
		}
		setExpanded(seed);
		setInitialised(true);
	}

	function toggle(id: string) {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}
	function expandAll() {
		setExpanded(new Set(flat.map((n) => n.id)));
	}
	function collapseAll() {
		setExpanded(new Set());
	}

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">Org chart</h1>
				</div>
				<EmptyState
					description="The org chart is available to administrators, HR, payroll, auditors, and team managers."
					icon={<Network size={28} />}
					title="You don't have access to the org chart"
				/>
			</div>
		);
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Org chart</span>
					</div>
					<h1 className="page-title">Org chart</h1>
					<p className="page-sub">
						Reporting lines across the organisation.
						{chart.data?.scoped ? " Showing your team." : ""}
					</p>
				</div>
			</div>

			<div className="oc-toolbar">
				<input
					aria-label="Search people"
					className="oc-search"
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search by name…"
					value={query}
				/>
				<button className="oc-btn" onClick={expandAll} type="button">
					Expand all
				</button>
				<button className="oc-btn" onClick={collapseAll} type="button">
					Collapse all
				</button>
			</div>

			{chart.isLoading ? <div className="oc-skeleton" /> : null}
			{chart.isError ? (
				<EmptyState
					compact
					description="Could not load the org chart. Please try again."
					title="Something went wrong"
				/>
			) : null}

			{!(chart.isLoading || chart.isError) && forest.length === 0 ? (
				<EmptyState
					compact
					description="No reporting structure to show yet. Set reporting managers on employee work info to build the chart."
					icon={<Network size={28} />}
					title="No org chart yet"
				/>
			) : null}

			{forest.length > 0 ? (
				<ul className="oc-tree">
					{forest.map((root) => (
						<OrgNode
							expanded={expanded}
							key={root.id}
							matchIds={matchIds}
							node={root}
							onToggle={toggle}
							query={query}
						/>
					))}
				</ul>
			) : null}
		</div>
	);
}
