import { serializeTerm, timeslotSelect } from "~/server/api/catalog-data";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { z } from "zod";

export const catalogRouter = createTRPCRouter({
  get: publicProcedure.input(z.void()).query(async ({ ctx }) => {
    const [programs, subjects] = await Promise.all([
      ctx.db.program.findMany({
        select: { id: true, name: true, subjects: { select: { year: true } } },
        orderBy: { id: "asc" },
      }),
      ctx.db.subject.findMany({
        select: {
          id: true,
          name: true,
          programs: {
            select: { year: true, programId: true },
            orderBy: [{ year: "asc" }, { programId: "asc" }],
          },
          timeslots: {
            select: timeslotSelect,
            orderBy: [
              { day: "asc" },
              { startTime: "asc" },
              { endTime: "asc" },
              { room: "asc" },
              { id: "asc" },
            ],
          },
        },
        orderBy: { id: "asc" },
      }),
    ]);
    return {
      programs: programs.map(({ id, name, subjects }) => ({
        id,
        name,
        years: [...new Set(subjects.map(({ year }) => year))].sort(
          (a, b) => a - b,
        ),
      })),
      subjects: subjects.map(({ id, name, programs, timeslots }) => ({
        id,
        name,
        years: [...new Set(programs.map(({ year }) => year))].sort(
          (a, b) => a - b,
        ),
        memberships: programs,
        terms: {
          P: timeslots.filter((slot) => slot.type === "P").map(serializeTerm),
          V: timeslots.filter((slot) => slot.type === "V").map(serializeTerm),
        },
      })),
    };
  }),
});
