/**
 * Attendance device adapter/provider model (Phase 11C).
 *
 * The punch pipeline is vendor-agnostic: devices register a `providerKey` that
 * resolves to an adapter here. Adapters normalize imported rows into
 * NormalizedPunch[]; the processor (biometric-processor.ts) does not care
 * whether a punch came from ZKTeco, NGTeco, a CSV/USB export, or a mobile
 * check-in.
 *
 * MVP reality:
 *  - File/API import paths are "supported" (generic CSV/Excel, NGTeco app/USB
 *    export, generic API ingest).
 *  - Live integrations (ZKTeco TCP pull, ZKTeco ADMS push, NGTeco cloud API)
 *    are "planned" — we DO NOT fake live sync. Their parseImportRows still works
 *    for any delimited export the device produces, but getConnectionStatus
 *    reports the live path as not-yet-available.
 *
 * Privacy: adapters ingest ONLY punch events + the verification METHOD. Any
 * incoming key resembling a biometric template is rejected upstream
 * (see rejectsBiometricTemplates in the router/ingest).
 */

export type PunchDirection = "in" | "out" | "unknown";
export type PunchVerifyMode =
	| "fingerprint"
	| "face"
	| "card"
	| "password"
	| "mobile_gps"
	| "manual"
	| "unknown";

export interface NormalizedPunch {
	deviceUserId: string;
	direction: PunchDirection;
	punchTime: Date;
	raw?: Record<string, unknown>;
	verifyMode: PunchVerifyMode;
}

export interface AdapterValidationResult {
	errors: string[];
	ok: boolean;
}

export interface AdapterConnectionStatus {
	detail: string;
	live: boolean;
	mode: "supported" | "planned";
}

export type AdapterStatus = "supported" | "planned";
export type AdapterVendor = "zkteco" | "ngteco" | "generic" | "custom";

interface ColumnAliases {
	deviceUserId: string[];
	direction: string[];
	timestamp: string[];
	verifyMode: string[];
}

export interface ParseResult {
	errors: string[];
	punches: NormalizedPunch[];
}

export interface AttendanceDeviceAdapter {
	capabilities: string[];
	displayName: string;
	getConnectionStatus(): AdapterConnectionStatus;
	parseImportRows(text: string): ParseResult;
	providerKey: string;
	status: AdapterStatus;
	supportedModes: string[];
	validateDeviceConfig(
		config: Record<string, unknown>
	): AdapterValidationResult;
	vendor: AdapterVendor;
}

// ── Normalisation helpers ────────────────────────────────────────────────────

const IN_TOKENS = new Set(["in", "i", "check-in", "checkin", "0", "3", "4"]);
const OUT_TOKENS = new Set([
	"out",
	"o",
	"check-out",
	"checkout",
	"1",
	"2",
	"5",
]);

function normalizeDirection(value: string | undefined): PunchDirection {
	if (!value) {
		return "unknown";
	}
	const v = value.trim().toLowerCase();
	if (IN_TOKENS.has(v)) {
		return "in";
	}
	if (OUT_TOKENS.has(v)) {
		return "out";
	}
	return "unknown";
}

const VERIFY_MAP: Record<string, PunchVerifyMode> = {
	"1": "fingerprint",
	fingerprint: "fingerprint",
	finger: "fingerprint",
	"15": "face",
	face: "face",
	"2": "card",
	card: "card",
	rfid: "card",
	"0": "password",
	password: "password",
	pin: "password",
	mobile: "mobile_gps",
	mobile_gps: "mobile_gps",
	gps: "mobile_gps",
	manual: "manual",
};

function normalizeVerifyMode(value: string | undefined): PunchVerifyMode {
	if (!value) {
		return "unknown";
	}
	return VERIFY_MAP[value.trim().toLowerCase()] ?? "unknown";
}

function parseTimestamp(value: string | undefined): Date | null {
	if (!value) {
		return null;
	}
	const raw = value.trim();
	// Accept "YYYY-MM-DD HH:MM:SS" (device export) and ISO 8601.
	const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
	const d = new Date(normalized);
	return Number.isNaN(d.getTime()) ? null : d;
}

function splitCsvLine(line: string): string[] {
	// Minimal CSV/TSV split — supports quoted fields with commas.
	const delimiter = line.includes("\t") && !line.includes(",") ? "\t" : ",";
	const out: string[] = [];
	let cur = "";
	let inQuotes = false;
	for (const ch of line) {
		if (ch === '"') {
			inQuotes = !inQuotes;
		} else if (ch === delimiter && !inQuotes) {
			out.push(cur);
			cur = "";
		} else {
			cur += ch;
		}
	}
	out.push(cur);
	return out.map((c) => c.trim());
}

