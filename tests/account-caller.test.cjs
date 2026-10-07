const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");
const cache = new Map();
function load(file) {
  const filename = resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  cache.set(filename, mod);
  mod.require = (id) => {
    if (id === "@clerk/nextjs/server") return { auth: () => ({ userId: "A" }) };
    if (id === "~/server/db") return { db: {} };
    if (id.startsWith("~/")) return load("src/" + id.slice(2) + ".ts");
    return require(id);
  };
  mod._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return mod.exports;
}
const { appRouter } = load("src/server/api/root.ts");
const code = (expected) => (error) => error.code === expected;
const defaults = {
  revision: 0,
  preferences: {
    mode: "account",
    group: null,
    catalogYear: 1,
    programFilters: [],
  },
  subjectIds: [],
  timeslotIds: [],
  scheduleVersion: 0,
  scheduleUpdate: { pending: false, publishedAt: null, removedTimeslots: [] },
};
const slot = (
  id,
  subjectId,
  day,
  groupId = "y1-g1",
  room = "101",
  type = "V",
) => ({
  id,
  subjectId,
  day,
  type,
  room,
  startTime: "08:00",
  endTime: "09:00",
  groups: [{ group: { id: groupId, name: "G1" } }],
});

// Transaction-local snapshots emulate commit/rollback; every owner predicate is asserted.
function fixture(slots = []) {
  let rows = {};
  let calls = [];
  let failCreate = false;
  const subjects = ["s1", "s2", "s3"];
  const memberships = [
    { year: 1, programId: "p1" },
    { year: 2, programId: "p2" },
  ];
  function delegates(state, owner) {
    function record(method, args) {
      calls.push({ method, args });
    }
    function owned(args) {
      assert.equal(args.where.userId, owner);
      return state[owner];
    }
    return {
      $queryRaw: async () => [],
      scheduleVersion: { findUnique: async () => null },
      userSettings: {
        async findUnique(args) {
          record("get", args);
          const row = owned(args);
          return row
            ? {
                ...row,
                timeslots: row.timeslots.map((item) => ({ ...item, timeslot: { ...slots.find((slot) => slot.id === item.timeslotId), active: true, subject: { name: "Subject" } } })),
                group: row.groupId
                  ? { id: row.groupId, name: "G1", year: 1 }
                  : null,
              }
            : null;
        },
        async upsert(args) {
          record("upsert", args);
          owned(args);
          assert.equal(args.create.userId, owner);
          state[owner] ??= {
            revision: 0,
            acknowledgedScheduleVersion: args.create.acknowledgedScheduleVersion,
            mode: "account",
            catalogYear: 1,
            groupId: null,
            subjects: [],
            timeslots: [],
            filters: [],
          };
        },
        async updateMany(args) {
          record("cas", args);
          const row = owned(args);
          if (row.revision !== args.where.revision) return { count: 0 };
          row.revision++;
          return { count: 1 };
        },
        async update(args) {
          record("update", args);
          Object.assign(
            owned(args),
            Object.fromEntries(
              Object.entries(args.data).filter(
                ([, value]) => value !== undefined,
              ),
            ),
          );
        },
      },
      userSubject: {
        async findMany(args) {
          record("ownedSubjects", args);
          return owned(args).subjects;
        },
        async deleteMany(args) {
          record("deleteSubjects", args);
          owned(args).subjects = [];
        },
        async createMany({ data }) {
          if (failCreate) throw new Error("write failed");
          for (const item of data) assert.equal(item.userId, owner);
          state[owner].subjects = data.map(({ subjectId, position }) => ({
            subjectId,
            position,
          }));
        },
      },
      userTimeslot: {
        async deleteMany(args) {
          record("deleteSlots", args);
          const row = owned(args);
          row.timeslots = args.where.timeslot
            ? row.timeslots.filter(({ timeslotId }) =>
                args.where.timeslot.subjectId.notIn.includes(
                  slots.find((slot) => slot.id === timeslotId).subjectId,
                ),
              )
            : [];
        },
        async createMany({ data }) {
          for (const item of data) assert.equal(item.userId, owner);
          state[owner].timeslots = data
            .map(({ timeslotId }) => ({ timeslotId }))
            .sort((a, b) => a.timeslotId.localeCompare(b.timeslotId));
        },
      },
      userProgramFilter: {
        async deleteMany(args) {
          owned(args).filters = [];
        },
        async createMany({ data }) {
          for (const item of data) assert.equal(item.userId, owner);
          state[owner].filters = data
            .map(({ year, programId }) => ({ year, programId }))
            .sort((a, b) => a.year - b.year);
        },
      },
      subject: {
        async findMany(args) {
          return subjects
            .filter((id) => args.where.id.in.includes(id))
            .map((id) => ({ id }));
        },
      },
      subjectProgram: {
        async findMany() {
          return memberships;
        },
      },
      studyGroup: {
        async findUnique(args) {
          return args.where.id === "y1-g1" ? { id: "y1-g1" } : null;
        },
      },
      timeslot: {
        async findMany(args) {
          return slots.filter((slot) =>
            args.where.subjectId.in.includes(slot.subjectId),
          );
        },
      },
    };
  }
  function caller(userId = "A") {
    const db = {
      ...delegates(rows, userId),
      async $transaction(run, options) {
        if (options) assert.equal(options.isolationLevel, "RepeatableRead");
        calls.push({ method: "transaction" });
        const draft = structuredClone(rows);
        const result = await run(delegates(draft, userId));
        Object.assign(rows, draft);
        return result;
      },
    };
    return appRouter.createCaller({
      db,
      userId,
      headers: new Headers({ "x-user-id": "B" }),
    }).account;
  }
  return {
    caller,
    get rows() {
      return structuredClone(rows);
    },
    calls,
    fail() {
      failCreate = true;
    },
  };
}
const saveSubjects = (caller, ids = ["s1"], expectedRevision = 0) =>
  caller.saveSubjects({
    subjectIds: ids,
    catalogYear: 1,
    programFilters: [{ year: 1, programId: "p1" }],
    expectedRevision,
  });

