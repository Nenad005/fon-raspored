const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");

const importer = import("../scripts/import-catalog.mjs");
const source = {
  subjects: { year1: { ISiT: ["Example", "Other"] } },
  terms: { year1: {
    Example: { P: [{ dan: "Ponedeljak", od: "08:00", do: "09:00", sala: "101", grupe: ["A1", "A2"] }] },
    Other: { V: [{ dan: "Utorak", od: "10:00", do: "11:00", sala: "102", grupe: ["A1"] }] },
  } },
};

test("schedule fingerprint ignores ordering but detects time, room, group and subject changes", async () => {
  const { prepareCatalog, catalogHash } = await importer;
  const original = prepareCatalog(source.subjects, source.terms);
  const reversed = structuredClone(original).reverse();
  for (const subject of reversed) {
    subject.timeslots.reverse();
    for (const slot of subject.timeslots) slot.groups.reverse();
    for (const names of Object.values(subject.programs)) names.reverse();
  }
  assert.equal(catalogHash(original), catalogHash(reversed));
  for (const change of [
    (catalog) => { catalog[0].timeslots[0].startTime = "08:15"; },
    (catalog) => { catalog[0].timeslots[0].room = "103"; },
    (catalog) => { catalog[0].timeslots[0].groups.pop(); },
    (catalog) => { catalog.pop(); },
  ]) {
    const changed = structuredClone(original);
    change(changed);
    assert.notEqual(catalogHash(original), catalogHash(changed));
  }
});

