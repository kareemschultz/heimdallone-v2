import { useQuery as useRQ } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useContext } from "react";
import { canViewPayroll } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/countries")({
	component: CountriesPage,
});

interface Bracket {
	fixedAmount?: number;
	max: number | null;
	min: number;
	rate: number;
}

interface Profile {
	childAllowancePerChild: string | null;
	countryCode: string;
	countryName: string;
	currency: string;
	effectiveFrom: string | Date | null;
	effectiveTo: string | Date | null;
	effectiveYear: number;
	employeeNISRate: string | null;
	employerNISRate: string | null;
	id: string;
	insurancePremiumCapAmount: string | null;
	isPublished: boolean;
	nisMaxEarnings: string | null;
	overtimeAllowanceCap: string | null;
	personalAllowanceThreshold: string | null;
	taxBrackets: Bracket[];
}

function money(currency: string, value: string | number | null): string {
	if (value == null) {
		return "—";
	}
	const n = Number(value);
	if (Number.isNaN(n)) {
		return "—";
	}
	return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function pct(value: string | number | null): string {
	if (value == null) {
		return "—";
	}
	const n = Number(value);
	return Number.isNaN(n) ? "—" : `${n}%`;
}

function effectiveLabel(p: Profile): string {
	const from = p.effectiveFrom
		? new Date(p.effectiveFrom).toLocaleDateString(undefined, {
				dateStyle: "medium",
			})
		: `${p.effectiveYear}`;
	const to = p.effectiveTo
		? new Date(p.effectiveTo).toLocaleDateString(undefined, {
				dateStyle: "medium",
			})
		: "ongoing";
	return `${from} → ${to}`;
}

function ProfileCard({ profile }: { profile: Profile }) {
	const cur = profile.currency;
	return (
		<div className="card card-pad" style={{ marginBottom: 16 }}>
			<div className="card-head-row">
				<div>
					<h3 style={{ fontSize: 16, fontWeight: 600 }}>
						{profile.countryName} ({profile.countryCode}) ·{" "}
						{profile.effectiveYear}
					</h3>
					<p style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 2 }}>
						{cur} · effective {effectiveLabel(profile)}
					</p>
				</div>
				<span
					className="status-pill"
					style={{
						alignSelf: "flex-start",
						padding: "3px 10px",
						fontSize: 11.5,
						borderRadius: 999,
						background: profile.isPublished
							? "var(--success-soft, rgba(34,197,94,0.15))"
							: "var(--bg-3)",
						color: profile.isPublished
							? "var(--success, #16a34a)"
							: "var(--fg-3)",
					}}
				>
					{profile.isPublished ? "Published" : "Draft"}
				</span>
			</div>

			<h4 style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 6px" }}>
				PAYE income-tax bands
			</h4>
			<table className="data-table" style={{ width: "100%", fontSize: 13 }}>
				<thead>
					<tr>
						<th style={{ textAlign: "left" }}>
							Chargeable income (per period)
						</th>
						<th style={{ textAlign: "right" }}>Rate</th>
					</tr>
				</thead>
				<tbody>
					{profile.taxBrackets.map((b) => (
						<tr key={`${b.min}-${b.max ?? "top"}`}>
							<td>
								{money(cur, b.min)} —{" "}
								{b.max == null ? "and above" : money(cur, b.max)}
							</td>
							<td style={{ textAlign: "right" }}>
								{(b.rate * 100).toFixed(0)}%
							</td>
						</tr>
					))}
				</tbody>
			</table>

			<h4 style={{ fontSize: 13, fontWeight: 600, margin: "14px 0 6px" }}>
				Statutory rates & allowances
			</h4>
			<dl
				style={{
					display: "grid",
					gridTemplateColumns: "1fr auto",
					gap: "6px 16px",
					fontSize: 13,
				}}
			>
				<dt style={{ color: "var(--fg-3)" }}>NIS — employee</dt>
				<dd style={{ textAlign: "right" }}>{pct(profile.employeeNISRate)}</dd>
				<dt style={{ color: "var(--fg-3)" }}>NIS — employer</dt>
				<dd style={{ textAlign: "right" }}>{pct(profile.employerNISRate)}</dd>
				<dt style={{ color: "var(--fg-3)" }}>NIS — max insurable (monthly)</dt>
				<dd style={{ textAlign: "right" }}>
					{money(cur, profile.nisMaxEarnings)}
				</dd>
				<dt style={{ color: "var(--fg-3)" }}>Personal allowance (monthly)</dt>
				<dd style={{ textAlign: "right" }}>
					{money(cur, profile.personalAllowanceThreshold)}
				</dd>
				<dt style={{ color: "var(--fg-3)" }}>Child allowance (per child)</dt>
				<dd style={{ textAlign: "right" }}>
					{money(cur, profile.childAllowancePerChild)}
				</dd>
				<dt style={{ color: "var(--fg-3)" }}>Overtime allowance cap</dt>
				<dd style={{ textAlign: "right" }}>
					{money(cur, profile.overtimeAllowanceCap)}
				</dd>
				<dt style={{ color: "var(--fg-3)" }}>Insurance premium cap</dt>
				<dd style={{ textAlign: "right" }}>
					{money(cur, profile.insurancePremiumCapAmount)}
				</dd>
			</dl>
		</div>
	);
}

function CountriesPage() {
	const org = useContext(OrgCtx);
	const canView = canViewPayroll(org.memberRole);
	const profilesQuery = useRQ({
		...orpc.payroll.settings.listCountryProfiles.queryOptions({}),
		enabled: canView,
	});
	const profiles = (profilesQuery.data ?? []) as Profile[];

	if (!canView) {
		return (
			<div className="page">
				<div className="card card-pad">
					<h3>No access</h3>
					<p style={{ color: "var(--fg-3)", fontSize: 13.5 }}>
						Countries & Tax is available to payroll administrators.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Countries & Tax</span>
					</div>
					<h1 className="page-title">Countries & Tax</h1>
					<p className="page-sub">
						Statutory tax tables, NIS rates and allowances applied by payroll.
						Source of truth: the relevant national authority (Guyana → GRA).
					</p>
				</div>
			</div>

			{profilesQuery.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading country profiles…
				</div>
			)}
			{profilesQuery.isError && (
				<div
					className="card card-pad"
					style={{ color: "var(--danger, #e5484d)" }}
				>
					Could not load country profiles.
				</div>
			)}
			{!(profilesQuery.isLoading || profilesQuery.isError) &&
				profiles.length === 0 && (
					<div className="card card-pad">
						<h3>No country profiles yet</h3>
						<p style={{ color: "var(--fg-3)", fontSize: 13.5 }}>
							Configure a payroll country profile in Payroll → Settings to
							define tax bands and statutory rates.
						</p>
					</div>
				)}
			{profiles.map((p) => (
				<ProfileCard key={p.id} profile={p} />
			))}
		</div>
	);
}
