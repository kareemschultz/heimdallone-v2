import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPin, MapPinOff, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useContext } from "react";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import { GeofencingTabs } from "@/features/biometrics/geofencing-tabs";
import { MobileCheckIn } from "@/features/biometrics/mobile-check-in";
import { canUseGeofenceCheckIn, canViewGeofencing } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/geofencing/")({
	component: GeofencingOverview,
});

function GeofencingOverview() {
	const org = useContext(OrgCtx);
	if (canViewGeofencing(org.memberRole)) {
		return <GeofencingDashboard />;
	}
	if (canUseGeofenceCheckIn(org.memberRole)) {
		return <CheckInOnly />;
	}
	return <NoAccess />;
}

function PageHeader() {
	return (
		<div className="page-header">
			<div>
				<div className="crumbs">
					<span>Heimdallone</span>
					<span className="sep">/</span>
					<span>Geofencing</span>
				</div>
				<h1 className="page-title">Geofencing</h1>
				<p className="page-sub">
					Manage work locations and mobile attendance check-ins.
				</p>
			</div>
		</div>
	);
}

function CheckInOnly() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Mobile check-in</span>
					</div>
					<h1 className="page-title">Mobile check-in</h1>
					<p className="page-sub">
						Clock in or out using your current location.
					</p>
				</div>
			</div>
			<MobileCheckIn />
		</div>
	);
}

function NoAccess() {
	return (
		<div className="page">
			<PageHeader />
			<div className="card card-pad">
				<EmptyState
					description="Geofencing is available to HR and administrators. If your role uses mobile check-in, open it from your attendance tools."
					icon={<MapPin size={20} />}
					title="You don't have access to geofencing"
				/>
			</div>
		</div>
	);
}

interface ExceptionRow {
	status: string;
	type: string;
}
interface SiteRow {
	id: string;
	isActive: boolean;
}
interface AssignmentRow {
	workSiteId: string;
}

