import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Globe, Save } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/employees.css";
import "@/styles/payroll.css";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

const PAYROLL_ROLES = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"payroll_admin",
];

export const Route = createFileRoute("/app/payroll/settings")({
	component: PayrollSettingsPage,
});

function PayrollSettingsPage() {
	const org = useContext(OrgCtx);
	const qc = useQueryClient();
	const canManage = PAYROLL_ROLES.includes(org.memberRole);

	const { data: settings, isLoading } = useQuery(
		orpc.payroll.settings.get.queryOptions({})
	);

	const { data: profiles } = useQuery(
		orpc.payroll.settings.listCountryProfiles.queryOptions({})
	);

	const [form, setForm] = useState<Record<string, string | number | null>>({});
	const [saving, setSaving] = useState(false);

	const activeProfile = profiles?.find(
		(p: { isActive: boolean }) => p.isActive
	);

	const val = (key: string, fallback: string | number = "") => {
		if (key in form) {
			return form[key];
		}
		if (!settings) {
			return fallback;
		}
		return (settings as Record<string, unknown>)[key] ?? fallback;
	};

	const set = (key: string, value: string | number | null) => {
		setForm((prev) => ({ ...prev, [key]: value }));
	};

	async function handleSave() {
		if (!canManage) {
			return;
		}
		setSaving(true);
		try {
			await client.payroll.settings.update({
				defaultCurrency: String(val("defaultCurrency", "GYD")),
				defaultPayFrequency: String(val("defaultPayFrequency", "monthly")),
				weekdayOvertimeMultiplier: String(
					val("weekdayOvertimeMultiplier", "1.50")
				),
				saturdayMultiplier: String(val("saturdayMultiplier", "1.50")),
				sundayMultiplier: String(val("sundayMultiplier", "2.00")),
				publicHolidayMultiplier: String(val("publicHolidayMultiplier", "2.00")),
				nightShiftMultiplier: String(val("nightShiftMultiplier", "1.00")),
				standardHoursPerDay: String(val("standardHoursPerDay", "8.00")),
				lunchDeductionMinutes: Number(val("lunchDeductionMinutes", 0)),
				paidHolidaysForHourly: Boolean(val("paidHolidaysForHourly", true)),
			});
			toast.success("Payroll settings updated");
			qc.invalidateQueries();
			setForm({});
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : "Failed to save settings");
		} finally {
			setSaving(false);
		}
	}

	if (isLoading) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<div className="crumbs">
							<span>{org.orgName}</span>
							<span className="sep">/</span>
							<span>Payroll</span>
							<span className="sep">/</span>
							<span>Settings</span>
						</div>
						<h1 className="page-title">Payroll settings</h1>
					</div>
				</div>
				<div style={{ padding: 40, textAlign: "center", color: "var(--fg-3)" }}>
					Loading...
				</div>
			</div>
		);
	}

	if (!settings) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<div className="crumbs">
							<span>{org.orgName}</span>
							<span className="sep">/</span>
							<span>Payroll</span>
							<span className="sep">/</span>
							<span>Settings</span>
						</div>
						<h1 className="page-title">Payroll settings</h1>
						<p className="page-sub">
							No payroll settings found. Run initial setup to create settings.
						</p>
					</div>
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
						<span>Payroll</span>
						<span className="sep">/</span>
						<span>Settings</span>
					</div>
					<h1 className="page-title">Payroll settings</h1>
					<p className="page-sub">
						Configure overtime, work schedule, and payroll defaults
					</p>
				</div>
				{canManage && Object.keys(form).length > 0 && (
					<button
						className="btn btn-primary"
						disabled={saving}
						onClick={handleSave}
						type="button"
					>
						<Save size={13} />
						{saving ? "Saving..." : "Save changes"}
					</button>
				)}
			</div>

			<div className="payroll-grid">
				<div className="left-col">
					<SettingsSection title="General">
						<SettingsField
							helper="Currency used for payroll calculations"
							label="Default currency"
						>
							<select
								className="emp-search"
								disabled={!canManage}
								onChange={(e) => set("defaultCurrency", e.target.value)}
								style={{ width: "100%" }}
								value={String(val("defaultCurrency", "GYD"))}
							>
								<option value="GYD">GYD — Guyanese Dollar</option>
								<option value="TTD">TTD — Trinidad Dollar</option>
								<option value="BBD">BBD — Barbados Dollar</option>
								<option value="USD">USD — US Dollar</option>
							</select>
						</SettingsField>
						<SettingsField
							helper="How often employees are paid"
							label="Default pay frequency"
						>
							<select
								className="emp-search"
								disabled={!canManage}
								onChange={(e) => set("defaultPayFrequency", e.target.value)}
								style={{ width: "100%" }}
								value={String(val("defaultPayFrequency", "monthly"))}
							>
								<option value="weekly">Weekly</option>
								<option value="monthly">Monthly</option>
								<option value="semi_monthly">Semi-monthly</option>
							</select>
						</SettingsField>
					</SettingsSection>

					<SettingsSection title="Work schedule">
						<SettingsField
							helper="Used to calculate hourly rates and overtime"
							label="Standard hours per day"
						>
							<input
								className="emp-search"
								disabled={!canManage}
								max="24"
								min="1"
								onChange={(e) => set("standardHoursPerDay", e.target.value)}
								step="0.5"
								style={{ width: "100%" }}
								type="number"
								value={String(val("standardHoursPerDay", "8.00"))}
							/>
						</SettingsField>
						<SettingsField
							helper="Minutes deducted from daily hours for lunch break"
							label="Lunch deduction (minutes)"
						>
							<input
								className="emp-search"
								disabled={!canManage}
								max="120"
								min="0"
								onChange={(e) =>
									set("lunchDeductionMinutes", Number(e.target.value))
								}
								step="15"
								style={{ width: "100%" }}
								type="number"
								value={String(val("lunchDeductionMinutes", 0))}
							/>
						</SettingsField>
					</SettingsSection>

					<SettingsSection title="Overtime multipliers">
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: 14,
							}}
						>
							<SettingsField helper="Standard overtime rate" label="Weekday">
								<input
									className="emp-search"
									disabled={!canManage}
									max="5"
									min="1"
									onChange={(e) =>
										set("weekdayOvertimeMultiplier", e.target.value)
									}
									step="0.25"
									style={{ width: "100%" }}
									type="number"
									value={String(val("weekdayOvertimeMultiplier", "1.50"))}
								/>
							</SettingsField>
							<SettingsField helper="Weekend rate" label="Saturday">
								<input
									className="emp-search"
									disabled={!canManage}
									max="5"
									min="1"
									onChange={(e) => set("saturdayMultiplier", e.target.value)}
									step="0.25"
									style={{ width: "100%" }}
									type="number"
									value={String(val("saturdayMultiplier", "1.50"))}
								/>
							</SettingsField>
							<SettingsField helper="Rest day rate (statutory)" label="Sunday">
								<input
									className="emp-search"
									disabled={!canManage}
									max="5"
									min="1"
									onChange={(e) => set("sundayMultiplier", e.target.value)}
									step="0.25"
									style={{ width: "100%" }}
									type="number"
									value={String(val("sundayMultiplier", "2.00"))}
								/>
							</SettingsField>
							<SettingsField
								helper="Holiday rate (statutory)"
								label="Public holiday"
							>
								<input
									className="emp-search"
									disabled={!canManage}
									max="5"
									min="1"
									onChange={(e) =>
										set("publicHolidayMultiplier", e.target.value)
									}
									step="0.25"
									style={{ width: "100%" }}
									type="number"
									value={String(val("publicHolidayMultiplier", "2.00"))}
								/>
							</SettingsField>
						</div>
					</SettingsSection>

					<SettingsSection title="Policies">
						<SettingsField
							helper="Whether hourly/daily workers receive holiday pay"
							label="Paid holidays for hourly workers"
						>
							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									fontSize: 13,
								}}
							>
								<input
									checked={Boolean(val("paidHolidaysForHourly", true))}
									disabled={!canManage}
									onChange={(e) =>
										set("paidHolidaysForHourly", e.target.checked ? 1 : 0)
									}
									type="checkbox"
								/>
								Yes, pay holidays for hourly employees
							</label>
						</SettingsField>
					</SettingsSection>
				</div>

				<div className="right-col">
					{activeProfile && (
						<div className="side-card">
							<div className="side-head">
								<span className="ttl">
									<Globe
										size={14}
										style={{ marginRight: 6, verticalAlign: -2 }}
									/>
									{activeProfile.countryName} {activeProfile.effectiveYear}
								</span>
								<span className="badge badge-success" style={{ fontSize: 10 }}>
									Active
								</span>
							</div>
							<div className="side-body">
								<div className="fact-row">
									<span className="k">Country code</span>
									<span className="v">{activeProfile.countryCode}</span>
								</div>
								<div className="fact-row">
									<span className="k">Currency</span>
									<span className="v">{activeProfile.currency}</span>
								</div>
								<div className="fact-row">
									<span className="k">Employee NIS</span>
									<span className="v">{activeProfile.employeeNISRate}%</span>
								</div>
								<div className="fact-row">
									<span className="k">Employer NIS</span>
									<span className="v">{activeProfile.employerNISRate}%</span>
								</div>
								<div className="fact-row">
									<span className="k">NIS ceiling</span>
									<span className="v">
										$
										{Number(activeProfile.nisMaxEarnings ?? 0).toLocaleString()}
									</span>
								</div>
								<div className="fact-row">
									<span className="k">Personal allowance</span>
									<span className="v">
										$
										{Number(
											activeProfile.personalAllowanceThreshold ?? 0
										).toLocaleString()}
									</span>
								</div>
								<div className="fact-row">
									<span className="k">Child allowance</span>
									<span className="v">
										$
										{Number(
											activeProfile.childAllowancePerChild ?? 0
										).toLocaleString()}
										/child
									</span>
								</div>
								<div style={{ marginTop: 10 }}>
									<span
										style={{
											fontSize: 11,
											fontWeight: 600,
											color: "var(--fg-3)",
											textTransform: "uppercase",
											letterSpacing: "0.05em",
										}}
									>
										PAYE brackets
									</span>
									<div className="bands" style={{ marginTop: 6 }}>
										{(
											activeProfile.taxBrackets as Array<{
												min: number;
												max: number | null;
												rate: number;
											}>
										)?.map((b, i) => (
											<div
												className={`band-row ${i > 0 ? "hi" : ""}`}
												key={b.min}
											>
												<span className="l">
													{b.max
														? `Up to $${b.max.toLocaleString()}`
														: `Above $${b.min.toLocaleString()}`}
												</span>
												<span className="r">{(b.rate * 100).toFixed(0)}%</span>
											</div>
										))}
									</div>
								</div>
							</div>
						</div>
					)}

					<div className="side-card">
						<div className="side-head">
							<span className="ttl">About these settings</span>
						</div>
						<div
							className="side-body"
							style={{ fontSize: 12.5, color: "var(--fg-3)", lineHeight: 1.6 }}
						>
							<p>
								These settings apply to all payroll runs for your organization.
							</p>
							<p style={{ marginTop: 8 }}>
								<strong>Overtime multipliers</strong> determine how overtime
								hours are paid. For example, 1.5× means an employee earning
								$1,000/hour gets $1,500/hour for overtime.
							</p>
							<p style={{ marginTop: 8 }}>
								<strong>Country payroll profile</strong> contains statutory tax
								and NIS rules. These are managed separately and apply
								automatically during payroll calculations.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function SettingsSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="emp-table">
			<div className="emp-head">
				<span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
			</div>
			<div
				style={{
					padding: "14px 18px",
					display: "flex",
					flexDirection: "column",
					gap: 16,
				}}
			>
				{children}
			</div>
		</div>
	);
}

function SettingsField({
	label,
	helper,
	children,
}: {
	label: string;
	helper: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<span
				style={{
					display: "block",
					fontSize: 13,
					fontWeight: 500,
					marginBottom: 4,
				}}
			>
				{label}
			</span>
			<div style={{ fontSize: 11.5, color: "var(--fg-3)", marginBottom: 6 }}>
				{helper}
			</div>
			{children}
		</div>
	);
}
