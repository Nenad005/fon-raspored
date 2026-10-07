import { serializeTerm, timeslotSelect } from "~/server/api/catalog-data";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { z } from "zod";
import { getScheduleVersion } from "~/server/api/schedule-version";
import { readPublicData } from "~/server/api/public-cache";

export const catalogRouter = createTRPCRouter({
  get: publicProcedure.input(z.void()).query(({ ctx }) =>
    readPublicData(ctx, ["catalog"], () =>
      ctx.db.$transaction(
        async (db) => {
          const [programs, subjects, release] = await Promise.all([
            db.program.findMany({
              where: { subjects: { some: { subject: { active: true } } } },
              select: {
                id: true,
                name: true,
                subjects: {
                  where: { subject: { active: true } },
                  select: { year: true },
                },
              },
              orderBy: { id: "asc" },
            }),
            db.subject.findMany({
              where: { active: true },
              select: {
                id: true,
                name: true,
                programs: {
                  select: { year: true, programId: true },
                  orderBy: [{ year: "asc" }, { programId: "asc" }],
                },
                timeslots: {
                  where: { active: true },
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
            getScheduleVersion(db),
          ]);
          return {
            scheduleVersion: release.version,
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
                P: timeslots
                  .filter((slot) => slot.type === "P")
                  .map(serializeTerm),
                V: timeslots
                  .filter((slot) => slot.type === "V")
                  .map(serializeTerm),
              },
            })),
          };
        },
        { isolationLevel: "RepeatableRead" },
      ),
    ),
  ),
});
