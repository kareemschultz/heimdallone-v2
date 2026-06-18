// Display-side mirrors of the gl router outputs (Phase Finance-depth / GL UI).

export type GlAccountType =
	| "asset"
	| "liability"
	| "equity"
	| "income"
	| "expense";

export type GlJournalStatus = "draft" | "posted" | "reversed";

export type GlJournalSource =
	| "payroll"
	| "manual"
	| "opening_balance"
	| "adjustment";

export interface GlAccountRow {
	code: string;
	id: string;
	isArchived: boolean;
	isPostable: boolean;
	name: string;
	parentAccountId: string | null;
	subType: string | null;
	type: GlAccountType;
}

export interface GlJournalListRow {
	currency: string;
	description: string | null;
	entryDate: string;
	id: string;
	postedAt: string | null;
	reference: string;
	source: GlJournalSource;
	status: GlJournalStatus;
	totalDebit: string;
}

export interface GlJournalLineRow {
	accountCode: string;
	accountId: string;
	accountName: string;
	creditAmount: string;
	debitAmount: string;
	description: string | null;
	id: string;
	linkedPayslipId: string | null;
}

export interface GlJournalDetail {
	entry: GlJournalListRow & {
		reversesEntryId?: string | null;
		reversedByEntryId?: string | null;
	};
	lines: GlJournalLineRow[];
}

export interface GlTrialBalanceRow {
	accountCode: string;
	accountId: string;
	accountName: string;
	accountType: GlAccountType;
	totalCredit: string;
	totalDebit: string;
}

export interface GlTrialBalance {
	balanced: boolean;
	rows: GlTrialBalanceRow[];
	totalCredit: string;
	totalDebit: string;
}

// Draft journal line in the create dialog (debit/credit as raw input strings).
export interface DraftLine {
	accountId: string;
	credit: string;
	debit: string;
	description: string;
}
