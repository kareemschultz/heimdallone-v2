import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canViewGeofencing } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/geofencing"
		| "/app/geofencing/locations"
		| "/app/geofencing/check-in";
	key: string;
	label: string;
}

const TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/geofencing" },
	{ key: "locations", label: "Locations", href: "/app/geofencing/locations" },
	{
		key: "check-in",
		label: "Mobile check-in",
		href: "/app/geofencing/check-in",
	},
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/geofencing/locations")) {
		return "locations";
	}
	if (clean.startsWith("/app/geofencing/check-in")) {
		return "check-in";
	}
	return "overview";
}

/**
 * HR/manager/auditor/payroll tab strip for the geofencing module. Employees use
 * the mobile check-in screen directly (no tab strip) — same pattern as the
 * offboarding self-service view.
 */
export function GeofencingTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/geofencing";

	if (!canViewGeofencing(org.memberRole)) {
		return null;
	}

	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="biometrics-tabs">
			{TABS.map((tab) => (
				<Link
					className={`biometrics-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
