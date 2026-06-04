import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canTrackProjectTime, canViewProjects } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/projects"
		| "/app/projects/all"
		| "/app/projects/my-tasks"
		| "/app/projects/my-time";
	key: string;
	label: string;
}

// Staff tabs (Overview + Projects) are for project viewers/managers; the
// self-service My Tasks / My Time tabs are for anyone who can be assigned work or
// log time (managing / manager / employee) — a read-only auditor/payroll sees the
// staff tabs only.
const STAFF_TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/projects" },
	{ key: "projects", label: "Projects", href: "/app/projects/all" },
];
const SELF_TABS: Tab[] = [
	{ key: "my-tasks", label: "My tasks", href: "/app/projects/my-tasks" },
	{ key: "my-time", label: "My time", href: "/app/projects/my-time" },
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/projects/my-tasks")) {
		return "my-tasks";
	}
	if (clean.startsWith("/app/projects/my-time")) {
		return "my-time";
	}
	if (clean.startsWith("/app/projects/all")) {
		return "projects";
	}
	return "overview";
}

export function ProjectsTabs() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/projects";

	const tabs: Tab[] = [
		...(canViewProjects(role) ? STAFF_TABS : []),
		...(canTrackProjectTime(role) ? SELF_TABS : []),
	];
	if (tabs.length === 0) {
		return null;
	}
	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="pj-tabs">
			{tabs.map((tab) => (
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
