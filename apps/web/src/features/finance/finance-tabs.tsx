import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canViewFinance, canViewGL } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/finance"
		| "/app/finance/costing"
		| "/app/finance/projects"
		| "/app/finance/budgets"
		| "/app/finance/variance"
		| "/app/finance/accounts"
		| "/app/finance/journals"
		| "/app/finance/trial-balance";
	key: string;
	label: string;
}

const BASE_TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/finance" },
	{ key: "costing", label: "Cost by department", href: "/app/finance/costing" },
	{ key: "projects", label: "Project costing", href: "/app/finance/projects" },
	{ key: "budgets", label: "Budgets", href: "/app/finance/budgets" },
	{ key: "variance", label: "Budget vs actual", href: "/app/finance/variance" },
];

// GL tabs — shown only to GL-capable roles (canViewGL excludes managers, who can
// still see the cost reports above).
const GL_TABS: Tab[] = [
	{
		key: "accounts",
		label: "Chart of accounts",
		href: "/app/finance/accounts",
	},
	{ key: "journals", label: "Journals", href: "/app/finance/journals" },
	{
		key: "trial-balance",
		label: "Trial balance",
		href: "/app/finance/trial-balance",
	},
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
	if (clean.startsWith("/app/finance/accounts")) {
		return "accounts";
	}
	if (clean.startsWith("/app/finance/journals")) {
		return "journals";
	}
	if (clean.startsWith("/app/finance/trial-balance")) {
		return "trial-balance";
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
	const tabs = canViewGL(org.memberRole)
		? [...BASE_TABS, ...GL_TABS]
		: BASE_TABS;

	return (
		<div className="fn-tabs">
			{tabs.map((tab) => (
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
