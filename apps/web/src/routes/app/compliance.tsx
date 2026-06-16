import { createFileRoute } from "@tanstack/react-router";
import { useContext } from "react";
import { PreviewBanner } from "@/components/preview-banner";
import { canManageHR } from "@/lib/rbac";
import { OrgCtx } from "@/routes/app/route";

export const Route = createFileRoute("/app/compliance")({
	component: CompliancePage,
});

const PLANNED = [
	"Immutable audit ledger of who changed what, when (sourced from the platform audit log).",
	"Payroll & statutory compliance checks (PAYE / NIS filing readiness, missing TIN/NIS).",
	"Approval-trail evidence for leave, payroll, contracts and corrections.",
	"Document retention & sensitive-field access history.",
	"Exportable compliance reports for auditors.",
];

function CompliancePage() {
	const org = useContext(OrgCtx);

	if (!canManageHR(org.memberRole)) {
		return (
			<div className="page">
				<div className="card card-pad">
					<h3>No access</h3>
					<p style={{ color: "var(--fg-3)", fontSize: 13.5 }}>
						Compliance is available to administrators.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>{org.orgName}</span>
						<span className="sep">/</span>
						<span>Compliance</span>
					</div>
					<h1 className="page-title">Compliance &amp; audit</h1>
					<p className="page-sub">
						Audit trail and statutory compliance evidence.
					</p>
				</div>
			</div>

			<PreviewBanner module="the Compliance module" />

			<div className="card card-pad">
				<h3 style={{ fontSize: 15, fontWeight: 600 }}>Not configured yet</h3>
				<p
					style={{
						maxWidth: 560,
						marginTop: 6,
						fontSize: 13.5,
						color: "var(--fg-3)",
						lineHeight: 1.6,
					}}
				>
					This module is a preview. It does not yet display live compliance data
					for {org.orgName}. When enabled it will surface the platform audit log
					and statutory checks — no sample or placeholder data is shown here.
				</p>
				<h4 style={{ fontSize: 13, fontWeight: 600, margin: "16px 0 6px" }}>
					Planned capabilities
				</h4>
				<ul
					style={{
						margin: 0,
						paddingLeft: 18,
						fontSize: 13,
						color: "var(--fg-2)",
						lineHeight: 1.7,
					}}
				>
					{PLANNED.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			</div>
		</div>
	);
}
