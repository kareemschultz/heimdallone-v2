// Shapes returned by the performance router (the columns the UI reads). The API
// resolves employeeName and the read-only linkedTask context. NOTE: the UI never
// renders objective.internalNote (a reserved manager note) or any private 1-on-1
// note or peer-review data — those are out of scope for 15D.

export interface ObjectiveRow {
	completedAt: string | Date | null;
	createdAt: string | Date | null;
	cycleId: string | null;
	description: string | null;
	dueDate: string | Date | null;
	employeeId: string;
	employeeName: string | null;
	id: string;
	isArchived: boolean;
	progressPercent: number;
	reference: string;
	startDate: string | Date | null;
	status: string;
	title: string;
	weight: number;
}

export interface LinkedTask {
	completedAt: string | Date | null;
	id: string;
	status: string;
	title: string;
}

export interface KeyResultRow {
	currentValue: string;
	id: string;
	linkedProjectTaskId: string | null;
	linkedTask: LinkedTask | null;
	objectiveId: string;
	progressType: string;
	startValue: string;
	status: string;
	targetValue: string;
	title: string;
}

export interface ObjectiveDetail extends ObjectiveRow {
	keyResults: KeyResultRow[];
}

export interface RecognitionRow {
	createdAt: string | Date | null;
	employeeId: string;
	employeeName: string | null;
	id: string;
	isPay: false;
	points: number;
	reason: string | null;
	source: string;
}

/** Clamp a key result's progress to 0..100 from its start/current/target. */
export function krProgressPercent(kr: KeyResultRow): number {
	const start = Number(kr.startValue);
	const current = Number(kr.currentValue);
	const target = Number(kr.targetValue);
	const span = target - start;
	if (span === 0) {
		return current >= target ? 100 : 0;
	}
	const pct = ((current - start) / span) * 100;
	return Math.max(0, Math.min(100, Math.round(pct)));
}
