import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import {
	canCreateObjective,
	canSubmitReview,
	canViewOneOnOnes,
	canViewPerformance,
	canViewRecognition,
	canViewReviews,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

interface Tab {
	href:
		| "/app/performance"
		| "/app/performance/goals"
		| "/app/performance/reviews"
		| "/app/performance/one-on-ones"
		| "/app/performance/recognition"
		| "/app/performance/my-goals"
		| "/app/performance/my-reviews";
	key: string;
	label: string;
}

// 15D shipped Overview + Goals + My goals; 15E adds Reviews (the management
// surface) + My reviews (assigned review tasks, self-service). 1-on-1s and
// recognition management arrive in later checkpoints with their own tabs.
const OVERVIEW_TAB: Tab = {
	key: "overview",
	label: "Overview",
	href: "/app/performance",
};
const GOALS_TAB: Tab = {
	key: "goals",
	label: "Goals",
	href: "/app/performance/goals",
};
const REVIEWS_TAB: Tab = {
	key: "reviews",
	label: "Reviews",
	href: "/app/performance/reviews",
};
const ONE_ON_ONES_TAB: Tab = {
	key: "one-on-ones",
	label: "1-on-1s",
	href: "/app/performance/one-on-ones",
};
const RECOGNITION_TAB: Tab = {
	key: "recognition",
	label: "Recognition",
	href: "/app/performance/recognition",
};
const MY_GOALS_TAB: Tab = {
	key: "my-goals",
	label: "My goals",
	href: "/app/performance/my-goals",
};
const MY_REVIEWS_TAB: Tab = {
	key: "my-reviews",
	label: "My reviews",
	href: "/app/performance/my-reviews",
};

const TRAILING_SLASH = /\/$/;

function resolveActiveTab(path: string): string {
	const clean = path.replace(TRAILING_SLASH, "");
	if (clean.startsWith("/app/performance/my-goals")) {
		return "my-goals";
	}
	if (clean.startsWith("/app/performance/my-reviews")) {
		return "my-reviews";
	}
	if (clean.startsWith("/app/performance/one-on-ones")) {
		return "one-on-ones";
	}
	if (clean.startsWith("/app/performance/recognition")) {
		return "recognition";
	}
	if (clean.startsWith("/app/performance/reviews")) {
		return "reviews";
	}
	if (clean.startsWith("/app/performance/goals")) {
		return "goals";
	}
	return "overview";
}

export function PerformanceTabs() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/performance";

	// Staff tabs (Overview/Goals/Reviews) for viewers; self tabs for anyone who
	// owns a goal or has review tasks. A pure employee sees only the self tabs.
	const tabs: Tab[] = [
		...(canViewPerformance(role) ? [OVERVIEW_TAB, GOALS_TAB] : []),
		...(canViewReviews(role) ? [REVIEWS_TAB] : []),
		...(canViewOneOnOnes(role) ? [ONE_ON_ONES_TAB] : []),
		...(canViewRecognition(role) ? [RECOGNITION_TAB] : []),
		...(canCreateObjective(role) ? [MY_GOALS_TAB] : []),
		...(canSubmitReview(role) ? [MY_REVIEWS_TAB] : []),
	];
	if (tabs.length === 0) {
		return null;
	}
	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="pf-tabs">
			{tabs.map((tab) => (
				<Link
					className={`pf-tab ${activeKey === tab.key ? "active" : ""}`}
					key={tab.key}
					to={tab.href}
				>
					{tab.label}
				</Link>
			))}
		</div>
	);
}
