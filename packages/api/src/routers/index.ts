import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { attendanceRouter } from "./attendance";
import { contractsRouter } from "./contracts";
import { hrCoreRouter } from "./hr-core";
import { leaveRouter } from "./leave";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),
	privateData: protectedProcedure.handler(({ context }) => ({
		message: "This is private",
		user: context.session?.user,
	})),
	hrCore: hrCoreRouter,
	...contractsRouter,
	attendance: attendanceRouter,
	leave: leaveRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
