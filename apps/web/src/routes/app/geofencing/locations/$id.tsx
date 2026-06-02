import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import {
	type GeofenceFormValues,
	GeofenceLocationFormDialog,
} from "@/features/biometrics/geofence-location-form-dialog";
import { canManageGeofencing, canViewGeofencing } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/app/geofencing/locations/$id")({
	component: LocationDetailPage,
});

interface SiteRow {
	accuracyThresholdMeters: number;
	address: string | null;
	allowOutsideWithReason: boolean;
	id: string;
	isActive: boolean;
	latitude: string;
	longitude: string;
	name: string;
	notes: string | null;
	radiusMeters: number;
}
interface AssignmentRow {
	departmentId: string | null;
	employeeId: string | null;
	id: string;
	isDefault: boolean;
	scope: string;
}

const SCOPE_LABEL: Record<string, string> = {
	organization: "Whole organization",
	department: "Department",
	employee: "Employee",
};

function invalidate() {
	queryClient.invalidateQueries({
		predicate: (q) =>
			Array.isArray(q.queryKey) &&
			Array.isArray(q.queryKey[0]) &&
			q.queryKey[0][0] === "biometric",
	});
}

function LocationDetailPage() {
	const org = useContext(OrgCtx);
	if (!canViewGeofencing(org.memberRole)) {
		return (
			<div className="page">
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
	return <LocationDetail canManage={canManageGeofencing(org.memberRole)} />;
}

function LocationDetail({ canManage }: { canManage: boolean }) {
	const { id } = useParams({ from: "/app/geofencing/locations/$id" });
	const [showEdit, setShowEdit] = useState(false);
	const [archiving, setArchiving] = useState(false);

	const site = useQuery(
		orpc.biometric.geofences.getById.queryOptions({
			input: { id },
			retry: false,
		})
	);
	const assignments = useQuery(
		orpc.biometric.assignments.list.queryOptions({
			input: { workSiteId: id },
			enabled: Boolean(site.data),
		})
	);

	if (site.isLoading) {
		return (
			<div className="page">
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading…
				</div>
			</div>
		);
	}
	if (!site.data) {
		return (
			<div className="page">
				<div className="card card-pad">
					<EmptyState
						description="This location may have been removed, or you don't have access to it."
						icon={<MapPin size={20} />}
						title="Location not available"
					/>
					<div style={{ textAlign: "center", marginTop: 8 }}>
						<Link to="/app/geofencing/locations">← Back to locations</Link>
					</div>
				</div>
			</div>
		);
	}

	const s = site.data as SiteRow;
	const assignmentRows = (assignments.data ?? []) as AssignmentRow[];

	const archive = async () => {
		setArchiving(true);
		try {
			await client.biometric.geofences.archive({ id: s.id });
			toast.success("Location archived.");
			invalidate();
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setArchiving(false);
		}
	};

	const initial: GeofenceFormValues = {
		id: s.id,
		name: s.name,
		address: s.address ?? "",
		latitude: String(s.latitude),
		longitude: String(s.longitude),
		radiusMeters: s.radiusMeters,
		accuracyThresholdMeters: s.accuracyThresholdMeters,
		allowOutsideWithReason: s.allowOutsideWithReason,
		isActive: s.isActive,
		notes: s.notes ?? "",
	};

	return (
		<div className="page">
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
				}}
			>
				<div className="page-header">
					<div>
						<div className="crumbs">
							<span>Heimdallone</span>
							<span className="sep">/</span>
							<Link to="/app/geofencing/locations">Locations</Link>
							<span className="sep">/</span>
							<span>{s.name}</span>
						</div>
						<h1 className="page-title">{s.name}</h1>
						<p className="page-sub">
							{s.address ?? "Work location"} —{" "}
							{s.isActive ? "Active" : "Inactive"}
						</p>
					</div>
				</div>
				{canManage && (
					<div style={{ display: "flex", gap: 8 }}>
						<button
							className="btn btn-sm"
							onClick={() => setShowEdit(true)}
							type="button"
						>
							Edit
						</button>
						{s.isActive && (
							<button
								className="btn btn-sm"
								disabled={archiving}
								onClick={archive}
								type="button"
							>
								{archiving ? "Archiving…" : "Archive"}
							</button>
						)}
					</div>
				)}
			</div>

			<div className="bio-section">
				<div className="eyebrow" style={{ marginBottom: 12 }}>
					Rules
				</div>
				<dl className="bio-kv">
					<dt>Allowed radius</dt>
					<dd>{s.radiusMeters} m</dd>
					<dt>GPS accuracy required</dt>
					<dd>{s.accuracyThresholdMeters} m or better</dd>
					<dt>Outside check-in</dt>
					<dd>
						{s.allowOutsideWithReason
							? "Allowed with a reason (flagged for review)"
							: "Not allowed"}
					</dd>
				</dl>
			</div>

			<div className="bio-section">
				<div className="eyebrow" style={{ marginBottom: 12 }}>
					Assignments
				</div>
				{assignments.isLoading && (
					<div style={{ fontSize: 13, color: "var(--fg-3)" }}>Loading…</div>
				)}
				{!assignments.isLoading && assignmentRows.length === 0 && (
					<div style={{ fontSize: 13, color: "var(--fg-3)" }}>
						No assignments. Check-ins resolve here only via the org-wide
						default.
					</div>
				)}
				{!assignments.isLoading && assignmentRows.length > 0 && (
					<ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
						{assignmentRows.map((a) => (
							<li key={a.id}>
								{SCOPE_LABEL[a.scope] ?? a.scope}
								{a.isDefault ? " · default" : ""}
							</li>
						))}
					</ul>
				)}
			</div>

			{canManage && (
				<div className="bio-section">
					<div className="eyebrow" style={{ marginBottom: 12 }}>
						Technical details (admin)
					</div>
					<dl className="bio-kv">
						<dt>Coordinates</dt>
						<dd
							style={{
								fontFamily: "var(--font-mono, monospace)",
								fontSize: 12,
							}}
						>
							{s.latitude}, {s.longitude}
						</dd>
					</dl>
				</div>
			)}

			{showEdit && (
				<GeofenceLocationFormDialog
					initial={initial}
					onClose={() => setShowEdit(false)}
					onSaved={() => {
						setShowEdit(false);
						invalidate();
					}}
				/>
			)}
		</div>
	);
}
