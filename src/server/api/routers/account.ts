import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  serializeTerm,
  timeslotSelect,
  type CatalogSlot,
} from "~/server/api/catalog-data";
import {
  getScheduleVersion,
  lockScheduleVersion,
} from "~/server/api/schedule-version";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const year = z.number().int().min(1).max(4);
const id = z.string().min(1).max(30);
const revision = z.number().int().min(0).max(2147483646);
const filters = z
  .array(z.object({ year, programId: id }).strict())
  .max(4)
  .refine(
    (items) => new Set(items.map((item) => item.year)).size === items.length,
    "Duplicate filter year",
  );
const preferences = z
  .object({
    expectedRevision: revision,
    mode: z.enum(["account", "search"]).optional(),
    groupId: id.nullable().optional(),
    catalogYear: year.optional(),
    programFilters: filters.optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
  })
  .strict();
const stateSelect = {
  revision: true,
  acknowledgedScheduleVersion: true,
  mode: true,
  theme: true,
  catalogYear: true,
  group: { select: { id: true, name: true, year: true } },
  filters: {
    select: { year: true, programId: true },
    orderBy: { year: "asc" },
  },
  subjects: {
    select: { subjectId: true },
    orderBy: [{ position: "asc" }, { subjectId: "asc" }],
  },
  timeslots: {
    select: {
      timeslotId: true,
      timeslot: {
        select: {
          ...timeslotSelect,
          active: true,
          subject: { select: { name: true } },
        },
      },
    },
    orderBy: { timeslotId: "asc" },
  },
} satisfies Prisma.UserSettingsSelect;

async function readState(db: Prisma.TransactionClient, userId: string) {
  const row = await db.userSettings.findUnique({
    where: { userId },
    select: stateSelect,
  });
  const release = await getScheduleVersion(db);
  return {
    revision: row?.revision ?? 0,
    preferences: {
      mode: row?.mode ?? "account",
      group: row?.group ?? null,
      catalogYear: row?.catalogYear ?? 1,
      programFilters: row?.filters ?? [],
      theme: row?.theme ?? "system",
    },
    subjectIds: row?.subjects.map((item) => item.subjectId) ?? [],
    timeslotIds:
      row?.timeslots
        .filter((item) => item.timeslot.active)
        .map((item) => item.timeslotId) ?? [],
    scheduleVersion: release.version,
    scheduleUpdate: {
      pending: Boolean(
        row && row.acknowledgedScheduleVersion < release.version,
      ),
      publishedAt: release.publishedAt,
      removedTimeslots:
        row?.timeslots
          .filter((item) => !item.timeslot.active)
          .map(({ timeslot }) => ({
            ...serializeTerm(timeslot),
            subjectName: timeslot.subject.name,
            type: timeslot.type,
          })) ?? [],
    },
  };
}

function bad(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

async function mutate<T>(
  db: PrismaClient,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  try {
    return await db.$transaction(run);
  } catch (error) {
    // Initialization races and transaction conflicts require a fresh revision/read.
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "P2002" || error.code === "P2034")
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Account state has changed",
        cause: error,
      });
    throw error;
  }
}

async function claim(
  db: Prisma.TransactionClient,
  userId: string,
  expectedRevision: number,
) {
  // The upsert and CAS share the transaction: a failed first save cannot leave a new row.
  const release = await lockScheduleVersion(db);
  await db.userSettings.upsert({
    where: { userId },
    create: { userId, acknowledgedScheduleVersion: release.version },
    update: {},
  });
  const updated = await db.userSettings.updateMany({
    where: { userId, revision: expectedRevision },
    data: { revision: { increment: 1 } },
  });
  if (updated.count !== 1)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Account state has changed",
    });
}

async function validateFilters(
  db: Prisma.TransactionClient,
  items: z.infer<typeof filters>,
) {
  if (!items.length) return;
  const memberships = await db.subjectProgram.findMany({
    where: { OR: items },
    select: { year: true, programId: true },
  });
  if (
    items.some(
      (item) =>
        !memberships.some(
          (membership) =>
            membership.year === item.year &&
            membership.programId === item.programId,
        ),
    )
  )
    bad("Unknown program/year membership");
}

async function replaceFilters(
  db: Prisma.TransactionClient,
  userId: string,
  items: z.infer<typeof filters>,
) {
  await db.userProgramFilter.deleteMany({ where: { userId } });
  if (items.length)
    await db.userProgramFilter.createMany({
      data: items.map((item) => ({ userId, ...item })),
    });
}

function interval(slot: CatalogSlot) {
  return `${slot.day}|${slot.startTime}|${slot.endTime}`;
}

