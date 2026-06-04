import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canViewProjects } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href: "/app/projects" | "/app/projects/all";
	key: string;
	label: string;
}

// 14D ships Overview + Projects. My Tasks + My Time (self-service) arrive in 14G
// and add their own tabs; the project-detail tabs are scoped to the $id (14E+).
const STAFF_TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/projects" },
	{ key: "projects", label: "Projects", href: "/app/projects/all" },
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/projects/all")) {
		return "projects";
	}
	return "overview";
}

export function ProjectsTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/projects";

	// The staff tab strip is for project viewers/managers. A pure employee uses the
	// scoped project list + (14G) the self-service My Tasks / My Time views.
	if (!canViewProjects(org.memberRole)) {
		return null;
	}
	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="pj-tabs">
			{STAFF_TABS.map((tab) => (
				<Link
					className={`pj-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
