import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canViewLeavePolicy } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href: "/app/leave/policies" | "/app/leave/policies/company";
	key: string;
	label: string;
}

const TABS: Tab[] = [
	{
		key: "templates",
		label: "Statutory templates",
		href: "/app/leave/policies",
	},
	{
		key: "company",
		label: "Company policies",
		href: "/app/leave/policies/company",
	},
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/leave/policies/company")) {
		return "company";
	}
	return "templates";
}

export function LeavePolicyTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/leave/policies";

	if (!canViewLeavePolicy(org.memberRole)) {
		return null;
	}

	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="leave-policy-tabs">
			{TABS.map((tab) => (
				<Link
					className={`leave-policy-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
