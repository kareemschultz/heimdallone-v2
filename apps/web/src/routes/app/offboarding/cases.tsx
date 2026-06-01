import { createFileRoute } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { OffboardingPlaceholder } from "@/features/offboarding/offboarding-placeholder";

export const Route = createFileRoute("/app/offboarding/cases")({
	component: OffboardingCasesPage,
});

function OffboardingCasesPage() {
	return (
		<OffboardingPlaceholder
			description="Browse every offboarding case, filter by status, and open a case to manage its exit."
			icon={<LogOut size={20} />}
			title="Cases"
		/>
	);
}
