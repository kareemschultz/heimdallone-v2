// Plain-language labels for the Biometrics module. No raw enum strings as
// primary text. Mirrors the server adapter mapping (providerKeyForDevice) so the
// UI can show an honest Supported / Planned badge without a round-trip.

export const VENDOR_LABEL: Record<string, string> = {
	zkteco: "ZKTeco",
	ngteco: "NGTeco",
	generic: "Generic",
	other: "Other",
};

export const MODE_LABEL: Record<string, string> = {
	csv_import: "CSV import",
	excel_import: "Excel import",
	usb_export_import: "USB / file import",
	api_ingest: "API ingest",
	zkteco_tcp_planned: "ZKTeco TCP/IP (planned)",
	zkteco_adms_push_planned: "ZKTeco ADMS/iClock push (planned)",
	ngteco_cloud_export: "NGTeco cloud export",
	ngteco_app_export: "NGTeco app/web export",
	vendor_manual_upload: "Manual upload",
	custom_adapter_planned: "Custom adapter (planned)",
};

// Friendly adapter name keyed by providerKey (matches attendance-adapters.ts).
export const ADAPTER_LABEL: Record<string, string> = {
	generic_csv: "Generic CSV import",
	generic_excel: "Generic Excel import",
	generic_api: "Generic API ingest",
	ngteco_app: "NGTeco app/web export",
	ngteco_kseries: "NGTeco K-series USB/import",
	zkteco_tcp: "ZKTeco TCP/IP planned",
	zkteco_adms: "ZKTeco ADMS/iClock planned",
	ngteco_cloud: "NGTeco cloud planned",
};

export const PUNCH_METHOD_LABEL: Record<string, string> = {
	face: "Face",
	fingerprint: "Fingerprint",
	rfid: "RFID card",
	pin: "PIN",
	mobile_app: "Mobile app",
	gps_mobile: "GPS / mobile",
};

export const NETWORK_LABEL: Record<string, string> = {
	wifi_2_4ghz: "Wi-Fi 2.4GHz",
	wifi_5ghz: "Wi-Fi 5GHz",
	tcp_ip: "TCP/IP (LAN)",
	usb: "USB",
	cloud_app: "Cloud / app",
};

export const DEVICE_STATUS_LABEL: Record<string, string> = {
	active: "Active",
	inactive: "Inactive",
	error: "Needs attention",
};

export const SYNC_STATUS_LABEL: Record<string, string> = {
	running: "Running",
	success: "Success",
	partial: "Partial — some rows skipped",
	failed: "Failed",
};

export const SYNC_MODE_LABEL: Record<string, string> = {
	csv_import: "CSV import",
	api_ingest: "API ingest",
};

export const PUNCH_STATUS_LABEL: Record<string, string> = {
	pending: "Pending processing",
	processed: "Processed",
	unmapped: "Unmapped — needs a device-user mapping",
	duplicate: "Duplicate (skipped)",
	error: "Error",
};

export const PUNCH_SOURCE_LABEL: Record<string, string> = {
	biometric: "Biometric device",
	mobile: "Mobile GPS",
	import: "File import",
	manual: "Manual",
	admin: "Admin entry",
};

export const PUNCH_DIRECTION_LABEL: Record<string, string> = {
	in: "Clock in",
	out: "Clock out",
	unknown: "Unknown",
};

export const VERIFY_MODE_LABEL: Record<string, string> = {
	fingerprint: "Fingerprint",
	face: "Face",
	card: "RFID card",
	password: "PIN / password",
	mobile_gps: "Mobile GPS",
	manual: "Manual",
	unknown: "Unknown",
};

// Geofence check verdict — plain, worker-friendly wording (not technical).
export const GEOFENCE_STATUS_LABEL: Record<string, string> = {
	inside: "You're at your work location",
	outside: "You're away from your work location",
	low_accuracy: "Your location signal is weak",
	unverified: "Couldn't confirm your work location",
};

export const GEOFENCE_STATUS_SHORT: Record<string, string> = {
	inside: "Inside work area",
	outside: "Outside work area",
	low_accuracy: "GPS accuracy too low",
	unverified: "Location not confirmed",
};

export const EXCEPTION_TYPE_LABEL: Record<string, string> = {
	unmapped_punch: "Unmapped device user",
	duplicate_punch: "Duplicate punch",
	missing_clock_out: "Missing clock-out",
	outside_geofence: "Outside geofence",
	low_gps_accuracy: "Low GPS accuracy",
	clock_drift: "Device clock drift",
	spoofing_suspected: "Suspected spoofing",
	device_error: "Device error",
	out_of_window: "Out of shift window",
};

export const EXCEPTION_SEVERITY_LABEL: Record<string, string> = {
	info: "Info",
	warning: "Warning",
	blocker: "Blocker — payroll cannot continue",
};

export const EXCEPTION_STATUS_LABEL: Record<string, string> = {
	open: "Open",
	in_review: "In review",
	resolved: "Resolved",
	dismissed: "Dismissed",
};

const PUNCH_EXCEPTIONS = new Set([
	"unmapped_punch",
	"duplicate_punch",
	"missing_clock_out",
	"out_of_window",
]);
const GEOFENCE_EXCEPTIONS = new Set([
	"outside_geofence",
	"low_gps_accuracy",
	"spoofing_suspected",
]);

export function exceptionSource(type: string): string {
	if (PUNCH_EXCEPTIONS.has(type)) {
		return "Punch";
	}
	if (GEOFENCE_EXCEPTIONS.has(type)) {
		return "Geofence";
	}
	return "Device";
}

// Mirror of the server's providerKeyForDevice(vendor, mode).
export function providerKeyForDevice(vendor: string, mode: string): string {
	if (vendor === "zkteco") {
		if (mode === "zkteco_adms_push_planned") {
			return "zkteco_adms";
		}
		if (mode === "zkteco_tcp_planned") {
			return "zkteco_tcp";
		}
	}
	if (vendor === "ngteco") {
		if (mode === "ngteco_cloud_export") {
			return "ngteco_cloud";
		}
		if (mode === "usb_export_import") {
			return "ngteco_kseries";
		}
		return "ngteco_app";
	}
	if (mode === "api_ingest") {
		return "generic_api";
	}
	if (mode === "excel_import") {
		return "generic_excel";
	}
	return "generic_csv";
}

const PLANNED_PROVIDERS = new Set([
	"zkteco_tcp",
	"zkteco_adms",
	"ngteco_cloud",
]);

export type AdapterStatus = "supported" | "planned";

export function deviceAdapterStatus(
	vendor: string,
	mode: string
): AdapterStatus {
	return PLANNED_PROVIDERS.has(providerKeyForDevice(vendor, mode))
		? "planned"
		: "supported";
}

export function deviceAdapterLabel(vendor: string, mode: string): string {
	const key = providerKeyForDevice(vendor, mode);
	return ADAPTER_LABEL[key] ?? "Generic import";
}
