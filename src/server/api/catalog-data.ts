import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";

export const timeslotSelect = {
  id: true,
  subjectId: true,
  type: true,
  day: true,
  startTime: true,
  endTime: true,
  room: true,
  groups: {
    select: { group: { select: { id: true, name: true } } },
    orderBy: { groupId: "asc" },
  },
} satisfies Prisma.TimeslotSelect;

export type CatalogSlot = Prisma.TimeslotGetPayload<{
  select: typeof timeslotSelect;
}>;
const weekdays = [
  "Ponedeljak",
  "Utorak",
  "Sreda",
  "\u010Cetvrtak",
  "Petak",
] as const;

export function serializeTerm(slot: CatalogSlot) {
  const dan = weekdays[slot.day - 1];
  if (!dan)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Invalid stored weekday",
    });
  return {
    id: slot.id,
    dan,
    od: slot.startTime,
    do: slot.endTime,
    sala: slot.room,
    grupe: [...new Set(slot.groups.map(({ group }) => group.name))],
    groupKeys: slot.groups.map(({ group }) => group.id),
  };
}
