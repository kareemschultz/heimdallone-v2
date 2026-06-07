import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canViewFinance } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/finance"
		| "/app/finance/costing"
		| "/app/finance/projects"
		| "/app/finance/budgets"
		| "/app/finance/variance";
	key: string;
	label: string;
}

const TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/finance" },
	{ key: "costing", label: "Cost by department", href: "/app/finance/costing" },
	{ key: "projects", label: "Project costing", href: "/app/finance/projects" },
	{ key: "budgets", label: "Budgets", href: "/app/finance/budgets" },
	{ key: "variance", label: "Budget vs actual", href: "/app/finance/variance" },
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/finance/costing")) {
		return "costing";
	}
	if (clean.startsWith("/app/finance/projects")) {
		return "projects";
	}
	if (clean.startsWith("/app/finance/budgets")) {
		return "budgets";
	}
	if (clean.startsWith("/app/finance/variance")) {
		return "variance";
	}
	return "overview";
}

export function FinanceTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/finance";

	if (!canViewFinance(org.memberRole)) {
		return null;
	}
	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="fn-tabs">
			{TABS.map((tab) => (
				<Link
					className={`fn-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
