// Seed CRM demo data for Atlas Shipping — Phase 17B.
//
// Idempotent: deletes existing CRM rows for the org (FK-safe order) then
// re-inserts a default pipeline + a dataset exercising every status/badge
// (open/won/lost deals, stalled deal, overdue follow-up, converted lead,
// team + private notes, a won→handoff link).
//
// Reuses real employee_profile rows as owners; writes ONLY crm_* tables.
//
// Run: export $(grep -v '^#' apps/server/.env | xargs) && bun run scripts/seed-crm.ts

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { createDb } from "../packages/db/src/index";
import { organization } from "../packages/db/src/schema/auth";
import {
	crmActivity,
	crmContact,
	crmCustomer,
	crmCustomerProjectLink,
	crmDeal,
	crmLead,
	crmNote,
	crmPipelineStage,
} from "../packages/db/src/schema/crm";
import { employeeProfile } from "../packages/db/src/schema/hr-core";
import { assertSeedAllowed } from "./_guard";

assertSeedAllowed();
const db = createDb();
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ahead = (days: number) => new Date(Date.now() + days * DAY);

async function resolveOrgId(): Promise<string> {
	const org = (
		await db
			.select()
			.from(organization)
			.where(eq(organization.slug, "atlas-shipping"))
			.limit(1)
	).at(0);
	if (!org) {
		process.stderr.write("Atlas org not found — run seed-dev.ts first.\n");
		process.exit(1);
	}
	return org.id;
}

async function resolveEmployees(orgId: string): Promise<Map<string, string>> {
	const rows = await db
		.select({
			id: employeeProfile.id,
			first: employeeProfile.firstName,
			last: employeeProfile.lastName,
		})
		.from(employeeProfile)
		.where(
			and(
				eq(employeeProfile.organizationId, orgId),
				eq(employeeProfile.isActive, true)
			)
		)
		.limit(40);
	const byName = new Map<string, string>();
	for (const r of rows) {
		byName.set(`${r.first}${r.last ? ` ${r.last}` : ""}`, r.id);
	}
	return byName;
}

async function resetOrg(orgId: string) {
	const where = eq(crmActivity.organizationId, orgId);
	await db.delete(crmActivity).where(where);
	await db.delete(crmNote).where(eq(crmNote.organizationId, orgId));
	await db.delete(crmLead).where(eq(crmLead.organizationId, orgId));
	await db
		.delete(crmCustomerProjectLink)
		.where(eq(crmCustomerProjectLink.organizationId, orgId));
	await db.delete(crmDeal).where(eq(crmDeal.organizationId, orgId));
	await db.delete(crmContact).where(eq(crmContact.organizationId, orgId));
	await db.delete(crmCustomer).where(eq(crmCustomer.organizationId, orgId));
	await db
		.delete(crmPipelineStage)
		.where(eq(crmPipelineStage.organizationId, orgId));
}

