import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canViewOffboarding } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/offboarding"
		| "/app/offboarding/cases"
		| "/app/offboarding/templates"
		| "/app/offboarding/tasks"
		| "/app/offboarding/assets"
		| "/app/offboarding/access";
	key: string;
	label: string;
}

const TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/offboarding" },
	{ key: "cases", label: "Cases", href: "/app/offboarding/cases" },
	{ key: "templates", label: "Templates", href: "/app/offboarding/templates" },
	{ key: "tasks", label: "Tasks", href: "/app/offboarding/tasks" },
	{ key: "assets", label: "Assets", href: "/app/offboarding/assets" },
	{ key: "access", label: "Access", href: "/app/offboarding/access" },
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean === "/app/offboarding") {
		return "overview";
	}
	if (clean.startsWith("/app/offboarding/cases")) {
		return "cases";
	}
	if (clean.startsWith("/app/offboarding/templates")) {
		return "templates";
	}
	if (clean.startsWith("/app/offboarding/tasks")) {
		return "tasks";
	}
	if (clean.startsWith("/app/offboarding/assets")) {
		return "assets";
	}
	if (clean.startsWith("/app/offboarding/access")) {
		return "access";
	}
	return "overview";
}

export function OffboardingTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/offboarding";

	// Staff tabs are for offboarding viewers/managers/auditors. Employees use the
	// self-service view (/app/offboarding/my) with no tab strip.
	if (!canViewOffboarding(org.memberRole)) {
		return null;
	}

	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="offboarding-tabs">
			{TABS.map((tab) => (
				<Link
					className={`offboarding-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