function resolveColumnIndexes(
	header: string[],
	aliases: ColumnAliases
): Record<keyof ColumnAliases, number> {
	const lower = header.map((h) => h.toLowerCase());
	const find = (names: string[]): number => {
		for (const n of names) {
			const idx = lower.indexOf(n.toLowerCase());
			if (idx !== -1) {
				return idx;
			}
		}
		return -1;
	};
	return {
		deviceUserId: find(aliases.deviceUserId),
		timestamp: find(aliases.timestamp),
		direction: find(aliases.direction),
		verifyMode: find(aliases.verifyMode),
	};
}

const MAX_IMPORT_ROWS = 10_000;
const LINE_SPLIT_RE = /\r?\n/;

/** Shared delimited-file parser used by every file-import adapter. */
function parseDelimited(text: string, aliases: ColumnAliases): ParseResult {
	const errors: string[] = [];
	const punches: NormalizedPunch[] = [];
	const lines = text
		.split(LINE_SPLIT_RE)
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	if (lines.length === 0) {
		return { punches, errors: ["File is empty."] };
	}
	if (lines.length - 1 > MAX_IMPORT_ROWS) {
		return {
			punches,
			errors: [
				`Too many rows (${lines.length - 1}); limit is ${MAX_IMPORT_ROWS}.`,
			],
		};
	}

	const header = splitCsvLine(lines[0] as string);
	const idx = resolveColumnIndexes(header, aliases);
	if (idx.deviceUserId === -1 || idx.timestamp === -1) {
		return {
			punches,
			errors: [
				`Missing required columns. Need a device user id (${aliases.deviceUserId.join("/")}) and a timestamp (${aliases.timestamp.join("/")}). Found: ${header.join(", ")}`,
			],
		};
	}

	for (let i = 1; i < lines.length; i++) {
		const cells = splitCsvLine(lines[i] as string);
		const deviceUserId = cells[idx.deviceUserId]?.trim();
		const punchTime = parseTimestamp(cells[idx.timestamp]);
		if (!deviceUserId) {
			errors.push(`Row ${i + 1}: missing device user id.`);
			continue;
		}
		if (!punchTime) {
			errors.push(`Row ${i + 1}: unparseable timestamp.`);
			continue;
		}
		punches.push({
			deviceUserId,
			punchTime,
			direction:
				idx.direction === -1
					? "unknown"
					: normalizeDirection(cells[idx.direction]),
			verifyMode:
				idx.verifyMode === -1
					? "unknown"
					: normalizeVerifyMode(cells[idx.verifyMode]),
		});
	}
	return { punches, errors };
}

function baseValidate(
	config: Record<string, unknown>
): AdapterValidationResult {
	const errors: string[] = [];
	if (typeof config.name !== "string" || config.name.trim() === "") {
		errors.push("Device name is required.");
	}
	return { ok: errors.length === 0, errors };
}

// ── Adapter factory ──────────────────────────────────────────────────────────

interface AdapterSpec {
	aliases: ColumnAliases;
	capabilities: string[];
	displayName: string;
	live: boolean;
	providerKey: string;
	status: AdapterStatus;
	statusDetail: string;
	supportedModes: string[];
	vendor: AdapterVendor;
}

function makeAdapter(spec: AdapterSpec): AttendanceDeviceAdapter {
	return {
		providerKey: spec.providerKey,
		displayName: spec.displayName,
		vendor: spec.vendor,
		status: spec.status,
		supportedModes: spec.supportedModes,
		capabilities: spec.capabilities,
		parseImportRows: (text: string) => parseDelimited(text, spec.aliases),
		validateDeviceConfig: (config) => baseValidate(config),
		getConnectionStatus: () => ({
			live: spec.live,
			mode: spec.status,
			detail: spec.statusDetail,
		}),
	};
}

const GENERIC_ALIASES: ColumnAliases = {
	deviceUserId: ["device_user_id", "user_id", "userid", "pin", "employee_id"],
	timestamp: ["timestamp", "time", "datetime", "punch_time", "date_time"],
	direction: ["direction", "log_type", "status", "in_out", "state"],
	verifyMode: ["verify_mode", "verify", "mode", "method", "verification"],
};

// NGTeco app/cloud CSV exports use Title Case headers.
const NGTECO_ALIASES: ColumnAliases = {
	deviceUserId: ["user id", "userid", "user_id", "employee no", "ac-no", "pin"],
	timestamp: ["time", "date/time", "datetime", "timestamp", "check time"],
	direction: ["state", "status", "in/out", "direction", "type"],
	verifyMode: ["verify mode", "verification", "mode", "method"],
};

