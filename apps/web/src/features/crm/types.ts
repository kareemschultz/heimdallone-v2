// Display-side mirrors of the crm router outputs (Phase 17C).

export interface StageRow {
	defaultProbabilityPct: number | null;
	id: string;
	isLost: boolean;
	isWon: boolean;
	name: string;
	position: number;
}

export interface CustomerRow {
	email: string | null;
	id: string;
	industry: string | null;
	name: string;
	openDealCount: number;
	openDealValue: string;
	ownerEmployeeId: string | null;
	ownerName?: string | null;
	phone: string | null;
	sourceKey: string | null;
	status: string;
	type: string;
	website: string | null;
}

export interface ContactRow {
	customerId: string | null;
	email: string | null;
	firstName: string;
	id: string;
	isPrimary: boolean;
	jobTitle: string | null;
	lastName: string | null;
	phone: string | null;
}

export interface LeadRow {
	companyName: string | null;
	contactEmail: string | null;
	contactPhone: string | null;
	convertedCustomerId: string | null;
	convertedDealId: string | null;
	description: string | null;
	estimatedValue: number | null;
	id: string;
	name: string;
	ownerEmployeeId: string | null;
	ownerName?: string | null;
	sourceKey: string | null;
	status: string;
}

export interface DealRow {
	currency: string;
	customerId: string;
	customerName?: string | null;
	expectedCloseDate: string | null;
	handedOffProjectLinkId: string | null;
	id: string;
	isStalled?: boolean;
	lastActivityAt: string | null;
	lostReason: string | null;
	ownerEmployeeId: string | null;
	ownerName?: string | null;
	primaryContactId: string | null;
	probabilityPct: number | null;
	stageId: string;
	stageName?: string | null;
	status: string;
	title: string;
	value: number | null;
}

export interface ActivityRow {
	assignedToEmployeeId: string | null;
	assigneeName?: string | null;
	body: string | null;
	completedAt: string | null;
	dueAt: string | null;
	id: string;
	isOverdue?: boolean;
	relatedId: string;
	relatedType: string;
	subject: string;
	type: string;
}

export interface NoteRow {
	body: string;
	createdAt: string;
	id: string;
	relatedId: string;
	relatedType: string;
	visibility: string;
}

export interface HandoffRow {
	customerId: string;
	dealId: string | null;
	handedOffAt: string | null;
	handoffNote: string | null;
	handoffStatus: string;
	id: string;
	projectId: string | null;
}
