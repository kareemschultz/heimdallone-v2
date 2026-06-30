import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	CreditCard,
	ExternalLink,
	Info,
	Sparkles,
	Users,
} from "lucide-react";
import { useContext, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { canManageHR } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/settings/billing")({
	component: BillingPage,
});

type PlanKey = "trial" | "starter" | "business" | "enterprise";
type BillingCycle = "monthly" | "yearly";

interface PlanSpec {
	employeeLimit: string;
	entityLimit: string;
	features: string[];
	label: string;
	monthly: string;
	monthlyNote: string;
	yearly: string;
	yearlyNote: string;
}

const PLANS: Record<Exclude<PlanKey, "trial">, PlanSpec> = {
	starter: {
		label: "Starter",
		monthly: "USD 125",
		yearly: "USD 100",
		monthlyNote: "/ mo",
		yearlyNote: "/ mo, billed yearly",
		employeeLimit: "50 employees",
		entityLimit: "1 legal entity",
		features: [
			"Guyana PAYE & NIS computation",
			"Bank file exports (RBL, RBC, NCB)",
			"Biometric device sync (1 device)",
			"Double-entry accounting",
			"Email support",
		],
	},
	business: {
		label: "Business",
		monthly: "USD 249",
		yearly: "USD 199",
		monthlyNote: "/ mo",
		yearlyNote: "/ mo, billed yearly",
		employeeLimit: "200 employees",
		entityLimit: "3 legal entities",
		features: [
			"Multi-company payroll runs",
			"Biometric device sync (unlimited)",
			"Inventory, bonded warehouse & warehouse management",
			"Bank reconciliation",
			"Custom payroll components",
			"Priority support",
		],
	},
	enterprise: {
		label: "Enterprise",
		monthly: "Custom",
		yearly: "Custom",
		monthlyNote: "",
		yearlyNote: "",
		employeeLimit: "Unlimited employees",
		entityLimit: "Unlimited entities",
		features: [
			"Multi-tenant management",
			"On-prem deployment option",
			"Dedicated CSM",
			"Custom SLA",
			"API + webhook access",
		],
	},
};

const PLAN_ORDER: PlanKey[] = ["trial", "starter", "business", "enterprise"];
const PAID_PLANS: Exclude<PlanKey, "trial">[] = [
	"starter",
	"business",
	"enterprise",
];

function daysUntil(isoDate: string): number {
	const ms =
		new Date(`${isoDate.slice(0, 10)}T12:00:00`).getTime() - Date.now();
	return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function formatDate(isoOrTimestamp: string | number): string {
	const d =
		typeof isoOrTimestamp === "number"
			? new Date(isoOrTimestamp * 1000)
			: new Date(`${String(isoOrTimestamp).slice(0, 10)}T12:00:00`);
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

type BillingStatus = Awaited<
	ReturnType<typeof orpc.organization.getBillingStatus.call>
>;
type InvoiceRow = Awaited<
	ReturnType<typeof orpc.organization.getInvoices.call>
>[number];

function BillingPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageHR(org.memberRole);
	const [cycle, setCycle] = useState<BillingCycle>("monthly");
	const [busy, setBusy] = useState<string | null>(null);

	const statusQuery = useQuery(
		orpc.organization.getBillingStatus.queryOptions({ enabled: canManage })
	);
	const invoicesQuery = useQuery(
		orpc.organization.getInvoices.queryOptions({ enabled: canManage })
	);

	if (!canManage) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">Billing</h1>
				</div>
				<EmptyState
					description="Billing and subscription management is available to workspace owners and administrators."
					icon={<CreditCard size={28} />}
					title="You don't have access to Billing"
				/>
			</div>
		);
	}

	const data = statusQuery.data as BillingStatus | undefined;
	const invoices = (invoicesQuery.data as InvoiceRow[] | undefined) ?? [];

	async function redirectTo(
		action: "checkout" | "portal",
		key: string,
		args?: { plan: "starter" | "business"; cycle: BillingCycle }
	) {
		setBusy(key);
		try {
			const res =
				action === "checkout" && args
					? await orpc.organization.createCheckoutSession.call(args)
					: await orpc.organization.createBillingPortalSession.call({});
			if (res?.url) {
				window.location.href = res.url;
			}
		} catch {
			setBusy(null);
		}
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Billing</span>
					</div>
					<h1 className="page-title">Billing</h1>
					<p className="page-sub">
						Subscription plan, usage, and upgrade options.
					</p>
				</div>
			</div>

			{statusQuery.isLoading || !data ? (
				<div className="card" style={{ height: 160 }} />
			) : (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 24,
						maxWidth: 960,
					}}
				>
					<StatusBanners data={data} />
					<CurrentPlanCard
						busy={busy}
						data={data}
						onPortal={() => redirectTo("portal", "__portal__")}
					/>
					<PlanGrid
						busy={busy}
						cycle={cycle}
						data={data}
						onCheckout={(plan) => redirectTo("checkout", plan, { plan, cycle })}
						onPortal={(plan) => redirectTo("portal", plan)}
						onSetCycle={setCycle}
					/>
					<InvoiceHistory
						invoices={invoices}
						isLoading={invoicesQuery.isLoading}
						stripeCustomerId={data.stripeCustomerId}
					/>
				</div>
			)}
		</div>
	);
}

