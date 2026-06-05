import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canCreateObjective, canViewPerformance } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/performance"
		| "/app/performance/goals"
		| "/app/performance/my-goals";
	key: string;
	label: string;
}

// 15D ships Overview + Goals (the management surface) + My Goals (self-service).
// Reviews / 1-on-1s / Recognition management arrive in later checkpoints and add
// their own tabs; they are NOT shown here.
const STAFF_TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/performance" },
	{ key: "goals", label: "Goals", href: "/app/performance/goals" },
];
const SELF_TAB: Tab = {
	key: "my-goals",
	label: "My goals",
	href: "/app/performance/my-goals",
};

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/performance/my-goals")) {
		return "my-goals";
	}
	if (clean.startsWith("/app/performance/goals")) {
		return "goals";
	}
	return "overview";
}

export function PerformanceTabs() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/performance";

	// Staff tabs for viewers (HR / manager / payroll / auditor); My goals for
	// anyone who can own a goal (HR / manager / employee). A pure employee sees
	// ONLY My goals.
	const tabs: Tab[] = [
		...(canViewPerformance(role) ? STAFF_TABS : []),
		...(canCreateObjective(role) ? [SELF_TAB] : []),
	];
	if (tabs.length === 0) {
		return null;
	}
	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="pf-tabs">
			{tabs.map((tab) => (
				<Link
					className={`pf-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
