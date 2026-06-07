import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canViewCrm } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/crm"
		| "/app/crm/leads"
		| "/app/crm/customers"
		| "/app/crm/deals"
		| "/app/crm/activities";
	key: string;
	label: string;
}

const TABS: Tab[] = [
	{ key: "overview", label: "Dashboard", href: "/app/crm" },
	{ key: "leads", label: "Leads", href: "/app/crm/leads" },
	{ key: "customers", label: "Customers", href: "/app/crm/customers" },
	{ key: "deals", label: "Deals", href: "/app/crm/deals" },
	{ key: "activities", label: "Activities", href: "/app/crm/activities" },
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/crm/leads")) {
		return "leads";
	}
	if (clean.startsWith("/app/crm/customers")) {
		return "customers";
	}
	if (clean.startsWith("/app/crm/deals")) {
		return "deals";
	}
	if (clean.startsWith("/app/crm/activities")) {
		return "activities";
	}
	return "overview";
}

export function CrmTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/crm";

	if (!canViewCrm(org.memberRole)) {
		return null;
	}
	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="crm-tabs">
			{TABS.map((tab) => (
				<Link
					className={`crm-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
