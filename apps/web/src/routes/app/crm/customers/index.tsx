import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Handshake } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/crm.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/crm/badge";
import { CrmTabs } from "@/features/crm/crm-tabs";
import { customerStatusLabel, customerStatusTone } from "@/features/crm/labels";
import type { CustomerRow } from "@/features/crm/types";
import { canViewCrm } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/crm/customers/")({
	component: CrmCustomersPage,
});

function CrmCustomersPage() {
	const org = useContext(OrgCtx);
	const canView = canViewCrm(org.memberRole);
	const [search, setSearch] = useState("");

	const customers = useQuery(
		orpc.crm.customers.list.queryOptions({ input: {}, enabled: canView })
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">CRM</h1>
				</div>
				<EmptyState
					description="CRM is available to the sales team, managers, and finance."
					icon={<Handshake size={28} />}
					title="You don't have access to CRM"
				/>
			</div>
		);
	}

	const all = (customers.data as CustomerRow[] | undefined) ?? [];
	const q = search.toLowerCase();
	const rows = q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all;

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Customers</span>
					</div>
					<h1 className="page-title">Customers</h1>
					<p className="page-sub">
						Your accounts and the contacts within them.
					</p>
				</div>
			</div>

			<CrmTabs />

			<div className="crm-toolbar">
				<input
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search customers…"
					value={search}
				/>
			</div>

			{customers.isLoading ? <div className="crm-skeleton" /> : null}
			{customers.isError ? (
				<EmptyState
					compact
					description="Could not load customers."
					title="Something went wrong"
				/>
			) : null}

			{!(customers.isLoading || customers.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description="No customers yet."
					icon={<Handshake size={26} />}
					title="No customers"
				/>
			) : null}

			{!(customers.isLoading || customers.isError) && rows.length > 0 ? (
				<table className="crm-table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Status</th>
							<th>Industry</th>
							<th>Owner</th>
							<th className="num">Open deals</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((c) => (
							<tr key={c.id}>
								<td>
									<Link
										className="crm-name-link"
										params={{ id: c.id }}
										to="/app/crm/customers/$id"
									>
										{c.name}
									</Link>
								</td>
								<td>
									<Badge tone={customerStatusTone(c.status)}>
										{customerStatusLabel(c.status)}
									</Badge>
								</td>
								<td>{c.industry ?? "—"}</td>
								<td>{c.ownerName ?? "Unassigned"}</td>
								<td className="num">{c.openDealCount}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}
		</div>
	);
}
