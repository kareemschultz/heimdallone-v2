import { Link, useMatches } from "@tanstack/react-router";
import { useContext } from "react";

import { OrgCtx } from "@/routes/app/route";

const PAYROLL_ROLES = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"payroll_admin",
];
const READONLY_ROLES = [...PAYROLL_ROLES, "auditor"];

interface Tab {
	adminOnly?: boolean;
	group: "work" | "setup" | "payments";
	href: string;
	key: string;
	label: string;
}

const TABS: Tab[] = [
	{
		key: "overview",
		label: "Overview",
		href: "/app/payroll",
		group: "work",
	},
	{
		key: "run",
		label: "Run Payroll",
		href: "/app/payroll/run",
		group: "work",
		adminOnly: true,
	},
	{
		key: "payslips",
		label: "Payslips",
		href: "/app/payroll/payslips",
		group: "work",
	},
	{
		key: "reports",
		label: "Reports",
		href: "/app/payroll/reports",
		group: "work",
		adminOnly: true,
	},
	{
		key: "settings",
		label: "Settings",
		href: "/app/payroll/settings",
		group: "setup",
		adminOnly: true,
	},
	{
		key: "pay-items",
		label: "Pay Items",
		href: "/app/payroll/pay-items",
		group: "setup",
		adminOnly: true,
	},
	{
		key: "loans",
		label: "Loans",
		href: "/app/payroll/loans",
		group: "setup",
		adminOnly: true,
	},
	{
		key: "reimbursements",
		label: "Reimbursements",
		href: "/app/payroll/reimbursements",
		group: "setup",
		adminOnly: true,
	},
	{
		key: "payments",
		label: "Payments",
		href: "/app/payroll/payments",
		group: "payments",
		adminOnly: true,
	},
];

export function PayrollTabs() {
	const org = useContext(OrgCtx);
	const matches = useMatches();
	const currentPath = matches.at(-1)?.pathname ?? "/app/payroll";

	const canAdmin = PAYROLL_ROLES.includes(org.memberRole);
	const canRead = READONLY_ROLES.includes(org.memberRole);
	const isEmployee = org.memberRole === "employee";

	const visibleTabs = TABS.filter((tab) => {
		if (tab.adminOnly && !canAdmin && !canRead) {
			return false;
		}
		if (isEmployee && tab.key !== "overview" && tab.key !== "payslips") {
			return false;
		}
		return true;
	});

	const activeKey = resolveActiveTab(currentPath);

	return (
		<div className="payroll-tabs">
			{visibleTabs.map((tab) => (
				<Link
					className={`payroll-tab ${activeKey === tab.key ? "active" : ""}`}
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
	if (clean === "/app/payroll") {
		return "overview";
	}
	if (clean.startsWith("/app/payroll/payslips")) {
		return "payslips";
	}
	if (clean.startsWith("/app/payroll/run")) {
		return "run";
	}
	if (clean.startsWith("/app/payroll/reports")) {
		return "reports";
	}
	if (clean.startsWith("/app/payroll/settings")) {
		return "settings";
	}
	if (clean.startsWith("/app/payroll/pay-items")) {
		return "pay-items";
	}
	if (clean.startsWith("/app/payroll/loans")) {
		return "loans";
	}
	if (clean.startsWith("/app/payroll/reimbursements")) {
		return "reimbursements";
	}
	if (clean.startsWith("/app/payroll/payments")) {
		return "payments";
	}
	return "overview";
}