function validateSelections(all: CatalogSlot[], selected: CatalogSlot[]) {
  const buckets = new Map<string, CatalogSlot[]>();
  for (const slot of selected) {
    const key = `${slot.subjectId}|${slot.type}`;
    buckets.set(key, [...(buckets.get(key) ?? []), slot]);
  }
  for (const choices of buckets.values()) {
    if (new Set(choices.map(interval)).size !== choices.length)
      bad("Select only one room per interval");
    const terms = all.filter(
      (slot) =>
        slot.subjectId === choices[0]!.subjectId &&
        slot.type === choices[0]!.type,
    );
    const sessions = new Map<string, Set<string>>();
    for (const slot of terms)
      for (const { group } of slot.groups) {
        const intervals = sessions.get(group.id) ?? new Set<string>();
        intervals.add(interval(slot));
        sessions.set(group.id, intervals);
      }
    const limit = Math.min(
      ...choices.map((slot) =>
        Math.max(
          1,
          ...slot.groups.map(({ group }) => sessions.get(group.id)?.size ?? 1),
        ),
      ),
    );
    if (choices.length > limit) bad("Weekly session limit exceeded");
    if (
      choices.length > 1 &&
      choices.some(
        (slot) =>
          !slot.groups.some(
            ({ group }) => (sessions.get(group.id)?.size ?? 0) > 1,
          ),
      )
    )
      bad("Group is not eligible for multiple weekly sessions");
  }
}

export const accountRouter = createTRPCRouter({
  get: protectedProcedure.input(z.void()).query(({ ctx }) =>
    ctx.db.$transaction(
      (tx) => readState(tx, ctx.userId),
      // The revision and its related selections must come from one snapshot.
      { isolationLevel: "RepeatableRead" },
    ),
  ),
  saveSubjects: protectedProcedure
    .input(
      z
        .object({
          subjectIds: z.array(id).max(100),
          catalogYear: year,
          programFilters: filters,
          expectedRevision: revision,
        })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      mutate(ctx.db, async (db) => {
        await claim(db, ctx.userId, input.expectedRevision);
        const subjectIds = [...new Set(input.subjectIds)];
        const subjects = await db.subject.findMany({
          where: { id: { in: subjectIds }, active: true },
          select: { id: true },
        });
        if (subjects.length !== subjectIds.length) bad("Unknown subject");
        await validateFilters(db, input.programFilters);
        await db.userTimeslot.deleteMany({
          where: {
            userId: ctx.userId,
            timeslot: { subjectId: { notIn: subjectIds } },
          },
        });
        await db.userSubject.deleteMany({ where: { userId: ctx.userId } });
        if (subjectIds.length)
          await db.userSubject.createMany({
            data: subjectIds.map((subjectId, position) => ({
              userId: ctx.userId,
              subjectId,
              position,
            })),
          });
        await replaceFilters(db, ctx.userId, input.programFilters);
        await db.userSettings.update({
          where: { userId: ctx.userId },
          data: { catalogYear: input.catalogYear },
        });
        return readState(db, ctx.userId);
      }),
    ),
  saveTimeslots: protectedProcedure
    .input(
      z
        .object({
          timeslotIds: z.array(id).max(200),
          expectedScheduleVersion: revision.default(0),
          expectedRevision: revision,
        })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      mutate(ctx.db, async (db) => {
        await lockScheduleVersion(db, input.expectedScheduleVersion);
        await claim(db, ctx.userId, input.expectedRevision);
        const owned = await db.userSubject.findMany({
          where: { userId: ctx.userId },
          select: { subjectId: true },
        });
        const all = await db.timeslot.findMany({
          where: {
            subjectId: { in: owned.map((item) => item.subjectId) },
            active: true,
          },
          select: timeslotSelect,
        });
        const ids = new Set(input.timeslotIds);
        const selected = all.filter((slot) => ids.has(slot.id));
        if (selected.length !== ids.size) bad("Unknown or unowned timeslot");
        validateSelections(all, selected);
        await db.userTimeslot.deleteMany({ where: { userId: ctx.userId } });
        if (selected.length)
          await db.userTimeslot.createMany({
            data: selected.map((slot) => ({
              userId: ctx.userId,
              timeslotId: slot.id,
            })),
          });
        await db.userSettings.update({
          where: { userId: ctx.userId },
          data: {
            mode: "account",
            acknowledgedScheduleVersion: input.expectedScheduleVersion,
          },
        });
        return readState(db, ctx.userId);
      }),
    ),
  acknowledgeSchedule: protectedProcedure
    .input(z.object({ expectedScheduleVersion: revision }).strict())
    .mutation(({ ctx, input }) =>
      mutate(ctx.db, async (db) => {
        await lockScheduleVersion(db, input.expectedScheduleVersion);
        await db.userSettings.updateMany({
          where: {
            userId: ctx.userId,
            acknowledgedScheduleVersion: { lt: input.expectedScheduleVersion },
          },
          data: { acknowledgedScheduleVersion: input.expectedScheduleVersion },
        });
        return readState(db, ctx.userId);
      }),
    ),
  updatePreferences: protectedProcedure
    .input(preferences)
    .mutation(({ ctx, input }) =>
      mutate(ctx.db, async (db) => {
        await claim(db, ctx.userId, input.expectedRevision);
        if (
          input.groupId != null &&
          !(await db.studyGroup.findUnique({
            where: { id: input.groupId },
            select: { id: true },
          }))
        )
          bad("Unknown group");
        if (input.programFilters !== undefined) {
          await validateFilters(db, input.programFilters);
          await replaceFilters(db, ctx.userId, input.programFilters);
        }
        await db.userSettings.update({
          where: { userId: ctx.userId },
          data: {
            mode: input.mode,
            groupId: input.groupId,
            catalogYear: input.catalogYear,
            theme: input.theme,
          },
        });
        return readState(db, ctx.userId);
      }),
    ),
});
