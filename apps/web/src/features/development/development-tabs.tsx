import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { canEnrollSelf, canViewDevelopment } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/development"
		| "/app/development/training"
		| "/app/development/certifications"
		| "/app/development/skills"
		| "/app/development/my-training"
		| "/app/development/my-certifications"
		| "/app/development/my-skills";
	key: string;
	label: string;
}

const OVERVIEW_TAB: Tab = {
	key: "overview",
	label: "Overview",
	href: "/app/development",
};
const TRAINING_TAB: Tab = {
	key: "training",
	label: "Training",
	href: "/app/development/training",
};
const CERTIFICATIONS_TAB: Tab = {
	key: "certifications",
	label: "Certifications",
	href: "/app/development/certifications",
};
const SKILLS_TAB: Tab = {
	key: "skills",
	label: "Skills",
	href: "/app/development/skills",
};
const MY_TRAINING_TAB: Tab = {
	key: "my-training",
	label: "My training",
	href: "/app/development/my-training",
};
const MY_CERTIFICATIONS_TAB: Tab = {
	key: "my-certifications",
	label: "My certifications",
	href: "/app/development/my-certifications",
};
const MY_SKILLS_TAB: Tab = {
	key: "my-skills",
	label: "My skills",
	href: "/app/development/my-skills",
};

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/development/my-training")) {
		return "my-training";
	}
	if (clean.startsWith("/app/development/my-certifications")) {
		return "my-certifications";
	}
	if (clean.startsWith("/app/development/my-skills")) {
		return "my-skills";
	}
	if (clean.startsWith("/app/development/training")) {
		return "training";
	}
	if (clean.startsWith("/app/development/certifications")) {
		return "certifications";
	}
	if (clean.startsWith("/app/development/skills")) {
		return "skills";
	}
	return "overview";
}

export function DevelopmentTabs() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/development";

	// The staff/management surface (Overview + the three catalogues) is for viewers
	// — HR, manager, auditor, payroll, recruiter — NOT a pure employee, who reaches
	// Development only through the self-service "My …" tabs (mirrors Performance).
	const seesStaffSurface = canViewDevelopment(role) && role !== "employee";
	const seesSelfSurface = canEnrollSelf(role);

	const tabs: Tab[] = [
		...(seesStaffSurface
			? [OVERVIEW_TAB, TRAINING_TAB, CERTIFICATIONS_TAB, SKILLS_TAB]
			: []),
		...(seesSelfSurface
			? [MY_TRAINING_TAB, MY_CERTIFICATIONS_TAB, MY_SKILLS_TAB]
			: []),
	];
	if (tabs.length === 0) {
		return null;
	}
	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="dv-tabs">
			{tabs.map((tab) => (
				<Link
					className={`dv-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
