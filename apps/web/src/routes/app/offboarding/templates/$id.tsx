import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/offboarding.css";
import { Modal } from "@/components/modal";
import {
	assigneeRoleLabel,
	categoryLabel,
	dueOffsetLabel,
	exitTypeLabel,
} from "@/features/offboarding/labels";
import { OffboardingTabs } from "@/features/offboarding/offboarding-tabs";
import { OffboardingTemplateFormDialog } from "@/features/offboarding/offboarding-template-form-dialog";
import { canManageOffboarding } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/offboarding/templates/$id")({
	component: TemplateDetailPage,
});

function TemplateDetailPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageOffboarding(org.memberRole);
	const { id } = Route.useParams();
	const queryClient = useQueryClient();
	const [showEdit, setShowEdit] = useState(false);
	const [showArchive, setShowArchive] = useState(false);

	const template = useQuery(
		orpc.offboarding.templates.getById.queryOptions({ input: { id } })
	);
	const tasks = useQuery(
		orpc.offboarding.templateTasks.listByTemplate.queryOptions({
			input: { templateId: id },
		})
	);

	const t = template.data;
	const taskRows = tasks.data ?? [];
	const categories = [...new Set(taskRows.map((x) => x.category))];

	const invalidate = () =>
		queryClient.invalidateQueries({
			predicate: (q) => {
				const path = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
				return Array.isArray(path) && path[0] === "offboarding";
			},
		});

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<Link
							style={{ color: "var(--fg-3)", textDecoration: "none" }}
							to="/app/offboarding/templates"
						>
							<ArrowLeft
								size={12}
								style={{ verticalAlign: "middle", marginRight: 4 }}
							/>
							Templates
						</Link>
						<span className="sep">/</span>
						<span>{t?.name ?? "Template"}</span>
					</div>
					<h1 className="page-title">{t?.name ?? "Loading…"}</h1>
					{t?.description && <p className="page-sub">{t.description}</p>}
				</div>
				{canManage && t && (
					<div className="page-actions" style={{ display: "flex", gap: 8 }}>
						<button
							className="btn btn-outline btn-sm"
							onClick={() => setShowEdit(true)}
							type="button"
						>
							Edit
						</button>
						{t.isActive && (
							<button
								className="btn btn-sm"
								onClick={() => setShowArchive(true)}
								type="button"
							>
								Archive
							</button>
						)}
					</div>
				)}
			</div>

			<OffboardingTabs />

			{template.isLoading && (
				<div className="card card-pad" style={{ color: "var(--fg-3)" }}>
					Loading…
				</div>
			)}

			{t && (
				<>
					<div
						className="card card-pad"
						style={{
							marginBottom: 14,
							display: "flex",
							gap: 24,
							flexWrap: "wrap",
						}}
					>
						<Summary
							label="Exit type"
							value={t.exitType ? exitTypeLabel(t.exitType) : "Any exit type"}
						/>
						<Summary
							label="Status"
							value={
								<span className={t.isActive ? "badge badge-success" : "badge"}>
									{t.isActive ? "Active" : "Archived"}
								</span>
							}
						/>
						<Summary label="Tasks" value={`${taskRows.length}`} />
						<Summary
							label="Required"
							value={`${taskRows.filter((x) => x.isRequired).length}`}
						/>
						<Summary
							label="Categories"
							value={
								categories.length
									? categories.map((c) => categoryLabel(c)).join(", ")
									: "—"
							}
						/>
					</div>

					<div className="card" style={{ overflow: "hidden" }}>
						<div className="card-pad" style={{ paddingBottom: 0 }}>
							<div className="eyebrow">Tasks (in order)</div>
						</div>
						{tasks.isLoading && (
							<div className="card-pad" style={{ color: "var(--fg-3)" }}>
								Loading tasks…
							</div>
						)}
						{!tasks.isLoading && taskRows.length === 0 && (
							<div className="card-pad" style={{ color: "var(--fg-3)" }}>
								This template has no tasks yet.
							</div>
						)}
						{!tasks.isLoading && taskRows.length > 0 && (
							<table className="tbl">
								<thead>
									<tr>
										<th style={{ width: 40 }}>#</th>
										<th>Task</th>
										<th>Category</th>
										<th>Assignee</th>
										<th>Due</th>
										<th>Required</th>
									</tr>
								</thead>
								<tbody>
									{taskRows.map((task, idx) => (
										<tr key={task.id}>
											<td style={{ color: "var(--fg-3)" }}>{idx + 1}</td>
											<td>
												<div style={{ fontWeight: 600, color: "var(--fg)" }}>
													{task.title}
												</div>
												{task.description && (
													<div style={{ fontSize: 12, color: "var(--fg-3)" }}>
														{task.description}
													</div>
												)}
											</td>
											<td>
												<span className="badge">
													{categoryLabel(task.category)}
												</span>
											</td>
											<td style={{ color: "var(--fg-2)" }}>
												{assigneeRoleLabel(task.defaultAssigneeRole)}
											</td>
											<td style={{ color: "var(--fg-3)" }}>
												{dueOffsetLabel(task.dueOffsetDays)}
											</td>
											<td>
												<span
													className={
														task.isRequired ? "badge badge-warning" : "badge"
													}
												>
													{task.isRequired ? "Required" : "Optional"}
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>

					{canManage && (
						<p style={{ color: "var(--fg-3)", fontSize: 12.5, marginTop: 12 }}>
							Task editing and reordering is coming in a later checkpoint.
						</p>
					)}
				</>
			)}

			{showEdit && t && (
				<OffboardingTemplateFormDialog
					initial={{
						name: t.name,
						description: t.description ?? "",
						exitType: t.exitType ?? "",
					}}
					mode="edit"
					onClose={() => setShowEdit(false)}
					onSaved={() => {
						setShowEdit(false);
						invalidate();
					}}
					templateId={id}
				/>
			)}

			{showArchive && (
				<ArchiveTemplateDialog id={id} onClose={() => setShowArchive(false)} />
			)}
		</div>
	);
}

function ArchiveTemplateDialog({
	id,
	onClose,
}: {
	id: string;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const archiveMutation = useMutation({
		mutationFn: () => client.offboarding.templates.archive({ id }),
		onSuccess: () => {
			toast.success("Template archived.");
			queryClient.invalidateQueries({
				predicate: (q) => {
					const path = Array.isArray(q.queryKey) ? q.queryKey[0] : null;
					return Array.isArray(path) && path[0] === "offboarding";
				},
			});
			navigate({ to: "/app/offboarding/templates" });
		},
		onError: (err: Error) => {
			toast.error(`Could not archive: ${err.message}`);
		},
	});

	return (
		<Modal
			footer={
				<>
					<button
						className="btn btn-sm"
						disabled={archiveMutation.isPending}
						onClick={onClose}
						type="button"
					>
						Cancel
					</button>
					<button
						className="btn btn-primary btn-sm"
						disabled={archiveMutation.isPending}
						onClick={() => archiveMutation.mutate()}
						type="button"
					>
						{archiveMutation.isPending ? "Archiving…" : "Archive template"}
					</button>
				</>
			}
			icon={<Archive size={18} />}
			intro="Existing offboarding cases will not be changed. The template will no longer appear when starting a new case."
			onClose={onClose}
			title="Archive this template?"
		>
			{null}
		</Modal>
	);
}

function Summary({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
			<span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{label}</span>
			<span style={{ fontSize: 13.5, color: "var(--fg)" }}>{value}</span>
		</div>
	);
}
