import { createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useContext } from "react";

import "@/styles/biometrics.css";
import { EmptyState } from "@/components/empty-state";
import { GeofencingTabs } from "@/features/biometrics/geofencing-tabs";
import { MobileCheckIn } from "@/features/biometrics/mobile-check-in";
import { canUseGeofenceCheckIn, canViewGeofencing } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

export const Route = createFileRoute("/app/geofencing/check-in")({
	component: CheckInPage,
});

function Header() {
	return (
		<div className="page-header">
			<div>
				<div className="crumbs">
					<span>Heimdallone</span>
					<span className="sep">/</span>
					<span>Geofencing</span>
					<span className="sep">/</span>
					<span>Mobile check-in</span>
				</div>
				<h1 className="page-title">Mobile check-in</h1>
				<p className="page-sub">Clock in or out using your current location.</p>
			</div>
		</div>
	);
}

function CheckInPage() {
	const org = useContext(OrgCtx);
	const canCheckIn = canUseGeofenceCheckIn(org.memberRole);
	const canView = canViewGeofencing(org.memberRole);

	if (!(canCheckIn || canView)) {
		return (
			<div className="page">
				<Header />
				<div className="card card-pad">
					<EmptyState
						description="Mobile check-in is available to staff who clock in for attendance."
						icon={<MapPin size={20} />}
						title="Mobile check-in isn't available for your role"
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="page">
			<Header />
			<GeofencingTabs />
			{canCheckIn ? (
				<MobileCheckIn />
			) : (
				<div className="card card-pad">
					<EmptyState
						description="Mobile check-in is used by staff who clock in. You have read-only access to geofencing."
						icon={<MapPin size={20} />}
						title="View-only access"
					/>
				</div>
			)}
		</div>
	);
}
