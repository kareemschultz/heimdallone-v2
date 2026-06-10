import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
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

const customerColumns: ColumnDef<CustomerRow, unknown>[] = [
	{
		accessorKey: "name",
		header: "Name",
		cell: ({ row }) => (
			<Link
				className="crm-name-link"
				params={{ id: row.original.id }}
				to="/app/crm/customers/$id"
			>
				{row.original.name}
			</Link>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge tone={customerStatusTone(row.original.status)}>
				{customerStatusLabel(row.original.status)}
			</Badge>
		),
	},
	{
		accessorKey: "industry",
		header: "Industry",
		cell: ({ row }) => <>{row.original.industry ?? "—"}</>,
	},
	{
		accessorKey: "ownerName",
		header: "Owner",
		cell: ({ row }) => <>{row.original.ownerName ?? "Unassigned"}</>,
	},
	{
		accessorKey: "openDealCount",
		header: "Open deals",
		cell: ({ row }) => (
			<span className="num">{row.original.openDealCount}</span>
		),
	},
];

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

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={customerColumns}
					data={rows as CustomerRow[]}
					emptyState={
						<EmptyState
							compact
							description="No customers yet."
							icon={<Handshake size={26} />}
							title="No customers"
						/>
					}
					isError={customers.isError}
					isLoading={customers.isLoading}
				/>
			</div>
		</div>
	);
}