function StatusBanners({ data }: { data: BillingStatus }) {
	const isPastDue = data.subscriptionStatus === "past_due";
	const isCanceling = data.subscriptionStatus === "canceling";

	if (isPastDue) {
		return (
			<Banner icon={<AlertCircle size={18} />} tone="danger">
				Payment failed — update your payment method to keep access.
			</Banner>
		);
	}
	if (isCanceling && data.cancelAt) {
		return (
			<Banner icon={<AlertTriangle size={18} />} tone="warn">
				Your {data.planLabel} plan cancels on {formatDate(data.cancelAt)}.
			</Banner>
		);
	}
	if (data.scheduledPlan && data.scheduledPlanAt) {
		return (
			<Banner icon={<Info size={18} />} tone="info">
				Downgrading to {data.scheduledPlan} on{" "}
				{formatDate(data.scheduledPlanAt)} — effective at the end of your
				billing period.
			</Banner>
		);
	}
	if (data.trial.isExpired) {
		return (
			<Banner icon={<AlertCircle size={18} />} tone="danger">
				Free trial ended. Read access continues but new payroll runs and
				employee additions are blocked. Pick a plan below to continue.
			</Banner>
		);
	}
	if (data.trial.isTrial) {
		return (
			<Banner icon={<Sparkles size={18} />} tone="accent">
				{data.trial.daysRemaining} day
				{data.trial.daysRemaining === 1 ? "" : "s"} left in your free trial —
				ends {formatDate(data.trial.endsAt)}.
			</Banner>
		);
	}
	return null;
}

function Banner({
	icon,
	tone,
	children,
}: {
	icon: React.ReactNode;
	tone: "danger" | "warn" | "info" | "accent";
	children: React.ReactNode;
}) {
	const color =
		tone === "danger"
			? "var(--danger, #ef4444)"
			: tone === "warn"
				? "var(--warning, #f59e0b)"
				: tone === "accent"
					? "var(--accent)"
					: "var(--fg-2)";
	return (
		<div
			className="card"
			style={{
				display: "flex",
				gap: 12,
				alignItems: "flex-start",
				padding: 16,
				borderColor: `color-mix(in oklch, ${color} 40%, transparent)`,
				background: `color-mix(in oklch, ${color} 8%, transparent)`,
			}}
		>
			<span style={{ color, flexShrink: 0 }}>{icon}</span>
			<span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{children}</span>
		</div>
	);
}

