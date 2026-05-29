import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canViewOnboarding } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/onboarding"
		| "/app/onboarding/templates"
		| "/app/onboarding/employees"
		| "/app/onboarding/tasks"
		| "/app/onboarding/documents";
	key: string;
	label: string;
}

const TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/onboarding" },
	{ key: "templates", label: "Templates", href: "/app/onboarding/templates" },
	{ key: "employees", label: "Employees", href: "/app/onboarding/employees" },
	{ key: "tasks", label: "Tasks", href: "/app/onboarding/tasks" },
	{ key: "documents", label: "Documents", href: "/app/onboarding/documents" },
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean === "/app/onboarding") {
		return "overview";
	}
	if (clean.startsWith("/app/onboarding/templates")) {
		return "templates";
	}
	if (clean.startsWith("/app/onboarding/employees")) {
		return "employees";
	}
	if (clean.startsWith("/app/onboarding/tasks")) {
		return "tasks";
	}
	if (clean.startsWith("/app/onboarding/documents")) {
		return "documents";
	}
	return "overview";
}

export function OnboardingTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/onboarding";

	// The staff admin tabs are for onboarding viewers/managers. Employees use
	// the self-service view (no tab strip).
	if (!canViewOnboarding(org.memberRole)) {
		return null;
	}

	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="onboarding-tabs">
			{TABS.map((tab) => (
				<Link
					className={`onboarding-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
