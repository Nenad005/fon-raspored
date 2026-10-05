const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createRequire, Module } = require("node:module");

// Use the project's installed TypeScript as the runtime, with auth/DB mocked.
const root = process.cwd();
const projectRequire = createRequire(resolve(root, "package.json"));
const ts = projectRequire("typescript");
let verifiedUserId = "verified-user";
const contextDb = {};
let middlewareArgs;
const cache = new Map();
function load(file) {
  const filename = resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  cache.set(filename, mod);
  mod.require = (id) => {
    if (id === "@clerk/nextjs/server")
      return {
        auth: () => ({ userId: verifiedUserId }),
        clerkMiddleware: (...args) => {
          middlewareArgs = args;
          return () => {};
        },
      };
    if (id === "~/server/db") return { db: contextDb };
    if (id.startsWith("~/")) return load("src/" + id.slice(2) + ".ts");
    return projectRequire(id);
  };
  const source = readFileSync(filename, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(result.outputText, filename);
  return mod.exports;
}

const { createTRPCContext, createTRPCRouter, protectedProcedure } = load(
  "src/server/api/trpc.ts",
);
const { appRouter } = load("src/server/api/root.ts");
const { fetchRequestHandler } = projectRequire("@trpc/server/adapters/fetch");
const { z } = projectRequire("zod");
let handlerCalls = 0;
const identity = ({ ctx }) => {
  handlerCalls++;
  assert.equal(ctx.db, contextDb);
  return ctx.userId;
};
const testRouter = createTRPCRouter({
  identity: protectedProcedure.query(identity),
  update: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(identity),
});
const code = (expected) => (error) => error.code === expected;

function scheduleCaller(handlers = {}, userId = null) {
  const calls = [];
  const db = Object.fromEntries(
    [
      "subject",
      "program",
      "subjectProgram",
      "studyGroup",
      "timeslot",
      "timeslotGroup",
    ].map((model) => [
      model,
      new Proxy(
        {},
        {
          get: (_, method) => async (args) => {
            const path = `${model}.${String(method)}`;
            calls.push({ path, args });
            assert.ok(handlers[path], `Unexpected database call: ${path}`);
            return handlers[path](args);
          },
        },
      ),
    ]),
  );
  return {
    calls,
    caller: appRouter.createCaller({ db, userId, headers: new Headers() })
      .schedule,
  };
}

const groupLookup = (year, name) => ({
  where: { year_name: { year, name } },
  select: { id: true, name: true },
});
const slotQuery = (year, groupId) => ({
  where: { active: true, groups: { some: { groupId } } },
  select: {
    id: true,
    day: true,
    type: true,
    startTime: true,
    endTime: true,
    room: true,
    subject: { select: { name: true } },
    groups: {
      where: { group: { year } },
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

test("public groups query scopes by year and populated groups, then sorts naturally", async () => {
  for (const userId of [null, "verified-user"]) {
    const groups = [
      { id: "g10", name: "Grupa 10" },
      { id: "g2", name: "Grupa 2" },
      { id: "g1", name: "Grupa 1" },
    ];
    const { caller, calls } = scheduleCaller(
      {
        "studyGroup.findMany": () => groups,
      },
      userId,
    );
    assert.deepEqual(await caller.groups({ year: 2 }), [
      { id: "g1", name: "Grupa 1" },
      { id: "g2", name: "Grupa 2" },
      { id: "g10", name: "Grupa 10" },
    ]);
    assert.equal(calls.length, 1);
    for (const call of calls) {
      assert.deepEqual(call, {
        path: "studyGroup.findMany",
        args: {
          where: { year: 2, timeslots: { some: { timeslot: { active: true } } } },
          select: { id: true, name: true },
        },
      });
    }
  }
});

test("public weekly schedule maps payloads, retaining room alternatives and short sessions", async () => {
  const slots = [
    {
      id: "s1",
      day: 1,
      type: "P",
      startTime: "08:00",
      endTime: "08:15",
      room: "101",
    },
    {
      id: "s2",
      day: 1,
      type: "P",
      startTime: "08:00",
      endTime: "08:15",
      room: "102",
    },
    {
      id: "s3",
      day: 2,
      type: "V",
      startTime: "09:00",
      endTime: "10:00",
      room: "201",
    },
    {
      id: "s4",
      day: 3,
      type: "P",
      startTime: "10:00",
      endTime: "11:00",
      room: "301",
    },
    {
      id: "s5",
      day: 4,
      type: "V",
      startTime: "11:00",
      endTime: "12:00",
      room: "401",
    },
    {
      id: "s6",
      day: 5,
      type: "P",
      startTime: "12:00",
      endTime: "13:00",
      room: "501",
    },
  ].map((slot) => ({
    ...slot,
    subject: { name: "Matematika" },
    groups: [{ group: { name: "Grupa 2" } }, { group: { name: "Grupa 3" } }],
  }));
  const days = ["Ponedeljak", "Utorak", "Sreda", "\u010Cetvrtak", "Petak"];
  for (const userId of [null, "verified-user"]) {
    const { caller, calls } = scheduleCaller(
      {
        "studyGroup.findUnique": () => ({ id: "g2", name: "Grupa 2" }),
        "timeslot.findMany": () => slots,
      },
      userId,
    );
    const result = await caller.getSchedule({
      year: 2,
      group: " \tgrupa 2\n ",
    });
    const schedule = {};
    for (const slot of slots) {
      (schedule[days[slot.day - 1]] ??= []).push({
        id: slot.id,
        predmet: "Matematika",
        tip: slot.type,
        od: slot.startTime,
        do: slot.endTime,
        sala: slot.room,
        grupe: ["Grupa 2", "Grupa 3"],
      });
    }
    assert.deepEqual(result, { group: "Grupa 2", year: 2, schedule });
    assert.deepEqual(calls, [
      { path: "studyGroup.findUnique", args: groupLookup(2, "grupa 2") },
      { path: "timeslot.findMany", args: slotQuery(2, "g2") },
    ]);
  }
});

test("invalid year and group inputs fail before any database access", async () => {
  const { caller, calls } = scheduleCaller();
  for (const year of [undefined, null, "1", 0, 5, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(caller.groups({ year }), code("BAD_REQUEST"));
    await assert.rejects(
      caller.getSchedule({ year, group: "Grupa 1" }),
      code("BAD_REQUEST"),
    );
  }
  for (const group of [undefined, null, 1, "", " \t\n ", "x".repeat(192)]) {
    await assert.rejects(
      caller.getSchedule({ year: 1, group }),
      code("BAD_REQUEST"),
    );
  }
  await assert.rejects(caller.groups(), code("BAD_REQUEST"));
  await assert.rejects(caller.getSchedule(), code("BAD_REQUEST"));
  assert.deepEqual(calls, []);
});

test("year and trimmed group length boundaries are accepted, including valid empty groups", async () => {
  for (const year of [1, 4]) {
    for (const name of ["x", "x".repeat(191)]) {
      const { caller, calls } = scheduleCaller({
        "studyGroup.findMany": () => [],
        "studyGroup.findUnique": () => ({ id: "empty", name }),
        "timeslot.findMany": () => [],
      });
      assert.deepEqual(await caller.groups({ year }), []);
      assert.deepEqual(await caller.getSchedule({ year, group: ` ${name} ` }), {
        group: name,
        year,
        schedule: {},
      });
      assert.deepEqual(calls.slice(1), [
        { path: "studyGroup.findUnique", args: groupLookup(year, name) },
        { path: "timeslot.findMany", args: slotQuery(year, "empty") },
      ]);
    }
  }
});

test("unknown names and groups in the wrong year return NOT_FOUND without fetching slots", async () => {
  const { caller, calls } = scheduleCaller({
    "studyGroup.findUnique": ({ where }) => {
      const { year, name } = where.year_name;
      return year === 2 && name === "Grupa 2" ? { id: "g2", name } : null;
    },
  });
  for (const input of [
    { year: 2, group: "Unknown" },
    { year: 1, group: "Grupa 2" },
  ]) {
    await assert.rejects(caller.getSchedule(input), code("NOT_FOUND"));
  }
  assert.deepEqual(calls, [
    { path: "studyGroup.findUnique", args: groupLookup(2, "Unknown") },
    { path: "studyGroup.findUnique", args: groupLookup(1, "Grupa 2") },
  ]);
});

test("invalid stored weekdays fail rather than create arbitrary schedule keys", async () => {
  for (const day of [0, 6, -1, 1.5, null]) {
    const { caller } = scheduleCaller({
      "studyGroup.findUnique": () => ({ id: "g1", name: "Grupa 1" }),
      "timeslot.findMany": () => [{ day }],
    });
    await assert.rejects(
      caller.getSchedule({ year: 1, group: "Grupa 1" }),
      (error) =>
        error.code === "INTERNAL_SERVER_ERROR" &&
        error.message === "Invalid stored weekday",
    );
  }
});

test("database errors propagate from each schedule query without becoming empty results", async () => {
  for (const path of [
    "studyGroup.findMany",
    "studyGroup.findUnique",
    "timeslot.findMany",
  ]) {
    const failure = new Error(`Database failure: ${path}`);
    const { caller, calls } = scheduleCaller({
      "studyGroup.findUnique": () => ({ id: "g1", name: "Grupa 1" }),
      [path]: () => {
        throw failure;
      },
    });
    const query =
      path === "studyGroup.findMany"
        ? caller.groups({ year: 1 })
        : caller.getSchedule({ year: 1, group: "Grupa 1" });
    await assert.rejects(
      query,
      (error) =>
        error.code === "INTERNAL_SERVER_ERROR" && error.cause === failure,
    );
    assert.equal(calls.at(-1).path, path);
  }
});

test("context uses Clerk identity, not caller-provided headers or fields", async () => {
  try {
    const ctx = await createTRPCContext({
      headers: new Headers({ "x-user-id": "victim" }),
      userId: "victim",
    });
    assert.equal(ctx.userId, "verified-user");
    assert.equal(ctx.db, contextDb);
    verifiedUserId = null;
    assert.equal(
      (await createTRPCContext({ headers: new Headers() })).userId,
      null,
    );
  } finally {
    verifiedUserId = "verified-user";
  }
});

test("protected queries and mutations reject anonymous calls before handlers", async () => {
  const caller = testRouter.createCaller({
    db: contextDb,
    userId: null,
    headers: new Headers(),
  });
  const callsBefore = handlerCalls;
  await assert.rejects(caller.identity(), code("UNAUTHORIZED"));
  await assert.rejects(
    caller.update({ userId: "victim" }),
    code("UNAUTHORIZED"),
  );
  assert.equal(handlerCalls, callsBefore);
});

test("protected handlers receive Clerk identity despite spoofed headers and input", async () => {
  const ctx = await createTRPCContext({
    headers: new Headers({ "x-user-id": "victim" }),
    userId: "victim",
  });
  const caller = testRouter.createCaller(ctx);
  const callsBefore = handlerCalls;
  assert.equal(await caller.identity(), "verified-user");
  assert.equal(await caller.update({ userId: "victim" }), "verified-user");
  assert.equal(handlerCalls, callsBefore + 2);
});

test("app router exposes schedule queries and retired procedure paths are unavailable", async () => {
  assert.deepEqual(Object.keys(appRouter._def.procedures).sort(), [
    "account.acknowledgeSchedule",
    "account.get",
    "account.saveSubjects",
    "account.saveTimeslots",
    "account.updatePreferences",
    "catalog.get",
    "schedule.getSchedule",
    "schedule.groups",
  ]);
  for (const userId of [null, "verified-user"]) {
    for (const [path, method] of [
      ["termin.hello", "GET"],
      ["termin.getAll", "GET"],
      ["settings.getUserClasses", "GET"],
      ["settings.addClassesFromSmer", "POST"],
      ["settings.addClass", "POST"],
    ]) {
      const response = await fetchRequestHandler({
        endpoint: "/api/trpc",
        req: new Request(`http://localhost/api/trpc/${path}`, {
          method,
          headers: { "content-type": "application/json" },
          ...(method === "POST"
            ? { body: JSON.stringify({ json: null }) }
            : {}),
        }),
        router: appRouter,
        createContext: () => ({
          db: contextDb,
          userId,
          headers: new Headers(),
        }),
      });
      assert.equal(response.status, 404, path);
      const body = await response.json();
      assert.equal(body.error.json.data.code, "NOT_FOUND", path);
    }
  }
});

test("middleware covers pages and API paths without a redirect/protect handler", () => {
  const { config } = load("src/middleware.ts");
  assert.deepEqual(middlewareArgs, []);
  const matches = (path) =>
    config.matcher.some((pattern) =>
      new RegExp("^" + pattern + "$").test(path),
    );
  for (const path of [
    "/",
    "/podesavanja",
    "/api/trpc/settings.getUserClasses",
    "/api/file.json",
    "/trpc/termin.getAll",
  ]) {
    assert.equal(matches(path), true, path);
  }
  for (const path of ["/_next/static/chunk.js", "/favicon.ico", "/image.png"]) {
    assert.equal(matches(path), false, path);
  }
});