async function main() {
	const orgId = await resolveOrgId();
	const emp = await resolveEmployees(orgId);
	const owner1 = emp.get("Andre Sealey") ?? null;
	const owner2 = emp.get("Rohan Gopaul") ?? null;

	await resetOrg(orgId);

	// ── default pipeline ──
	const stageDefs = [
		{ name: "New", position: 0, prob: 10, won: false, lost: false },
		{ name: "Qualified", position: 1, prob: 30, won: false, lost: false },
		{ name: "Proposal", position: 2, prob: 50, won: false, lost: false },
		{ name: "Negotiation", position: 3, prob: 75, won: false, lost: false },
		{ name: "Won", position: 4, prob: 100, won: true, lost: false },
		{ name: "Lost", position: 5, prob: 0, won: false, lost: true },
	];
	const stageId: Record<string, string> = {};
	for (const s of stageDefs) {
		const id = createId();
		stageId[s.name] = id;
		await db.insert(crmPipelineStage).values({
			id,
			organizationId: orgId,
			name: s.name,
			position: s.position,
			defaultProbabilityPct: s.prob,
			isWon: s.won,
			isLost: s.lost,
		});
	}

	// ── customers ──
	const custDefs = [
		{
			key: "guyoil",
			name: "GuyOil Distribution",
			status: "active",
			source: "referral",
		},
		{
			key: "demerara",
			name: "Demerara Bank",
			status: "prospect",
			source: "web_form",
		},
		{
			key: "qaiwan",
			name: "Qaiwan Shipping Ltd",
			status: "active",
			source: "event",
		},
		{
			key: "inactive",
			name: "Old Co (dormant)",
			status: "inactive",
			source: "manual",
		},
	] as const;
	const custId: Record<string, string> = {};
	for (const c of custDefs) {
		const id = createId();
		custId[c.key] = id;
		await db.insert(crmCustomer).values({
			id,
			organizationId: orgId,
			name: c.name,
			type: "company",
			status: c.status,
			ownerEmployeeId: owner1,
			website: "https://example.com",
			email: "info@example.com",
			industry: "Logistics",
			sourceKey: c.source,
		});
	}

	// ── contacts ──
	const contactId: Record<string, string> = {};
	const contactDefs = [
		{
			key: "c1",
			cust: "guyoil",
			first: "Marcia",
			last: "Welch",
			primary: true,
			email: "marcia@guyoil.example",
		},
		{
			key: "c2",
			cust: "guyoil",
			first: "Dev",
			last: "Singh",
			primary: false,
			email: "dev@guyoil.example",
		},
		{
			key: "c3",
			cust: "demerara",
			first: "Anil",
			last: "Persaud",
			primary: true,
			email: "anil@demerara.example",
		},
	];
	for (const c of contactDefs) {
		const id = createId();
		contactId[c.key] = id;
		await db.insert(crmContact).values({
			id,
			organizationId: orgId,
			customerId: custId[c.cust],
			firstName: c.first,
			lastName: c.last,
			email: c.email,
			jobTitle: "Operations Manager",
			isPrimary: c.primary,
			ownerEmployeeId: owner1,
		});
	}

	// ── deals (open in stages + won + lost + stalled) ──
	const dealId: Record<string, string> = {};
	const dealDefs = [
		{
			key: "d-new",
			title: "Fleet GPS rollout",
			cust: "demerara",
			stage: "New",
			value: "1200000.00",
			status: "open",
			lastAct: 1,
		},
		{
			key: "d-prop",
			title: "Warehouse WiFi upgrade",
			cust: "guyoil",
			stage: "Proposal",
			value: "3400000.00",
			status: "open",
			lastAct: 2,
		},
		{
			key: "d-stalled",
			title: "CCTV expansion",
			cust: "qaiwan",
			stage: "Negotiation",
			value: "5600000.00",
			status: "open",
			lastAct: 40,
		},
		{
			key: "d-won",
			title: "Office network refresh",
			cust: "guyoil",
			stage: "Won",
			value: "2500000.00",
			status: "won",
			lastAct: 5,
		},
		{
			key: "d-lost",
			title: "Data center build",
			cust: "qaiwan",
			stage: "Lost",
			value: "9000000.00",
			status: "lost",
			lastAct: 20,
			lost: "Budget cut by client",
		},
	];
	for (const d of dealDefs) {
		const id = createId();
		dealId[d.key] = id;
		await db.insert(crmDeal).values({
			id,
			organizationId: orgId,
			customerId: custId[d.cust],
			primaryContactId: d.cust === "guyoil" ? contactId.c1 : null,
			title: d.title,
			stageId: stageId[d.stage],
			value: d.value,
			currency: "GYD",
			probabilityPct: stageDefs.find((s) => s.name === d.stage)?.prob ?? null,
			expectedCloseDate: ahead(30),
			status: d.status,
			lostReason: d.lost ?? null,
			ownerEmployeeId: d.cust === "demerara" ? owner2 : owner1,
			lastActivityAt: ago(d.lastAct),
		});
	}

	// won → handoff link
	const linkId = createId();
	await db.insert(crmCustomerProjectLink).values({
		id: linkId,
		organizationId: orgId,
		customerId: custId.guyoil,
		dealId: dealId["d-won"],
		projectId: null,
		handoffStatus: "intended",
		handoffNote: "Won — ready to staff the network refresh.",
		handedOffByUserId: null,
		handedOffAt: new Date(),
	});
	await db
		.update(crmDeal)
		.set({ handedOffProjectLinkId: linkId })
		.where(eq(crmDeal.id, dealId["d-won"]));

	// ── leads (statuses incl converted) ──
	const leadDefs = [
		{
			name: "Berbice Co-op",
			status: "new",
			source: "web_form",
			val: "800000.00",
		},
		{
			name: "Linden Mining Svc",
			status: "contacted",
			source: "campaign",
			val: "1500000.00",
		},
		{
			name: "Essequibo Traders",
			status: "qualified",
			source: "referral",
			val: "2200000.00",
		},
		{ name: "Spam inquiry", status: "unqualified", source: "other", val: null },
	];
	for (const l of leadDefs) {
		await db.insert(crmLead).values({
			id: createId(),
			organizationId: orgId,
			name: l.name,
			companyName: l.name,
			contactEmail: "lead@example.com",
			status: l.status,
			sourceKey: l.source,
			ownerEmployeeId: owner2,
			estimatedValue: l.val,
			description: "Inbound interest.",
		});
	}
	// a converted lead (read-only, points at the won deal)
	await db.insert(crmLead).values({
		id: createId(),
		organizationId: orgId,
		name: "GuyOil (converted)",
		companyName: "GuyOil Distribution",
		status: "converted",
		sourceKey: "referral",
		ownerEmployeeId: owner1,
		convertedCustomerId: custId.guyoil,
		convertedContactId: contactId.c1,
		convertedDealId: dealId["d-won"],
		convertedAt: ago(10),
	});

	// ── activities (overdue follow-up + completed + open) ──
	const actDefs = [
		{
			type: "follow_up",
			subject: "Call back re: proposal",
			rel: "deal",
			id: dealId["d-prop"],
			due: ago(3),
			done: null,
		},
		{
			type: "call",
			subject: "Intro call",
			rel: "deal",
			id: dealId["d-new"],
			due: null,
			done: ago(2),
		},
		{
			type: "meeting",
			subject: "Site survey",
			rel: "deal",
			id: dealId["d-stalled"],
			due: ahead(2),
			done: null,
		},
		{
			type: "task",
			subject: "Send contract",
			rel: "customer",
			id: custId.guyoil,
			due: ahead(1),
			done: null,
		},
	];
	for (const a of actDefs) {
		await db.insert(crmActivity).values({
			id: createId(),
			organizationId: orgId,
			type: a.type,
			subject: a.subject,
			relatedType: a.rel,
			relatedId: a.id,
			dueAt: a.due,
			completedAt: a.done,
			assignedToEmployeeId: owner1,
			createdByUserId: null,
		});
	}

	// ── notes (team + private) ──
	await db.insert(crmNote).values({
		id: createId(),
		organizationId: orgId,
		relatedType: "deal",
		relatedId: dealId["d-prop"],
		body: "Customer comparing us against two competitors.",
		visibility: "team",
		authorUserId: null,
	});
	await db.insert(crmNote).values({
		id: createId(),
		organizationId: orgId,
		relatedType: "deal",
		relatedId: dealId["d-prop"],
		body: "PRIVATE: champion hinted budget is tight — push payment terms.",
		visibility: "private",
		authorUserId: null,
	});

	process.stdout.write(
		`✓ Seeded CRM for Atlas Shipping: 6 stages, ${custDefs.length} customers, ${contactDefs.length} contacts, ${dealDefs.length} deals, 5 leads, ${actDefs.length} activities, 2 notes, 1 handoff.\n`
	);
	process.exit(0);
}

main().catch((e) => {
	process.stderr.write(`${e}\n`);
	process.exit(1);
});
