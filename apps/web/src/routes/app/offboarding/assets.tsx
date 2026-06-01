import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";

import { OffboardingPlaceholder } from "@/features/offboarding/offboarding-placeholder";

export const Route = createFileRoute("/app/offboarding/assets")({
	component: OffboardingAssetsPage,
});

function OffboardingAssetsPage() {
	return (
		<OffboardingPlaceholder
			description="Company assets to recover from departing employees — laptops, devices, keys, and more."
			icon={<Boxes size={20} />}
			title="Asset returns"
		/>
	);
}
