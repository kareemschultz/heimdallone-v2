import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { assetsRouter } from "./assets";
import { attendanceRouter } from "./attendance";
import { biometricRouter } from "./biometric";
import { contractsRouter } from "./contracts";
import { helpdeskRouter } from "./helpdesk";
import { hrCoreRouter } from "./hr-core";
import { leaveRouter } from "./leave";
import { leavePolicyRouter } from "./leave-policy";
import { offboardingRouter } from "./offboarding";
import { onboardingRouter } from "./onboarding";
import { payrollRouter } from "./payroll";
import { projectsRouter } from "./projects";
import { recruitmentRouter } from "./recruitment";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),
	privateData: protectedProcedure.handler(({ context }) => ({
		message: "This is private",
		user: context.session?.user,
	})),
	hrCore: hrCoreRouter,
	...contractsRouter,
	assets: assetsRouter,
	attendance: attendanceRouter,
	biometric: biometricRouter,
	helpdesk: helpdeskRouter,
	leave: leaveRouter,
	leavePolicy: leavePolicyRouter,
	payroll: payrollRouter,
	projects: projectsRouter,
	recruitment: recruitmentRouter,
	onboarding: onboardingRouter,
	offboarding: offboardingRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
