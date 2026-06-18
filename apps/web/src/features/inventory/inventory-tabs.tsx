import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";
import { canViewInventory } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/inventory"
		| "/app/inventory/catalog"
		| "/app/inventory/movements"
		| "/app/inventory/locations";
	key: string;
	label: string;
}

const TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/inventory" },
	{ key: "catalog", label: "Catalogue", href: "/app/inventory/catalog" },
	{ key: "movements", label: "Movements", href: "/app/inventory/movements" },
	{ key: "locations", label: "Locations", href: "/app/inventory/locations" },
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/inventory/catalog")) {
		return "catalog";
	}
	if (clean.startsWith("/app/inventory/movements")) {
		return "movements";
	}
	if (clean.startsWith("/app/inventory/locations")) {
		return "locations";
	}
	return "overview";
}

export function InventoryTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/inventory";

	if (!canViewInventory(org.memberRole)) {
		return null;
	}
	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="inv-tabs">
			{TABS.map((tab) => (
				<Link
					className={`inv-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
