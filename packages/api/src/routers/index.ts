import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { analyticsRouter } from "./analytics";
import { assetsRouter } from "./assets";
import { attendanceRouter } from "./attendance";
import { biometricRouter } from "./biometric";
import { contractsRouter } from "./contracts";
import { crmRouter } from "./crm";
import { financeRouter } from "./finance";
import { glRouter } from "./gl";
import { helpdeskRouter } from "./helpdesk";
import { hrCoreRouter } from "./hr-core";
import { leaveRouter } from "./leave";
import { leavePolicyRouter } from "./leave-policy";
import { notificationsRouter } from "./notifications";
import { offboardingRouter } from "./offboarding";
import { onboardingRouter } from "./onboarding";
import { payrollRouter } from "./payroll";
import { performanceRouter } from "./performance";
import { projectsRouter } from "./projects";
import { recruitmentRouter } from "./recruitment";
import { rosterRouter } from "./roster";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),
	privateData: protectedProcedure.handler(({ context }) => ({
		message: "This is private",
		user: context.session?.user,
	})),
	hrCore: hrCoreRouter,
	...contractsRouter,
	analytics: analyticsRouter,
	assets: assetsRouter,
	attendance: attendanceRouter,
	biometric: biometricRouter,
	crm: crmRouter,
	finance: financeRouter,
	gl: glRouter,
	helpdesk: helpdeskRouter,
	leave: leaveRouter,
	leavePolicy: leavePolicyRouter,
	notifications: notificationsRouter,
	payroll: payrollRouter,
	performance: performanceRouter,
	projects: projectsRouter,
	recruitment: recruitmentRouter,
	roster: rosterRouter,
	onboarding: onboardingRouter,
	offboarding: offboardingRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
