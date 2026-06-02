import { createFileRoute } from "@tanstack/react-router";

import { MyOffboarding } from "@/features/offboarding/my-offboarding";

export const Route = createFileRoute("/app/offboarding/my")({
	component: MyOffboarding,
});
