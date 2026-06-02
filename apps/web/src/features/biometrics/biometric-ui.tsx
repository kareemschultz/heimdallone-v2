import { CircleCheck, Clock3, Cpu } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { deviceAdapterStatus } from "./labels";

/** Supported / Planned badge — prevents customers thinking live sync works. */
export function AdapterStatusBadge({
	vendor,
	mode,
}: {
	mode: string;
	vendor: string;
}) {
	const status = deviceAdapterStatus(vendor, mode);
	if (status === "supported") {
		return (
			<span className="bio-badge bio-badge-supported">
				<CircleCheck size={12} /> Supported now
			</span>
		);
	}
	return (
		<span className="bio-badge bio-badge-planned">
			<Clock3 size={12} /> Planned
		</span>
	);
}

/** Renders a string[] of capability/method/network codes as friendly tags. */
export function TagList({
	items,
	map,
	empty = "—",
}: {
	empty?: string;
	items: string[] | null | undefined;
	map: Record<string, string>;
}) {
	if (!items || items.length === 0) {
		return (
			<span style={{ color: "var(--fg-3)", fontSize: 12.5 }}>{empty}</span>
		);
	}
	return (
		<div className="bio-tags">
			{items.map((code) => (
				<span className="bio-tag" key={code}>
					{map[code] ?? code}
				</span>
			))}
		</div>
	);
}

/** Shared no-access page for device-management surfaces. */
export function BiometricNoAccess({
	section,
	description,
}: {
	description: string;
	section: string;
}) {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Biometrics</span>
						<span className="sep">/</span>
						<span>{section}</span>
					</div>
					<h1 className="page-title">{section}</h1>
					<p className="page-sub">Attendance devices and synced punches.</p>
				</div>
			</div>
			<div className="card card-pad">
				<EmptyState
					description={description}
					icon={<Cpu size={20} />}
					title="You don't have access to device management"
				/>
			</div>
		</div>
	);
}
