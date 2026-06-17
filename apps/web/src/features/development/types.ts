// Development module — shared row types (Phase Dev). These mirror the shapes the
// `development` router returns; kept loose (string|Date) so JSON/Date both work.

export type ProgramStatus = "draft" | "active" | "archived";
export type TrainingDelivery =
	| "internal"
	| "external"
	| "online"
	| "in_person"
	| "blended";
export type EnrollmentStatus =
	| "enrolled"
	| "in_progress"
	| "completed"
	| "failed"
	| "withdrawn";
export type CertStatus = "active" | "revoked" | "superseded";
export type CertExpiryState =
	| "no_expiry"
	| "valid"
	| "expiring_soon"
	| "expired";
export type SkillSource = "self" | "manager" | "hr" | "import";

export interface TrainingProgram {
	allowSelfEnroll: boolean;
	categoryId: string | null;
	delivery: TrainingDelivery;
	description: string | null;
	durationHours: string | null;
	id: string;
	maxAttempts: number;
	name: string;
	passingScorePercent: number | null;
	provider: string | null;
	reference: string;
	status: ProgramStatus;
}

export interface TrainingModule {
	content: string | null;
	displayOrder: number;
	id: string;
	title: string;
}

export interface Enrollment {
	attemptsUsed: number;
	completedAt: string | Date | null;
	employeeId: string;
	employeeName: string;
	id: string;
	programId: string;
	scorePercent: number | null;
	status: EnrollmentStatus;
}

export interface CertificationType {
	defaultValidityMonths: number | null;
	id: string;
	issuingBody: string | null;
	name: string;
	reminderThresholdDays: number[] | null;
	requiresRenewal: boolean;
}

export interface EmployeeCertification {
	certificationTypeId: string;
	certificationTypeName: string;
	credentialId: string | null;
	daysUntilExpiry: number | null;
	employeeId: string;
	employeeName: string;
	expiryDate: string | Date | null;
	expiryState: CertExpiryState;
	id: string;
	issueDate: string | Date | null;
	issuingBody: string | null;
	status: CertStatus;
	thresholdBucket: number | null;
}

export interface SkillCategory {
	id: string;
	name: string;
	sortOrder: number;
}

export interface SkillType {
	categoryId: string;
	description: string | null;
	id: string;
	name: string;
	proficiencyLevels: string[];
}

export interface EmployeeSkill {
	categoryId: string | null;
	employeeId: string;
	employeeName: string;
	id: string;
	proficiencyLevel: string;
	proficiencyOrdinal: number;
	skillTypeId: string;
	skillTypeName: string;
	source: SkillSource;
}
