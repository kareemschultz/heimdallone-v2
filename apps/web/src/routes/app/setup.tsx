import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Building2,
	Calendar,
	Cpu,
	DatabaseBackup,
	Globe,
	Landmark,
	MapPin,
	Settings as SettingsIcon,
	Wallet,
} from "lucide-react";
import { type ComponentType, useContext } from "react";
import {
	canManageHR,
	canViewBiometrics,
	canViewGeofencing,
	canViewPayroll,
} from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

export const Route = createFileRoute("/app/setup")({
	component: SetupCenter,
});

interface SetupItem {
	can: (role: string) => boolean;
	description: string;
	href: string;
	icon: ComponentType<{ size?: number }>;
	title: string;
}

interface SetupSection {
	group: string;
	items: SetupItem[];
}

const SECTIONS: SetupSection[] = [
	{
		group: "Organization",
		items: [
			{
				title: "Departments & positions",
				description:
					"Org structure used across employees, contracts and payroll.",
				href: "/app/settings",
				icon: Building2,
				can: canManageHR,
			},
			{
				title: "Work types, shifts & roles",
				description: "Employment types, shift patterns and role definitions.",
				href: "/app/settings",
				icon: SettingsIcon,
				can: canManageHR,
			},
		],
	},
	{
		group: "Payroll & Tax",
		items: [
			{
				title: "Payroll settings",
				description:
					"Currency, pay frequency, workweek and overtime multipliers.",
				href: "/app/payroll/settings",
				icon: Wallet,
				can: canViewPayroll,
			},
			{
				title: "Countries & Tax",
				description:
					"Statutory tax bands, NIS rates and allowances (GRA for Guyana).",
				href: "/app/countries",
				icon: Globe,
				can: canViewPayroll,
			},
			{
				title: "Pay items & recurring allowances",
				description: "Allowances and deductions applied to payroll runs.",
				href: "/app/payroll/pay-items",
				icon: Landmark,
				can: canViewPayroll,
			},
		],
	},
	{
		group: "Time & Attendance",
		items: [
			{
				title: "Time clocks & devices",
				description: "Register biometric/time-clock devices and ingest keys.",
				href: "/app/biometrics/devices",
				icon: Cpu,
				can: canViewBiometrics,
			},
			{
				title: "Geofencing locations",
				description: "Work sites for mobile attendance check-in.",
				href: "/app/geofencing/locations",
				icon: MapPin,
				can: canViewGeofencing,
			},
		],
	},
	{
		group: "Leave",
		items: [
			{
				title: "Leave policies",
				description: "Leave types, entitlements, carry-over and accrual.",
				href: "/app/leave/policies",
				icon: Calendar,
				can: canManageHR,
			},
		],
	},
	{
		group: "Administration",
		items: [
			{
				title: "Migration status",
				description: "v1→v2 migration progress and login preservation.",
				href: "/app/migration-status",
				icon: DatabaseBackup,
				can: canManageHR,
			},
		],
	},
];

function SetupCenter() {
	const org = useContext(OrgCtx);
	const role = org.memberRole;

	const sections = SECTIONS.map((s) => ({
		...s,
		items: s.items.filter((i) => i.can(role)),
	})).filter((s) => s.items.length > 0);

	if (sections.length === 0) {
		return (
			<div className="page">
				<div className="card card-pad">
					<h3>No setup access</h3>
					<p style={{ color: "var(--fg-3)", fontSize: 13.5 }}>
						Setup is available to administrators and payroll managers.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Setup</span>
					</div>
					<h1 className="page-title">Setup center</h1>
					<p className="page-sub">
						Everything you need to configure {org.orgName} — payroll, tax, time
						clocks, leave and org structure, in one place.
					</p>
				</div>
			</div>

			{sections.map((section) => (
				<section key={section.group} style={{ marginBottom: 22 }}>
					<div className="nav-group-label" style={{ marginBottom: 8 }}>
						{section.group}
					</div>
					<div className="dash-grid">
						{section.items.map((item) => (
							<Link className="dash-card card" key={item.title} to={item.href}>
								<span className="dash-card-icon">
									<item.icon size={18} />
								</span>
								<span className="dash-card-body">
									<span className="dash-card-title">{item.title}</span>
									<span className="dash-card-desc">{item.description}</span>
								</span>
							</Link>
						))}
					</div>
				</section>
			))}
		</div>
	);
}
