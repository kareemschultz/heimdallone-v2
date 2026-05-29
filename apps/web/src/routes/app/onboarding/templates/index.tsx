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

			{templates.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading templates…
				</div>
			)}

			{!templates.isLoading && rows.length === 0 && (
				<div className="card card-pad">
					<EmptyState
						description="Create your first template to start onboarding new hires faster."
						icon={<ClipboardList size={20} />}
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
												to="/app/onboarding/templates/$id"
											>
												{t.name}
											</Link>
											{t.description && (
												<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
													{t.description}
												</div>
											)}
										</td>
										<td>
											<span className="badge badge-success">Active</span>
											{t.isDefault && (
												<span className="badge" style={{ marginLeft: 6 }}>
													Default
												</span>
											)}
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
