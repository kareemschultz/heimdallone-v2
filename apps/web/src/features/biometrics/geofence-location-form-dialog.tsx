import { MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { client } from "@/utils/orpc";

export interface GeofenceFormValues {
	accuracyThresholdMeters: number;
	address: string;
	allowOutsideWithReason: boolean;
	id?: string;
	isActive: boolean;
	latitude: string;
	longitude: string;
	name: string;
	notes: string;
	radiusMeters: number;
}

const LAT_MAX = 90;
const LON_MAX = 180;
const RADIUS_MIN = 10;
const RADIUS_MAX = 100_000;
const ACC_MIN = 5;

function validate(v: GeofenceFormValues): string | null {
	if (v.name.trim() === "") {
		return "Name is required.";
	}
	const lat = Number(v.latitude);
	const lon = Number(v.longitude);
	if (Number.isNaN(lat) || lat < -LAT_MAX || lat > LAT_MAX) {
		return "Latitude must be between -90 and 90.";
	}
	if (Number.isNaN(lon) || lon < -LON_MAX || lon > LON_MAX) {
		return "Longitude must be between -180 and 180.";
	}
	if (v.radiusMeters < RADIUS_MIN || v.radiusMeters > RADIUS_MAX) {
		return "Allowed radius must be between 10 and 100,000 metres.";
	}
	if (
		v.accuracyThresholdMeters < ACC_MIN ||
		v.accuracyThresholdMeters > RADIUS_MAX
	) {
		return "GPS accuracy threshold must be between 5 and 100,000 metres.";
	}
	return null;
}

interface Props {
	initial?: GeofenceFormValues;
	onClose: () => void;
	onSaved: () => void;
}

export function GeofenceLocationFormDialog({
	initial,
	onClose,
	onSaved,
}: Props) {
	const editing = Boolean(initial?.id);
	const [form, setForm] = useState<GeofenceFormValues>(
		initial ?? {
			name: "",
			address: "",
			latitude: "",
			longitude: "",
			radiusMeters: 150,
			accuracyThresholdMeters: 100,
			allowOutsideWithReason: true,
			isActive: true,
			notes: "",
		}
	);
	const [pending, setPending] = useState(false);
	const ids = {
		name: useId(),
		address: useId(),
		lat: useId(),
		lon: useId(),
		radius: useId(),
		accuracy: useId(),
		outside: useId(),
		active: useId(),
		notes: useId(),
	};

	const set = <K extends keyof GeofenceFormValues>(
		key: K,
		value: GeofenceFormValues[K]
	) => setForm((f) => ({ ...f, [key]: value }));

	const save = async () => {
		const error = validate(form);
		if (error) {
			toast.error(error);
			return;
		}
		setPending(true);
		try {
			const base = {
				name: form.name.trim(),
				address: form.address.trim() === "" ? undefined : form.address.trim(),
				latitude: Number(form.latitude),
				longitude: Number(form.longitude),
				radiusMeters: form.radiusMeters,
				accuracyThresholdMeters: form.accuracyThresholdMeters,
				allowOutsideWithReason: form.allowOutsideWithReason,
				notes: form.notes.trim() === "" ? undefined : form.notes.trim(),
			};
			if (editing && initial?.id) {
				await client.biometric.geofences.update({
					id: initial.id,
					...base,
					isActive: form.isActive,
				});
				toast.success("Work location updated.");
			} else {
				await client.biometric.geofences.create(base);
				toast.success("Work location created.");
			}
			onSaved();
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			setPending(false);
		}
	};

	let saveLabel = "Create location";
	if (pending) {
		saveLabel = "Saving…";
	} else if (editing) {
		saveLabel = "Save changes";
	}

	return (
		<Modal
			footer={
				<>
					<button
						className="btn btn-sm"
						disabled={pending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={pending}
						onClick={save}
						type="button"
					>
						{saveLabel}
					</button>
				</>
			}
			icon={<MapPin size={18} />}
			intro="Map picker is coming later. Enter latitude and longitude for now (e.g. from Google Maps)."
			onClose={onClose}
			title={editing ? "Edit work location" : "New work location"}
			wide
		>
			<Field id={ids.name} label="Name *">
				<input
					className="input"
					id={ids.name}
					onChange={(e) => set("name", e.target.value)}
					value={form.name}
				/>
			</Field>
			<Field id={ids.address} label="Address / site label">
				<input
					className="input"
					id={ids.address}
					onChange={(e) => set("address", e.target.value)}
					value={form.address}
				/>
			</Field>
			<div style={{ display: "flex", gap: 10 }}>
				<Field id={ids.lat} label="Latitude *">
					<input
						className="input"
						id={ids.lat}
						inputMode="decimal"
						onChange={(e) => set("latitude", e.target.value)}
						placeholder="6.8013"
						value={form.latitude}
					/>
				</Field>
				<Field id={ids.lon} label="Longitude *">
					<input
						className="input"
						id={ids.lon}
						inputMode="decimal"
						onChange={(e) => set("longitude", e.target.value)}
						placeholder="-58.1551"
						value={form.longitude}
					/>
				</Field>
			</div>
			<div style={{ display: "flex", gap: 10 }}>
				<Field id={ids.radius} label="Allowed radius (m) *">
					<input
						className="input"
						id={ids.radius}
						onChange={(e) => set("radiusMeters", Number(e.target.value))}
						type="number"
						value={form.radiusMeters}
					/>
				</Field>
				<Field id={ids.accuracy} label="GPS accuracy required (m) *">
					<input
						className="input"
						id={ids.accuracy}
						onChange={(e) =>
							set("accuracyThresholdMeters", Number(e.target.value))
						}
						type="number"
						value={form.accuracyThresholdMeters}
					/>
				</Field>
			</div>
			<label
				htmlFor={ids.outside}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					fontSize: 12.5,
					color: "var(--fg-2)",
				}}
			>
				<input
					checked={form.allowOutsideWithReason}
					id={ids.outside}
					onChange={(e) => set("allowOutsideWithReason", e.target.checked)}
					type="checkbox"
				/>
				Allow check-in outside the radius with a reason
			</label>
			{editing && (
				<label
					htmlFor={ids.active}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						fontSize: 12.5,
						color: "var(--fg-2)",
					}}
				>
					<input
						checked={form.isActive}
						id={ids.active}
						onChange={(e) => set("isActive", e.target.checked)}
						type="checkbox"
					/>
					Active
				</label>
			)}
			<Field id={ids.notes} label="Notes">
				<input
					className="input"
					id={ids.notes}
					onChange={(e) => set("notes", e.target.value)}
					value={form.notes}
				/>
			</Field>
		</Modal>
	);
}

function Field({
	id,
	label,
	children,
}: {
	children: ReactNode;
	id: string;
	label: string;
}) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
			<label htmlFor={id} style={{ fontSize: 12, color: "var(--fg-3)" }}>
				{label}
			</label>
			{children}
		</div>
	);
}