function CurrentPlanCard({
	data,
	busy,
	onPortal,
}: {
	data: BillingStatus;
	busy: string | null;
	onPortal: () => void;
}) {
	const statusLabel = data.subscriptionStatus
		? data.subscriptionStatus
		: data.trial.isExpired
			? "Expired"
			: data.trial.isTrial
				? "Trial"
				: "Active";
	const usagePct =
		data.employeeLimit && data.employeeLimit > 0
			? Math.min(100, (data.employeeCount / data.employeeLimit) * 100)
			: null;

	return (
		<div className="card" style={{ padding: 20 }}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
						{data.planLabel} plan
					</h2>
					<span
						style={{
							fontSize: 11,
							textTransform: "capitalize",
							padding: "2px 8px",
							borderRadius: 999,
							border: "1px solid var(--line)",
							color: "var(--fg-3)",
						}}
					>
						{statusLabel}
					</span>
				</div>
				<CreditCard color="var(--fg-3)" size={22} />
			</div>

			<div
				style={{
					marginTop: 16,
					padding: 12,
					borderRadius: 8,
					border: "1px solid var(--line)",
					background: "var(--bg-2)",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						fontSize: 13,
					}}
				>
					<span
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							color: "var(--fg-3)",
						}}
					>
						<Users size={14} /> Employees
					</span>
					<span style={{ fontWeight: 600 }}>
						{data.employeeCount} / {data.employeeLimit ?? "unlimited"}
					</span>
				</div>
				{usagePct !== null && (
					<div
						style={{
							marginTop: 8,
							height: 6,
							borderRadius: 999,
							background: "var(--line)",
							overflow: "hidden",
						}}
					>
						<div
							style={{
								height: "100%",
								width: `${usagePct}%`,
								background:
									usagePct > 90 ? "var(--warning, #f59e0b)" : "var(--accent)",
							}}
						/>
					</div>
				)}
			</div>

			{data.currentPeriodEnd && (
				<p style={{ marginTop: 12, fontSize: 13, color: "var(--fg-3)" }}>
					{data.billingCycle === "monthly" ? "Monthly" : "Yearly"} subscription
					· {data.subscriptionStatus === "canceling" ? "Cancels" : "Renews"}{" "}
					{formatDate(data.currentPeriodEnd)} ·{" "}
					{daysUntil(data.currentPeriodEnd)} days
					{data.amountUSD == null ? "" : ` · $${data.amountUSD} USD`}
				</p>
			)}

			{data.v2CreditDays ? (
				<div
					style={{
						display: "flex",
						alignItems: "flex-start",
						gap: 10,
						marginTop: 14,
						padding: "10px 14px",
						borderRadius: 10,
						border:
							"1px solid color-mix(in oklch, var(--accent) 40%, transparent)",
						background: "color-mix(in oklch, var(--accent) 10%, transparent)",
						fontSize: 13,
						lineHeight: 1.4,
					}}
				>
					<Sparkles
						size={16}
						style={{ marginTop: 1, color: "var(--accent)", flexShrink: 0 }}
					/>
					<span>
						<strong style={{ color: "var(--accent)" }}>
							{data.v2CreditDays}-day credit applied.
						</strong>{" "}
						{data.v2CreditNote ??
							`Your renewal was extended by ${data.v2CreditDays} days with the v2 upgrade.`}
					</span>
				</div>
			) : null}

			<div style={{ marginTop: 16 }}>
				{data.stripeCustomerId ? (
					<button
						className="btn"
						disabled={busy === "__portal__"}
						onClick={onPortal}
						type="button"
					>
						<ExternalLink size={14} />{" "}
						{busy === "__portal__" ? "Redirecting…" : "Manage subscription"}
					</button>
				) : (
					<p style={{ fontSize: 13, color: "var(--fg-3)" }}>
						Contact{" "}
						<a href="mailto:support@heimdallone.com">support@heimdallone.com</a>{" "}
						to change or cancel your plan.
					</p>
				)}
			</div>
		</div>
	);
}

