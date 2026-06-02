import { useQuery } from "@tanstack/react-query";
import {
	CheckCircle2,
	LogIn,
	LogOut,
	MapPin,
	TriangleAlert,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { GEOFENCE_STATUS_LABEL } from "@/features/biometrics/labels";
import { client, orpc, queryClient } from "@/utils/orpc";

const PRIVACY_NOTE =
	"Your location is used only to confirm this check-in. Heimdallone does not track you in the background and does not store fingerprints or face data.";
const PAYROLL_NOTE =
	"Mobile check-ins may need a quick review before they count toward pay.";

type GeoErrorKind = "denied" | "unavailable" | "timeout" | null;

interface Coords {
	accuracy: number;
	lat: number;
	lon: number;
}

interface Preview {
	accuracyThresholdMeters: number | null;
	allowOutsideWithReason: boolean;
	distanceMeters: number | null;
	radiusMeters: number | null;
	siteName: string | null;
	status: string;
}

const GEO_OPTS: PositionOptions = {
	enableHighAccuracy: true,
	timeout: 15_000,
	maximumAge: 0,
};

function getPosition(): Promise<GeolocationPosition> {
	return new Promise((resolve, reject) => {
		if (!("geolocation" in navigator)) {
			reject(new Error("unavailable"));
			return;
		}
		navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTS);
	});
}

function classifyGeoError(err: unknown): GeoErrorKind {
	const code = (err as GeolocationPositionError)?.code;
	if (code === 1) {
		return "denied";
	}
	if (code === 3) {
		return "timeout";
	}
	return "unavailable";
}

