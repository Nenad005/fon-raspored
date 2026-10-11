const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");
const React = require("react");

function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    const filename = resolve(file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename);
    cache.set(filename, mod);
    mod.require = (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith("~/")) {
        const base = "src/" + id.slice(2);
        return load(base + (existsSync(base + ".ts") ? ".ts" : ".tsx"));
      }
      return require(id);
    };
    mod._compile(
      ts.transpileModule(readFileSync(filename, "utf8"), {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText,
      filename,
    );
    return mod.exports;
  }
  return load;
}

const load = loader();
const {
  sharedSnapshotSchema,
  shareLifetimeMs,
  shareExpired,
  shareTokenSchema,
} = load("src/lib/shared-schedule.ts");
const event = {
  id: "slot1",
  predmet: "Matematika",
  tip: "P",
  od: "10:15",
  do: "12:00",
  sala: "101",
  grupe: ["A1"],
};
const snapshot = () => ({
  version: 1,
  title: "FON raspored",
  schedule: { Ponedeljak: [{ ...event }] },
});
const storedSlot = () => ({
  id: "slot1",
  subjectId: "subject1",
  subject: { name: "Matematika" },
  type: "P",
  day: 1,
  startTime: "10:15",
  endTime: "12:00",
  room: "101",
  groups: [{ group: { id: "group1", name: "A1" } }],
});

function caller({ slots = [storedSlot()], hits = 1 } = {}) {
  const copies = [];
  const calls = [];
  const db = {
    shareRateLimit: {
      upsert: async (args) => {
        calls.push(["limit", args]);
        return { hits };
      },
    },
    scheduleVersion: {
      findUnique: async () => ({ version: 4, publishedAt: new Date() }),
    },
    timeslot: { findMany: async () => slots },
    sharedSchedule: {
      create: async ({ data }) => {
        copies.push(structuredClone(data));
        return data;
      },
    },
    $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, "RepeatableRead");
      return fn(db);
    },
  };
  const load = loader({
    "@clerk/nextjs/server": { auth: () => ({ userId: null }) },
    "~/server/db": { db },
  });
  const { shareRouter } = load("src/server/api/routers/share.ts");
  return {
    api: shareRouter.createCaller({ db, userId: null, headers: new Headers() }),
    copies,
    calls,
  };
}

test("snapshot validates weekdays, times, size and duplicate IDs, strips private/extra fields", () => {
  const input = snapshot();
  input.owner = "private-user";
  input.schedule.Ponedeljak[0].email = "private@example.com";
  const parsed = sharedSnapshotSchema.parse(input);
  assert.equal(parsed.owner, undefined);
  assert.equal(parsed.schedule.Ponedeljak[0].email, undefined);
  for (const bad of [
    { ...snapshot(), schedule: {} },
    { ...snapshot(), schedule: { Sunday: [event] } },
    { ...snapshot(), schedule: { Ponedeljak: [{ ...event, od: "25:00" }] } },
    { ...snapshot(), schedule: { Ponedeljak: [{ ...event, do: "08:00" }] } },
    { ...snapshot(), schedule: { Ponedeljak: [event, event] } },
  ])
    assert.equal(sharedSnapshotSchema.safeParse(bad).success, false);
});

test("anonymous sharing saves independent display data, unpredictable tokens, current release and exactly seven days", async () => {
  const h = caller();
  const input = snapshot();
  const first = await h.api.create(input);
  const second = await h.api.create(snapshot());
  assert.ok(shareTokenSchema.safeParse(first.token).success);
  assert.notEqual(first.token, second.token);
  const saved = h.copies[0];
  assert.equal(saved.expiresAt - saved.createdAt, shareLifetimeMs);
  assert.equal(saved.scheduleVersion, 4);
  assert.equal(saved.userId, undefined);
  input.schedule.Ponedeljak[0].sala = "changed";
  assert.equal(saved.snapshot.schedule.Ponedeljak[0].sala, "101");
  assert.equal(
    shareExpired(saved.expiresAt, new Date(saved.expiresAt - 1)),
    false,
  );
  assert.equal(shareExpired(saved.expiresAt, saved.expiresAt), true);
});