test("initialization races and deadlocks are conflicts; unrelated transaction failures propagate", async () => {
  for (const dbCode of ["P2002", "P2034", "P1001"]) {
    const failure = Object.assign(new Error("transaction failure"), {
      code: dbCode,
    });
    const caller = appRouter.createCaller({
      db: {
        $transaction: async () => {
          throw failure;
        },
      },
      userId: "A",
      headers: new Headers(),
    }).account;
    await assert.rejects(
      saveSubjects(caller),
      (error) =>
        error.code ===
          (dbCode === "P1001" ? "INTERNAL_SERVER_ERROR" : "CONFLICT") &&
        error.cause === failure,
    );
  }
});

test("missing account reads exact defaults without writes; A/B remain isolated", async () => {
  const f = fixture([slot("t1", "s1", 1)]);
  assert.deepEqual(await f.caller().get(), defaults);
  assert.deepEqual(f.rows, {});
  assert.deepEqual(
    f.calls.map((call) => call.method),
    ["transaction", "get"],
  );
  await saveSubjects(f.caller());
  await f.caller().saveTimeslots({ timeslotIds: ["t1"], expectedRevision: 1 });
  assert.deepEqual(await f.caller("B").get(), defaults);
  await saveSubjects(f.caller("B"), ["s2"]);
  assert.deepEqual((await f.caller().get()).timeslotIds, ["t1"]);
  assert.deepEqual((await f.caller("B").get()).subjectIds, ["s2"]);
});

test("anonymous calls and spoofed owner fields fail before database access", async () => {
  const f = fixture();
  const anon = f.caller(null);
  for (const [method, input] of [
    ["get", undefined],
    ["saveSubjects", {}],
    ["saveTimeslots", {}],
    ["updatePreferences", {}],
  ])
    await assert.rejects(anon[method](input), code("UNAUTHORIZED"));
  const caller = f.caller();
  await assert.rejects(caller.get({ userId: "B" }), code("BAD_REQUEST"));
  await assert.rejects(
    caller.saveSubjects({
      subjectIds: [],
      catalogYear: 1,
      programFilters: [],
      expectedRevision: 0,
      userId: "B",
    }),
    code("BAD_REQUEST"),
  );
  await assert.rejects(
    caller.saveTimeslots({ timeslotIds: [], expectedRevision: 0, userId: "B" }),
    code("BAD_REQUEST"),
  );
  await assert.rejects(
    caller.updatePreferences({ expectedRevision: 0, userId: "B" }),
    code("BAD_REQUEST"),
  );
  assert.deepEqual(f.calls, []);
});

