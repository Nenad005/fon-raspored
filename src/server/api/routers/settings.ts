import { TRPCError } from "@trpc/server";
import { z } from "zod";

import predmeti from "~/data/predmeti.json";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const yearSchema = z.enum(["year1", "year2", "year3", "year4"]);
const yearToInt = { year1: 0, year2: 1, year3: 2, year4: 3 } as const;

export const settingsRouter = createTRPCRouter({
  getUserClasses: protectedProcedure.query(({ ctx }) => {
    return ctx.db.predmeti.findMany({ where: { userId: ctx.userId } });
  }),

  addClassesFromSmer: protectedProcedure
    .input(z.object({ year: yearSchema, smer: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const programs: Record<string, string[]> = predmeti[input.year];
      const subjects = Object.hasOwn(programs, input.smer)
        ? programs[input.smer]
        : undefined;
      if (!subjects) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid program" });
      }

      const godina = yearToInt[input.year];
      await ctx.db.$transaction(async (tx) => {
        const classes = await tx.predmeti.findMany({
          where: { userId: ctx.userId, godina },
        });
        const existing = new Set(classes.map((subject) => subject.ime));
        const data = [...new Set(subjects)]
          .filter((ime) => !existing.has(ime))
          .map((ime) => ({ userId: ctx.userId, godina, ime }));

        if (data.length > 0) {
          await tx.predmeti.createMany({ data });
        }
      });
    }),

  addClass: protectedProcedure
    .input(z.object({ year: yearSchema, ime: z.string().min(1).max(255) }))
    .mutation(async ({ input, ctx }) => {
      const subjects = Object.values(predmeti[input.year]).flat();
      if (!subjects.includes(input.ime)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid subject" });
      }

      const godina = yearToInt[input.year];
      const classes = await ctx.db.predmeti.findMany({
        where: { userId: ctx.userId, godina },
      });
      if (classes.some((subject) => subject.ime === input.ime)) {
        throw new TRPCError({ code: "CONFLICT", message: "Pred vec izabran!" });
      }
      await ctx.db.predmeti.create({
        data: { userId: ctx.userId, godina, ime: input.ime },
      });
    }),
});