export const ADAPTERS: Record<string, AttendanceDeviceAdapter> = {
	generic_csv: makeAdapter({
		providerKey: "generic_csv",
		displayName: "Generic CSV import",
		vendor: "generic",
		status: "supported",
		live: false,
		statusDetail: "Upload a CSV export. No live device connection.",
		supportedModes: ["csv_import", "vendor_manual_upload"],
		capabilities: ["file_import"],
		aliases: GENERIC_ALIASES,
	}),
	generic_excel: makeAdapter({
		providerKey: "generic_excel",
		displayName: "Generic Excel import",
		vendor: "generic",
		status: "supported",
		live: false,
		statusDetail:
			"Upload an Excel export saved as CSV/TSV. No live device connection.",
		supportedModes: ["excel_import", "vendor_manual_upload"],
		capabilities: ["file_import"],
		aliases: GENERIC_ALIASES,
	}),
	generic_api: makeAdapter({
		providerKey: "generic_api",
		displayName: "Generic API ingest",
		vendor: "generic",
		status: "supported",
		live: true,
		statusDetail:
			"Receives punches via the authenticated /ingest endpoint (external sync-agent posts here).",
		supportedModes: ["api_ingest"],
		capabilities: ["api_ingest"],
		aliases: GENERIC_ALIASES,
	}),
	zkteco_tcp: makeAdapter({
		providerKey: "zkteco_tcp",
		displayName: "ZKTeco TCP/IP (planned)",
		vendor: "zkteco",
		status: "planned",
		live: false,
		statusDetail:
			"Native TCP pull (port 4370) is not built into the server. Use the external sync-agent → API ingest, or CSV import. Live pull is planned.",
		supportedModes: ["zkteco_tcp_planned", "api_ingest", "csv_import"],
		capabilities: ["file_import", "live_pull_planned"],
		aliases: GENERIC_ALIASES,
	}),
	zkteco_adms: makeAdapter({
		providerKey: "zkteco_adms",
		displayName: "ZKTeco ADMS/iClock push (planned)",
		vendor: "zkteco",
		status: "planned",
		live: false,
		statusDetail:
			"ADMS/iClock push receiver is planned (needs a hardened public endpoint + SN allowlist). Use API ingest or CSV import meanwhile.",
		supportedModes: ["zkteco_adms_push_planned", "api_ingest", "csv_import"],
		capabilities: ["push_receiver_planned", "file_import"],
		aliases: GENERIC_ALIASES,
	}),
	ngteco_cloud: makeAdapter({
		providerKey: "ngteco_cloud",
		displayName: "NGTeco Cloud (export — live API planned)",
		vendor: "ngteco",
		status: "planned",
		live: false,
		statusDetail:
			"NGTeco cloud devices may not expose a public local/cloud API. Live cloud sync requires vendor verification + production secret storage. Supported path today: manual app/cloud CSV export.",
		supportedModes: [
			"ngteco_cloud_export",
			"vendor_manual_upload",
			"csv_import",
		],
		capabilities: ["file_import", "cloud_sync_planned"],
		aliases: NGTECO_ALIASES,
	}),
	ngteco_app: makeAdapter({
		providerKey: "ngteco_app",
		displayName: "NGTeco app export",
		vendor: "ngteco",
		status: "supported",
		live: false,
		statusDetail:
			"Export attendance logs from the NGTeco mobile/web app and upload here. No live API.",
		supportedModes: ["ngteco_app_export", "vendor_manual_upload", "csv_import"],
		capabilities: ["file_import"],
		aliases: NGTECO_ALIASES,
	}),
	ngteco_kseries: makeAdapter({
		providerKey: "ngteco_kseries",
		displayName: "NGTeco K-series (WiFi/TCP/USB import)",
		vendor: "ngteco",
		status: "supported",
		live: false,
		statusDetail:
			"Export logs to USB/file from a K-series clock (e.g. K4) and upload here. Live WiFi/TCP pull is not built.",
		supportedModes: ["usb_export_import", "csv_import", "vendor_manual_upload"],
		capabilities: ["file_import", "usb_export"],
		aliases: NGTECO_ALIASES,
	}),
};

export function getAdapter(providerKey: string): AttendanceDeviceAdapter {
	return (
		ADAPTERS[providerKey] ?? (ADAPTERS.generic_csv as AttendanceDeviceAdapter)
	);
}

export function listAdapters(): AttendanceDeviceAdapter[] {
	return Object.values(ADAPTERS);
}

// Substrings (alphanumeric-normalised) that flag biometric identity material —
// keys an ingest/import payload must never carry.
const BANNED_TEMPLATE_TOKENS = [
	"template",
	"fingerprintdata",
	"facedata",
	"palmdata",
	"irisdata",
	"biometricdata",
];

const NON_ALNUM_RE = /[^a-z0-9]/g;

/** Rejects any object carrying biometric-template material (privacy guard). */
export function containsBiometricTemplate(
	obj: Record<string, unknown>
): boolean {
	return Object.keys(obj).some((key) => {
		const normalized = key.toLowerCase().replace(NON_ALNUM_RE, "");
		return BANNED_TEMPLATE_TOKENS.some((token) => normalized.includes(token));
	});
}