test("subject replacement atomically retains slots, prunes only removed subjects, and supports empty", async () => {
  const f = fixture([slot("t1", "s1", 1), slot("t2", "s2", 1)]);
  const c = f.caller();
  await saveSubjects(c, ["s1", "s2"]);
  await c.saveTimeslots({ timeslotIds: ["t1", "t2"], expectedRevision: 1 });
  const state = await saveSubjects(c, ["s2", "s3"], 2);
  assert.deepEqual(state.subjectIds, ["s2", "s3"]);
  assert.deepEqual(state.timeslotIds, ["t2"]);
  assert.equal(state.revision, 3);
  const empty = await saveSubjects(c, [], 3);
  assert.deepEqual(empty.timeslotIds, []);
  assert.deepEqual(empty.subjectIds, []);
});

test("stale and initial revisions conflict; failed validation/writes roll back everything", async () => {
  const f = fixture();
  const c = f.caller();
  await assert.rejects(saveSubjects(c, ["s1"], 1), code("CONFLICT"));
  assert.deepEqual(f.rows, {});
  await assert.rejects(saveSubjects(c, ["unknown"]), code("BAD_REQUEST"));
  assert.deepEqual(f.rows, {});
  await saveSubjects(c);
  const before = f.rows;
  await assert.rejects(saveSubjects(c, [], 0), code("CONFLICT"));
  await assert.rejects(
    c.updatePreferences({ expectedRevision: 1, groupId: "missing" }),
    code("BAD_REQUEST"),
  );
  await assert.rejects(
    c.updatePreferences({
      expectedRevision: 1,
      programFilters: [{ year: 2, programId: "p1" }],
    }),
    code("BAD_REQUEST"),
  );
  f.fail();
  await assert.rejects(saveSubjects(c, ["s2"], 1), /write failed/);
  assert.deepEqual(f.rows, before);
  const cas = f.calls.find((call) => call.method === "cas").args;
  assert.deepEqual(cas, {
    where: { userId: "A", revision: 1 },
    data: { revision: { increment: 1 } },
  });
});

test("strict preference patch preserves omitted values and clears nullable group/filters", async () => {
  const f = fixture();
  const c = f.caller();
  const first = await c.updatePreferences({
    expectedRevision: 0,
    mode: "search",
    groupId: "y1-g1",
    catalogYear: 4,
    programFilters: [{ year: 2, programId: "p2" }],
  });
  assert.deepEqual(first.preferences, {
    mode: "search",
    group: { id: "y1-g1", name: "G1", year: 1 },
    catalogYear: 4,
    programFilters: [{ year: 2, programId: "p2" }],
  });
  const next = await c.updatePreferences({
    expectedRevision: 1,
    groupId: null,
    programFilters: [],
  });
  assert.deepEqual(next.preferences, {
    ...first.preferences,
    group: null,
    programFilters: [],
  });
  await assert.rejects(
    c.updatePreferences({ expectedRevision: 2, theme: "dark" }),
    code("BAD_REQUEST"),
  );
  await assert.rejects(
    c.updatePreferences({
      expectedRevision: 2,
      programFilters: [
        { year: 1, programId: "p1" },
        { year: 1, programId: "p1" },
      ],
    }),
    code("BAD_REQUEST"),
  );
});

