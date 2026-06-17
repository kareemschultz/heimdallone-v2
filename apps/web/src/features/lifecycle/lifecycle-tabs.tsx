import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import {
	canManageDisciplinary,
	canRequestResignation,
	canViewDisciplinary,
	canViewResignations,
	canViewTransfers,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/lifecycle"
		| "/app/lifecycle/disciplinary"
		| "/app/lifecycle/transfers"
		| "/app/lifecycle/resignations"
		| "/app/lifecycle/my";
	key: string;
	label: string;
	show: boolean;
}

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/lifecycle/disciplinary")) {
		return "disciplinary";
	}
	if (clean.startsWith("/app/lifecycle/transfers")) {
		return "transfers";
	}
	if (clean.startsWith("/app/lifecycle/resignations")) {
		return "resignations";
	}
	if (clean.startsWith("/app/lifecycle/my")) {
		return "my";
	}
	return "overview";
}

export function LifecycleTabs() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/lifecycle";
	const activeKey = resolveActiveTab(currentPath);

	// A pure employee (no view grants) reaches only the self-service surface.
	const isStaffViewer =
		canViewDisciplinary(role) ||
		canViewTransfers(role) ||
		canViewResignations(role) ||
		canManageDisciplinary(role);

	const tabs: Tab[] = [
		{
			key: "overview",
			label: "Overview",
			href: "/app/lifecycle",
			show: true,
		},
		{
			key: "disciplinary",
			label: "Disciplinary",
			href: "/app/lifecycle/disciplinary",
			show: canViewDisciplinary(role),
		},
		{
			key: "transfers",
			label: "Transfers",
			href: "/app/lifecycle/transfers",
			show: canViewTransfers(role),
		},
		{
			key: "resignations",
			label: "Resignations",
			href: "/app/lifecycle/resignations",
			show: canViewResignations(role),
		},
		{
			key: "my",
			label: isStaffViewer ? "My lifecycle" : "My cases & resignation",
			href: "/app/lifecycle/my",
			show: canRequestResignation(role),
		},
	];

	return (
		<div className="lc-tabs">
			{tabs
				.filter((t) => t.show)
				.map((tab) => (
					<Link
						className={`lc-tab ${activeKey === tab.key ? "active" : ""}`}
						key={tab.key}
						to={tab.href}
					>
						{tab.label}
					</Link>
				))}
		</div>
	);
}
