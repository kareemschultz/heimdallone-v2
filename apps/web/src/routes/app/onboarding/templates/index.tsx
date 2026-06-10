import {
	type ColumnDef,
	DataTable,
} from "@Heimdallone/ui/components/data-table";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useContext, useState } from "react";

import "@/styles/onboarding.css";
import { EmptyState } from "@/components/empty-state";
import { categoryLabel } from "@/features/onboarding/labels";
import { OnboardingTabs } from "@/features/onboarding/onboarding-tabs";
import { TemplateFormDialog } from "@/features/onboarding/template-form-dialog";
import { canManageOnboarding } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/onboarding/templates/")({
	component: TemplatesListPage,
});

interface TemplateTaskRow {
	category: string;
	isRequired: boolean;
}

interface TemplateRow {
	categories: string[];
	description: string | null;
	id: string;
	isDefault: boolean;
	name: string;
	requiredCount: number;
	taskCount: number;
	tasksLoading: boolean;
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
					to="/app/onboarding/templates/$id"
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
		accessorKey: "isDefault",
		header: "Status",
		cell: ({ row }) => (
			<>
				<span className="badge badge-success">Active</span>
				{row.original.isDefault && (
					<span className="badge" style={{ marginLeft: 6 }}>
						Default
					</span>
				)}
			</>
		),
	},
	{
		accessorKey: "taskCount",
		header: "Tasks",
		cell: ({ row }) => (
			<span style={{ textAlign: "right", color: "var(--fg-2)" }}>
				{row.original.tasksLoading
					? "…"
					: `${row.original.taskCount} (${row.original.requiredCount} required)`}
			</span>
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
	const canManage = canManageOnboarding(org.memberRole);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [showCreate, setShowCreate] = useState(false);

	const templates = useQuery(
		orpc.onboarding.templates.list.queryOptions({
			input: { page: 1, pageSize: 50 },
		})
	);
	const rows = templates.data?.data ?? [];

	// Per-template task summaries (count / required / categories).
	const taskQueries = useQueries({
		queries: rows.map((t) =>
			orpc.onboarding.templateTasks.listByTemplate.queryOptions({
				input: { templateId: t.id },
			})
		),
	});

	const invalidate = () =>
		queryClient.invalidateQueries({
			predicate: (q) => {
				const path = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
				return Array.isArray(path) && path[0] === "onboarding";
			},
		});

	const tableRows: TemplateRow[] = rows.map((t, i) => {
		const tasks = (taskQueries[i]?.data ?? []) as TemplateTaskRow[];
		const requiredCount = tasks.filter((x) => x.isRequired).length;
		const categories = [...new Set(tasks.map((x) => x.category))];
		return {
			id: t.id,
			name: t.name,
			description: t.description,
			isDefault: t.isDefault,
			updatedAt: t.updatedAt,
			tasksLoading: taskQueries[i]?.isLoading ?? false,
			taskCount: tasks.length,
			requiredCount,
			categories,
		};
	});

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Onboarding</span>
						<span className="sep">/</span>
						<span>Templates</span>
					</div>
					<h1 className="page-title">Onboarding templates</h1>
					<p className="page-sub">
						Create reusable checklists for different types of new hires.
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

			<OnboardingTabs />

			<div
				className="card card-pad"
				style={{ marginBottom: 14, color: "var(--fg-3)", fontSize: 12.5 }}
			>
				Templates are copied into each employee onboarding when onboarding
				starts. Editing a template does not change onboarding that is already in
				progress.
			</div>

			<div className="card" style={{ overflow: "hidden" }}>
				<DataTable
					columns={templateColumns}
					data={tableRows}
					emptyState={
						<EmptyState
							description="Create your first template to start onboarding new hires faster."
							icon={<ClipboardList size={20} />}
							title="No templates yet"
						/>
					}
					isError={templates.isError}
					isLoading={templates.isLoading}
				/>
			</div>

			{showCreate && (
				<TemplateFormDialog
					mode="create"
					onClose={() => setShowCreate(false)}
					onSaved={(id) => {
						setShowCreate(false);
						invalidate();
						navigate({
							params: { id },
							to: "/app/onboarding/templates/$id",
						});
					}}
				/>
			)}
		</div>
	);
}
