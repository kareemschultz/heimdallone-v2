import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";

import { OffboardingPlaceholder } from "@/features/offboarding/offboarding-placeholder";

export const Route = createFileRoute("/app/offboarding/access")({
	component: OffboardingAccessPage,
});

function OffboardingAccessPage() {
	return (
		<OffboardingPlaceholder
			description="System and physical access to revoke as employees leave — accounts, badges, and permissions."
			icon={<KeyRound size={20} />}
			title="Access removal"
		/>
	);
}