test("stale or removed catalog entries cannot be shared as a current release", async () => {
  for (const slots of [
    [],
    [{ ...storedSlot(), room: "202" }],
    [{ ...storedSlot(), day: 2 }],
    [{ ...storedSlot(), groups: [] }],
  ]) {
    const h = caller({ slots });
    await assert.rejects(
      h.api.create(snapshot()),
      (error) => error.code === "CONFLICT",
    );
    assert.equal(h.copies.length, 0);
  }
});

test("database-backed rate limit rejects excess creation and validates input before writes", async () => {
  const limited = caller({ hits: 21 });
  await assert.rejects(
    limited.api.create(snapshot()),
    (error) => error.code === "TOO_MANY_REQUESTS",
  );
  assert.equal(limited.copies.length, 0);
  const invalid = caller();
  await assert.rejects(
    invalid.api.create({ ...snapshot(), schedule: {} }),
    (error) => error.code === "BAD_REQUEST",
  );
  assert.equal(invalid.calls.length, 0);
});

function text(node) {
  return React.isValidElement(node)
    ? React.Children.toArray(node.props.children).map(text).join(" ")
    : node == null
      ? ""
      : String(node);
}

function componentHarness(file, mocks = {}) {
  const values = [];
  let cursor = 0;
  const load = loader({
    react: {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in values))
          values[index] = typeof initial === "function" ? initial() : initial;
        return [
          values[index],
          (value) => {
            values[index] = value;
          },
        ];
      },
      useEffect: () => {},
    },
    "~/components/ui/button": { Button: "Button" },
    "~/components/ui/input": { Input: "Input" },
    "~/components/ui/dialog": Object.fromEntries(
      [
        "Dialog",
        "DialogContent",
        "DialogDescription",
        "DialogHeader",
        "DialogTitle",
        "DialogTrigger",
      ].map((name) => [name, name]),
    ),
    "next/link": { __esModule: true, default: "Link" },
    "~/components/raspored": { __esModule: true, default: "Raspored" },
    "~/components/calendar-export": {
      __esModule: true,
      default: "CalendarExport",
    },
    ...mocks,
  });
  const Component = load(file).default;
  return (props) => {
    cursor = 0;
    return Component(props);
  };
}

function nodes(node) {
  return React.isValidElement(node)
    ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)]
    : [];
}

test("share dialog creates only on explicit action, retains link on reopening, and supports copy and retry", async () => {
  const calls = [];
  let fail = false;
  const render = componentHarness("src/components/schedule-share.tsx", {
    "~/trpc/react": {
      api: {
        share: {
          create: {
            useMutation: () => ({
              isPending: false,
              mutateAsync: async (input) => {
                calls.push(input);
                if (fail) throw new Error("Pokušaj ponovo");
                return {
                  token: "a".repeat(32),
                  expiresAt: new Date(Date.now() + shareLifetimeMs),
                };
              },
            }),
          },
        },
      },
    },
  });
  const oldWindow = global.window;
  const oldNavigator = Object.getOwnPropertyDescriptor(global, "navigator");
  const copied = [];
  global.window = { location: { origin: "https://app.test" } };
  Object.defineProperty(global, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async (value) => copied.push(value) } },
  });
  try {
    const props = { schedule: snapshot().schedule, title: "FON raspored" };
    let tree = render(props);
    assert.equal(calls.length, 0);
    fail = true;
    nodes(tree)
      .find((node) => node.type === "Button" && text(node) === "Napravi link")
      .props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    tree = render(props);
    assert.match(text(tree), /Pokušaj ponovo/);
    fail = false;
    nodes(tree)
      .find((node) => node.type === "Button" && text(node) === "Napravi link")
      .props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    tree = render(props);
    const count = calls.length;
    tree.props.onOpenChange(false);
    tree.props.onOpenChange(true);
    tree = render(props);
    assert.equal(calls.length, count);
    assert.equal(
      nodes(tree).find((node) => node.type === "Input").props.value,
      "https://app.test/s/" + "a".repeat(32),
    );
    nodes(tree)
      .find(
        (node) => node.type === "Button" && text(node).includes("Kopiraj link"),
      )
      .props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    tree = render(props);
    assert.equal(copied.length, 1);
    assert.match(text(tree), /Link je kopiran/);
    assert.deepEqual(calls.at(-1).schedule, props.schedule);
  } finally {
    if (oldWindow === undefined) delete global.window;
    else global.window = oldWindow;
    if (oldNavigator) Object.defineProperty(global, "navigator", oldNavigator);
    else delete global.navigator;
  }
});

