import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canCreateHelpdeskRequest, canViewHelpdesk } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href: "/app/helpdesk" | "/app/helpdesk/requests" | "/app/helpdesk/my";
	key: string;
	label: string;
}

// 13D shipped Overview + Requests; 13F adds My requests (shown to viewers who can
// also log their own request — managers/HR/agents). Categories (later) adds its own.
const STAFF_TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/helpdesk" },
	{ key: "requests", label: "Requests", href: "/app/helpdesk/requests" },
];
const MY_TAB: Tab = {
	key: "my",
	label: "My requests",
	href: "/app/helpdesk/my",
};

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/helpdesk/requests")) {
		return "requests";
	}
	if (clean.startsWith("/app/helpdesk/my")) {
		return "my";
	}
	return "overview";
}

export function HelpdeskTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/helpdesk";

	// The staff tab strip is for helpdesk viewers/agents. A pure employee uses the
	// self-service My requests view, which is a single page with no tab strip.
	if (!canViewHelpdesk(org.memberRole)) {
		return null;
	}

	// Viewers who can also log their own request (managers/HR/agents) get the
	// My requests tab too; read-only viewers (auditor/payroll) do not.
	const tabs = canCreateHelpdeskRequest(org.memberRole)
		? [...STAFF_TABS, MY_TAB]
		: STAFF_TABS;
	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="hd-tabs">
			{tabs.map((tab) => (
				<Link
					className={`hd-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
