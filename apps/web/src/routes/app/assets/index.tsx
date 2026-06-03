import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useContext } from "react";

import "@/styles/assets.css";
import { AssetsTabs } from "@/features/assets/assets-tabs";
import { canViewAssets } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/assets/")({
	component: AssetsOverviewPage,
});

function useCount(
	input: {
		status?: "available" | "in_use" | "retired";
	},
	enabled: boolean
): number {
	const q = useQuery(
		orpc.assets.list.queryOptions({
			input: { page: 1, pageSize: 1, ...input },
			enabled,
		})
	);
	return (q.data as { total?: number } | undefined)?.total ?? 0;
}

function AssetsOverviewPage() {
	const org = useContext(OrgCtx);
	const canView = canViewAssets(org.memberRole);

	const total = useCount({}, canView);
	const available = useCount({ status: "available" }, canView);
	const inUse = useCount({ status: "in_use" }, canView);
	const retired = useCount({ status: "retired" }, canView);
	const openRequests = useQuery(
		orpc.assets.requests.list.queryOptions({
			input: { page: 1, pageSize: 1, status: "requested" },
			enabled: canView,
		})
	);
	const requestCount =
		(openRequests.data as { total?: number } | undefined)?.total ?? 0;

	// Employees (and other non-viewers) go straight to their own assets.
	if (!canView) {
		return <Navigate to="/app/assets/my" />;
	}

	const tiles = [
		{ label: "Total assets", value: total },
		{ label: "Available", value: available },
		{ label: "In use", value: inUse },
		{ label: "Retired", value: retired },
		{ label: "Open requests", value: requestCount },
	];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Assets</span>
					</div>
					<h1 className="page-title">Assets</h1>
					<p className="page-sub">
						Company property tracking, allocation, and returns.
					</p>
				</div>
			</div>

			<AssetsTabs />

			<div className="asset-tiles">
				{tiles.map((t) => (
					<div className="asset-tile" key={t.label}>
						<span className="asset-tile-val">{t.value}</span>
						<span className="asset-tile-lbl">{t.label}</span>
					</div>
				))}
			</div>

			<div className="asset-quicklinks">
				<Link className="asset-quicklink" to="/app/assets/inventory">
					<span className="asset-ql-title">Inventory</span>
					<span className="asset-ql-sub">Browse, assign, return, retire</span>
				</Link>
				<Link className="asset-quicklink" to="/app/assets/requests">
					<span className="asset-ql-title">Requests</span>
					<span className="asset-ql-sub">
						{requestCount} pending request{requestCount === 1 ? "" : "s"}
					</span>
				</Link>
				<Link className="asset-quicklink" to="/app/assets/categories">
					<span className="asset-ql-title">Categories</span>
					<span className="asset-ql-sub">Organise your assets</span>
				</Link>
			</div>
		</div>
	);
}
