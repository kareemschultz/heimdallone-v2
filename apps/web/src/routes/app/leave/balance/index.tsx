import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Info } from "lucide-react";
import { useContext } from "react";

import "@/styles/leave.css";
import { EmptyState } from "@/components/empty-state";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/leave/balance/")({
	component: WhyThisBalancePage,
});

interface BalanceLine {
	accrualAmount: string;
	accrualPeriod: string;
	available: string;
	carryForward: string;
	expiryDate: string | Date | null;
	explanation: string;
	isPaid: boolean;
	leaveTypeName: string;
	pending: number;
	used: string;
}

interface Explanation {
	balances: BalanceLine[];
	policy: {
		countryCode: string;
		effectiveFrom: string | Date | null;
		name: string;
	} | null;
	policyNotice: string | null;
	unverifiedNotice: string | null;
}

function num(v: string | number): string {
	const n = Number(v);
	return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function BalanceCard({ b }: { b: BalanceLine }) {
	return (
		<div className="lp-balance-card">
			<div className="lp-balance-head">
				<span className="lp-balance-name">{b.leaveTypeName}</span>
				<span className={`lp-badge tone-${b.isPaid ? "success" : "neutral"}`}>
					{b.isPaid ? "Paid" : "Unpaid"}
				</span>
			</div>
			<div className="lp-balance-grid">
				<div>
					<span className="lp-balance-k">Available</span>
					<span className="lp-balance-v">{num(b.available)}</span>
				</div>
				<div>
					<span className="lp-balance-k">Used</span>
					<span className="lp-balance-v">{num(b.used)}</span>
				</div>
				<div>
					<span className="lp-balance-k">Pending</span>
					<span className="lp-balance-v">{num(b.pending)}</span>
				</div>
				<div>
					<span className="lp-balance-k">Carried forward</span>
					<span className="lp-balance-v">{num(b.carryForward)}</span>
				</div>
			</div>
			<p className="lp-balance-explain">{b.explanation}</p>
		</div>
	);
}

function WhyThisBalancePage() {
	const org = useContext(OrgCtx);
	const explain = useQuery(
		orpc.leavePolicy.balanceExplanation.forSelf.queryOptions({ input: {} })
	);

	const data = explain.data as Explanation | undefined;
	const balances = data?.balances ?? [];

	return (
		<div className="page">
			<Link className="lp-back" to="/app/leave">
				<ArrowLeft size={14} /> Back to leave
			</Link>
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<Link to="/app/leave">Leave</Link>
						<span className="sep">/</span>
						<span>My balance</span>
					</div>
					<h1 className="page-title">Why this balance?</h1>
					<p className="page-sub">
						How each of your leave balances is calculated.
					</p>
				</div>
			</div>

			{data?.policy ? (
				<div className="lp-policy-context">
					<Info size={14} />
					<span>
						Under <strong>{data.policy.name}</strong>
						{data.policy.effectiveFrom
							? ` (effective ${new Date(data.policy.effectiveFrom).toLocaleDateString()})`
							: ""}
						.
					</span>
				</div>
			) : null}
			{data?.policyNotice ? (
				<div className="lp-notice" role="note">
					<Info size={14} />
					<span>{data.policyNotice}</span>
				</div>
			) : null}
			{data?.unverifiedNotice ? (
				<div className="lp-notice warn" role="note">
					<Info size={14} />
					<span>{data.unverifiedNotice}</span>
				</div>
			) : null}

			{explain.isLoading ? (
				<div className="lp-grid">
					{[0, 1].map((i) => (
						<div className="lp-card lp-card-skeleton" key={i} />
					))}
				</div>
			) : null}

			{explain.isError ? (
				<EmptyState
					compact
					description="Could not load your leave balance explanation."
					title="Something went wrong"
				/>
			) : null}

			{!(explain.isLoading || explain.isError) && balances.length === 0 ? (
				<EmptyState
					compact
					description="You don't have any leave balances on file yet."
					title="No leave balances"
				/>
			) : null}

			{balances.length > 0 ? (
				<div className="lp-balance-list">
					{balances.map((b) => (
						<BalanceCard b={b} key={b.leaveTypeName} />
					))}
				</div>
			) : null}
		</div>
	);
}
