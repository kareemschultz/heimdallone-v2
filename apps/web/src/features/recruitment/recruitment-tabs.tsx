import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import {
	canManageRecruitment,
	canViewRecruitment,
	isOwnerOrAdmin,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	group: "work" | "reports";
	href: string;
	key: string;
	label: string;
	managerOnlyForViewers?: boolean;
	reportsOnly?: boolean;
}

const TABS: Tab[] = [
	{
		key: "overview",
		label: "Overview",
		href: "/app/recruitment",
		group: "work",
	},
	{
		key: "jobs",
		label: "Jobs",
		href: "/app/recruitment/jobs",
		group: "work",
		managerOnlyForViewers: true,
	},
	{
		key: "candidates",
		label: "Candidates",
		href: "/app/recruitment/candidates",
		group: "work",
		managerOnlyForViewers: true,
	},
	{
		key: "pipeline",
		label: "Pipeline",
		href: "/app/recruitment/pipeline",
		group: "work",
		managerOnlyForViewers: true,
	},
	{
		key: "interviews",
		label: "Interviews",
		href: "/app/recruitment/interviews",
		group: "work",
		managerOnlyForViewers: true,
	},
	{
		key: "offers",
		label: "Offers",
		href: "/app/recruitment/offers",
		group: "work",
		managerOnlyForViewers: true,
	},
	{
		key: "reports",
		label: "Reports",
		href: "/app/recruitment/reports",
		group: "reports",
		reportsOnly: true,
	},
];

export function RecruitmentTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/recruitment";

	const canManage = canManageRecruitment(org.memberRole);
	const canView = canViewRecruitment(org.memberRole);
	const canSeeReports =
		isOwnerOrAdmin(org.memberRole) ||
		org.memberRole === "hr_admin" ||
		org.memberRole === "auditor";

	const visibleTabs = TABS.filter((tab) => {
		if (tab.reportsOnly) {
			return canSeeReports;
		}
		if (tab.managerOnlyForViewers && !canManage && !canView) {
			return false;
		}
		return true;
	});

	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="recruitment-tabs">
			{visibleTabs.map((tab) => (
				<Link
					className={`recruitment-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean === "/app/recruitment") {
		return "overview";
	}
	if (clean.startsWith("/app/recruitment/jobs")) {
		return "jobs";
	}
	if (clean.startsWith("/app/recruitment/candidates")) {
		return "candidates";
	}
	if (clean.startsWith("/app/recruitment/pipeline")) {
		return "pipeline";
	}
	if (clean.startsWith("/app/recruitment/interviews")) {
		return "interviews";
	}
	if (clean.startsWith("/app/recruitment/offers")) {
		return "offers";
	}
	if (clean.startsWith("/app/recruitment/reports")) {
		return "reports";
	}
	return "overview";
}
