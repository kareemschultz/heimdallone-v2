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
