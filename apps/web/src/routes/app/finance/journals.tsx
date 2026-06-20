import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Landmark, ScrollText } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/finance.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { Badge } from "@/features/finance/badge";
import { FinanceTabs } from "@/features/finance/finance-tabs";
import {
	glMoney,
	journalSourceLabel,
	journalStatusLabel,
	journalStatusTone,
} from "@/features/finance/gl-labels";
import type {
	DraftLine,
	GlAccountRow,
	GlJournalDetail,
	GlJournalListRow,
	GlJournalSource,
	GlJournalStatus,
} from "@/features/finance/gl-types";
import { canManageGL, canReverseGL, canViewGL } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/finance/journals")({
	component: FinanceJournalsPage,
});

function invalidateGl(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => {
			const key = String(q.queryKey[0] ?? "");
			return key.includes("gl") || key.includes("finance");
		},
	});
}

const STATUS_FILTERS: GlJournalStatus[] = ["draft", "posted", "reversed"];
const SOURCE_FILTERS: GlJournalSource[] = [
	"manual",
	"payroll",
	"opening_balance",
	"adjustment",
];

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

function emptyLine(): DraftLine {
	return { accountId: "", debit: "", credit: "", description: "" };
}

function sumLines(lines: DraftLine[], key: "debit" | "credit"): number {
	return lines.reduce((acc, l) => acc + (Number(l[key]) || 0), 0);
}