function GeofencingDashboard() {
	const sites = useQuery(
		orpc.biometric.geofences.list.queryOptions({
			input: { includeInactive: true },
		})
	);
	const assignments = useQuery(
		orpc.biometric.assignments.list.queryOptions({ input: {} })
	);
	const openExceptions = useQuery(
		orpc.biometric.exceptions.list.queryOptions({
			input: { status: "open", limit: 500 },
		})
	);

	const siteRows = (sites.data ?? []) as SiteRow[];
	const assignmentRows = (assignments.data ?? []) as AssignmentRow[];
	const exRows = (openExceptions.data ?? []) as ExceptionRow[];

	const activeSites = siteRows.filter((s) => s.isActive).length;
	const outsideOpen = exRows.filter(
		(e) => e.type === "outside_geofence"
	).length;
	const lowAccOpen = exRows.filter((e) => e.type === "low_gps_accuracy").length;
	const geofenceExceptions = exRows.filter((e) =>
		["outside_geofence", "low_gps_accuracy", "spoofing_suspected"].includes(
			e.type
		)
	).length;

	const assignedSiteIds = new Set(assignmentRows.map((a) => a.workSiteId));
	const unassignedSites = siteRows.filter(
		(s) => s.isActive && !assignedSiteIds.has(s.id)
	).length;

	const attention = buildAttention({
		outside: outsideOpen,
		lowAcc: lowAccOpen,
		unassigned: unassignedSites,
	});

	return (
		<div className="page">
			<PageHeader />
			<GeofencingTabs />

			<div className="sum-row" style={{ marginBottom: 18 }}>
				<StatTile
					delta="Work areas in service"
					label="Active locations"
					loading={sites.isLoading}
					value={activeSites}
				/>
				<StatTile
					delta="Employee / department / org rules"
					label="Assignments"
					loading={assignments.isLoading}
					value={assignmentRows.length}
				/>
				<StatTile
					delta="Open, away from work area"
					label="Outside check-ins"
					loading={openExceptions.isLoading}
					value={outsideOpen}
				/>
				<StatTile
					delta="Open, weak GPS signal"
					label="Low-accuracy check-ins"
					loading={openExceptions.isLoading}
					value={lowAccOpen}
				/>
				<StatTile
					delta="Geofence issues to review"
					label="Open exceptions"
					loading={openExceptions.isLoading}
					value={geofenceExceptions}
				/>
			</div>

			<div className="card card-pad" style={{ marginBottom: 18 }}>
				<div className="eyebrow" style={{ marginBottom: 12 }}>
					What needs attention
				</div>
				{attention.length === 0 ? (
					<div style={{ fontSize: 13, color: "var(--fg-3)" }}>
						Nothing needs attention right now.
					</div>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						{attention.map((item) => (
							<Link
								key={item.key}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									gap: 16,
									padding: "12px 14px",
									textDecoration: "none",
									color: "var(--fg)",
									background: "var(--bg-2)",
									border: "1px solid var(--line)",
									borderRadius: 12,
								}}
								to={item.href}
							>
								<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											width: 32,
											height: 32,
											color: "var(--fg-2)",
											background: "var(--bg-3)",
											borderRadius: 10,
										}}
									>
										{item.icon}
									</div>
									<div>
										<div style={{ fontSize: 13.5, fontWeight: 600 }}>
											{item.title}
										</div>
										<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
											{item.description}
										</div>
									</div>
								</div>
								<ArrowRight color="var(--fg-3)" size={16} />
							</Link>
						))}
					</div>
				)}
			</div>

			<div className="card card-pad">
				<div className="eyebrow" style={{ marginBottom: 12 }}>
					Quick links
				</div>
				<div className="quick-links">
					<Link className="quick-link" to="/app/geofencing/locations">
						<span className="quick-link-icon">
							<MapPin size={16} />
						</span>
						<span>Work locations</span>
						<ArrowRight color="var(--fg-3)" size={14} />
					</Link>
					<Link className="quick-link" to="/app/geofencing/check-in">
						<span className="quick-link-icon">
							<MapPin size={16} />
						</span>
						<span>Mobile check-in</span>
						<ArrowRight color="var(--fg-3)" size={14} />
					</Link>
				</div>
			</div>
		</div>
	);
}

function StatTile({
	delta,
	label,
	loading,
	value,
}: {
	delta: string;
	label: string;
	loading: boolean;
	value: number;
}) {
	return (
		<div className="sum-card">
			<span className="lbl">{label}</span>
			<span className="val">{loading ? "…" : value}</span>
			<span className="delta">{delta}</span>
		</div>
	);
}

type GeoHref = "/app/geofencing/locations" | "/app/biometrics/exceptions";

interface AttentionItem {
	description: string;
	href: GeoHref;
	icon: ReactNode;
	key: string;
	title: string;
}

function plural(n: number): string {
	return n === 1 ? "" : "s";
}

function buildAttention(i: {
	outside: number;
	lowAcc: number;
	unassigned: number;
}): AttentionItem[] {
	const items: AttentionItem[] = [];
	if (i.outside > 0) {
		items.push({
			key: "outside",
			title: `${i.outside} outside-geofence check-in${plural(i.outside)} to review`,
			description: "Review check-ins made away from the assigned work area.",
			href: "/app/biometrics/exceptions",
			icon: <TriangleAlert size={16} />,
		});
	}
	if (i.lowAcc > 0) {
		items.push({
			key: "low-acc",
			title: `${i.lowAcc} low-accuracy check-in${plural(i.lowAcc)}`,
			description: "GPS signal was too weak to confirm the location.",
			href: "/app/biometrics/exceptions",
			icon: <TriangleAlert size={16} />,
		});
	}
	if (i.unassigned > 0) {
		items.push({
			key: "unassigned",
			title: `${i.unassigned} active location${plural(i.unassigned)} with no assignments`,
			description: "Assign employees or departments so check-ins resolve here.",
			href: "/app/geofencing/locations",
			icon: <MapPinOff size={16} />,
		});
	}
	return items;
}