test("recipient view uses read-only schedule and calendar export, and hides expired data", () => {
  const props = {
    schedule: snapshot().schedule,
    title: "FON raspored",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + shareLifetimeMs).toISOString(),
    updated: true,
  };
  const render = componentHarness("src/components/shared-schedule-view.tsx");
  const tree = render(props);
  assert.match(text(tree), /Zvanični raspored je ažuriran/);
  const display = nodes(tree).find((node) => node.type === "Raspored");
  assert.equal(display.props.shared, true);
  assert.ok(nodes(tree).some((node) => node.type === "CalendarExport"));
  const expired = componentHarness("src/components/shared-schedule-view.tsx")({
    ...props,
    expiresAt: new Date(Date.now() - 1).toISOString(),
  });
  assert.match(text(expired), /istekao/);
  assert.ok(
    !nodes(expired).some((node) =>
      ["Raspored", "CalendarExport"].includes(node.type),
    ),
  );
});

test("public page enforces expiry before release lookup, warns on updates and never reads accounts", async () => {
  let reads = 0;
  let copy = {
    snapshot: snapshot(),
    scheduleVersion: 4,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + shareLifetimeMs),
  };
  const db = {
    sharedSchedule: {
      findUnique: async () => {
        reads++;
        return copy;
      },
    },
    scheduleVersion: {
      findUnique: async () => ({ version: 5, publishedAt: new Date() }),
    },
  };
  const load = loader({
    "~/server/db": { db },
    "~/components/shared-schedule-view": {
      __esModule: true,
      default: "SharedView",
    },
    "~/components/ui/button": { Button: "Button" },
    "next/link": { __esModule: true, default: "Link" },
  });
  const Page = load("src/app/s/[token]/page.tsx").default;
  const token = "a".repeat(32);
  const view = await Page({ params: { token } });
  assert.equal(view.props.updated, true);
  assert.deepEqual(view.props.schedule, snapshot().schedule);
  copy.expiresAt = new Date(Date.now() - 1);
  const expired = await Page({ params: { token } });
  assert.match(text(expired.type(expired.props)), /istekao/);
  assert.equal(expired.props.schedule, undefined);
  copy = null;
  const missing = await Page({ params: { token } });
  assert.match(text(missing.type(missing.props)), /nije dostupan/);
  const before = reads;
  await Page({ params: { token: "invalid" } });
  assert.equal(reads, before);
});

test("cron rejects unauthenticated requests and deletes only expired copies and rate limits", async () => {
  const calls = [];
  const db = {
    sharedSchedule: {
      deleteMany: (args) => {
        calls.push(args);
        return Promise.resolve({ count: 3 });
      },
    },
    shareRateLimit: {
      deleteMany: (args) => {
        calls.push(args);
        return Promise.resolve({ count: 2 });
      },
    },
    $transaction: async (queries) => Promise.all(queries),
  };
  const load = loader({ "~/server/db": { db } });
  const { GET } = load("src/app/api/cron/shared-schedules/route.ts");
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret-with-enough-length";
  try {
    assert.equal((await GET(new Request("http://localhost"))).status, 401);
    assert.equal(calls.length, 0);
    const response = await GET(
      new Request("http://localhost", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    assert.deepEqual(await response.json(), {
      deleted: 3,
      rateLimitsDeleted: 2,
    });
    assert.ok(calls.every((args) => args.where.expiresAt.lte instanceof Date));
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
});
