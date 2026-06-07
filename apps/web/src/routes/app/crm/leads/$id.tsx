import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/crm.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/crm/badge";
import { CrmTabs } from "@/features/crm/crm-tabs";
import {
	formatMoney,
	leadStatusLabel,
	leadStatusTone,
	sourceLabel,
} from "@/features/crm/labels";
import type { LeadRow } from "@/features/crm/types";
import { canManageCrm, canViewCrm } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/crm/leads/$id")({
	component: CrmLeadDetailPage,
});

function CrmLeadDetailPage() {
	const { id } = Route.useParams();
	const org = useContext(OrgCtx);
	const canView = canViewCrm(org.memberRole);
	const canManage = canManageCrm(org.memberRole);
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);

	const lead = useQuery(
		orpc.crm.leads.getById.queryOptions({ input: { id }, enabled: canView })
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

	if (lead.isError) {
		return (
			<div className="page">
				<CrmTabs />
				<EmptyState
					compact
					description="This lead is unavailable or outside your access."
					title="Lead unavailable"
				/>
			</div>
		);
	}

	const l = lead.data as LeadRow | undefined;
	const isConverted = l?.status === "converted";

	async function convert() {
		setBusy(true);
		try {
			const res = (await client.crm.leads.convert({ id })) as {
				customerId: string;
			};
			toast.success("Lead converted to a customer + deal.");
			qc.invalidateQueries({
				predicate: (q) => String(q.queryKey[0] ?? "").includes("crm"),
			});
			navigate({
				to: "/app/crm/customers/$id",
				params: { id: res.customerId },
			});
		} catch (e) {
			toast.error((e as { message?: string }).message ?? "Could not convert.");
			setBusy(false);
		}
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Leads</span>
					</div>
					<h1 className="page-title">{l?.name ?? "Lead"}</h1>
				</div>
				{canManage && l && !isConverted ? (
					<button
						className="crm-btn primary"
						disabled={busy}
						onClick={convert}
						type="button"
					>
						{busy ? "Converting…" : "Convert lead"}
					</button>
				) : null}
			</div>

			<CrmTabs />

			{lead.isLoading || !l ? (
				<div className="crm-skeleton" />
			) : (
				<>
					<div className="crm-cell-badges" style={{ marginBottom: 12 }}>
						<Badge tone={leadStatusTone(l.status)}>
							{leadStatusLabel(l.status)}
						</Badge>
						{isConverted ? (
							<span className="crm-sub">
								This lead is converted and read-only.
							</span>
						) : null}
					</div>
					<div className="crm-detail-grid">
						<div className="crm-field">
							<span className="crm-field-lbl">Company</span>
							<span className="crm-field-val">{l.companyName ?? "—"}</span>
						</div>
						<div className="crm-field">
							<span className="crm-field-lbl">Email</span>
							<span className="crm-field-val">{l.contactEmail ?? "—"}</span>
						</div>
						<div className="crm-field">
							<span className="crm-field-lbl">Phone</span>
							<span className="crm-field-val">{l.contactPhone ?? "—"}</span>
						</div>
						<div className="crm-field">
							<span className="crm-field-lbl">Source</span>
							<span className="crm-field-val">{sourceLabel(l.sourceKey)}</span>
						</div>
						<div className="crm-field">
							<span className="crm-field-lbl">Owner</span>
							<span className="crm-field-val">
								{l.ownerName ?? "Unassigned"}
							</span>
						</div>
						<div className="crm-field">
							<span className="crm-field-lbl">Estimated value</span>
							<span className="crm-field-val">
								{formatMoney(l.estimatedValue, "GYD")}
							</span>
						</div>
					</div>
					{l.description ? (
						<div className="crm-section">
							<div className="crm-section-title">Notes</div>
							<p className="crm-field-val">{l.description}</p>
						</div>
					) : null}
				</>
			)}
		</div>
	);
}
