import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";

import "@/styles/finance.css";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/features/finance/badge";
import { FinanceTabs } from "@/features/finance/finance-tabs";
import {
	accountTypeLabel,
	accountTypeTone,
} from "@/features/finance/gl-labels";
import type { GlAccountRow, GlAccountType } from "@/features/finance/gl-types";
import { canManageGL, canViewGL } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/finance/accounts")({
	component: FinanceAccountsPage,
});

function invalidateGl(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({
		predicate: (q) => {
			const key = String(q.queryKey[0] ?? "");
			return key.includes("gl") || key.includes("finance");
		},
	});
}

const ACCOUNT_TYPES: GlAccountType[] = [
	"asset",
	"liability",
	"equity",
	"income",
	"expense",
];

interface AccountFormValues {
	code: string;
	isPostable: boolean;
	name: string;
	parentAccountId: string | null;
	subType: string | null;
	type: GlAccountType;
}

function AccountDialog({
	existing,
	accounts,
	onCancel,
	onSubmit,
}: {
	existing: GlAccountRow | null;
	accounts: GlAccountRow[];
	onCancel: () => void;
	onSubmit: (values: AccountFormValues) => Promise<void>;
}) {
	const isEdit = existing != null;
	const [code, setCode] = useState(existing?.code ?? "");
	const [name, setName] = useState(existing?.name ?? "");
	const [type, setType] = useState<GlAccountType>(existing?.type ?? "asset");
	const [subType, setSubType] = useState(existing?.subType ?? "");
	const [isPostable, setIsPostable] = useState(existing?.isPostable ?? true);
	const [parentAccountId, setParentAccountId] = useState(
		existing?.parentAccountId ?? ""
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onCancel();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onCancel]);

	async function handleSave() {
		setError(null);
		if (!(isEdit || code.trim())) {
			setError("An account code is required.");
			return;
		}
		if (!name.trim()) {
			setError("An account name is required.");
			return;
		}
		setBusy(true);
		try {
			await onSubmit({
				code: code.trim(),
				name: name.trim(),
				type,
				subType: subType.trim() || null,
				isPostable,
				parentAccountId: parentAccountId || null,
			});
		} catch (e) {
			setError(
				(e as { message?: string }).message ?? "Could not save the account."
			);
			setBusy(false);
		}
	}

	// A header (non-postable) account can be a parent; never itself.
	const parentChoices = accounts.filter(
		(a) => a.id !== existing?.id && !a.isArchived
	);

	return (
		<div className="fn-dialog-backdrop">
			<div
				aria-labelledby="fn-acct-title"
				aria-modal="true"
				className="fn-dialog"
				role="dialog"
			>
				<h2 id="fn-acct-title">{isEdit ? "Edit account" : "New account"}</h2>
				<p className="fn-sub">
					Accounts make up your chart of accounts. Header accounts group detail
					accounts; only postable accounts can carry journal lines.
				</p>

				{isEdit ? null : (
					<div className="fn-field">
						<label htmlFor="fn-a-code">Code</label>
						<input
							id="fn-a-code"
							onChange={(e) => setCode(e.target.value)}
							placeholder="e.g. 1000"
							value={code}
						/>
					</div>
				)}

				<div className="fn-field">
					<label htmlFor="fn-a-name">Name</label>
					<input
						id="fn-a-name"
						onChange={(e) => setName(e.target.value)}
						placeholder="e.g. Cash at bank"
						value={name}
					/>
				</div>

				{isEdit ? null : (
					<div className="fn-field">
						<label htmlFor="fn-a-type">Type</label>
						<select
							id="fn-a-type"
							onChange={(e) => setType(e.target.value as GlAccountType)}
							value={type}
						>
							{ACCOUNT_TYPES.map((t) => (
								<option key={t} value={t}>
									{accountTypeLabel(t)}
								</option>
							))}
						</select>
					</div>
				)}

				<div className="fn-field">
					<label htmlFor="fn-a-subtype">Sub-type (optional)</label>
					<input
						id="fn-a-subtype"
						onChange={(e) => setSubType(e.target.value)}
						placeholder="e.g. Current asset"
						value={subType}
					/>
				</div>

				<div className="fn-field">
					<label htmlFor="fn-a-parent">Parent account (optional)</label>
					<select
						id="fn-a-parent"
						onChange={(e) => setParentAccountId(e.target.value)}
						value={parentAccountId}
					>
						<option value="">None (top level)</option>
						{parentChoices.map((a) => (
							<option key={a.id} value={a.id}>
								{a.code} · {a.name}
							</option>
						))}
					</select>
				</div>

				<div className="fn-field">
					<label htmlFor="fn-a-postable">
						<input
							checked={isPostable}
							id="fn-a-postable"
							onChange={(e) => setIsPostable(e.target.checked)}
							type="checkbox"
						/>{" "}
						Postable (can carry journal lines)
					</label>
				</div>

				{error ? (
					<p className="fn-sub" style={{ color: "var(--danger)" }}>
						{error}
					</p>
				) : null}

				<div className="fn-dialog-actions">
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
						{busy ? "Saving…" : "Save account"}
					</button>
				</div>
			</div>
		</div>
	);
}

