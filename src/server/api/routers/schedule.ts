import type { TimeslotType } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const yearInput = z.number().int().min(1).max(4);
const weekdays = ["Ponedeljak", "Utorak", "Sreda", "\u010Cetvrtak", "Petak"];

type Event = {
  id: string;
  predmet: string;
  tip: TimeslotType;
  od: string;
  do: string;
  sala: string;
  grupe: string[];
};

export const scheduleRouter = createTRPCRouter({
  groups: publicProcedure
    .input(z.object({ year: yearInput }))
    .query(async ({ ctx, input }) => {
      const groups = await ctx.db.studyGroup.findMany({
        where: { year: input.year, timeslots: { some: {} } },
        select: { id: true, name: true },
      });
      return groups.sort((a, b) =>
        a.name.localeCompare(b.name, "sr", { numeric: true }),
      );
    }),
  getSchedule: publicProcedure
    .input(
      z.object({
        year: yearInput,
        group: z.string().trim().min(1).max(191),
      }),
    )
    .query(async ({ ctx, input }) => {
      const group = await ctx.db.studyGroup.findUnique({
        where: { year_name: { year: input.year, name: input.group } },
        select: { id: true, name: true },
      });
      if (!group) throw new TRPCError({ code: "NOT_FOUND" });

      const timeslots = await ctx.db.timeslot.findMany({
        where: { groups: { some: { groupId: group.id } } },
        select: {
          id: true,
          day: true,
          type: true,
          startTime: true,
          endTime: true,
          room: true,
          subject: { select: { name: true } },
          groups: {
            where: { group: { year: input.year } },
            select: { group: { select: { name: true } } },
          },
        },
        orderBy: [
          { day: "asc" },
          { startTime: "asc" },
          { endTime: "asc" },
          { subject: { name: "asc" } },
          { room: "asc" },
          { id: "asc" },
        ],
      });

      const schedule: Record<string, Event[]> = {};
      for (const slot of timeslots) {
        const day = weekdays[slot.day - 1];
        if (!day) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Invalid stored weekday",
          });
        }
        (schedule[day] ??= []).push({
          id: slot.id,
          predmet: slot.subject.name,
          tip: slot.type,
          od: slot.startTime,
          do: slot.endTime,
          sala: slot.room,
          grupe: slot.groups.map(({ group }) => group.name),
        });
      }
      return { group: group.name, year: input.year, schedule };
    }),
});
