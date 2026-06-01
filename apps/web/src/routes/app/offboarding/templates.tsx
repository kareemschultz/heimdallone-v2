import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";

import { OffboardingPlaceholder } from "@/features/offboarding/offboarding-placeholder";

export const Route = createFileRoute("/app/offboarding/templates")({
	component: OffboardingTemplatesPage,
});

function OffboardingTemplatesPage() {
	return (
		<OffboardingPlaceholder
			description="Reusable exit checklists — clearance steps, asset returns, and document requests applied when a case starts."
			icon={<FileText size={20} />}
			title="Templates"
		/>
	);
}
