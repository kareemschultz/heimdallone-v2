import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import "@/styles/surveys.css";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { canManageSurveys } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/surveys/")({
	component: SurveysPage,
});

type AudienceType = "all_members" | "department" | "role";
type QuestionType = "text" | "single_choice" | "multi_choice" | "rating";

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

const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
	text: "Text",
	single_choice: "Single choice",
	multi_choice: "Multiple choice",
	rating: "Rating",
};

interface FeedSurvey {
	closesAt: string | Date | null;
	description: string | null;
	hasResponded: boolean;
	id: string;
	isAnonymous: boolean;
	title: string;
}

interface ManageSurvey {
	audienceType: AudienceType;
	createdAt: string | Date;
	id: string;
	isAnonymous: boolean;
	publishedAt: string | Date | null;
	status: "draft" | "published" | "closed";
	title: string;
}

interface Question {
	id: string;
	isRequired: boolean;
	options: unknown;
	questionText: string;
	questionType: QuestionType;
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

function statusBadgeClass(status: ManageSurvey["status"]): string {
	if (status === "published") {
		return "badge badge-success";
	}
	if (status === "closed") {
		return "badge badge-warning";
	}
	return "badge badge-info";
}

function optionList(options: unknown): string[] {
	return Array.isArray(options) ? (options as string[]) : [];
}

function maxRating(options: unknown): number {
	const m = (options as { maxRating?: number } | null)?.maxRating;
	return typeof m === "number" ? m : 5;
}

// ── one question's answer input (respond form) ──
interface AnswerValue {
	choices?: string[];
	rating?: number;
	text?: string;
}

function QuestionInput({
	question,
	value,
	onChange,
}: {
	question: Question;
	value: AnswerValue;
	onChange: (v: AnswerValue) => void;
}) {
	if (question.questionType === "text") {
		return (
			<textarea
				onChange={(e) => onChange({ text: e.target.value })}
				rows={3}
				value={value.text ?? ""}
			/>
		);
	}
	if (question.questionType === "rating") {
		const max = maxRating(question.options);
		return (
			<div className="sv-rating">
				{Array.from({ length: max }, (_, i) => i + 1).map((n) => (
					<button
						className={`sv-rating-btn ${value.rating === n ? "active" : ""}`}
						key={n}
						onClick={() => onChange({ rating: n })}
						type="button"
					>
						{n}
					</button>
				))}
			</div>
		);
	}
	const opts = optionList(question.options);
	const selected = value.choices ?? [];
	const multi = question.questionType === "multi_choice";
	return (
		<div>
			{opts.map((opt) => {
				const checked = selected.includes(opt);
				return (
					<label className="sv-opt" key={opt}>
						<input
							checked={checked}
							onChange={() => {
								if (multi) {
									onChange({
										choices: checked
											? selected.filter((c) => c !== opt)
											: [...selected, opt],
									});
								} else {
									onChange({ choices: [opt] });
								}
							}}
							type={multi ? "checkbox" : "radio"}
						/>
						{opt}
					</label>
				);
			})}
		</div>
	);
}

function RespondDialog({
	surveyId,
	onClose,
	onDone,
}: {
	surveyId: string;
	onClose: () => void;
	onDone: () => void;
}) {
	const detail = useQuery(
		orpc.surveys.getById.queryOptions({ input: { id: surveyId } })
	);
	const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
	const [saving, setSaving] = useState(false);
	const data = detail.data as
		| { survey: { title: string; isAnonymous: boolean }; questions: Question[] }
		| undefined;

	const submit = async () => {
		if (!data) {
			return;
		}
		setSaving(true);
		try {
			await client.surveys.respond({
				surveyId,
				answers: data.questions.map((q) => ({
					questionId: q.id,
					answerText: answers[q.id]?.text ?? null,
					choices: answers[q.id]?.choices ?? null,
					rating: answers[q.id]?.rating ?? null,
				})),
			});
			toast.success("Thanks — your response was recorded.");
			onDone();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not submit.");
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
						disabled={saving || !data}
						onClick={submit}
						type="button"
					>
						{saving ? "Submitting…" : "Submit"}
					</button>
				</>
			}
			icon={<ClipboardList size={18} />}
			intro={
				data?.survey.isAnonymous
					? "This survey is anonymous. Your answers are not linked to your name."
					: undefined
			}
			onClose={onClose}
			title={data?.survey.title ?? "Survey"}
			wide
		>
			{detail.isLoading ? <p className="page-sub">Loading…</p> : null}
			{detail.isError ? (
				<p className="page-sub" style={{ color: "var(--danger)" }}>
					This survey is not available.
				</p>
			) : null}
			{data?.questions.map((q) => (
				<div className="sv-field" key={q.id}>
					<label htmlFor={`q-${q.id}`}>
						{q.questionText}
						{q.isRequired ? <span className="sv-req"> *</span> : null}
					</label>
					<QuestionInput
						onChange={(v) => setAnswers((p) => ({ ...p, [q.id]: v }))}
						question={q}
						value={answers[q.id] ?? {}}
					/>
				</div>
			))}
		</Modal>
	);
}

// ── results (aggregate only) ──
interface ResultQuestion {
	average?: number;
	count?: number;
	counts?: Record<string, number>;
	distribution?: Record<string, number>;
	options?: string[];
	questionId: string;
	questionText: string;
	questionType: QuestionType;
	textAnswers?: string[];
}

function ResultBars({
	labels,
	counts,
}: {
	labels: string[];
	counts: Record<string, number>;
}) {
	const max = Math.max(1, ...Object.values(counts));
	return (
		<div>
			{labels.map((label) => {
				const c = counts[label] ?? 0;
				return (
					<div className="sv-bar-row" key={label}>
						<span className="sv-bar-label">{label}</span>
						<span className="sv-bar-track">
							<span
								className="sv-bar-fill"
								style={{ width: `${(c / max) * 100}%` }}
							/>
						</span>
						<span className="sv-bar-count">{c}</span>
					</div>
				);
			})}
		</div>
	);
}

function ResultRow({ q }: { q: ResultQuestion }) {
	return (
		<div className="sv-result">
			<div className="sv-result-q">{q.questionText}</div>
			{q.questionType === "text"
				? (q.textAnswers ?? []).map((t, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: free-text answers are not unique and have no id
						<div className="sv-text-answer" key={`${q.questionId}-${i}`}>
							{t}
						</div>
					))
				: null}
			{q.questionType === "rating" ? (
				<>
					<div className="sv-card-meta">
						Average {q.average ?? 0} · {q.count ?? 0} responses
					</div>
					<ResultBars
						counts={q.distribution ?? {}}
						labels={Object.keys(q.distribution ?? {}).sort()}
					/>
				</>
			) : null}
			{q.questionType === "single_choice" ||
			q.questionType === "multi_choice" ? (
				<ResultBars counts={q.counts ?? {}} labels={q.options ?? []} />
			) : null}
		</div>
	);
}

function ResultsPanel({
	surveyId,
	onClose,
}: {
	surveyId: string;
	onClose: () => void;
}) {
	const res = useQuery(
		orpc.surveys.results.queryOptions({ input: { id: surveyId } })
	);
	const data = res.data as
		| {
				survey: { title: string; isAnonymous: boolean };
				responseCount: number;
				questions: ResultQuestion[];
		  }
		| undefined;
	return (
		<Modal
			footer={
				<button className="btn btn-primary" onClick={onClose} type="button">
					Close
				</button>
			}
			icon={<ClipboardList size={18} />}
			intro={`${data?.responseCount ?? 0} response(s)${data?.survey.isAnonymous ? " · anonymous" : ""}`}
			onClose={onClose}
			title={data ? `Results — ${data.survey.title}` : "Results"}
			wide
		>
			{res.isLoading ? <p className="page-sub">Loading…</p> : null}
			{res.isError ? (
				<p className="page-sub" style={{ color: "var(--danger)" }}>
					Could not load results.
				</p>
			) : null}
			{data && data.responseCount === 0 ? (
				<EmptyState compact description="No responses yet." title="No data" />
			) : null}
			{data?.questions.map((q) => (
				<ResultRow key={q.questionId} q={q} />
			))}
		</Modal>
	);
}

function SurveyFeed({
	feed,
	isLoading,
	isError,
	onRespond,
}: {
	feed: FeedSurvey[];
	isLoading: boolean;
	isError: boolean;
	onRespond: (id: string) => void;
}) {
	if (isLoading) {
		return <p className="page-sub">Loading…</p>;
	}
	if (isError) {
		return (
			<p className="page-sub" style={{ color: "var(--danger)" }}>
				Could not load surveys.
			</p>
		);
	}
	if (feed.length === 0) {
		return (
			<EmptyState
				description="There are no surveys for you right now."
				icon={<ClipboardList size={28} />}
				title="Nothing to fill in"
			/>
		);
	}
	return (
		<>
			{feed.map((s) => (
				<div className="sv-card" key={s.id}>
					<div className="sv-card-title">{s.title}</div>
					{s.description ? (
						<div className="sv-card-desc">{s.description}</div>
					) : null}
					<div className="sv-card-foot">
						<span className="sv-card-meta">
							{s.isAnonymous ? "Anonymous" : "Identified"}
							{s.closesAt ? ` · closes ${fmtDate(s.closesAt)}` : ""}
						</span>
						{s.hasResponded ? (
							<span className="badge badge-success">Responded</span>
						) : (
							<button
								className="btn btn-primary btn-sm"
								onClick={() => onRespond(s.id)}
								type="button"
							>
								Respond
							</button>
						)}
					</div>
				</div>
			))}
		</>
	);
}

function SurveyManageRow({
	s,
	onPublish,
	onClose,
	onResults,
}: {
	s: ManageSurvey;
	onPublish: (id: string) => void;
	onClose: (id: string) => void;
	onResults: (id: string) => void;
}) {
	return (
		<tr>
			<td>{s.title}</td>
			<td>
				<span className={statusBadgeClass(s.status)}>{s.status}</span>
			</td>
			<td>{s.isAnonymous ? "Anonymous" : "Identified"}</td>
			<td>{fmtDate(s.publishedAt)}</td>
			<td>
				<div className="ann-row-actions">
					{s.status === "draft" ? (
						<button
							className="btn btn-outline btn-sm"
							onClick={() => onPublish(s.id)}
							type="button"
						>
							Publish
						</button>
					) : null}
					{s.status === "published" ? (
						<button
							className="btn btn-ghost btn-sm"
							onClick={() => onClose(s.id)}
							type="button"
						>
							Close
						</button>
					) : null}
					<button
						className="btn btn-ghost btn-sm"
						onClick={() => onResults(s.id)}
						type="button"
					>
						Results
					</button>
				</div>
			</td>
		</tr>
	);
}

function SurveyManageTable({
	managed,
	isLoading,
	isError,
	onPublish,
	onClose,
	onResults,
}: {
	managed: ManageSurvey[];
	isLoading: boolean;
	isError: boolean;
	onPublish: (id: string) => void;
	onClose: (id: string) => void;
	onResults: (id: string) => void;
}) {
	return (
		<div className="card card-pad">
			{isLoading ? <p className="page-sub">Loading…</p> : null}
			{isError ? (
				<p className="page-sub" style={{ color: "var(--danger)" }}>
					Could not load.
				</p>
			) : null}
			{!(isLoading || isError) && managed.length === 0 ? (
				<EmptyState
					description="Create your first survey."
					icon={<ClipboardList size={28} />}
					title="No surveys yet"
				/>
			) : null}
			{managed.length > 0 ? (
				<div className="table-wrap">
					<table className="tbl">
						<thead>
							<tr>
								<th>Title</th>
								<th>Status</th>
								<th>Type</th>
								<th>Published</th>
								<th aria-label="Actions" />
							</tr>
						</thead>
						<tbody>
							{managed.map((s) => (
								<SurveyManageRow
									key={s.id}
									onClose={onClose}
									onPublish={onPublish}
									onResults={onResults}
									s={s}
								/>
							))}
						</tbody>
					</table>
				</div>
			) : null}
		</div>
	);
}

function SurveysPage() {
	const org = useContext(OrgCtx);
	const canManage = canManageSurveys(org.memberRole);
	const qc = useQueryClient();
	const [tab, setTab] = useState<"feed" | "manage">("feed");
	const [builderOpen, setBuilderOpen] = useState(false);
	const [respondId, setRespondId] = useState<string | null>(null);
	const [resultsId, setResultsId] = useState<string | null>(null);

	const feedQuery = useQuery(orpc.surveys.feed.queryOptions({ input: {} }));
	const manageQuery = useQuery({
		...orpc.surveys.list.queryOptions({ input: {} }),
		enabled: canManage && tab === "manage",
	});
	const feed = (feedQuery.data ?? []) as FeedSurvey[];
	const managed = (manageQuery.data ?? []) as ManageSurvey[];
	const invalidate = () => qc.invalidateQueries();

	const publish = async (id: string) => {
		try {
			await client.surveys.publish({ id });
			toast.success("Published.");
			invalidate();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed.");
		}
	};
	const close = async (id: string) => {
		try {
			await client.surveys.close({ id });
			toast.success("Closed.");
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
						<span>Surveys</span>
					</div>
					<h1 className="page-title">Surveys</h1>
					<p className="page-sub">Questionnaires and feedback.</p>
				</div>
				{canManage ? (
					<button
						className="btn btn-primary"
						onClick={() => setBuilderOpen(true)}
						type="button"
					>
						<Plus size={14} />
						New survey
					</button>
				) : null}
			</div>

			{canManage ? (
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
			) : null}

			{tab === "feed" ? (
				<SurveyFeed
					feed={feed}
					isError={feedQuery.isError}
					isLoading={feedQuery.isLoading}
					onRespond={setRespondId}
				/>
			) : null}

			{tab === "manage" && canManage ? (
				<SurveyManageTable
					isError={manageQuery.isError}
					isLoading={manageQuery.isLoading}
					managed={managed}
					onClose={close}
					onPublish={publish}
					onResults={setResultsId}
				/>
			) : null}

			{builderOpen ? (
				<SurveyBuilderDialog
					onClose={() => setBuilderOpen(false)}
					onSaved={() => {
						setBuilderOpen(false);
						setTab("manage");
						invalidate();
					}}
				/>
			) : null}
			{respondId ? (
				<RespondDialog
					onClose={() => setRespondId(null)}
					onDone={() => {
						setRespondId(null);
						invalidate();
					}}
					surveyId={respondId}
				/>
			) : null}
			{resultsId ? (
				<ResultsPanel onClose={() => setResultsId(null)} surveyId={resultsId} />
			) : null}
		</div>
	);
}

// ── builder: create survey + add questions, then publish from the table ──
interface DraftQuestion {
	isRequired: boolean;
	maxRating: number;
	options: string;
	questionText: string;
	questionType: QuestionType;
}

// Persist a new draft survey + its questions (kept module-level to keep the
// builder component's cognitive complexity in check).
async function persistSurvey(
	surveyInput: {
		title: string;
		description: string | null;
		isAnonymous: boolean;
		audienceType: AudienceType;
		audienceDepartmentId: string | null;
		audienceRole: string | null;
	},
	questions: DraftQuestion[]
): Promise<void> {
	const created = await client.surveys.create(surveyInput);
	for (let i = 0; i < questions.length; i++) {
		const q = questions[i];
		const needsOptions =
			q.questionType === "single_choice" || q.questionType === "multi_choice";
		await client.surveys.questionsAdd({
			surveyId: created.id,
			questionType: q.questionType,
			questionText: q.questionText.trim(),
			options: needsOptions
				? q.options
						.split("\n")
						.map((o) => o.trim())
						.filter(Boolean)
				: null,
			maxRating: q.questionType === "rating" ? q.maxRating : null,
			isRequired: q.isRequired,
			sortOrder: i,
		});
	}
}

function QuestionEditor({
	q,
	index,
	onUpdate,
	onRemove,
}: {
	q: DraftQuestion;
	index: number;
	onUpdate: (i: number, patch: Partial<DraftQuestion>) => void;
	onRemove: (i: number) => void;
}) {
	const isChoice =
		q.questionType === "single_choice" || q.questionType === "multi_choice";
	return (
		<div className="sv-q">
			<div className="sv-q-head">
				<span className="sv-q-type">{QUESTION_TYPE_LABEL[q.questionType]}</span>
				<button
					aria-label="Remove question"
					className="btn btn-ghost btn-sm"
					onClick={() => onRemove(index)}
					type="button"
				>
					<Trash2 size={12} />
				</button>
			</div>
			<div className="sv-field">
				<input
					onChange={(e) => onUpdate(index, { questionText: e.target.value })}
					placeholder="Question text"
					value={q.questionText}
				/>
			</div>
			<div className="sv-field-row">
				<div className="sv-field">
					<select
						onChange={(e) =>
							onUpdate(index, { questionType: e.target.value as QuestionType })
						}
						value={q.questionType}
					>
						<option value="text">Text</option>
						<option value="single_choice">Single choice</option>
						<option value="multi_choice">Multiple choice</option>
						<option value="rating">Rating</option>
					</select>
				</div>
				<label className="sv-checkline">
					<input
						checked={q.isRequired}
						onChange={(e) => onUpdate(index, { isRequired: e.target.checked })}
						type="checkbox"
					/>
					Required
				</label>
			</div>
			{isChoice ? (
				<div className="sv-field">
					<textarea
						onChange={(e) => onUpdate(index, { options: e.target.value })}
						placeholder="One option per line"
						rows={3}
						value={q.options}
					/>
				</div>
			) : null}
			{q.questionType === "rating" ? (
				<div className="sv-field">
					<label htmlFor={`sv-max-${index}`}>Max rating</label>
					<input
						id={`sv-max-${index}`}
						inputMode="numeric"
						onChange={(e) =>
							onUpdate(index, {
								maxRating: Number.parseInt(e.target.value, 10) || 5,
							})
						}
						value={q.maxRating}
					/>
				</div>
			) : null}
		</div>
	);
}

function SurveyBuilderDialog({
	onClose,
	onSaved,
}: {
	onClose: () => void;
	onSaved: () => void;
}) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [isAnonymous, setIsAnonymous] = useState(true);
	const [audienceType, setAudienceType] = useState<AudienceType>("all_members");
	const [audienceDepartmentId, setAudienceDepartmentId] = useState("");
	const [audienceRole, setAudienceRole] = useState("employee");
	const [questions, setQuestions] = useState<DraftQuestion[]>([]);
	const [saving, setSaving] = useState(false);

	const deptQuery = useQuery(
		orpc.hrCore.departments.list.queryOptions({
			input: { includeArchived: false },
		})
	);
	const departments = (deptQuery.data ?? []) as { id: string; name: string }[];

	const addQuestion = () =>
		setQuestions((p) => [
			...p,
			{
				questionType: "text",
				questionText: "",
				options: "",
				maxRating: 5,
				isRequired: false,
			},
		]);
	const updateQuestion = (i: number, patch: Partial<DraftQuestion>) =>
		setQuestions((p) =>
			p.map((q, idx) => (idx === i ? { ...q, ...patch } : q))
		);
	const removeQuestion = (i: number) =>
		setQuestions((p) => p.filter((_, idx) => idx !== i));

	const save = async () => {
		if (!title.trim()) {
			toast.error("A title is required.");
			return;
		}
		if (
			questions.length === 0 ||
			questions.some((q) => !q.questionText.trim())
		) {
			toast.error("Add at least one question and fill in each question text.");
			return;
		}
		setSaving(true);
		try {
			await persistSurvey(
				{
					title: title.trim(),
					description: description.trim() || null,
					isAnonymous,
					audienceType,
					audienceDepartmentId:
						audienceType === "department" ? audienceDepartmentId || null : null,
					audienceRole: audienceType === "role" ? audienceRole : null,
				},
				questions
			);
			toast.success("Survey saved as draft. Publish it when ready.");
			onSaved();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save.");
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
						{saving ? "Saving…" : "Save draft"}
					</button>
				</>
			}
			icon={<ClipboardList size={18} />}
			intro="Build your survey below. Add questions, set the audience, then save as a draft. Publish it from the Manage tab when ready."
			onClose={onClose}
			title="New survey"
			wide
		>
			<div className="sv-field">
				<label htmlFor="sv-title">Title</label>
				<input
					id="sv-title"
					onChange={(e) => setTitle(e.target.value)}
					value={title}
				/>
			</div>
			<div className="sv-field">
				<label htmlFor="sv-desc">Description</label>
				<textarea
					id="sv-desc"
					onChange={(e) => setDescription(e.target.value)}
					rows={2}
					value={description}
				/>
			</div>
			<div className="sv-field-row">
				<div className="sv-field">
					<label htmlFor="sv-aud">Audience</label>
					<select
						id="sv-aud"
						onChange={(e) => setAudienceType(e.target.value as AudienceType)}
						value={audienceType}
					>
						<option value="all_members">Everyone</option>
						<option value="department">A department</option>
						<option value="role">A role</option>
					</select>
				</div>
				{audienceType === "department" ? (
					<div className="sv-field">
						<label htmlFor="sv-dept">Department</label>
						<select
							id="sv-dept"
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
				) : null}
				{audienceType === "role" ? (
					<div className="sv-field">
						<label htmlFor="sv-role">Role</label>
						<select
							id="sv-role"
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
				) : null}
			</div>
			<label className="sv-checkline" style={{ marginTop: 12 }}>
				<input
					checked={isAnonymous}
					onChange={(e) => setIsAnonymous(e.target.checked)}
					type="checkbox"
				/>
				Anonymous (responses are not linked to a person)
			</label>

			<div className="sv-field">
				<span className="sv-q-type">Questions</span>
				{questions.map((q, i) => (
					<QuestionEditor
						index={i}
						// biome-ignore lint/suspicious/noArrayIndexKey: draft questions have no stable id until saved
						key={i}
						onRemove={removeQuestion}
						onUpdate={updateQuestion}
						q={q}
					/>
				))}
				<button
					className="btn btn-outline btn-sm"
					onClick={addQuestion}
					style={{ marginTop: 10 }}
					type="button"
				>
					<Plus size={12} /> Add question
				</button>
			</div>
		</Modal>
	);
}
