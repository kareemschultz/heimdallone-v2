import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import { GeofenceLocationFormDialog } from "@/features/biometrics/geofence-location-form-dialog";
import { GeofencingTabs } from "@/features/biometrics/geofencing-tabs";
import { canManageGeofencing, canViewGeofencing } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/app/geofencing/locations/")({
	component: LocationsPage,
});

interface SiteRow {
	accuracyThresholdMeters: number;
	address: string | null;
	id: string;
	isActive: boolean;
	name: string;
	radiusMeters: number;
}
interface AssignmentRow {
	workSiteId: string;
}

function LocationsPage() {
	const org = useContext(OrgCtx);
	if (!canViewGeofencing(org.memberRole)) {
		return (
			<div className="page">
				<Header />
				<div className="card card-pad">
					<EmptyState
						description="Work-location management is available to HR and administrators."
						icon={<MapPin size={20} />}
						title="You don't have access to work locations"
					/>
				</div>
			</div>
		);
	}
	return <LocationsList canManage={canManageGeofencing(org.memberRole)} />;
}

function Header() {
	return (
		<div className="page-header">
			<div>
				<div className="crumbs">
					<span>Heimdallone</span>
					<span className="sep">/</span>
					<span>Geofencing</span>
					<span className="sep">/</span>
					<span>Locations</span>
				</div>
				<h1 className="page-title">Work locations</h1>
				<p className="page-sub">
					Define where mobile check-ins are allowed and how close staff must be.
				</p>
			</div>
		</div>
	);
}

function invalidate() {
	queryClient.invalidateQueries({
		predicate: (q) =>
			Array.isArray(q.queryKey) &&
			Array.isArray(q.queryKey[0]) &&
			q.queryKey[0][0] === "biometric",
	});
}

function LocationsList({ canManage }: { canManage: boolean }) {
	const [showCreate, setShowCreate] = useState(false);
	const sites = useQuery(
		orpc.biometric.geofences.list.queryOptions({
			input: { includeInactive: true },
		})
	);
	const assignments = useQuery(
		orpc.biometric.assignments.list.queryOptions({ input: {} })
	);
	const rows = (sites.data ?? []) as SiteRow[];
	const countBySite = new Map<string, number>();
	for (const a of (assignments.data ?? []) as AssignmentRow[]) {
		countBySite.set(a.workSiteId, (countBySite.get(a.workSiteId) ?? 0) + 1);
	}

	return (
		<div className="page">
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
				}}
			>
				<Header />
				{canManage && (
					<button
						className="btn btn-primary btn-sm"
						onClick={() => setShowCreate(true)}
						type="button"
					>
						New location
					</button>
				)}
			</div>

			<GeofencingTabs />

			{sites.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading locations…
				</div>
			)}
			{!sites.isLoading && rows.length === 0 && (
				<div className="card card-pad">
					<EmptyState
						action={
							canManage
								? { label: "New location", onClick: () => setShowCreate(true) }
								: undefined
						}
						description="Add a work location so staff can check in by GPS from their phone."
						icon={<MapPin size={20} />}
						title="No work locations yet"
					/>
				</div>
			)}
			{!sites.isLoading && rows.length > 0 && (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
						gap: 14,
					}}
				>
					{rows.map((s) => (
						<Link
							className="card card-pad"
							key={s.id}
							params={{ id: s.id }}
							style={{
								textDecoration: "none",
								color: "var(--fg)",
								display: "block",
							}}
							to="/app/geofencing/locations/$id"
						>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "flex-start",
									gap: 10,
									marginBottom: 8,
								}}
							>
								<div>
									<div style={{ fontSize: 14.5, fontWeight: 600 }}>
										{s.name}
									</div>
									{s.address && (
										<div
											style={{
												fontSize: 12.5,
												color: "var(--fg-3)",
												marginTop: 2,
											}}
										>
											{s.address}
										</div>
									)}
								</div>
								<span style={{ fontSize: 12, color: "var(--fg-3)" }}>
									{s.isActive ? "Active" : "Inactive"}
								</span>
							</div>
							<dl className="bio-kv" style={{ gridTemplateColumns: "1fr" }}>
								<dd style={{ fontSize: 12.5 }}>
									Allowed radius: {s.radiusMeters} m
								</dd>
								<dd style={{ fontSize: 12.5 }}>
									GPS accuracy required: {s.accuracyThresholdMeters} m or better
								</dd>
								<dd style={{ fontSize: 12.5, color: "var(--fg-3)" }}>
									{countBySite.get(s.id) ?? 0} assignment
									{(countBySite.get(s.id) ?? 0) === 1 ? "" : "s"}
								</dd>
							</dl>
							<div
								style={{
									marginTop: 10,
									fontSize: 12.5,
									fontWeight: 500,
									color: "var(--accent, var(--fg-2))",
								}}
							>
								View details →
							</div>
						</Link>
					))}
				</div>
			)}

			{showCreate && (
				<GeofenceLocationFormDialog
					onClose={() => setShowCreate(false)}
					onSaved={() => {
						setShowCreate(false);
						invalidate();
					}}
				/>
			)}
		</div>
	);
}
