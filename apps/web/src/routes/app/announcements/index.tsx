import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Megaphone, Pin, Plus } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/announcements.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { canManageAnnouncements } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/announcements/")({
	component: AnnouncementsPage,
});

type AudienceType = "all_members" | "department" | "role";

const ROLE_OPTIONS = [
	"tenant_owner",
	"tenant_admin",
	"hr_admin",
	"payroll_admin",
	"manager",
	"employee",
	"auditor",
	"recruiter",
	"helpdesk_agent",
	"project_manager",
	"sales_admin",
	"sales_rep",
	"inventory_manager",
	"stock_officer",
];

interface FeedItem {
	body: string;
	id: string;
	isPinned: boolean;
	publishedAt: string | Date | null;
	readAt: string | Date | null;
	title: string;
}

interface ManageItem {
	audienceType: AudienceType;
	createdAt: string | Date;
	id: string;
	isPinned: boolean;
	publishedAt: string | Date | null;
	status: "draft" | "published" | "archived";
	title: string;
}

function saveButtonLabel(saving: boolean, publishNow: boolean): string {
	if (saving) {
		return "Saving…";
	}
	return publishNow ? "Publish" : "Save draft";
}

function statusBadgeClass(status: ManageItem["status"]): string {
	if (status === "published") {
		return "badge badge-success";
	}
	if (status === "archived") {
		return "badge badge-warning";
	}
	return "badge badge-info";
}

function fmtDate(v: string | Date | null): string {
	if (!v) {
		return "—";
	}
	const d = typeof v === "string" ? new Date(v) : v;
	return Number.isNaN(d.getTime())
		? "—"
		: d.toLocaleDateString(undefined, {
				day: "numeric",
				month: "short",
				year: "numeric",
			});
}

function AnnouncementsPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageAnnouncements(org.memberRole);
	const qc = useQueryClient();
	const [tab, setTab] = useState<"feed" | "manage">("feed");
	const [dialogOpen, setDialogOpen] = useState(false);

	const feedQuery = useQuery(
		orpc.communications.announcements.feed.queryOptions({})
	);
	const manageQuery = useQuery({
		...orpc.communications.announcements.list.queryOptions({ input: {} }),
		enabled: canManage && tab === "manage",
	});

	const feed = (feedQuery.data ?? []) as FeedItem[];
	const managed = (manageQuery.data ?? []) as ManageItem[];

	const invalidate = () => qc.invalidateQueries();

	const markRead = async (id: string) => {
		try {
			await client.communications.announcements.markRead({ id });
			invalidate();
		} catch {
			// non-fatal
		}
	};

	const publish = async (id: string, next: boolean) => {
		try {
			await client.communications.announcements.publish({ id, publish: next });
			toast.success(next ? "Published." : "Unpublished.");
			invalidate();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed.");
		}
	};

	const archive = async (id: string) => {
		try {
			await client.communications.announcements.archive({ id });
			toast.success("Archived.");
			invalidate();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed.");
		}
	};

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Announcements</span>
					</div>
					<h1 className="page-title">Announcements</h1>
					<p className="page-sub">Company updates and notices.</p>
				</div>
				{canManage && (
					<button
						className="btn btn-primary"
						onClick={() => setDialogOpen(true)}
						type="button"
					>
						<Plus size={14} />
						New announcement
					</button>
				)}
			</div>

			{canManage && (
				<div className="tabs" style={{ marginBottom: 18 }}>
					<button
						aria-selected={tab === "feed"}
						className="tab"
						onClick={() => setTab("feed")}
						role="tab"
						type="button"
					>
						Feed
					</button>
					<button
						aria-selected={tab === "manage"}
						className="tab"
						onClick={() => setTab("manage")}
						role="tab"
						type="button"
					>
						Manage
					</button>
				</div>
			)}

			{tab === "feed" && (
				<>
					{feedQuery.isLoading && <p className="page-sub">Loading…</p>}
					{feedQuery.isError && (
						<p className="page-sub" style={{ color: "var(--danger)" }}>
							Could not load announcements.
						</p>
					)}
					{!(feedQuery.isLoading || feedQuery.isError) && feed.length === 0 && (
						<EmptyState
							description="There are no announcements right now."
							icon={<Megaphone size={28} />}
							title="Nothing to show"
						/>
					)}
					{feed.map((a) => (
						<button
							className={a.readAt ? "ann-card" : "ann-card unread"}
							key={a.id}
							onClick={() => !a.readAt && markRead(a.id)}
							style={{
								display: "block",
								width: "100%",
								textAlign: "left",
								cursor: a.readAt ? "default" : "pointer",
							}}
							type="button"
						>
							<div className="ann-card-head">
								<div>
									<div className="ann-title">{a.title}</div>
									<div className="ann-meta">{fmtDate(a.publishedAt)}</div>
								</div>
								{a.isPinned && (
									<span className="ann-pin">
										<Pin size={12} /> Pinned
									</span>
								)}
							</div>
							<div className="ann-body">{a.body}</div>
						</button>
					))}
				</>
			)}

			{tab === "manage" && canManage && (
				<div className="card card-pad">
					{manageQuery.isLoading && <p className="page-sub">Loading…</p>}
					{manageQuery.isError && (
						<p className="page-sub" style={{ color: "var(--danger)" }}>
							Could not load.
						</p>
					)}
					{!(manageQuery.isLoading || manageQuery.isError) &&
						managed.length === 0 && (
							<EmptyState
								description="Create your first announcement."
								icon={<Megaphone size={28} />}
								title="No announcements yet"
							/>
						)}
					{managed.length > 0 && (
						<div className="table-wrap">
							<table className="tbl">
								<thead>
									<tr>
										<th>Title</th>
										<th>Status</th>
										<th>Audience</th>
										<th>Published</th>
										<th aria-label="Actions" />
									</tr>
								</thead>
								<tbody>
									{managed.map((a) => (
										<tr key={a.id}>
											<td>
												{a.isPinned && <Pin size={11} />} {a.title}
											</td>
											<td>
												<span className={statusBadgeClass(a.status)}>
													{a.status}
												</span>
											</td>
											<td>{a.audienceType.replace("_", " ")}</td>
											<td>{fmtDate(a.publishedAt)}</td>
											<td>
												<div className="ann-row-actions">
													{a.status !== "published" &&
														a.status !== "archived" && (
															<button
																className="btn btn-outline btn-sm"
																onClick={() => publish(a.id, true)}
																type="button"
															>
																<Check size={12} /> Publish
															</button>
														)}
													{a.status === "published" && (
														<button
															className="btn btn-ghost btn-sm"
															onClick={() => publish(a.id, false)}
															type="button"
														>
															Unpublish
														</button>
													)}
													{a.status !== "archived" && (
														<button
															className="btn btn-ghost btn-sm"
															onClick={() => archive(a.id)}
															type="button"
														>
															Archive
														</button>
													)}
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			{dialogOpen && (
				<AnnouncementDialog
					onClose={() => setDialogOpen(false)}
					onSaved={() => {
						setDialogOpen(false);
						setTab("manage");
						invalidate();
					}}
				/>
			)}
		</div>
	);
}

function AnnouncementDialog({
	onClose,
	onSaved,
}: {
	onClose: () => void;
	onSaved: () => void;
}) {
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [audienceType, setAudienceType] = useState<AudienceType>("all_members");
	const [audienceDepartmentId, setAudienceDepartmentId] = useState("");
	const [audienceRole, setAudienceRole] = useState("employee");
	const [isPinned, setIsPinned] = useState(false);
	const [publishNow, setPublishNow] = useState(true);
	const [saving, setSaving] = useState(false);

	const deptQuery = useQuery(
		orpc.hrCore.departments.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const departments = (deptQuery.data ?? []) as { id: string; name: string }[];

	const save = async () => {
		if (!(title.trim() && body.trim())) {
			toast.error("Title and message are required.");
			return;
		}
		setSaving(true);
		try {
			const created = await client.communications.announcements.create({
				title: title.trim(),
				body: body.trim(),
				audienceType,
				audienceDepartmentId:
					audienceType === "department" ? audienceDepartmentId || null : null,
				audienceRole: audienceType === "role" ? audienceRole : null,
				isPinned,
			});
			if (publishNow) {
				await client.communications.announcements.publish({
					id: created.id,
					publish: true,
				});
			}
			toast.success(publishNow ? "Published." : "Saved as draft.");
			onSaved();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			footer={
				<>
					<button className="btn btn-ghost" onClick={onClose} type="button">
						Cancel
					</button>
					<button
						className="btn btn-primary"
						disabled={saving}
						onClick={save}
						type="button"
					>
						{saveButtonLabel(saving, publishNow)}
					</button>
				</>
			}
			icon={<Megaphone size={18} />}
			intro="Announcements are posted to the selected audience's feed immediately or saved as a draft."
			onClose={onClose}
			title="New announcement"
		>
			<div className="ann-form-field">
				<label htmlFor="ann-title">Title</label>
				<input
					id="ann-title"
					onChange={(e) => setTitle(e.target.value)}
					value={title}
				/>
			</div>
			<div className="ann-form-field">
				<label htmlFor="ann-body">Message</label>
				<textarea
					id="ann-body"
					onChange={(e) => setBody(e.target.value)}
					value={body}
				/>
			</div>
			<div className="ann-form-row">
				<div className="ann-form-field">
					<label htmlFor="ann-aud">Audience</label>
					<select
						id="ann-aud"
						onChange={(e) => setAudienceType(e.target.value as AudienceType)}
						value={audienceType}
					>
						<option value="all_members">Everyone</option>
						<option value="department">A department</option>
						<option value="role">A role</option>
					</select>
				</div>
				{audienceType === "department" && (
					<div className="ann-form-field">
						<label htmlFor="ann-dept">Department</label>
						<select
							id="ann-dept"
							onChange={(e) => setAudienceDepartmentId(e.target.value)}
							value={audienceDepartmentId}
						>
							<option value="">Select…</option>
							{departments.map((d) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>
					</div>
				)}
				{audienceType === "role" && (
					<div className="ann-form-field">
						<label htmlFor="ann-role">Role</label>
						<select
							id="ann-role"
							onChange={(e) => setAudienceRole(e.target.value)}
							value={audienceRole}
						>
							{ROLE_OPTIONS.map((r) => (
								<option key={r} value={r}>
									{r.replace(/_/g, " ")}
								</option>
							))}
						</select>
					</div>
				)}
			</div>
			<div className="ann-form-row" style={{ marginTop: 12 }}>
				<label
					style={{
						display: "flex",
						gap: 6,
						alignItems: "center",
						fontSize: 13,
					}}
				>
					<input
						checked={isPinned}
						onChange={(e) => setIsPinned(e.target.checked)}
						type="checkbox"
					/>
					Pin to top
				</label>
				<label
					style={{
						display: "flex",
						gap: 6,
						alignItems: "center",
						fontSize: 13,
					}}
				>
					<input
						checked={publishNow}
						onChange={(e) => setPublishNow(e.target.checked)}
						type="checkbox"
					/>
					Publish now
				</label>
			</div>
		</Modal>
	);
}
