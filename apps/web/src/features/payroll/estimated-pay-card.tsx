import { useQuery } from "@tanstack/react-query";
import { Clock, Info, TrendingUp } from "lucide-react";
import { orpc } from "@/utils/orpc";

type ConfidenceLabel =
	| "High confidence"
	| "Needs review"
	| "Cannot finalize yet";

interface ProjectionView {
	calculatedAt: string;
	confidenceLabel: ConfidenceLabel;
	confidenceReasons: string[];
	days: {
		workedDays: number;
		absentDays: number;
		approvedLeaveDays: number;
		unpaidLeaveDays: number;
	};
	disclaimers: string[];
	estimatedGross: number;
	estimatedNet: number;
	hours: { regularHours: number; overtimeHours: number };
	periodEnd: string;
	periodName: string;
	periodStart: string;
}

function confidenceBadge(label: ConfidenceLabel): string {
	if (label === "High confidence") {
		return "badge-success";
	}
	if (label === "Cannot finalize yet") {
		return "badge-danger";
	}
	return "badge-warning";
}

function fmtMoney(n: number): string {
	return `$${Number(n).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function fmtDate(d: string): string {
	if (!d) {
		return "—";
	}
	return new Date(d).toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function fmtUpdated(iso: string): string {
	if (!iso) {
		return "";
	}
	return new Date(iso).toLocaleString("en-GB", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

const CARD_STYLE: React.CSSProperties = {
	marginBottom: 16,
	padding: 18,
	background: "var(--bg-1)",
	border: "1px solid var(--line)",
	borderRadius: 14,
};

const STAT_GRID: React.CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
	gap: 12,
	marginTop: 14,
};

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 2 }}>
				{label}
			</div>
			<div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-1)" }}>
				{value}
			</div>
		</div>
	);
}

export function EstimatedPayCard() {
	const query = useQuery({
		...orpc.payroll.projectedPay.own.queryOptions({ input: {} }),
		retry: false,
	});

	// No employee profile / no pay period yet → silently render nothing; the
	// payslips table below still shows. This card is additive, never blocking.
	if (query.isError) {
		return null;
	}

	if (query.isLoading) {
		return (
			<div style={CARD_STYLE}>
				<div
					style={{
						height: 14,
						width: 200,
						background: "var(--bg-3)",
						borderRadius: 4,
					}}
				/>
				<div
					style={{
						height: 28,
						width: 140,
						background: "var(--bg-3)",
						borderRadius: 4,
						marginTop: 14,
					}}
				/>
			</div>
		);
	}

	const p = query.data as unknown as ProjectionView | undefined;
	if (!p) {
		return null;
	}

	const guardrail =
		p.disclaimers[0] ?? "This is an estimate, not your final pay.";

	return (
		<div style={CARD_STYLE}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 10,
					flexWrap: "wrap",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<TrendingUp size={16} style={{ color: "var(--accent)" }} />
					<h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
						Estimated pay this period
					</h2>
					<span className="badge badge-outline" style={{ fontSize: 9 }}>
						Estimate
					</span>
				</div>
				<span
					className={`badge ${confidenceBadge(p.confidenceLabel)}`}
					style={{ fontSize: 10 }}
				>
					{p.confidenceLabel}
				</span>
			</div>

			<div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 4 }}>
				{p.periodName} · {fmtDate(p.periodStart)} — {fmtDate(p.periodEnd)}
			</div>

			<div
				style={{ display: "flex", gap: 28, marginTop: 14, flexWrap: "wrap" }}
			>
				<div>
					<div style={{ fontSize: 11, color: "var(--fg-3)" }}>
						Estimated net pay
					</div>
					<div style={{ fontSize: 26, fontWeight: 700, color: "var(--fg-1)" }}>
						{fmtMoney(p.estimatedNet)}
					</div>
				</div>
				<div>
					<div style={{ fontSize: 11, color: "var(--fg-3)" }}>
						Estimated gross
					</div>
					<div style={{ fontSize: 26, fontWeight: 700, color: "var(--fg-2)" }}>
						{fmtMoney(p.estimatedGross)}
					</div>
				</div>
			</div>

			<div style={STAT_GRID}>
				<Stat label="Regular hours" value={`${p.hours.regularHours}h`} />
				<Stat label="Overtime" value={`${p.hours.overtimeHours}h`} />
				<Stat label="Days worked" value={`${p.days.workedDays}`} />
				<Stat label="Paid leave" value={`${p.days.approvedLeaveDays} day(s)`} />
				{p.days.unpaidLeaveDays > 0 && (
					<Stat
						label="Unpaid leave"
						value={`${p.days.unpaidLeaveDays} day(s)`}
					/>
				)}
			</div>

			{p.confidenceReasons.length > 0 && (
				<div
					style={{
						marginTop: 14,
						padding: "10px 12px",
						background: "var(--bg-2)",
						borderRadius: 10,
						fontSize: 12.5,
						color: "var(--fg-2)",
					}}
				>
					<div style={{ fontWeight: 600, marginBottom: 4 }}>
						What might still change
					</div>
					<ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
						{p.confidenceReasons.map((r) => (
							<li key={r}>{r}</li>
						))}
					</ul>
				</div>
			)}

			<div
				style={{
					marginTop: 14,
					display: "flex",
					alignItems: "flex-start",
					gap: 6,
					fontSize: 11.5,
					color: "var(--fg-3)",
					lineHeight: 1.6,
				}}
			>
				<Info size={13} style={{ marginTop: 2, flexShrink: 0 }} />
				<span>
					{guardrail} Estimated pay is based on approved attendance and current
					payroll settings. Your final payslip may change after HR/payroll
					review.
				</span>
			</div>

			{p.calculatedAt && (
				<div
					style={{
						marginTop: 8,
						display: "flex",
						alignItems: "center",
						gap: 4,
						fontSize: 11,
						color: "var(--fg-4)",
					}}
				>
					<Clock size={11} />
					Updated {fmtUpdated(p.calculatedAt)}
				</div>
			)}
		</div>
	);
}
