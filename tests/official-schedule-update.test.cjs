const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");

test("official second-week release preserves all unchanged IDs and warns only about actually removed choices", {
  skip: !process.env.OFFICIAL_SCHEDULE_TEST_DATABASE_URL || !process.env.SCHEDULE_PREVIOUS_CATALOG_PATH,
}, async () => {
  const url = new URL(process.env.OFFICIAL_SCHEDULE_TEST_DATABASE_URL);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/official_schedule_updates");
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const cache = new Map();
  function load(file) {
    const filename = resolve(file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename);
    cache.set(filename, mod);
    mod.require = (id) => {
      if (id === "@clerk/nextjs/server") return { auth: () => ({ userId: "affected" }) };
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
  const { prepareCatalog, publishCatalog, importCatalog } = await import("../scripts/import-catalog.mjs");
  const previous = JSON.parse(readFileSync(process.env.SCHEDULE_PREVIOUS_CATALOG_PATH, "utf8"));
  const current = prepareCatalog(require("../src/data/predmeti.json"), require("../src/data/termini.json"));
  const identity = (name, slot) => JSON.stringify([name, slot.type, slot.day, slot.startTime, slot.endTime, slot.room]);
  const nextIdentities = new Set(current.flatMap((subject) => subject.timeslots.map((slot) => identity(subject.name, slot))));
  try {
    await db.$executeRawUnsafe("TRUNCATE user_settings, subjects, programs, study_groups CASCADE");
    await db.scheduleVersion.update({ where: { id: 1 }, data: { version: 0, contentHash: null } });
    await importCatalog(db, prepareCatalog(previous.subjects, previous.terms));
    assert.equal((await publishCatalog(db, prepareCatalog(previous.subjects, previous.terms))).changed, false);
    const before = await db.timeslot.findMany({ include: { subject: true } });
    assert.equal(before.length, 394);
    const retained = before.filter((slot) => nextIdentities.has(identity(slot.subject.name, slot)));
    const removed = before.filter((slot) => !nextIdentities.has(identity(slot.subject.name, slot)));
    assert.equal(retained.length, 349);
    assert.equal(removed.length, 45);
    const changed = removed.find((slot) => current.some((subject) => subject.name === slot.subject.name && subject.timeslots.some((next) => next.type === slot.type)));
    const unchanged = retained.find((slot) => slot.subjectId !== changed.subjectId && slot.room.includes("/"));
    assert.ok(unchanged, "Use a retained composite-room slot to test room-order compatibility");
    for (const [userId, choices] of [["affected", [unchanged, changed]], ["unaffected", [unchanged]]]) {
      await db.userSettings.create({ data: {
        userId,
        subjects: { create: [...new Set(choices.map((slot) => slot.subjectId))].map((subjectId) => ({ subjectId })) },
        timeslots: { create: choices.map((slot) => ({ timeslotId: slot.id })) },
      } });
    }
    const publication = await publishCatalog(db, current);
    assert.equal(publication.version, 1);
    assert.equal(publication.changed, true);
    assert.equal(await db.subject.count({ where: { active: true } }), 63);
    assert.equal(await db.timeslot.count({ where: { active: true } }), 426);
    assert.equal(await db.timeslot.count({ where: { active: false } }), 45);
    const after = await db.timeslot.findMany({ include: { subject: true } });
    for (const slot of retained) {
      const kept = after.find((next) => identity(next.subject.name, next) === identity(slot.subject.name, slot));
      assert.equal(kept.id, slot.id);
      assert.equal(kept.active, true);
    }
    for (const slot of removed) assert.equal(after.find((next) => next.id === slot.id).active, false);
    const affected = await caller("affected").account.get();
    const unaffected = await caller("unaffected").account.get();
    assert.deepEqual(affected.timeslotIds, [unchanged.id]);
    assert.equal(affected.scheduleUpdate.pending, true);
    assert.deepEqual(affected.scheduleUpdate.removedTimeslots.map((slot) => slot.id), [changed.id]);
    assert.deepEqual(unaffected.timeslotIds, [unchanged.id]);
    assert.equal(unaffected.scheduleUpdate.pending, true);
    assert.deepEqual(unaffected.scheduleUpdate.removedTimeslots, []);
    const ack = await caller("affected").account.acknowledgeSchedule({ expectedScheduleVersion: 1 });
    assert.equal(ack.scheduleUpdate.pending, false);
    assert.equal(ack.scheduleUpdate.removedTimeslots.length, 1);
    const replacement = await db.timeslot.findFirstOrThrow({ where: { active: true, subjectId: changed.subjectId, type: changed.type } });
    await assert.rejects(caller("affected").account.saveTimeslots({ timeslotIds: [unchanged.id, changed.id], expectedRevision: 0, expectedScheduleVersion: 1 }), (error) => error.code === "BAD_REQUEST");
    await assert.rejects(caller("affected").account.saveTimeslots({ timeslotIds: [unchanged.id, replacement.id], expectedRevision: 0, expectedScheduleVersion: 0 }), (error) => error.code === "CONFLICT");
    const saved = await caller("affected").account.saveTimeslots({ timeslotIds: [unchanged.id, replacement.id], expectedRevision: 0, expectedScheduleVersion: 1 });
    assert.equal(saved.timeslotIds.length, 2);
    assert.equal(saved.scheduleUpdate.removedTimeslots.length, 0);
    const duplicate = await publishCatalog(db, current);
    assert.equal(duplicate.changed, false);
    assert.equal(duplicate.version, 1);
    assert.equal((await caller("affected").account.get()).scheduleUpdate.pending, false);
    console.log(JSON.stringify({ previous: before.length, current: 426, preservedIDs: retained.length, retired: removed.length, added: after.length - before.length, warningExample: affected.scheduleUpdate.removedTimeslots[0] }, null, 2));
  } finally {
    await db.$disconnect();
  }
});
