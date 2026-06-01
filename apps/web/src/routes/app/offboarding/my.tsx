import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/offboarding/my")({
	component: MyOffboardingPage,
});

// Employee self-service shell. Submitting a resignation and tracking your own
// exit ships in a later Phase 10D checkpoint (uses the resignation resource
// server-side, not the HR offboarding management view).
function MyOffboardingPage() {
	return (
		<div className="page">
			<div className="page-header">
				<div>
					<div className="crumbs">
						<span>Heimdallone</span>
						<span className="sep">/</span>
						<span>Offboarding</span>
						<span className="sep">/</span>
						<span>My offboarding</span>
					</div>
					<h1 className="page-title">My offboarding</h1>
					<p className="page-sub">
						Submit a resignation and track your own exit.
					</p>
				</div>
			</div>

			<div
				className="card card-pad"
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					minHeight: 320,
					textAlign: "center",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 48,
						height: 48,
						marginBottom: 12,
						color: "var(--fg-4)",
						background: "var(--bg-3)",
						borderRadius: 14,
					}}
				>
					<ShieldCheck size={20} />
				</div>
				<div className="eyebrow" style={{ marginBottom: 8 }}>
					Coming later
				</div>
				<div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
					Employee self-service
				</div>
				<p
					style={{
						maxWidth: 420,
						marginTop: 8,
						fontSize: 13.5,
						color: "var(--fg-3)",
					}}
				>
					Submitting a resignation and tracking your offboarding ships in a
					later Phase 10D checkpoint.
				</p>
			</div>
		</div>
	);
}
