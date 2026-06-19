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

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const LIVE_WINDOW_MS = 6 * HOUR_MS;
const IDLE_WINDOW_MS = 2 * DAY_MS;

/** Human "synced 3 min ago" style relative time from a timestamp. */
export function relativeTime(value: string | Date | null): string {
	if (!value) {
		return "never";
	}
	const d = value instanceof Date ? value : new Date(value);
	const ms = Date.now() - d.getTime();
	if (Number.isNaN(ms)) {
		return "—";
	}
	if (ms < MINUTE_MS) {
		return "just now";
	}
	if (ms < HOUR_MS) {
		return `${Math.floor(ms / MINUTE_MS)} min ago`;
	}
	if (ms < DAY_MS) {
		return `${Math.floor(ms / HOUR_MS)} hr ago`;
	}
	const days = Math.floor(ms / DAY_MS);
	return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Live connection indicator for a device, DERIVED from its admin status, sync
 * mode and last successful sync. For push/API-ingest devices "Connected" means
 * a recent successful ingest (the on-site poller is posting); import devices are
 * manual, so they read "Manual import" rather than a liveness state.
 */
export function DeviceConnectionBadge({
	mode,
	status,
	lastSyncCursor,
	lastSyncStatus,
}: {
	lastSyncCursor: string | Date | null;
	lastSyncStatus: string | null;
	mode: string;
	status: string;
}) {
	const badge = (cls: string, label: string) => (
		<span className={`bio-conn ${cls}`}>
			<span className="bio-conn-dot" />
			{label}
		</span>
	);

	if (status === "error") {
		return badge("bio-conn-error", "Needs attention");
	}
	if (status !== "active") {
		return badge("bio-conn-muted", "Inactive");
	}
	if (mode !== "api_ingest") {
		return badge("bio-conn-muted", "Manual import");
	}
	if (lastSyncStatus === "failed") {
		return badge("bio-conn-error", "Sync error");
	}
	if (!lastSyncCursor) {
		return badge("bio-conn-muted", "Awaiting first sync");
	}
	const d =
		lastSyncCursor instanceof Date ? lastSyncCursor : new Date(lastSyncCursor);
	const age = Date.now() - d.getTime();
	const rel = relativeTime(lastSyncCursor);
	if (age < LIVE_WINDOW_MS) {
		return badge("bio-conn-live", `Connected · synced ${rel}`);
	}
	if (age < IDLE_WINDOW_MS) {
		return badge("bio-conn-idle", `Idle · last sync ${rel}`);
	}
	return badge("bio-conn-error", `Offline · last sync ${rel}`);
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
