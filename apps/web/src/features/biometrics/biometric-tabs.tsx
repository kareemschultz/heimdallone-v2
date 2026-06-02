import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canViewBiometrics } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/biometrics"
		| "/app/biometrics/devices"
		| "/app/biometrics/sync-runs"
		| "/app/biometrics/punches"
		| "/app/biometrics/exceptions";
	key: string;
	label: string;
}

const TABS: Tab[] = [
	{ key: "overview", label: "Overview", href: "/app/biometrics" },
	{ key: "devices", label: "Devices", href: "/app/biometrics/devices" },
	{ key: "sync-runs", label: "Sync runs", href: "/app/biometrics/sync-runs" },
	{ key: "punches", label: "Punch review", href: "/app/biometrics/punches" },
	{
		key: "exceptions",
		label: "Exceptions",
		href: "/app/biometrics/exceptions",
	},
];

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean === "/app/biometrics") {
		return "overview";
	}
	if (clean.startsWith("/app/biometrics/devices")) {
		return "devices";
	}
	if (clean.startsWith("/app/biometrics/sync-runs")) {
		return "sync-runs";
	}
	if (clean.startsWith("/app/biometrics/punches")) {
		return "punches";
	}
	if (clean.startsWith("/app/biometrics/exceptions")) {
		return "exceptions";
	}
	return "overview";
}

export function BiometricTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/biometrics";

	if (!canViewBiometrics(org.memberRole)) {
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