test("weekly limits 2/3, room replacements, group eligibility, and cross-class overlaps", async () => {
  for (const limit of [2, 3]) {
    const slots = Array.from({ length: limit }, (_, i) =>
      slot(`t${i}`, "s1", i + 1),
    );
    slots.push(
      slot("smaller1", "s1", 4, "smaller"),
      slot("smaller2", "s1", 5, "smaller"),
      slot("room", "s1", 1, "y1-g1", "102"),
      slot("regular", "s1", 5, "regular"),
      slot("overlap", "s2", 1),
    );
    const f = fixture(slots);
    const c = f.caller();
    await saveSubjects(c, ["s1", "s2"]);
    await c.updatePreferences({ expectedRevision: 1, mode: "search" });
    const selected = slots.slice(0, limit).map((s) => s.id);
    const state = await c.saveTimeslots({
      expectedRevision: 2,
      timeslotIds: [...selected, "overlap"],
    });
    assert.equal(state.preferences.mode, "account");
    const before = f.rows;
    await assert.rejects(
      c.saveTimeslots({
        expectedRevision: 3,
        timeslotIds: [...selected, "smaller1"],
      }),
      code("BAD_REQUEST"),
    );
    await assert.rejects(
      c.saveTimeslots({
        expectedRevision: 3,
        timeslotIds: [...selected, "room"],
      }),
      code("BAD_REQUEST"),
    );
    await assert.rejects(
      c.saveTimeslots({ expectedRevision: 3, timeslotIds: ["t0", "regular"] }),
      code("BAD_REQUEST"),
    );
    await assert.rejects(
      c.saveTimeslots({ expectedRevision: 3, timeslotIds: ["unknown"] }),
      code("BAD_REQUEST"),
    );
    assert.deepEqual(f.rows, before);
    const replacement = await c.saveTimeslots({
      expectedRevision: 3,
      timeslotIds: ["room", ...selected.slice(1)],
    });
    assert.equal(replacement.timeslotIds.length, limit);
    assert.deepEqual(
      (await c.saveTimeslots({ expectedRevision: 4, timeslotIds: [] }))
        .timeslotIds,
      [],
    );
  }
});

test("same display label across years cannot manufacture multi-session eligibility; unowned slots rejected", async () => {
  const f = fixture([
    slot("t1", "s1", 1, "year1-g1"),
    slot("t2", "s1", 2, "year2-g1"),
    slot("other", "s2", 1),
  ]);
  const c = f.caller();
  await saveSubjects(c);
  await assert.rejects(
    c.saveTimeslots({ expectedRevision: 1, timeslotIds: ["t1", "t2"] }),
    code("BAD_REQUEST"),
  );
  await assert.rejects(
    c.saveTimeslots({ expectedRevision: 1, timeslotIds: ["other"] }),
    code("BAD_REQUEST"),
  );
  await assert.rejects(
    c.saveTimeslots({
      expectedRevision: 1,
      timeslotIds: Array(201).fill("t1"),
    }),
    code("BAD_REQUEST"),
  );
  await assert.rejects(
    saveSubjects(c, Array(101).fill("s1"), 1),
    code("BAD_REQUEST"),
  );
  assert.equal((await c.get()).revision, 1);
});

test("catalog serializes DB rows only, preserves IDs and deduplicates labels, and guards weekdays/errors", async () => {
  const timeslot = slot("t1", "s1", 4);
  timeslot.groups.push({ group: { id: "y2-g1", name: "G1" } });
  const db = {
    scheduleVersion: { findUnique: async () => null },
    $transaction: async (run) => run(db),
    program: {
      findMany: async () => [
        {
          id: "p1",
          name: "Program",
          subjects: [{ year: 2 }, { year: 1 }, { year: 1 }],
        },
      ],
    },
    subject: {
      findMany: async () => [
        {
          id: "s1",
          name: "Subject",
          programs: [{ year: 1, programId: "p1" }],
          timeslots: [timeslot],
        },
      ],
    },
  };
  const c = appRouter.createCaller({
    db,
    userId: null,
    headers: new Headers(),
  });
  assert.deepEqual(await c.catalog.get(), {
    scheduleVersion: 0,
    programs: [{ id: "p1", name: "Program", years: [1, 2] }],
    subjects: [
      {
        id: "s1",
        name: "Subject",
        years: [1],
        memberships: [{ year: 1, programId: "p1" }],
        terms: {
          P: [],
          V: [
            {
              id: "t1",
              dan: "\u010Cetvrtak",
              od: "08:00",
              do: "09:00",
              sala: "101",
              grupe: ["G1"],
              groupKeys: ["y1-g1", "y2-g1"],
            },
          ],
        },
      },
    ],
  });
  for (const day of [0, 6, 1.5, null]) {
    timeslot.day = day;
    await assert.rejects(
      c.catalog.get(),
      (error) =>
        error.code === "INTERNAL_SERVER_ERROR" &&
        error.message === "Invalid stored weekday",
    );
  }
  const failure = new Error("DB offline");
  db.program.findMany = async () => {
    throw failure;
  };
  await assert.rejects(c.catalog.get(), (error) => error.cause === failure);
  const account = appRouter.createCaller({
    db: {
      $transaction: async () => {
        throw failure;
      },
    },
    userId: "A",
    headers: new Headers(),
  }).account;
  await assert.rejects(account.get(), (error) => error.cause === failure);
});
