// Shapes returned by the performance.reviewCycles procs (the columns the UI
// reads). The results payload is the anonymity-critical one: `named` carries
// reviewer identity for self/manager/report only; `peers` arrives already
// reduced by the server to one of three modes. The UI renders the mode it is
// given and NEVER infers a peer identity that the server withheld.

export interface CycleRow {
	anonymityThreshold: number;
	createdAt: string | Date | null;
	description: string | null;
	endDate: string | Date | null;
	id: string;
	isAnonymousPeers: boolean;
	name: string;
	reference: string;
	startDate: string | Date | null;
	status: string;
	type: string;
}

export interface ReviewRequestRow {
	createdAt: string | Date | null;
	cycleId: string;
	id: string;
	relationship: string;
	status: string;
	subjectEmployeeId: string;
	subjectName: string | null;
	submittedAt: string | Date | null;
}

export interface ResponseRow {
	answerJson: unknown;
	answerRating: number | null;
	answerText: string | null;
	id: string;
	questionId: string | null;
	requestId: string;
}

export interface NamedResult {
	relationship: string;
	responses: ResponseRow[];
	reviewerName: string | null;
	status: string;
}

// Discriminated on `mode`: the server picked exactly one. `hidden` carries no
// responses (below threshold); `aggregated` carries responses but NO reviewer
// name; `raw` (HR only) carries names.
export interface PeerResultsHidden {
	message: string;
	mode: "hidden";
	submitted: number;
	threshold: number;
}
export interface PeerResultsAggregated {
	items: { responses: ResponseRow[] }[];
	mode: "aggregated";
	submitted: number;
	threshold: number;
}
export interface PeerResultsRaw {
	count: number;
	items: {
		responses: ResponseRow[];
		reviewerName: string | null;
		status: string;
	}[];
	mode: "raw";
	submitted: number;
}
export type PeerResults =
	| PeerResultsHidden
	| PeerResultsAggregated
	| PeerResultsRaw;

export interface ReviewResults {
	cycle: CycleRow;
	named: NamedResult[];
	peers: PeerResults;
	subjectId: string;
}
