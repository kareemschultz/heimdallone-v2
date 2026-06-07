import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Handshake } from "lucide-react";
import { useContext, useEffect, useState } from "react";
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

export const Route = createFileRoute("/app/crm/leads/")({
	component: CrmLeadsPage,
});

function invalidateCrm(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("crm"),
	});
}

function NewLeadDialog({ onClose }: { onClose: () => void }) {
	const qc = useQueryClient();
	const [name, setName] = useState("");
	const [company, setCompany] = useState("");
	const [email, setEmail] = useState("");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	async function save() {
		if (!name.trim()) {
			return;
		}
		setBusy(true);
		try {
			await client.crm.leads.create({
				name: name.trim(),
				companyName: company.trim() || null,
				contactEmail: email.trim() || null,
				status: "new",
			});
			toast.success("Lead created.");
			invalidateCrm(qc);
			onClose();
		} catch (e) {
			toast.error(
				(e as { message?: string }).message ?? "Could not create lead."
			);
			setBusy(false);
		}
	}

	return (
		<div className="crm-dialog-backdrop">
			<div
				aria-labelledby="crm-new-lead"
				aria-modal="true"
				className="crm-dialog"
				role="dialog"
			>
				<h2 id="crm-new-lead">New lead</h2>
				<div className="crm-form-field">
					<label htmlFor="nl-name">Name</label>
					<input
						id="nl-name"
						onChange={(e) => setName(e.target.value)}
						value={name}
					/>
				</div>
				<div className="crm-form-field">
					<label htmlFor="nl-co">Company</label>
					<input
						id="nl-co"
						onChange={(e) => setCompany(e.target.value)}
						value={company}
					/>
				</div>
				<div className="crm-form-field">
					<label htmlFor="nl-email">Email</label>
					<input
						id="nl-email"
						onChange={(e) => setEmail(e.target.value)}
						value={email}
					/>
				</div>
				<div className="crm-dialog-actions">
					<button
						className="crm-btn"
						disabled={busy}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="crm-btn primary"
						disabled={busy}
						onClick={save}
						type="button"
					>
						{busy ? "Saving…" : "Create lead"}
					</button>
				</div>
			</div>
		</div>
	);
}

function CrmLeadsPage() {
	const org = useContext(OrgCtx);
	const canView = canViewCrm(org.memberRole);
	const canManage = canManageCrm(org.memberRole);
	const [status, setStatus] = useState("");
	const [dialog, setDialog] = useState(false);

	const leads = useQuery(
		orpc.crm.leads.list.queryOptions({
			input: status ? { status: status as never } : {},
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
					description="CRM is available to the sales team, managers, and finance."
					icon={<Handshake size={28} />}
					title="You don't have access to CRM"
				/>
			</div>
		);
	}

	const rows = (leads.data as LeadRow[] | undefined) ?? [];

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Leads</span>
					</div>
					<h1 className="page-title">Leads</h1>
					<p className="page-sub">
						Capture, qualify, and convert new business.
					</p>
				</div>
				{canManage ? (
					<button
						className="crm-btn primary"
						onClick={() => setDialog(true)}
						type="button"
					>
						New lead
					</button>
				) : null}
			</div>

			<CrmTabs />

			<div className="crm-toolbar">
				<select onChange={(e) => setStatus(e.target.value)} value={status}>
					<option value="">All statuses</option>
					<option value="new">New</option>
					<option value="contacted">Contacted</option>
					<option value="qualified">Qualified</option>
					<option value="unqualified">Unqualified</option>
					<option value="converted">Converted</option>
				</select>
			</div>

			{leads.isLoading ? <div className="crm-skeleton" /> : null}
			{leads.isError ? (
				<EmptyState
					compact
					description="Could not load leads."
					title="Something went wrong"
				/>
			) : null}

			{!(leads.isLoading || leads.isError) && rows.length === 0 ? (
				<EmptyState
					compact
					description={
						canManage ? "Add your first lead to get started." : "No leads yet."
					}
					icon={<Handshake size={26} />}
					title="No leads"
				/>
			) : null}

			{!(leads.isLoading || leads.isError) && rows.length > 0 ? (
				<table className="crm-table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Company</th>
							<th>Status</th>
							<th>Source</th>
							<th>Owner</th>
							<th className="num">Est. value</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((l) => (
							<tr key={l.id}>
								<td>
									<Link
										className="crm-name-link"
										params={{ id: l.id }}
										to="/app/crm/leads/$id"
									>
										{l.name}
									</Link>
								</td>
								<td>{l.companyName ?? "—"}</td>
								<td>
									<Badge tone={leadStatusTone(l.status)}>
										{leadStatusLabel(l.status)}
									</Badge>
								</td>
								<td>{sourceLabel(l.sourceKey)}</td>
								<td>{l.ownerName ?? "Unassigned"}</td>
								<td className="num">{formatMoney(l.estimatedValue, "GYD")}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}

			{dialog ? <NewLeadDialog onClose={() => setDialog(false)} /> : null}
		</div>
	);
}