export function MobileCheckIn() {
	const [coords, setCoords] = useState<Coords | null>(null);
	const [preview, setPreview] = useState<Preview | null>(null);
	const [geoError, setGeoError] = useState<GeoErrorKind>(null);
	const [locating, setLocating] = useState(false);
	const [reason, setReason] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const reasonId = useId();

	const history = useQuery(
		orpc.biometric.checkIns.listSelf.queryOptions({ input: { limit: 5 } })
	);

	const locate = async () => {
		setLocating(true);
		setGeoError(null);
		setPreview(null);
		try {
			const pos = await getPosition();
			const c: Coords = {
				lat: pos.coords.latitude,
				lon: pos.coords.longitude,
				accuracy: Math.round(pos.coords.accuracy),
			};
			setCoords(c);
			const verdict = (await client.biometric.checkIns.previewSelf({
				latitude: c.lat,
				longitude: c.lon,
				accuracyMeters: c.accuracy,
			})) as Preview;
			setPreview(verdict);
		} catch (err) {
			setCoords(null);
			setGeoError(classifyGeoError(err));
		} finally {
			setLocating(false);
		}
	};

	const outside = preview?.status === "outside";
	const reasonRequired = outside && (preview?.allowOutsideWithReason ?? true);
	const reasonMissing = reasonRequired && reason.trim() === "";

	const submit = async (direction: "in" | "out") => {
		if (!coords) {
			return;
		}
		setSubmitting(true);
		try {
			const res = (await client.biometric.checkIns.createSelf({
				latitude: coords.lat,
				longitude: coords.lon,
				accuracyMeters: coords.accuracy,
				direction,
				outsideReason: reason.trim() === "" ? undefined : reason.trim(),
			})) as { status: string };
			if (res.status === "inside") {
				toast.success("Check-in submitted.");
			} else {
				toast.success("Check-in submitted for review.");
			}
			queryClient.invalidateQueries({
				predicate: (q) =>
					Array.isArray(q.queryKey) &&
					Array.isArray(q.queryKey[0]) &&
					q.queryKey[0][0] === "biometric",
			});
			setPreview(null);
			setCoords(null);
			setReason("");
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div
			style={{
				maxWidth: 460,
				margin: "0 auto",
				display: "flex",
				flexDirection: "column",
				gap: 16,
			}}
		>
			<div className="card card-pad" style={{ textAlign: "center" }}>
				<MapPin
					size={28}
					style={{ margin: "0 auto 8px", color: "var(--fg-3)" }}
				/>
				<h2 style={{ fontSize: 16, fontWeight: 600 }}>Check in for work</h2>
				<p style={{ fontSize: 13, color: "var(--fg-3)", margin: "6px 0 16px" }}>
					Tap the button to check using your current location.
				</p>
				<button
					className="btn btn-primary"
					disabled={locating}
					onClick={locate}
					style={{ width: "100%", justifyContent: "center" }}
					type="button"
				>
					<MapPin size={16} />{" "}
					{locating ? "Getting your location…" : "Get my location"}
				</button>
			</div>

			{geoError && <GeoErrorCard kind={geoError} onRetry={locate} />}

			{preview && coords && (
				<VerdictCard
					accuracy={coords.accuracy}
					onSubmit={submit}
					preview={preview}
					reason={reason}
					reasonId={reasonId}
					reasonMissing={reasonMissing}
					reasonRequired={reasonRequired}
					setReason={setReason}
					submitting={submitting}
				/>
			)}

			<div className="card card-pad">
				<div className="eyebrow" style={{ marginBottom: 8 }}>
					Recent check-ins
				</div>
				{history.isLoading && (
					<div style={{ fontSize: 12.5, color: "var(--fg-3)" }}>Loading…</div>
				)}
				{!history.isLoading && (history.data ?? []).length === 0 && (
					<div style={{ fontSize: 12.5, color: "var(--fg-3)" }}>
						No check-ins yet.
					</div>
				)}
				{!history.isLoading && (history.data ?? []).length > 0 && (
					<ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
						{(history.data as RecentRow[]).map((c) => (
							<li
								key={c.id}
								style={{
									display: "flex",
									justifyContent: "space-between",
									gap: 12,
									padding: "8px 0",
									borderBottom: "1px solid var(--line)",
									fontSize: 12.5,
								}}
							>
								<span>{fmtWhen(c.capturedAt)}</span>
								<span style={{ color: "var(--fg-3)" }}>
									{GEOFENCE_STATUS_LABEL[c.status] ?? c.status}
								</span>
							</li>
						))}
					</ul>
				)}
			</div>

			<p style={{ fontSize: 11.5, color: "var(--fg-3)", lineHeight: 1.5 }}>
				{PRIVACY_NOTE}
			</p>
			<p style={{ fontSize: 11.5, color: "var(--fg-3)", lineHeight: 1.5 }}>
				{PAYROLL_NOTE}
			</p>
		</div>
	);
}

interface RecentRow {
	capturedAt: string | Date;
	id: string;
	status: string;
}

function fmtWhen(value: string | Date): string {
	const d = value instanceof Date ? value : new Date(value);
	return Number.isNaN(d.getTime())
		? "—"
		: d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const STATUS_TONE: Record<string, string> = {
	inside: "#1a7f4b",
	outside: "#9a6a14",
	low_accuracy: "#9a6a14",
	unverified: "#9a6a14",
};

function VerdictCard({
	preview,
	accuracy,
	reason,
	setReason,
	reasonRequired,
	reasonMissing,
	reasonId,
	submitting,
	onSubmit,
}: {
	accuracy: number;
	onSubmit: (direction: "in" | "out") => void;
	preview: Preview;
	reason: string;
	reasonId: string;
	reasonMissing: boolean;
	reasonRequired: boolean;
	setReason: (v: string) => void;
	submitting: boolean;
}) {
	const tone = STATUS_TONE[preview.status] ?? "var(--fg-2)";
	const ok = preview.status === "inside";
	return (
		<div className="card card-pad">
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					marginBottom: 6,
				}}
			>
				{ok ? (
					<CheckCircle2 color={tone} size={20} />
				) : (
					<TriangleAlert color={tone} size={20} />
				)}
				<span style={{ fontSize: 15, fontWeight: 600, color: tone }}>
					{GEOFENCE_STATUS_LABEL[preview.status] ?? preview.status}
				</span>
			</div>
			<div style={{ fontSize: 12.5, color: "var(--fg-3)", marginBottom: 12 }}>
				{preview.siteName ? `Work location: ${preview.siteName}. ` : ""}
				{preview.radiusMeters
					? `Allowed radius: ${preview.radiusMeters} m. `
					: ""}
				Location signal: about {accuracy} m.
			</div>

			{reasonRequired && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 4,
						marginBottom: 12,
					}}
				>
					<label
						htmlFor={reasonId}
						style={{ fontSize: 12, color: "var(--fg-3)" }}
					>
						You're away from your work location — add a reason *
					</label>
					<textarea
						className="input"
						id={reasonId}
						onChange={(e) => setReason(e.target.value)}
						placeholder="e.g. visiting a client site before coming in"
						rows={2}
						style={{ width: "100%", resize: "vertical" }}
						value={reason}
					/>
				</div>
			)}

			<div style={{ display: "flex", gap: 8 }}>
				<button
					className="btn btn-primary"
					disabled={submitting || reasonMissing}
					onClick={() => onSubmit("in")}
					style={{ flex: 1, justifyContent: "center" }}
					type="button"
				>
					<LogIn size={16} /> Clock in
				</button>
				<button
					className="btn"
					disabled={submitting || reasonMissing}
					onClick={() => onSubmit("out")}
					style={{ flex: 1, justifyContent: "center" }}
					type="button"
				>
					<LogOut size={16} /> Clock out
				</button>
			</div>
		</div>
	);
}

const GEO_ERROR_COPY: Record<
	NonNullable<GeoErrorKind>,
	{ detail: string; title: string }
> = {
	denied: {
		title: "Location permission is off",
		detail:
			"Allow location for this site in your browser settings, then try again. Contact HR if you can't share your location.",
	},
	unavailable: {
		title: "Couldn't get your location",
		detail:
			"Your device couldn't provide a location right now. Move to an open area and try again, or contact HR.",
	},
	timeout: {
		title: "Location took too long",
		detail: "We couldn't get a fix in time. Please try again.",
	},
};

function GeoErrorCard({
	kind,
	onRetry,
}: {
	kind: NonNullable<GeoErrorKind>;
	onRetry: () => void;
}) {
	const copy = GEO_ERROR_COPY[kind];
	return (
		<div className="card card-pad">
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					marginBottom: 6,
				}}
			>
				<TriangleAlert color="#9a6a14" size={20} />
				<span style={{ fontSize: 14, fontWeight: 600 }}>{copy.title}</span>
			</div>
			<p style={{ fontSize: 12.5, color: "var(--fg-3)", margin: "0 0 12px" }}>
				Location is required for mobile check-in. {copy.detail}
			</p>
			<button className="btn btn-sm" onClick={onRetry} type="button">
				Try again
			</button>
		</div>
	);
}
