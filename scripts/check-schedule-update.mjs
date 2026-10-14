import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prepareCatalog } from "./import-catalog.mjs";

const identity = (name, slot) =>
  JSON.stringify([
    name,
    slot.type,
    slot.day,
    slot.startTime,
    slot.endTime,
    slot.room,
  ]);

export function assertSafeUpdate(previous, current) {
  for (const year of [1, 2, 3, 4]) {
    const collect = (catalog) =>
      new Set(
        catalog.flatMap((subject) =>
          subject.timeslots
            .filter((slot) => slot.groups.some((group) => group.year === year))
            .map((slot) => identity(subject.name, slot)),
        ),
      );
    const before = collect(previous);
    const after = collect(current);
    if (!before.size || !after.size) {
      throw new Error(
        `Year ${year}: empty production or incoming schedule; manual review required.`,
      );
    }
    const removed = [...before].filter((key) => !after.has(key)).length;
    if (after.size < before.size * 0.8 || removed > before.size * 0.3) {
      throw new Error(
        `Year ${year}: suspicious update (${before.size} -> ${after.size} slots, ${removed} removed/replaced). Manual review required; production was not changed by this check.`,
      );
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
    throw new Error("DATABASE_URL and DIRECT_URL must both be configured.");
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
  const current = prepareCatalog(subjects, terms);
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL } },
  });
  try {
    const stored = await db.subject.findMany({
      where: { active: true },
      include: {
        timeslots: {
          where: { active: true },
          include: { groups: { include: { group: true } } },
        },
      },
    });
    const previous = stored.map((subject) => ({
      name: subject.name,
      timeslots: subject.timeslots.map((slot) => ({
        ...slot,
        groups: slot.groups.map((link) => link.group),
      })),
    }));
    assertSafeUpdate(previous, current);
    console.log(
      "Production safety checks passed for all four years. No database writes made.",
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
