import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canViewHelpdesk } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href: "/app/helpdesk" | "/app/helpdesk/requests";
	key: string;
	label: string;
}

// 13D ships Overview + Requests. My requests (13F) and Categories (later) add
// their own tabs when those routes land.
const TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/helpdesk" },
	{ key: "requests", label: "Requests", href: "/app/helpdesk/requests" },
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/helpdesk/requests")) {
		return "requests";
	}
	return "overview";
}

export function HelpdeskTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/helpdesk";

	// Staff tabs are for helpdesk viewers/agents. Employees use the self-service
	// view (no tab strip) — their queue is scoped to their own requests.
	if (!canViewHelpdesk(org.memberRole)) {
		return null;
	}

	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="hd-tabs">
			{TABS.map((tab) => (
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
