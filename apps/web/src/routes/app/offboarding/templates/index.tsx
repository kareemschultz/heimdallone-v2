import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/offboarding.css";
import { EmptyState } from "@/components/empty-state";
import { categoryLabel, exitTypeLabel } from "@/features/offboarding/labels";
import { OffboardingTabs } from "@/features/offboarding/offboarding-tabs";
import { OffboardingTemplateFormDialog } from "@/features/offboarding/offboarding-template-form-dialog";
import { canManageOffboarding, canViewOffboarding } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/offboarding/templates/")({
	component: TemplatesListPage,
});

interface TemplateTaskRow {
	category: string;
	isRequired: boolean;
}

interface TemplateRow {
	categories: string[];
	description: string | null;
	exitType: string | null;
	id: string;
	isActive: boolean;
	name: string;
	tasksLabel: string;
	updatedAt: string | Date;
}

const templateColumns: ColumnDef<TemplateRow, unknown>[] = [
	{
		accessorKey: "name",
		header: "Template",
		cell: ({ row }) => (
			<>
				<Link
					params={{ id: row.original.id }}
					style={{
						fontWeight: 600,
						color: "var(--fg)",
						textDecoration: "none",
					}}
					to="/app/offboarding/templates/$id"
				>
					{row.original.name}
				</Link>
				{row.original.description && (
					<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
						{row.original.description}
					</div>
				)}
			</>
		),
	},
	{
		accessorKey: "exitType",
		header: "Exit type",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-2)" }}>
				{row.original.exitType ? exitTypeLabel(row.original.exitType) : "Any"}
			</span>
		),
	},
	{
		accessorKey: "isActive",
		header: "Status",
		cell: ({ row }) => (
			<span className={row.original.isActive ? "badge badge-success" : "badge"}>
				{row.original.isActive ? "Active" : "Archived"}
			</span>
		),
	},
	{
		accessorKey: "tasksLabel",
		header: "Tasks",
		cell: ({ row }) => (
			<div style={{ textAlign: "right", color: "var(--fg-2)" }}>
				{row.original.tasksLabel}
			</div>
		),
	},
	{
		accessorKey: "categories",
		header: "Categories",
		cell: ({ row }) => (
			<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
				{row.original.categories.map((c) => (
					<span className="badge" key={c}>
						{categoryLabel(c)}
					</span>
				))}
			</div>
		),
	},
	{
		accessorKey: "updatedAt",
		header: "Updated",
		cell: ({ row }) => (
			<span style={{ color: "var(--fg-3)" }}>
				{new Date(row.original.updatedAt).toLocaleDateString()}
			</span>
		),
	},
];

function TemplatesListPage() {
	const org = useContext(OrgCtx);
	const canView = canViewOffboarding(org.memberRole);
	const canManage = canManageOffboarding(org.memberRole);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [showCreate, setShowCreate] = useState(false);

	// Show active + archived so the status column is meaningful. Disabled for
	// non-viewers (employees) so we don't fire 403s.
	const templates = useQuery(
		orpc.offboarding.templates.list.queryOptions({
			input: { includeInactive: true },
			enabled: canView,
		})
	);
	const rows = templates.data ?? [];

	// Per-template task summaries (count / required / categories).
	const taskQueries = useQueries({
		queries: rows.map((t) =>
			orpc.offboarding.templateTasks.listByTemplate.queryOptions({
				input: { templateId: t.id },
				enabled: canView,
			})
		),
	});

	const tableRows: TemplateRow[] = rows.map((t, i) => {
		const tasks = (taskQueries[i]?.data ?? []) as TemplateTaskRow[];
		const requiredCount = tasks.filter((x) => x.isRequired).length;
		const categories = [...new Set(tasks.map((x) => x.category))];
		const tasksLabel = taskQueries[i]?.isLoading
			? "…"
			: `${tasks.length} (${requiredCount} required)`;
		return {
			id: t.id,
			name: t.name,
			description: t.description,
			exitType: t.exitType,
			isActive: t.isActive,
			updatedAt: t.updatedAt,
			tasksLabel,
			categories,
		};
	});

	const invalidate = () =>
		queryClient.invalidateQueries({
			predicate: (q) => {
				const path = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
				return Array.isArray(path) && path[0] === "offboarding";
			},
		});

	if (!canView) {
		return (
			<div className="page">
				<div className="page-header">
					<div>
						<div className="crumbs">
							<span>Heimdallone</span>
							<span className="sep">/</span>
							<span>Offboarding</span>
							<span className="sep">/</span>
							<span>Templates</span>
						</div>
						<h1 className="page-title">Offboarding templates</h1>
						<p className="page-sub">Manage exit checklists.</p>
					</div>
				</div>
				<div className="card card-pad">
					<EmptyState
						description="Offboarding template management is available to HR and administrators."
						icon={<FileText size={20} />}
						title="You don't have access to offboarding templates"
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Offboarding</span>
						<span className="sep">/</span>
						<span>Templates</span>
					</div>
					<h1 className="page-title">Offboarding templates</h1>
					<p className="page-sub">
						Create reusable clearance checklists for different exit types.
					</p>
				</div>
				{canManage && (
					<div className="page-actions">
						<button
							className="btn btn-primary btn-sm"
							onClick={() => setShowCreate(true)}
							type="button"
						>
							Create template
						</button>
					</div>
				)}
			</div>

			<OffboardingTabs />

			<div
				className="card card-pad"
				style={{ marginBottom: 14, color: "var(--fg-3)", fontSize: 12.5 }}
			>
				Templates are copied into each offboarding case when the case starts.
				Editing a template does not change cases already in progress.
			</div>

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={templateColumns}
					data={tableRows}
					emptyState={
						<EmptyState
							description="Create your first template to start offboarding employees faster."
							icon={<FileText size={20} />}
							title="No templates yet"
						/>
					}
					isError={templates.isError}
					isLoading={templates.isLoading}
				/>
			</div>

			{showCreate && (
				<OffboardingTemplateFormDialog
					mode="create"
					onClose={() => setShowCreate(false)}
					onSaved={(id) => {
						setShowCreate(false);
						invalidate();
						navigate({
							params: { id },
							to: "/app/offboarding/templates/$id",
						});
					}}
				/>
			)}
		</div>
	);
}
