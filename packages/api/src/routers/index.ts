import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { analyticsRouter } from "./analytics";
import { assetsRouter } from "./assets";
import { attendanceRouter } from "./attendance";
import { auditRouter } from "./audit";
import { biometricRouter } from "./biometric";
import { brandingRouter } from "./branding";
import { communicationsRouter } from "./communications";
import { contractsRouter } from "./contracts";
import { crmRouter } from "./crm";
import { developmentRouter } from "./development";
import { financeRouter } from "./finance";
import { glRouter } from "./gl";
import { helpdeskRouter } from "./helpdesk";
import { hrCoreRouter } from "./hr-core";
import { inventoryRouter } from "./inventory";
import { leaveRouter } from "./leave";
import { leavePolicyRouter } from "./leave-policy";
import { lifecycleRouter } from "./lifecycle";
import { migrationRouter } from "./migration";
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
	...auditRouter,
	biometric: biometricRouter,
	communications: communicationsRouter,
	...brandingRouter,
	crm: crmRouter,
	development: developmentRouter,
	finance: financeRouter,
	gl: glRouter,
	helpdesk: helpdeskRouter,
	inventory: inventoryRouter,
	leave: leaveRouter,
	leavePolicy: leavePolicyRouter,
	lifecycle: lifecycleRouter,
	migration: migrationRouter,
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
