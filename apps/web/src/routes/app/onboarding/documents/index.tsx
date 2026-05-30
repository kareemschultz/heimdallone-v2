import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useContext, useMemo, useState } from "react";

import "@/styles/onboarding.css";
import { EmptyState } from "@/components/empty-state";
import {
	AcknowledgementTable,
	type AckRow,
	type DocRequestRow,
	DocumentRequestTable,
	type OnboardingMeta,
} from "@/features/onboarding/document-center";
import { OnboardingTabs } from "@/features/onboarding/onboarding-tabs";
import { canManageOnboarding, canViewOnboarding } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/onboarding/documents/")({
	component: OnboardingDocumentsPage,
});

type SubTab = "documents" | "acknowledgements";

function OnboardingDocumentsPage() {
	const org = useContext(OrgCtx);
	const canView = canViewOnboarding(org.memberRole);
	const canManage = canManageOnboarding(org.memberRole);
	const [tab, setTab] = useState<SubTab>("documents");

	// List endpoints are per-onboarding, so fan out over all onboardings and
	// flatten. Cheap at demo scale; denormalized list endpoints are a 9I item.
	const onboardings = useQuery(
		orpc.onboarding.employeeOnboarding.list.queryOptions({
			input: { page: 1, pageSize: 100 },
			enabled: canView,
		})
	);
	const onboardingRows = onboardings.data?.data ?? [];

	const employees = useQuery(
		orpc.hrCore.employees.list.queryOptions({
			input: { isActive: true, page: 1, pageSize: 100 },
			enabled: canView,
		})
	);
	const templates = useQuery(
		orpc.onboarding.templates.list.queryOptions({
			input: { page: 1, pageSize: 100 },
			enabled: canView,
		})
	);

	const meta = useMemo(() => {
		const employeeName = new Map<string, string>();
		for (const e of (employees.data?.data ?? []) as {
			firstName: string;
			id: string;
			lastName: string | null;
		}[]) {
			employeeName.set(
				e.id,
				[e.firstName, e.lastName].filter(Boolean).join(" ")
			);
		}
		const templateName = new Map<string, string>();
		for (const t of templates.data?.data ?? []) {
			templateName.set(t.id, t.name);
		}
		const map = new Map<string, OnboardingMeta>();
		for (const o of onboardingRows) {
			map.set(o.id, {
				employeeName: employeeName.get(o.employeeId) ?? "Employee",
				templateName: o.templateId
					? (templateName.get(o.templateId) ?? "—")
					: "—",
			});
		}
		return map;
	}, [employees.data, templates.data, onboardingRows]);

	const docQueries = useQueries({
		queries: onboardingRows.map((o) =>
			orpc.onboarding.documentRequests.list.queryOptions({
				input: { onboardingId: o.id },
			})
		),
	});
	const ackQueries = useQueries({
		queries: onboardingRows.map((o) =>
			orpc.onboarding.acknowledgements.list.queryOptions({
				input: { onboardingId: o.id },
			})
		),
	});

	const docsLoading =
		onboardings.isLoading || docQueries.some((q) => q.isLoading);
	const acksLoading =
		onboardings.isLoading || ackQueries.some((q) => q.isLoading);

	const docRows = useMemo(
		() => docQueries.flatMap((q) => (q.data ?? []) as DocRequestRow[]),
		[docQueries]
	);
	const ackRows = useMemo(
		() => ackQueries.flatMap((q) => (q.data ?? []) as AckRow[]),
		[ackQueries]
	);

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Onboarding</span>
						<span className="sep">/</span>
						<span>Documents</span>
					</div>
					<h1 className="page-title">Onboarding documents</h1>
					<p className="page-sub">
						Track document requests and policy acknowledgements for new hires.
					</p>
				</div>
			</div>

			<OnboardingTabs />

			{canView ? (
				<>
					<div
						className="card card-pad"
						style={{
							marginBottom: 14,
							fontSize: 12.5,
							color: "var(--fg-3)",
						}}
					>
						File upload storage is coming later. For now, HR can track whether
						documents were received, approved, rejected, or waived.
					</div>

					<div className="onboarding-tabs" style={{ maxWidth: 360 }}>
						<button
							className={`onboarding-tab ${tab === "documents" ? "active" : ""}`}
							onClick={() => setTab("documents")}
							type="button"
						>
							Document requests
						</button>
						<button
							className={`onboarding-tab ${tab === "acknowledgements" ? "active" : ""}`}
							onClick={() => setTab("acknowledgements")}
							type="button"
						>
							Acknowledgements
						</button>
					</div>

					<Section
						title={
							tab === "documents" ? "Document requests" : "Acknowledgements"
						}
					>
						{tab === "documents" ? (
							<DocumentRequestTable
								canManage={canManage}
								emptyDescription="No document requests across any onboarding yet."
								isLoading={docsLoading}
								meta={meta}
								rows={docRows}
								showContext
							/>
						) : (
							<AcknowledgementTable
								canManage={canManage}
								emptyDescription="No acknowledgements across any onboarding yet."
								isLoading={acksLoading}
								meta={meta}
								rows={ackRows}
								showContext
							/>
						)}
					</Section>
				</>
			) : (
				<EmptyState
					description="Onboarding documents are available to HR, recruiters, managers, and auditors."
					title="You don't have access to onboarding documents"
				/>
			)}
		</div>
	);
}

function Section({ title, children }: { children: ReactNode; title: string }) {
	return (
		<div className="card card-pad" style={{ marginBottom: 14 }}>
			<div className="eyebrow" style={{ marginBottom: 10 }}>
				{title}
			</div>
			{children}
		</div>
	);
}
