import { createFileRoute } from "@tanstack/react-router";

import "@/styles/onboarding.css";
import { MyOnboarding } from "@/features/onboarding/my-onboarding";

export const Route = createFileRoute("/app/onboarding/my/")({
	component: MyOnboarding,
});
