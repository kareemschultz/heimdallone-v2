import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canViewAssets } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/assets"
		| "/app/assets/inventory"
		| "/app/assets/requests"
		| "/app/assets/categories";
	key: string;
	label: string;
}

const TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/assets" },
	{ key: "inventory", label: "Inventory", href: "/app/assets/inventory" },
	{ key: "requests", label: "Requests", href: "/app/assets/requests" },
	{ key: "categories", label: "Categories", href: "/app/assets/categories" },
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/assets/inventory")) {
		return "inventory";
	}
	if (clean.startsWith("/app/assets/requests")) {
		return "requests";
	}
	if (clean.startsWith("/app/assets/categories")) {
		return "categories";
	}
	return "overview";
}

export function AssetsTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/assets";

	// Staff tabs are for asset viewers/managers. Employees use the self-service
	// "My assets" view (/app/assets/my) with no tab strip.
	if (!canViewAssets(org.memberRole)) {
		return null;
	}

	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="assets-tabs">
			{TABS.map((tab) => (
				<Link
					className={`assets-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