// Use an isolated, disposable PostgreSQL DB, never the application's env files.
test("schedule releases preserve choices, notify per account, and reject stale/removed selections atomically", {
  skip: !process.env.SCHEDULE_TEST_DATABASE_URL,
}, async () => {
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: process.env.SCHEDULE_TEST_DATABASE_URL } } });
  const cache = new Map();
  function load(file) {
    const filename = resolve(file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename);
    cache.set(filename, mod);
    mod.require = (id) => {
      if (id === "@clerk/nextjs/server") return { auth: () => ({ userId: "A" }) };
      if (id === "~/server/db") return { db };
      if (id.startsWith("~/")) return load("src/" + id.slice(2) + ".ts");
      return require(id);
    };
    mod._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, filename);
    return mod.exports;
  }
  const { appRouter } = load("src/server/api/root.ts");
  const caller = (userId) => appRouter.createCaller({ db, userId, headers: new Headers() });
  const { prepareCatalog, importCatalog, publishCatalog } = await importer;
  const catalog = prepareCatalog(source.subjects, source.terms);
  const conflict = (error) => error.code === "CONFLICT";
  try {
    // Migrations must be applied to this dedicated disposable DB before the test.
    assert.equal(new URL(process.env.SCHEDULE_TEST_DATABASE_URL).pathname, "/schedule_updates");
    assert.equal(new URL(process.env.SCHEDULE_TEST_DATABASE_URL).hostname, "127.0.0.1");
    assert.equal(new URL(process.env.SCHEDULE_TEST_DATABASE_URL).port, "55432");
    await db.$executeRawUnsafe('TRUNCATE user_settings, subjects, programs, study_groups CASCADE');
    await db.scheduleVersion.update({ where: { id: 1 }, data: { version: 0, contentHash: null } });
    await importCatalog(db, catalog);
    const subjects = await db.subject.findMany({ orderBy: { name: "asc" } });
    const slots = await db.timeslot.findMany({ orderBy: { day: "asc" } });
    for (const userId of ["A", "B"]) {
      await db.userSettings.create({ data: { userId, subjects: { create: subjects.map((subject) => ({ subjectId: subject.id })) }, timeslots: { create: slots.map((slot) => ({ timeslotId: slot.id })) } } });
    }
    // Installing versioning on an unchanged existing database must not notify users.
    assert.equal((await publishCatalog(db, catalog)).changed, false);
    assert.equal((await caller("A").account.get()).scheduleUpdate.pending, false);
    const reordered = structuredClone(catalog).reverse();
    reordered.forEach((subject) => subject.timeslots.forEach((slot) => slot.groups.reverse()));
    assert.equal((await publishCatalog(db, reordered)).version, 0);

    const changed = structuredClone(catalog);
    changed[1].timeslots[0].room = "NEW";
    const release = await publishCatalog(db, changed);
    assert.equal(release.version, 1);
    const state = await caller("A").account.get();
    assert.deepEqual(state.timeslotIds, [slots[0].id]);
    assert.equal(state.scheduleUpdate.pending, true);
    assert.equal(state.scheduleUpdate.removedTimeslots[0].id, slots[1].id);
    assert.equal(state.scheduleUpdate.removedTimeslots[0].sala, "102");
    assert.equal(state.scheduleUpdate.removedTimeslots[0].subjectName, "Other");
    assert.equal(await db.userTimeslot.count({ where: { userId: "A" } }), 2);
    const publicCatalog = await caller(null).catalog.get();
    assert.equal(publicCatalog.scheduleVersion, 1);
    assert.equal(publicCatalog.subjects[0].terms.P[0].id, slots[0].id);
    assert.equal(publicCatalog.subjects[1].terms.V[0].sala, "NEW");
    const publicSchedule = await caller(null).schedule.getSchedule({ year: 1, group: "A1" });
    assert.equal(publicSchedule.schedule.Utorak[0].sala, "NEW");

    await assert.rejects(caller("A").account.acknowledgeSchedule({ expectedScheduleVersion: 0 }), conflict);
    const acknowledged = await caller("A").account.acknowledgeSchedule({ expectedScheduleVersion: 1 });
    assert.equal(acknowledged.scheduleUpdate.pending, false);
    assert.equal(acknowledged.scheduleUpdate.removedTimeslots.length, 1);
    assert.equal((await caller("B").account.get()).scheduleUpdate.pending, true);
    assert.equal((await caller("NEW").account.get()).scheduleUpdate.pending, false);
    await assert.rejects(caller(null).account.acknowledgeSchedule({ expectedScheduleVersion: 1 }), (error) => error.code === "UNAUTHORIZED");
    await assert.rejects(caller("A").account.saveTimeslots({ timeslotIds: [slots[0].id], expectedRevision: 0, expectedScheduleVersion: 0 }), conflict);
    await assert.rejects(caller("A").account.saveTimeslots({ timeslotIds: [slots[1].id], expectedRevision: 0, expectedScheduleVersion: 1 }), (error) => error.code === "BAD_REQUEST");
    assert.equal((await caller("A").account.get()).revision, 0);
    const saved = await caller("A").account.saveTimeslots({ timeslotIds: [slots[0].id], expectedRevision: 0, expectedScheduleVersion: 1 });
    assert.equal(saved.scheduleUpdate.removedTimeslots.length, 0);
    assert.deepEqual(saved.timeslotIds, [slots[0].id]);
    assert.equal(saved.revision, 1);

    // A second unseen update is cumulative; unrelated choices remain intact.
    const third = structuredClone(changed);
    third[0].timeslots = [];
    assert.equal((await publishCatalog(db, third)).version, 2);
    assert.equal((await caller("B").account.get()).scheduleUpdate.removedTimeslots.length, 2);
    assert.equal((await caller("A").account.get()).scheduleUpdate.pending, true);
    const empty = await caller("A").account.saveTimeslots({ timeslotIds: [], expectedRevision: 1, expectedScheduleVersion: 2 });
    assert.equal(empty.scheduleUpdate.removedTimeslots.length, 0);
    assert.equal(empty.scheduleUpdate.pending, false);

    // Failed publication rolls back new content, activity flags and release version.
    const before = await db.scheduleVersion.findUnique({ where: { id: 1 } });
    const broken = structuredClone(third);
    broken[1].timeslots[0].day = 100_000; // PostgreSQL SMALLINT overflow.
    await assert.rejects(publishCatalog(db, broken));
    assert.deepEqual(await db.scheduleVersion.findUnique({ where: { id: 1 } }), before);
    await assert.rejects(publishCatalog(db, []), /empty catalog/);

    // Concurrent identical publications publish one version, not two.
    const concurrent = await Promise.all([publishCatalog(db, catalog), publishCatalog(db, catalog)]);
    assert.equal(concurrent.filter((result) => result.changed).length, 1);
    assert.equal(concurrent[0].version, concurrent[1].version);
    assert.equal((await db.timeslot.findUnique({ where: { id: slots[0].id } })).active, true);
  } finally {
    await db.$disconnect();
  }
});