function JournalDialog({
	accounts,
	onCancel,
	onSubmit,
}: {
	accounts: GlAccountRow[];
	onCancel: () => void;
	onSubmit: (input: {
		reference: string;
		description: string | null;
		entryDate: string;
		source: GlJournalSource;
		post: boolean;
		lines: {
			accountId: string;
			debit: number;
			credit: number;
			description: string | null;
		}[];
	}) => Promise<void>;
}) {
	const [reference, setReference] = useState("");
	const [description, setDescription] = useState("");
	const [entryDate, setEntryDate] = useState(todayIso());
	const [source, setSource] = useState<GlJournalSource>("manual");
	const [post, setPost] = useState(false);
	const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const postable = accounts.filter((a) => a.isPostable && !a.isArchived);
	const totalDebit = sumLines(lines, "debit");
	const totalCredit = sumLines(lines, "credit");
	const balanced =
		Math.round(totalDebit * 100) === Math.round(totalCredit * 100) &&
		totalDebit > 0;

	function updateLine(idx: number, patch: Partial<DraftLine>) {
		setLines((prev) =>
			prev.map((l, i) => (i === idx ? { ...l, ...patch } : l))
		);
	}
	function addLine() {
		setLines((prev) => [...prev, emptyLine()]);
	}
	function removeLine(idx: number) {
		setLines((prev) =>
			prev.length > 2 ? prev.filter((_, i) => i !== idx) : prev
		);
	}

	async function handleSave() {
		setError(null);
		if (!reference.trim()) {
			setError("A reference is required.");
			return;
		}
		if (lines.some((l) => !l.accountId)) {
			setError("Every line needs an account.");
			return;
		}
		if (!balanced) {
			setError("Debits and credits must balance (and be greater than zero).");
			return;
		}
		setBusy(true);
		try {
			await onSubmit({
				reference: reference.trim(),
				description: description.trim() || null,
				entryDate,
				source,
				post,
				lines: lines.map((l) => ({
					accountId: l.accountId,
					debit: Number(l.debit) || 0,
					credit: Number(l.credit) || 0,
					description: l.description.trim() || null,
				})),
			});
		} catch (e) {
			setError(
				(e as { message?: string }).message ?? "Could not save the journal."
			);
			setBusy(false);
		}
	}

	return (
		<Modal
			footer={
				<>
					<button
						className="fn-btn"
						disabled={busy}
						onClick={onCancel}
						type="button"
					>
						Cancel
					</button>
					<button
						className="fn-btn primary"
						disabled={busy}
						onClick={handleSave}
						type="button"
					>
						{busy ? "Saving..." : "Save journal"}
					</button>
				</>
			}
			icon={<ScrollText size={18} />}
			intro="A journal must balance — total debits equal total credits."
			onClose={onCancel}
			title="New journal entry"
			wide
		>
			<div className="fn-field">
				<label htmlFor="fn-j-ref">Reference</label>
				<input
					id="fn-j-ref"
					onChange={(e) => setReference(e.target.value)}
					placeholder="e.g. JE-1001"
					value={reference}
				/>
			</div>
			<div className="fn-field">
				<label htmlFor="fn-j-date">Entry date</label>
				<input
					id="fn-j-date"
					onChange={(e) => setEntryDate(e.target.value)}
					type="date"
					value={entryDate}
				/>
			</div>
			<div className="fn-field">
				<label htmlFor="fn-j-source">Source</label>
				<select
					id="fn-j-source"
					onChange={(e) => setSource(e.target.value as GlJournalSource)}
					value={source}
				>
					{SOURCE_FILTERS.map((s) => (
						<option key={s} value={s}>
							{journalSourceLabel(s)}
						</option>
					))}
				</select>
			</div>
			<div className="fn-field">
				<label htmlFor="fn-j-desc">Description (optional)</label>
				<input
					id="fn-j-desc"
					onChange={(e) => setDescription(e.target.value)}
					value={description}
				/>
			</div>

			<div className="fn-section-title" style={{ marginTop: 14 }}>
				Lines
			</div>
			<table className="fn-table">
				<thead>
					<tr>
						<th>Account</th>
						<th className="num">Debit</th>
						<th className="num">Credit</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{lines.map((line, idx) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: draft lines have no stable id
						<tr key={idx}>
							<td>
								<select
									aria-label="Line account"
									onChange={(e) =>
										updateLine(idx, { accountId: e.target.value })
									}
									value={line.accountId}
								>
									<option value="">Select...</option>
									{postable.map((a) => (
										<option key={a.id} value={a.id}>
											{a.code} · {a.name}
										</option>
									))}
								</select>
							</td>
							<td className="num">
								<input
									aria-label="Debit"
									inputMode="decimal"
									onChange={(e) => updateLine(idx, { debit: e.target.value })}
									placeholder="0.00"
									value={line.debit}
								/>
							</td>
							<td className="num">
								<input
									aria-label="Credit"
									inputMode="decimal"
									onChange={(e) => updateLine(idx, { credit: e.target.value })}
									placeholder="0.00"
									value={line.credit}
								/>
							</td>
							<td>
								<button
									aria-label="Remove line"
									className="fn-btn"
									disabled={lines.length <= 2}
									onClick={() => removeLine(idx)}
									type="button"
								>
									&#x2715;
								</button>
							</td>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr>
						<td>
							<button className="fn-btn" onClick={addLine} type="button">
								+ Add line
							</button>
						</td>
						<td className="num">{glMoney(totalDebit)}</td>
						<td className="num">{glMoney(totalCredit)}</td>
						<td>
							<Badge tone={balanced ? "success" : "danger"}>
								{balanced ? "Balanced" : "Off"}
							</Badge>
						</td>
					</tr>
				</tfoot>
			</table>

			<div className="fn-field">
				<label htmlFor="fn-j-post">
					<input
						checked={post}
						id="fn-j-post"
						onChange={(e) => setPost(e.target.checked)}
						type="checkbox"
					/>{" "}
					Post immediately (otherwise saved as draft)
				</label>
			</div>

			{error ? (
				<p className="fn-sub" style={{ color: "var(--danger)" }}>
					{error}
				</p>
			) : null}
		</Modal>
	);
}

function JournalDetail({
	id,
	onClose,
	canManage,
	canReverse,
	onChanged,
}: {
	id: string;
	onClose: () => void;
	canManage: boolean;
	canReverse: boolean;
	onChanged: () => void;
}) {
	const detail = useQuery(
		orpc.gl.journals.getById.queryOptions({ input: { id } })
	);
	const [busy, setBusy] = useState(false);
	const data = detail.data as GlJournalDetail | undefined;

	async function run(fn: () => Promise<unknown>, msg: string) {
		setBusy(true);
		try {
			await fn();
			toast.success(msg);
			onChanged();
			onClose();
		} catch (e) {
			toast.error((e as { message?: string }).message ?? "Action failed.");
			setBusy(false);
		}
	}

	const footer = data ? (
		<>
			<button className="fn-btn" onClick={onClose} type="button">
				Close
			</button>
			{canManage && data.entry.status === "draft" ? (
				<>
					<button
						className="fn-btn danger"
						disabled={busy}
						onClick={() =>
							run(
								() => client.gl.journals.remove({ id }),
								"Draft journal removed."
							)
						}
						type="button"
					>
						Delete draft
					</button>
					<button
						className="fn-btn primary"
						disabled={busy}
						onClick={() =>
							run(() => client.gl.journals.post({ id }), "Journal posted.")
						}
						type="button"
					>
						Post
					</button>
				</>
			) : null}
			{canReverse && data.entry.status === "posted" ? (
				<button
					className="fn-btn danger"
					disabled={busy}
					onClick={() =>
						run(
							() => client.gl.journals.reverse({ id }),
							"Journal reversed with a counter-entry."
						)
					}
					type="button"
				>
					Reverse
				</button>
			) : null}
		</>
	) : (
		<button className="fn-btn" onClick={onClose} type="button">
			Close
		</button>
	);

	const subtitle = data
		? `${data.entry.entryDate} · ${journalSourceLabel(data.entry.source)}`
		: undefined;

	return (
		<Modal
			footer={footer}
			icon={<FileText size={18} />}
			onClose={onClose}
			subtitle={subtitle}
			title={data?.entry.reference ?? "Journal entry"}
			wide
		>
			{detail.isLoading ? <div className="fn-skeleton" /> : null}
			{detail.isError ? (
				<EmptyState
					compact
					description="Could not load the journal."
					title="Something went wrong"
				/>
			) : null}
			{data ? (
				<>
					<p className="fn-sub" style={{ marginTop: 0 }}>
						<Badge tone={journalStatusTone(data.entry.status)}>
							{journalStatusLabel(data.entry.status)}
						</Badge>
					</p>
					{data.entry.description ? (
						<p className="fn-sub">{data.entry.description}</p>
					) : null}
					<table className="fn-table" style={{ marginTop: 12 }}>
						<thead>
							<tr>
								<th>Account</th>
								<th className="num">Debit</th>
								<th className="num">Credit</th>
							</tr>
						</thead>
						<tbody>
							{data.lines.map((l) => (
								<tr key={l.id}>
									<td>
										<span className="fn-mono">{l.accountCode}</span> ·{" "}
										{l.accountName}
										{l.description ? (
											<>
												<br />
												<span className="fn-sub">{l.description}</span>
											</>
										) : null}
									</td>
									<td className="num">
										{Number(l.debitAmount)
											? glMoney(l.debitAmount, data.entry.currency)
											: ""}
									</td>
									<td className="num">
										{Number(l.creditAmount)
											? glMoney(l.creditAmount, data.entry.currency)
											: ""}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			) : null}
		</Modal>
	);
}

function journalColumns(
	onOpen: (id: string) => void
): ColumnDef<GlJournalListRow, unknown>[] {
	return [
		{
			accessorKey: "reference",
			header: "Reference",
			cell: ({ row }) => (
				<button
					className="fn-name-link"
					onClick={() => onOpen(row.original.id)}
					type="button"
				>
					{row.original.reference}
				</button>
			),
		},
		{
			accessorKey: "entryDate",
			header: "Date",
			cell: ({ row }) => row.original.entryDate,
		},
		{
			accessorKey: "description",
			header: "Description",
			cell: ({ row }) => (
				<span className="fn-sub">{row.original.description ?? "—"}</span>
			),
		},
		{
			accessorKey: "source",
			header: "Source",
			cell: ({ row }) => journalSourceLabel(row.original.source),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<Badge tone={journalStatusTone(row.original.status)}>
					{journalStatusLabel(row.original.status)}
				</Badge>
			),
		},
		{
			accessorKey: "totalDebit",
			header: "Amount",
			cell: ({ row }) => (
				<span className="num">
					{glMoney(row.original.totalDebit, row.original.currency)}
				</span>
			),
		},
	];
}

function FinanceJournalsPage() {
	const org = useContext(OrgCtx);
	const canView = canViewGL(org.memberRole);
	const canManage = canManageGL(org.memberRole);
	const canReverse = canReverseGL(org.memberRole);
	const qc = useQueryClient();
	const [status, setStatus] = useState<GlJournalStatus | "">("");
	const [source, setSource] = useState<GlJournalSource | "">("");
	const [dialogOpen, setDialogOpen] = useState(false);
	const [openId, setOpenId] = useState<string | null>(null);

	const journals = useQuery(
		orpc.gl.journals.list.queryOptions({
			input: {
				status: status || undefined,
				source: source || undefined,
			},
			enabled: canView,
		})
	);
	const accounts = useQuery(
		orpc.gl.accounts.list.queryOptions({
			input: { includeArchived: false },
			enabled: canView && dialogOpen,
		})
	);

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<h1 className="page-title">Finance</h1>
				</div>
				<EmptyState
					description="The general ledger is available to administrators, payroll administrators, and auditors."
					icon={<Landmark size={28} />}
					title="You don't have access to the ledger"
				/>
			</div>
		);
	}

	const rows = (journals.data as GlJournalListRow[] | undefined) ?? [];
	const accountRows = (accounts.data as GlAccountRow[] | undefined) ?? [];

	async function handleCreate(input: {
		reference: string;
		description: string | null;
		entryDate: string;
		source: GlJournalSource;
		post: boolean;
		lines: {
			accountId: string;
			debit: number;
			credit: number;
			description: string | null;
		}[];
	}) {
		await client.gl.journals.create(input);
		toast.success(input.post ? "Journal posted." : "Draft journal saved.");
		setDialogOpen(false);
		invalidateGl(qc);
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Finance</span>
					</div>
					<h1 className="page-title">Journal entries</h1>
					<p className="page-sub">
						Double-entry journals. Posting a journal updates the ledger;
						corrections are made by reversal.
					</p>
				</div>
				{canManage ? (
					<button
						className="fn-btn primary"
						onClick={() => setDialogOpen(true)}
						type="button"
					>
						New journal
					</button>
				) : null}
			</div>

			<FinanceTabs />

			<div className="fn-toolbar">
				<select
					aria-label="Filter by status"
					onChange={(e) => setStatus(e.target.value as GlJournalStatus | "")}
					value={status}
				>
					<option value="">All statuses</option>
					{STATUS_FILTERS.map((s) => (
						<option key={s} value={s}>
							{journalStatusLabel(s)}
						</option>
					))}
				</select>
				<select
					aria-label="Filter by source"
					onChange={(e) => setSource(e.target.value as GlJournalSource | "")}
					value={source}
				>
					<option value="">All sources</option>
					{SOURCE_FILTERS.map((s) => (
						<option key={s} value={s}>
							{journalSourceLabel(s)}
						</option>
					))}
				</select>
			</div>

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={journalColumns(setOpenId)}
					data={rows}
					emptyState={
						<EmptyState
							compact
							description="No journal entries match these filters."
							title="No journals"
						/>
					}
					isError={journals.isError}
					isLoading={journals.isLoading}
				/>
			</div>

			{dialogOpen ? (
				<JournalDialog
					accounts={accountRows}
					onCancel={() => setDialogOpen(false)}
					onSubmit={handleCreate}
				/>
			) : null}

			{openId ? (
				<JournalDetail
					canManage={canManage}
					canReverse={canReverse}
					id={openId}
					onChanged={() => invalidateGl(qc)}
					onClose={() => setOpenId(null)}
				/>
			) : null}
		</div>
	);
}
