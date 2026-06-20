import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Handshake, TrendingDown } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/crm.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { CrmTabs } from "@/features/crm/crm-tabs";
import { formatMoney } from "@/features/crm/labels";
import type { CustomerRow, DealRow, StageRow } from "@/features/crm/types";
import { canManageCrm, canViewCrm } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/crm/deals/")({
	component: CrmDealsPage,
});

function invalidateCrm(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => String(q.queryKey[0] ?? "").includes("crm"),
	});
}

function NewDealDialog({
	customers,
	stages,
	onClose,
}: {
	customers: CustomerRow[];
	stages: StageRow[];
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const [title, setTitle] = useState("");
	const [customerId, setCustomerId] = useState("");
	const [stageId, setStageId] = useState(stages[0]?.id ?? "");
	const [value, setValue] = useState("");
	const [busy, setBusy] = useState(false);

	async function save() {
		if (!(title.trim() && customerId && stageId)) {
			toast.error("Title, customer, and stage are required.");
			return;
		}
		setBusy(true);
		try {
			await client.crm.deals.create({
				title: title.trim(),
				customerId,
				stageId,
				value: value ? Number(value) : null,
			});
			toast.success("Deal created.");
			invalidateCrm(qc);
			onClose();
		} catch (e) {
			toast.error(
				(e as { message?: string }).message ?? "Could not create deal."
			);
			setBusy(false);
		}
	}

	return (
		<Modal
			footer={
				<>
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
						{busy ? "Saving…" : "Create deal"}
					</button>
				</>
			}
			icon={<Handshake size={18} />}
			intro="Add a new deal to the pipeline and assign it to a customer and stage."
			onClose={onClose}
			title="New deal"
			wide
		>
			<div className="crm-form-field">
				<label htmlFor="nd-title">Title</label>
				<input
					id="nd-title"
					onChange={(e) => setTitle(e.target.value)}
					value={title}
				/>
			</div>
			<div className="crm-form-field">
				<label htmlFor="nd-cust">Customer</label>
				<select
					id="nd-cust"
					onChange={(e) => setCustomerId(e.target.value)}
					value={customerId}
				>
					<option value="">Select a customer…</option>
					{customers.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
			</div>
			<div className="crm-form-field">
				<label htmlFor="nd-stage">Stage</label>
				<select
					id="nd-stage"
					onChange={(e) => setStageId(e.target.value)}
					value={stageId}
				>
					{stages.map((s) => (
						<option key={s.id} value={s.id}>
							{s.name}
						</option>
					))}
				</select>
			</div>
			<div className="crm-form-field">
				<label htmlFor="nd-val">Value</label>
				<input
					id="nd-val"
					inputMode="decimal"
					onChange={(e) => setValue(e.target.value)}
					placeholder="0"
					value={value}
				/>
			</div>
		</Modal>
	);
}

function LostReasonDialog({
	onCancel,
	onConfirm,
}: {
	onCancel: () => void;
	onConfirm: (reason: string) => void;
}) {
	const [reason, setReason] = useState("");
	return (
		<Modal
			footer={
				<>
					<button className="crm-btn" onClick={onCancel} type="button">
						Cancel
					</button>
					<button
						className="crm-btn primary"
						disabled={!reason.trim()}
						onClick={() => onConfirm(reason.trim())}
						type="button"
					>
						Mark lost
					</button>
				</>
			}
			icon={<TrendingDown size={18} />}
			intro="Provide a reason so your team can learn from it. This is required before marking the deal lost."
			onClose={onCancel}
			title="Mark deal as lost"
		>
			<div className="crm-form-field">
				<label htmlFor="lost-reason">Reason (required)</label>
				<textarea
					id="lost-reason"
					onChange={(e) => setReason(e.target.value)}
					rows={3}
					value={reason}
				/>
			</div>
		</Modal>
	);
}

function CrmDealsPage() {
	const org = useContext(OrgCtx);
	const canView = canViewCrm(org.memberRole);
	const canManage = canManageCrm(org.memberRole);
	const qc = useQueryClient();
	const [newOpen, setNewOpen] = useState(false);
	const [lostPending, setLostPending] = useState<{
		dealId: string;
		stageId: string;
	} | null>(null);

	const stages = useQuery(
		orpc.crm.stages.list.queryOptions({ enabled: canView })
	);
	const deals = useQuery(
		orpc.crm.deals.list.queryOptions({ input: {}, enabled: canView })
	);
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

	const stageRows = ((stages.data as StageRow[] | undefined) ?? [])
		.slice()
		.sort((a, b) => a.position - b.position);
	const dealRows = (deals.data as DealRow[] | undefined) ?? [];
	const customerRows = (customers.data as CustomerRow[] | undefined) ?? [];

	async function moveStage(
		dealId: string,
		stageId: string,
		lostReason?: string
	) {
		try {
			await client.crm.deals.advanceStage({ id: dealId, stageId, lostReason });
			toast.success("Deal moved.");
			invalidateCrm(qc);
		} catch (e) {
			toast.error(
				(e as { message?: string }).message ?? "Could not move deal."
			);
		}
	}

	function onStageChange(deal: DealRow, stageId: string) {
		const target = stageRows.find((s) => s.id === stageId);
		if (target?.isLost) {
			setLostPending({ dealId: deal.id, stageId });
			return;
		}
		moveStage(deal.id, stageId);
	}

	async function handoff(dealId: string) {
		try {
			await client.crm.deals.handoff({ id: dealId });
			toast.success("Handoff created — ready to staff.");
			invalidateCrm(qc);
		} catch (e) {
			toast.error((e as { message?: string }).message ?? "Could not hand off.");
		}
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Deals</span>
					</div>
					<h1 className="page-title">Pipeline</h1>
					<p className="page-sub">
						Your deals by stage. Move a deal to advance it.
					</p>
				</div>
				{canManage ? (
					<button
						className="crm-btn primary"
						onClick={() => setNewOpen(true)}
						type="button"
					>
						New deal
					</button>
				) : null}
			</div>

			<CrmTabs />

			{deals.isLoading || stages.isLoading ? (
				<div className="crm-skeleton" />
			) : null}
			{deals.isError || stages.isError ? (
				<EmptyState
					compact
					description="Could not load the pipeline."
					title="Something went wrong"
				/>
			) : null}

			{deals.isLoading ||
			stages.isLoading ||
			deals.isError ||
			stages.isError ? null : (
				<div className="crm-board">
					{stageRows.map((stage) => {
						const inStage = dealRows.filter((d) => d.stageId === stage.id);
						const total = inStage.reduce((s, d) => s + (d.value ?? 0), 0);
						return (
							<div className="crm-col" key={stage.id}>
								<div className="crm-col-head">
									<span>
										{stage.name} ({inStage.length})
									</span>
									<span className="crm-col-total">
										{formatMoney(total, dealRows[0]?.currency ?? "GYD")}
									</span>
								</div>
								{inStage.map((d) => (
									<div className="crm-card" key={d.id}>
										<Link
											className="crm-card-title"
											params={{ id: d.id }}
											to="/app/crm/deals/$id"
										>
											{d.title}
										</Link>
										<div className="crm-card-meta">
											<span>{d.customerName ?? "—"}</span>
											<span>{formatMoney(d.value, d.currency)}</span>
											{d.isStalled ? (
												<span className="crm-badge tone-warning">Stalled</span>
											) : null}
										</div>
										{canManage ? (
											<select
												aria-label={`Move ${d.title} to stage`}
												onChange={(e) => onStageChange(d, e.target.value)}
												value={d.stageId}
											>
												{stageRows.map((s) => (
													<option key={s.id} value={s.id}>
														{s.name}
													</option>
												))}
											</select>
										) : null}
										{canManage &&
										d.status === "won" &&
										!d.handedOffProjectLinkId ? (
											<button
												className="crm-btn"
												onClick={() => handoff(d.id)}
												type="button"
											>
												Create handoff
											</button>
										) : null}
									</div>
								))}
							</div>
						);
					})}
				</div>
			)}

			{newOpen ? (
				<NewDealDialog
					customers={customerRows}
					onClose={() => setNewOpen(false)}
					stages={stageRows}
				/>
			) : null}
			{lostPending ? (
				<LostReasonDialog
					onCancel={() => setLostPending(null)}
					onConfirm={(reason) => {
						moveStage(lostPending.dealId, lostPending.stageId, reason);
						setLostPending(null);
					}}
				/>
			) : null}
		</div>
	);
}