function PlanGrid({
	data,
	cycle,
	busy,
	onSetCycle,
	onCheckout,
	onPortal,
}: {
	data: BillingStatus;
	cycle: BillingCycle;
	busy: string | null;
	onSetCycle: (c: BillingCycle) => void;
	onCheckout: (plan: "starter" | "business") => void;
	onPortal: (plan: string) => void;
}) {
	const currentIndex = PLAN_ORDER.indexOf(data.plan as PlanKey);
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
					{data.trial.isTrial ? "Choose a plan" : "Plans"}
				</h2>
				<div
					style={{
						display: "inline-flex",
						gap: 4,
						padding: 4,
						borderRadius: 8,
						border: "1px solid var(--line)",
						background: "var(--bg-2)",
						fontSize: 13,
					}}
				>
					{(["monthly", "yearly"] as const).map((c) => (
						<button
							className="btn btn-ghost"
							key={c}
							onClick={() => onSetCycle(c)}
							style={{
								textTransform: "capitalize",
								background: cycle === c ? "var(--bg-1)" : "transparent",
								color: cycle === c ? "var(--fg)" : "var(--fg-3)",
							}}
							type="button"
						>
							{c}
							{c === "yearly" ? " · −20%" : ""}
						</button>
					))}
				</div>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
					gap: 16,
				}}
			>
				{PAID_PLANS.map((planKey) => (
					<PlanCard
						busy={busy}
						currentPeriodEnd={data.currentPeriodEnd}
						cycle={cycle}
						isAbove={PLAN_ORDER.indexOf(planKey) > currentIndex}
						isBelow={PLAN_ORDER.indexOf(planKey) < currentIndex}
						isCurrent={planKey === data.plan}
						key={planKey}
						onCheckout={onCheckout}
						onPortal={onPortal}
						planKey={planKey}
						spec={PLANS[planKey]}
						stripeCustomerId={data.stripeCustomerId}
					/>
				))}
			</div>
		</div>
	);
}

function PlanCard({
	planKey,
	spec,
	cycle,
	isCurrent,
	isAbove,
	isBelow,
	stripeCustomerId,
	currentPeriodEnd,
	busy,
	onCheckout,
	onPortal,
}: {
	planKey: Exclude<PlanKey, "trial">;
	spec: PlanSpec;
	cycle: BillingCycle;
	isCurrent: boolean;
	isAbove: boolean;
	isBelow: boolean;
	stripeCustomerId: string | null;
	currentPeriodEnd: string | null;
	busy: string | null;
	onCheckout: (plan: "starter" | "business") => void;
	onPortal: (plan: string) => void;
}) {
	const price = cycle === "monthly" ? spec.monthly : spec.yearly;
	const note = cycle === "monthly" ? spec.monthlyNote : spec.yearlyNote;
	const isEnterprise = planKey === "enterprise";
	const highlighted = planKey === "business";

	return (
		<div
			className="card"
			style={{
				padding: 20,
				display: "flex",
				flexDirection: "column",
				borderColor: highlighted ? "var(--accent)" : undefined,
			}}
		>
			{highlighted && !isCurrent ? (
				<span
					style={{
						alignSelf: "flex-start",
						marginBottom: 10,
						fontSize: 10.5,
						fontWeight: 700,
						textTransform: "uppercase",
						letterSpacing: "0.04em",
						color: "var(--accent)",
					}}
				>
					Most popular
				</span>
			) : null}
			<h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{spec.label}</h3>
			<div
				style={{
					marginTop: 8,
					display: "flex",
					alignItems: "baseline",
					gap: 4,
				}}
			>
				<span style={{ fontSize: 22, fontWeight: 700 }}>{price}</span>
				{note ? (
					<span style={{ fontSize: 13, color: "var(--fg-3)" }}>{note}</span>
				) : null}
			</div>
			<p style={{ marginTop: 4, fontSize: 12, color: "var(--fg-3)" }}>
				{spec.employeeLimit} · {spec.entityLimit}
			</p>
			<ul
				style={{
					marginTop: 16,
					flex: 1,
					listStyle: "none",
					padding: 0,
					display: "flex",
					flexDirection: "column",
					gap: 6,
				}}
			>
				{spec.features.map((feat) => (
					<li
						key={feat}
						style={{
							display: "flex",
							gap: 8,
							fontSize: 13,
							alignItems: "flex-start",
						}}
					>
						<CheckCircle2
							color="var(--accent)"
							size={15}
							style={{ marginTop: 2, flexShrink: 0 }}
						/>
						{feat}
					</li>
				))}
			</ul>
			<div style={{ marginTop: 18 }}>
				<PlanCta
					busy={busy}
					currentPeriodEnd={currentPeriodEnd}
					isAbove={isAbove}
					isBelow={isBelow}
					isCurrent={isCurrent}
					isEnterprise={isEnterprise}
					onCheckout={onCheckout}
					onPortal={onPortal}
					planKey={planKey}
					spec={spec}
					stripeCustomerId={stripeCustomerId}
				/>
			</div>
		</div>
	);
}

