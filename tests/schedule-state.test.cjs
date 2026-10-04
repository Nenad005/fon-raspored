const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");

function load(file, mocks) {
  const filename = resolve(__dirname, "..", file);
  const mod = new Module(filename);
  mod.require = (id) => (id in mocks ? mocks[id] : require(id));
  const result = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  mod._compile(result.outputText, filename);
  return mod.exports;
}

function scheduleState(auth, search, account = {}) {
  const calls = [];
  const hook = load("src/hooks/use-schedule-state.ts", {
    "@clerk/nextjs": { useUser: () => auth },
    "next/navigation": { useSearchParams: () => new URLSearchParams(search) },
    "~/trpc/react": {
      api: {
        account: {
          get: {
            useQuery: (input, options) => {
              calls.push({ input, options });
              return account;
            },
          },
        },
      },
    },
  }).useScheduleState;
  return { value: hook(), calls };
}

test("guest and unresolved auth use URL preferences without requesting private data", () => {
  for (const auth of [
    { isLoaded: true, isSignedIn: false },
    { isLoaded: false, isSignedIn: undefined },
  ]) {
    const { value, calls } = scheduleState(auth, "year=3&group=%20C1%20", {
      data: {
        preferences: { mode: "account", group: { year: 1, name: "A1" } },
      },
    });
    assert.equal(value.mode, "search");
    assert.deepEqual(value.group, { year: 3, name: "C1" });
    assert.equal(calls[0].options.enabled, false);
  }
});

test("account preferences are authoritative; guest URL is never imported", () => {
  const { value, calls } = scheduleState(
    { isLoaded: true, isSignedIn: true },
    "year=3&group=C1",
    {
      data: { preferences: { mode: "account", group: null } },
    },
  );
  assert.equal(value.mode, "account");
  assert.equal(value.group, null);
  assert.deepEqual(calls[0], {
    input: undefined,
    options: { enabled: true, retry: false },
  });
  const failed = scheduleState(
    { isLoaded: true, isSignedIn: true },
    "year=3&group=C1",
    { isError: true },
  );
  assert.equal(failed.value.mode, "account");
  assert.equal(failed.value.group, null);
});

test("invalid and incomplete guest URL preferences do not select a group", () => {
  for (const search of [
    "",
    "year=0&group=A1",
    "year=5&group=A1",
    "year=1.5&group=A1",
    "year=invalid&group=A1",
    "year=1&group=%20%20",
    "group=A1",
  ]) {
    assert.equal(
      scheduleState({ isLoaded: true, isSignedIn: false }, search).value.group,
      null,
    );
  }
});

test("tRPC provider scopes caches to each identity and clears disposed queries", () => {
  let user = { id: "A" };
  const clients = [];
  const cleanups = [];
  const { TRPCReactProvider } = load("src/trpc/react.tsx", {
    react: {
      useState: (initial) => [
        typeof initial === "function" ? initial() : initial,
      ],
      useEffect: (effect) => cleanups.push(effect()),
    },
    "@clerk/nextjs": { useUser: () => ({ user }) },
    "@tanstack/react-query": { QueryClientProvider: "QueryClientProvider" },
    "@trpc/client": {
      loggerLink: () => null,
      unstable_httpBatchStreamLink: () => null,
    },
    "@trpc/react-query": {
      createTRPCReact: () => ({
        createClient: () => ({}),
        Provider: "TRPCProvider",
      }),
    },
    "./query-client": {
      createQueryClient: () => {
        const client = {
          values: new Map(),
          cancelled: false,
          cancelQueries: () => {
            client.cancelled = true;
            return Promise.resolve();
          },
          clear: () => client.values.clear(),
        };
        clients.push(client);
        return client;
      },
    },
  });
  const a = TRPCReactProvider({ children: null });
  a.type(a.props);
  clients[0].values.set("account", "A private schedule");
  user = { id: "B" };
  const b = TRPCReactProvider({ children: null });
  b.type(b.props);
  assert.notEqual(a.key, b.key);
  assert.notStrictEqual(clients[0], clients[1]);
  assert.equal(clients[1].values.size, 0);
  cleanups[0]();
  assert.equal(clients[0].cancelled, true);
  assert.equal(clients[0].values.size, 0);
  user = null;
  assert.equal(TRPCReactProvider({ children: null }).key, "guest");
});
