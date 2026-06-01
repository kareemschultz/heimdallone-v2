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

			{templates.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading templates…
				</div>
			)}

			{!templates.isLoading && rows.length === 0 && (
				<div className="card card-pad">
					<EmptyState
						description="Create your first template to start offboarding employees faster."
						icon={<FileText size={20} />}
						title="No templates yet"
					/>
				</div>
			)}

			{!templates.isLoading && rows.length > 0 && (
				<div className="card" style={{ overflow: "hidden" }}>
					<table className="tbl">
						<thead>
							<tr>
								<th>Template</th>
								<th>Exit type</th>
								<th>Status</th>
								<th style={{ textAlign: "right" }}>Tasks</th>
								<th>Categories</th>
								<th>Updated</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((t, i) => {
								const tasks = (taskQueries[i]?.data ?? []) as TemplateTaskRow[];
								const requiredCount = tasks.filter((x) => x.isRequired).length;
								const categories = [...new Set(tasks.map((x) => x.category))];
								return (
									<tr key={t.id}>
										<td>
											<Link
												params={{ id: t.id }}
												style={{
													fontWeight: 600,
													color: "var(--fg)",
													textDecoration: "none",
												}}
												to="/app/offboarding/templates/$id"
											>
												{t.name}
											</Link>
											{t.description && (
												<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
													{t.description}
												</div>
											)}
										</td>
										<td style={{ color: "var(--fg-2)" }}>
											{t.exitType ? exitTypeLabel(t.exitType) : "Any"}
										</td>
										<td>
											<span
												className={t.isActive ? "badge badge-success" : "badge"}
											>
												{t.isActive ? "Active" : "Archived"}
											</span>
										</td>
										<td style={{ textAlign: "right", color: "var(--fg-2)" }}>
											{taskQueries[i]?.isLoading
												? "…"
												: `${tasks.length} (${requiredCount} required)`}
										</td>
										<td>
											<div
												style={{ display: "flex", flexWrap: "wrap", gap: 4 }}
											>
												{categories.map((c) => (
													<span className="badge" key={c}>
														{categoryLabel(c)}
													</span>
												))}
											</div>
										</td>
										<td style={{ color: "var(--fg-3)" }}>
											{new Date(t.updatedAt).toLocaleDateString()}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

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