function PlanCta({
	planKey,
	spec,
	isCurrent,
	isAbove,
	isBelow,
	isEnterprise,
	stripeCustomerId,
	currentPeriodEnd,
	busy,
	onCheckout,
	onPortal,
}: {
	planKey: Exclude<PlanKey, "trial">;
	spec: PlanSpec;
	isCurrent: boolean;
	isAbove: boolean;
	isBelow: boolean;
	isEnterprise: boolean;
	stripeCustomerId: string | null;
	currentPeriodEnd: string | null;
	busy: string | null;
	onCheckout: (plan: "starter" | "business") => void;
	onPortal: (plan: string) => void;
}) {
	if (isCurrent) {
		return (
			<button
				className="btn btn-outline"
				disabled
				style={{ width: "100%" }}
				type="button"
			>
				Current plan
			</button>
		);
	}
	if (isEnterprise) {
		return (
			<a
				className="btn btn-outline"
				href="mailto:sales@heimdallone.com?subject=Enterprise%20Plan%20Enquiry"
				style={{ width: "100%" }}
			>
				<ExternalLink size={14} /> Contact sales
			</a>
		);
	}
	if (isAbove) {
		return (
			<button
				className="btn btn-primary"
				disabled={busy === planKey}
				onClick={() => onCheckout(planKey as "starter" | "business")}
				style={{ width: "100%" }}
				type="button"
			>
				{busy === planKey ? (
					"Redirecting…"
				) : (
					<>
						<Sparkles size={14} /> Upgrade to {spec.label}
					</>
				)}
			</button>
		);
	}
	if (isBelow && stripeCustomerId) {
		return (
			<button
				className="btn btn-outline"
				disabled={busy === planKey}
				onClick={() => onPortal(planKey)}
				style={{ width: "100%" }}
				type="button"
			>
				{busy === planKey
					? "Redirecting…"
					: currentPeriodEnd
						? `Downgrade — effective ${formatDate(currentPeriodEnd)}`
						: `Switch to ${spec.label}`}
			</button>
		);
	}
	return (
		<a
			className="btn btn-outline"
			href={`mailto:support@heimdallone.com?subject=Downgrade+to+${spec.label}`}
			style={{ width: "100%" }}
		>
			<ExternalLink size={14} /> Contact support
		</a>
	);
}

function InvoiceHistory({
	invoices,
	isLoading,
	stripeCustomerId,
}: {
	invoices: InvoiceRow[];
	isLoading: boolean;
	stripeCustomerId: string | null;
}) {
	if (!(isLoading || invoices.length > 0 || stripeCustomerId)) {
		return null;
	}
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			<h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
				Invoice history
			</h2>
			{isLoading ? (
				<div className="card" style={{ height: 80 }} />
			) : invoices.length === 0 ? (
				<p style={{ fontSize: 13, color: "var(--fg-3)" }}>No invoices yet.</p>
			) : (
				<div className="card" style={{ overflow: "hidden", padding: 0 }}>
					<table className="table" style={{ width: "100%" }}>
						<thead>
							<tr>
								<th>Date</th>
								<th>Invoice #</th>
								<th>Amount</th>
								<th>Status</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{invoices.map((inv) => (
								<tr key={inv.id}>
									<td>{formatDate(inv.periodStart)}</td>
									<td style={{ fontFamily: "monospace" }}>
										{inv.number ?? inv.id}
									</td>
									<td>
										{(inv.amountPaid / 100).toFixed(2)}{" "}
										{inv.currency?.toUpperCase() ?? "USD"}
									</td>
									<td style={{ textTransform: "capitalize" }}>
										{inv.status ?? "open"}
									</td>
									<td>
										<div style={{ display: "flex", gap: 12 }}>
											{inv.pdfUrl ? (
												<a href={inv.pdfUrl} rel="noreferrer" target="_blank">
													PDF
												</a>
											) : null}
											{inv.hostedUrl ? (
												<a
													href={inv.hostedUrl}
													rel="noreferrer"
													target="_blank"
												>
													View
												</a>
											) : null}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
