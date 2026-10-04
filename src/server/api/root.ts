import { scheduleRouter } from "~/server/api/routers/schedule";
import { catalogRouter } from "~/server/api/routers/catalog";
import { accountRouter } from "~/server/api/routers/account";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  schedule: scheduleRouter,
  catalog: catalogRouter,
  account: accountRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
