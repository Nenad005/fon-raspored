import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createCatalogIndex, termKey } from "../src/lib/schedule-storage.ts";

const year = z.enum(["year1", "year2", "year3", "year4"]);
const text = z
  .string()
  .min(1)
  .max(191)
  .refine((value) => value === value.trim());
const days = ["Ponedeljak", "Utorak", "Sreda", "\u010Cetvrtak", "Petak"];
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const term = z
  .object({
    dan: z.enum(days),
    od: time,
    do: time,
    sala: text,
    grupe: z.array(text).min(1),
  })
  .strict()
  .refine((value) => value.od < value.do, "Session must end after it starts");
const subjectsSchema = z.record(year, z.record(text, z.array(text)));
const termsSchema = z.record(
  year,
  z.record(
    text,
    z
      .object({ P: z.array(term).optional(), V: z.array(term).optional() })
      .strict(),
  ),
);

export function prepareCatalog(subjectData, termData) {
  const subjects = subjectsSchema.parse(subjectData);
  const terms = termsSchema.parse(termData);
  const catalog = new Map();
  for (const [year, programs] of Object.entries(subjects)) {
    for (const [program, names] of Object.entries(programs)) {
      for (const name of names) {
        const subject = catalog.get(name) ?? {
          name,
          programs: {},
          timeslots: [],
        };
        const memberships = (subject.programs[year] ??= []);
        if (!memberships.includes(program)) memberships.push(program);
        catalog.set(name, subject);
      }
    }
  }
  for (const [name, indexed] of createCatalogIndex(terms)) {
    const subject = catalog.get(name);
    if (!subject)
      throw new Error(`Timeslots reference an unknown subject: ${name}`);
    if (indexed.years.some((year) => !subject.programs[year])) {
      throw new Error(
        `Timeslots reference a subject outside its catalog years: ${name}`,
      );
    }
    for (const type of ["P", "V"]) {
      for (const term of indexed[type].terms) {
        subject.timeslots.push({
          type,
          day: days.indexOf(term.dan) + 1,
          startTime: term.od,
          endTime: term.do,
          room: term.sala,
          groups: [
            ...new Map(
              indexed.years.flatMap((year) =>
                (terms[year][name][type] ?? [])
                  .filter((source) => termKey(source) === termKey(term))
                  .flatMap((source) =>
                    source.grupe.map((name) => {
                      const group = { year: Number(year.slice(4)), name };
                      return [JSON.stringify(group), group];
                    }),
                  ),
              ),
            ).values(),
          ],
        });
      }
    }
  }
  return [...catalog.values()];
}

export async function importCatalog(db, catalog) {
  return db.$transaction(
    async (tx) => {
      let timeslots = 0;
      const subjectIds = [];
      const timeslotIds = [];
      const programsByName = new Map();
      const groupsByKey = new Map();
      const memberships = [];
      const groupLinks = [];
      for (const { name, programs, timeslots: slots } of catalog) {
        const subject = await tx.subject.upsert({
          where: { name },
          create: { name },
          update: {},
        });
        subjectIds.push(subject.id);
        for (const [year, names] of Object.entries(programs)) {
          for (const name of names) {
            let program = programsByName.get(name);
            if (!program) {
              program = await tx.program.upsert({
                where: { name },
                create: { name },
                update: {},
              });
              programsByName.set(name, program);
            }
            memberships.push({
              subjectId: subject.id,
              programId: program.id,
              year: Number(year.slice(4)),
            });
          }
        }
        for (const slot of slots) {
          const { groups, ...identity } = slot;
          const key = { subjectId: subject.id, ...identity };
          const timeslot = await tx.timeslot.upsert({
            where: { subjectId_type_day_startTime_endTime_room: key },
            create: key,
            update: {},
          });
          timeslotIds.push(timeslot.id);
          for (const group of groups) {
            const groupKey = JSON.stringify(group);
            let stored = groupsByKey.get(groupKey);
            if (!stored) {
              stored = await tx.studyGroup.upsert({
                where: { year_name: group },
                create: group,
                update: {},
              });
              groupsByKey.set(groupKey, stored);
            }
            groupLinks.push({ timeslotId: timeslot.id, groupId: stored.id });
          }
          timeslots++;
        }
      }
      // Refresh only imported records' associations; catalog IDs stay stable.
      if (subjectIds.length) {
        await tx.subjectProgram.deleteMany({
          where: { subjectId: { in: subjectIds } },
        });
        if (memberships.length)
          await tx.subjectProgram.createMany({ data: memberships });
      }
      if (timeslotIds.length) {
        await tx.timeslotGroup.deleteMany({
          where: { timeslotId: { in: timeslotIds } },
        });
        if (groupLinks.length)
          await tx.timeslotGroup.createMany({ data: groupLinks });
      }
      return { subjects: catalog.length, timeslots };
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) {
    throw new Error("Usage: npm run db:import -- [--dry-run]");
  }
  const [subjects, terms] = await Promise.all(
    ["predmeti", "termini"].map(async (name) =>
      JSON.parse(
        await readFile(
          new URL(`../src/data/${name}.json`, import.meta.url),
          "utf8",
        ),
      ),
    ),
  );
  const catalog = prepareCatalog(subjects, terms);
  if (args.includes("--dry-run")) {
    console.log(
      `Validated ${catalog.length} subjects and ${catalog.reduce((count, subject) => count + subject.timeslots.length, 0)} timeslots. No database connection made.`,
    );
    return;
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL must be set before importing.");
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({
    datasources: {
      db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL },
    },
  });
  try {
    const result = await importCatalog(db, catalog);
    console.log(
      `Imported ${result.subjects} subjects and ${result.timeslots} timeslots.`,
    );
  } finally {
    await db.$disconnect();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(
      error.message.replace(
        /postgres(?:ql)?:\/\/[^\s"']+/g,
        "[redacted database URL]",
      ),
    );
    process.exitCode = 1;
  });
}
