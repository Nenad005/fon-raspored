import { terminRouter } from "~/server/api/routers/termin";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { settingsRouter } from "./routers/settings";

export const appRouter = createTRPCRouter({
  termin: terminRouter,
  settings: settingsRouter
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
