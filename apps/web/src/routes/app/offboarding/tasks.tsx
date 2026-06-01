import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";

import { OffboardingPlaceholder } from "@/features/offboarding/offboarding-placeholder";

export const Route = createFileRoute("/app/offboarding/tasks")({
	component: OffboardingTasksPage,
});

function OffboardingTasksPage() {
	return (
		<OffboardingPlaceholder
			description="Clearance tasks across all active cases — what's done, in progress, blocked, or overdue."
			icon={<ClipboardCheck size={20} />}
			title="Tasks"
		/>
	);
}