function accountColumns(
	canManage: boolean,
	onEdit: (a: GlAccountRow) => void,
	onArchive: (a: GlAccountRow) => void
): ColumnDef<GlAccountRow, unknown>[] {
	const columns: ColumnDef<GlAccountRow, unknown>[] = [
		{
			accessorKey: "code",
			header: "Code",
			cell: ({ row }) => <span className="fn-mono">{row.original.code}</span>,
		},
		{
			accessorKey: "name",
			header: "Account",
			cell: ({ row }) => (
				<span>
					<span className="fn-name">{row.original.name}</span>
					{row.original.subType ? (
						<>
							<br />
							<span className="fn-sub">{row.original.subType}</span>
						</>
					) : null}
				</span>
			),
		},
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => (
				<Badge tone={accountTypeTone(row.original.type)}>
					{accountTypeLabel(row.original.type)}
				</Badge>
			),
		},
		{
			accessorKey: "isPostable",
			header: "Role",
			cell: ({ row }) =>
				row.original.isPostable ? (
					<span className="fn-sub">Detail</span>
				) : (
					<span className="fn-sub">Header</span>
				),
		},
		{
			accessorKey: "isArchived",
			header: "Status",
			cell: ({ row }) =>
				row.original.isArchived ? (
					<Badge tone="neutral">Archived</Badge>
				) : (
					<Badge tone="success">Active</Badge>
				),
		},
	];
	if (canManage) {
		columns.push({
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="fn-row-actions">
					<button
						className="fn-btn"
						onClick={() => onEdit(row.original)}
						type="button"
					>
						Edit
					</button>
					{row.original.isArchived ? null : (
						<button
							className="fn-btn danger"
							onClick={() => onArchive(row.original)}
							type="button"
						>
							Archive
						</button>
					)}
				</div>
			),
		});
	}
	return columns;
}

function FinanceAccountsPage() {
	const org = useContext(OrgCtx);
	const canView = canViewGL(org.memberRole);
	const canManage = canManageGL(org.memberRole);
	const qc = useQueryClient();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<GlAccountRow | null>(null);
	const [showArchived, setShowArchived] = useState(false);

	const accounts = useQuery(
		orpc.gl.accounts.list.queryOptions({
			input: { includeArchived: showArchived },
			enabled: canView,
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

	const rows = (accounts.data as GlAccountRow[] | undefined) ?? [];

	function openCreate() {
		setEditing(null);
		setDialogOpen(true);
	}
	function openEdit(a: GlAccountRow) {
		setEditing(a);
		setDialogOpen(true);
	}

	async function handleSubmit(values: AccountFormValues) {
		if (editing) {
			await client.gl.accounts.update({
				id: editing.id,
				name: values.name,
				subType: values.subType,
				isPostable: values.isPostable,
				parentAccountId: values.parentAccountId,
			});
			toast.success("Account updated.");
		} else {
			await client.gl.accounts.create({
				code: values.code,
				name: values.name,
				type: values.type,
				subType: values.subType,
				isPostable: values.isPostable,
				parentAccountId: values.parentAccountId,
			});
			toast.success("Account created.");
		}
		setDialogOpen(false);
		setEditing(null);
		invalidateGl(qc);
	}

	async function handleArchive(a: GlAccountRow) {
		await client.gl.accounts.archive({ id: a.id, archived: true });
		toast.success("Account archived.");
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
					<h1 className="page-title">Chart of accounts</h1>
					<p className="page-sub">The accounts your journal entries post to.</p>
				</div>
				{canManage ? (
					<button className="fn-btn primary" onClick={openCreate} type="button">
						New account
					</button>
				) : null}
			</div>

			<FinanceTabs />

			<div className="fn-toolbar">
				<label htmlFor="fn-a-show-archived">
					<input
						checked={showArchived}
						id="fn-a-show-archived"
						onChange={(e) => setShowArchived(e.target.checked)}
						type="checkbox"
					/>{" "}
					Show archived
				</label>
			</div>

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={accountColumns(canManage, openEdit, handleArchive)}
					data={rows}
					emptyState={
						<EmptyState
							compact
							description="No accounts yet. Create your chart of accounts to start posting journals."
							title="No accounts"
						/>
					}
					isError={accounts.isError}
					isLoading={accounts.isLoading}
				/>
			</div>

			{dialogOpen ? (
				<AccountDialog
					accounts={rows}
					existing={editing}
					onCancel={() => {
						setDialogOpen(false);
						setEditing(null);
					}}
					onSubmit={handleSubmit}
				/>
			) : null}
		</div>
	);
}
