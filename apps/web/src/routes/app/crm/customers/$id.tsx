import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useContext } from "react";

import "@/styles/crm.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/crm/badge";
import { CrmTabs } from "@/features/crm/crm-tabs";
import {
	customerStatusLabel,
	customerStatusTone,
	dealStatusLabel,
	dealStatusTone,
	formatMoney,
	handoffStatusLabel,
} from "@/features/crm/labels";
import type {
	ContactRow,
	CustomerRow,
	DealRow,
	HandoffRow,
} from "@/features/crm/types";
import { canViewCrm } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/crm/customers/$id")({
	component: CrmCustomerDetailPage,
});

function CrmCustomerDetailPage() {
	const { id } = Route.useParams();
	const org = useContext(OrgCtx);
	const canView = canViewCrm(org.memberRole);

	const customer = useQuery(
		orpc.crm.customers.getById.queryOptions({ input: { id }, enabled: canView })
	);
	const contacts = useQuery(
		orpc.crm.contacts.list.queryOptions({
			input: { customerId: id },
			enabled: canView,
		})
	);
	const deals = useQuery(
		orpc.crm.deals.list.queryOptions({ input: {}, enabled: canView })
	);
	const handoffs = useQuery(
		orpc.crm.customers.handoffs.queryOptions({
			input: { customerId: id },
			enabled: canView,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">CRM</h1>
				</div>
				<EmptyState
					description="No access."
					title="You don't have access to CRM"
				/>
			</div>
		);
	}

	if (customer.isError) {
		return (
			<div className="page">
				<CrmTabs />
				<EmptyState
					compact
					description="This customer is unavailable."
					title="Customer unavailable"
				/>
			</div>
		);
	}

	const c = customer.data as CustomerRow | undefined;
	const contactRows = (contacts.data as ContactRow[] | undefined) ?? [];
	const dealRows = ((deals.data as DealRow[] | undefined) ?? []).filter(
		(d) => d.customerId === id
	);
	const handoffRows = (handoffs.data as HandoffRow[] | undefined) ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Customers</span>
					</div>
					<h1 className="page-title">{c?.name ?? "Customer"}</h1>
				</div>
			</div>

			<CrmTabs />

			{customer.isLoading || !c ? (
				<div className="crm-skeleton" />
			) : (
				<>
					<div className="crm-cell-badges" style={{ marginBottom: 12 }}>
						<Badge tone={customerStatusTone(c.status)}>
							{customerStatusLabel(c.status)}
						</Badge>
					</div>
					<div className="crm-detail-grid">
						<div className="crm-field">
							<span className="crm-field-lbl">Industry</span>
							<span className="crm-field-val">{c.industry ?? "—"}</span>
						</div>
						<div className="crm-field">
							<span className="crm-field-lbl">Email</span>
							<span className="crm-field-val">{c.email ?? "—"}</span>
						</div>
						<div className="crm-field">
							<span className="crm-field-lbl">Phone</span>
							<span className="crm-field-val">{c.phone ?? "—"}</span>
						</div>
						<div className="crm-field">
							<span className="crm-field-lbl">Owner</span>
							<span className="crm-field-val">
								{c.ownerName ?? "Unassigned"}
							</span>
						</div>
					</div>

					<div className="crm-section">
						<div className="crm-section-title">
							Contacts ({contactRows.length})
						</div>
						{contactRows.length === 0 ? (
							<p className="crm-sub">No contacts yet.</p>
						) : (
							<table className="crm-table">
								<tbody>
									{contactRows.map((ct) => (
										<tr key={ct.id}>
											<td className="crm-name">
												{ct.firstName} {ct.lastName ?? ""}
												{ct.isPrimary ? (
													<span
														className="crm-badge tone-info"
														style={{ marginLeft: 8 }}
													>
														Primary
													</span>
												) : null}
											</td>
											<td>{ct.jobTitle ?? "—"}</td>
											<td>{ct.email ?? "—"}</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>

					<div className="crm-section">
						<div className="crm-section-title">Deals ({dealRows.length})</div>
						{dealRows.length === 0 ? (
							<p className="crm-sub">No deals yet.</p>
						) : (
							<table className="crm-table">
								<tbody>
									{dealRows.map((d) => (
										<tr key={d.id}>
											<td>
												<Link
													className="crm-name-link"
													params={{ id: d.id }}
													to="/app/crm/deals/$id"
												>
													{d.title}
												</Link>
											</td>
											<td>
												<Badge tone={dealStatusTone(d.status)}>
													{dealStatusLabel(d.status)}
												</Badge>
											</td>
											<td className="num">
												{formatMoney(d.value, d.currency)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>

					<div className="crm-section">
						<div className="crm-section-title">
							Delivery — project handoffs ({handoffRows.length})
						</div>
						<p className="crm-sub">
							Won deals handed off for delivery. Linking to a real project
							happens in Projects.
						</p>
						{handoffRows.map((h) => (
							<div className="crm-attention-row" key={h.id}>
								<Badge tone="info">{handoffStatusLabel(h.handoffStatus)}</Badge>
								<span>{h.handoffNote ?? "Handoff"}</span>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}
