const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");
const React = require("react");

function accountState(mode = "search", group = null, revision = 7) {
  return {
    revision,
    preferences: {
      mode,
      group,
      catalogYear: 1,
      programFilters: [],
    },
    subjectIds: ["subject"],
    timeslotIds: ["slot"],
  };
}

function harness(options = {}) {
  const atoms = { open: options.open ?? true, error: false };
  const state = {
    isLoaded: options.isLoaded ?? true,
    isSignedIn: "signedIn" in options ? options.signedIn : false,
    mode: options.mode ?? "search",
    group: options.group ?? null,
    account: {
      data: options.signedIn
        ? accountState(options.mode, options.group)
        : undefined,
      isError: false,
      isFetching: false,
      refetch: () => {
        accountRetries++;
        return Promise.resolve();
      },
    },
  };
  const pushes = [],
    queries = [],
    calls = [],
    cacheWrites = [];
  const results = new Map();
  let retries = 0,
    accountRetries = 0,
    cursor = 0,
    dirty = false,
    effects = [];
  let mounted = true,
    currentCall;
  const slots = [];
  const mutation = {
    isPending: false,
    isError: false,
    variables: undefined,
    error: null,
    reset() {
      mutation.isError = false;
      mutation.error = null;
      mutation.variables = undefined;
    },
    mutate(input, callbacks) {
      calls.push(input);
      currentCall = callbacks;
      mutation.variables = input;
      mutation.isPending = true;
      mutation.isError = false;
    },
  };
  let mutationOptions;
  const mocks = {
    react: {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [
          slots[index],
          (value) => {
            if (slots[index] !== value) {
              slots[index] = value;
              dirty = true;
            }
          },
        ];
      },
      useEffect(callback, deps) {
        const index = cursor++;
        if (!slots[index] || deps.some((dep, i) => dep !== slots[index][i])) {
          slots[index] = deps;
          effects.push(callback);
        }
      },
    },
    jotai: {
      useAtom: (atom) => [
        atoms[atom],
        (value) => {
          atoms[atom] = value;
          dirty = true;
        },
      ],
    },
    "~/hooks/use-schedule-state": { useScheduleState: () => state },
    "~/components/pwa-controls": { PwaInstallButton: "PwaInstallButton" },
    "next/navigation": {
      useRouter: () => ({ push: (path) => pushes.push(path) }),
    },
    "next/link": { __esModule: true, default: "Link" },
    "lucide-react": {
      BookOpen: "BookOpen",
      CalendarClock: "CalendarClock",
      Settings2: "Settings2",
    },
    "~/lib/utils": { cn: (...args) => args.join(" ") },
    "~/trpc/react": {
      api: {
        useUtils: () => ({
          account: {
            get: {
              setData(key, data) {
                cacheWrites.push({ key, data });
                state.account.data = data;
                state.mode = data.preferences.mode;
                state.group = data.preferences.group;
              },
            },
          },
        }),
        account: {
          updatePreferences: {
            useMutation(options) {
              mutationOptions = options;
              return mutation;
            },
          },
        },
        schedule: {
          groups: {
            useQuery(input, options) {
              queries.push({ input, options });
              return {
                data: undefined,
                isError: false,
                isFetching: false,
                isPlaceholderData: false,
                ...results.get(input.year),
                refetch: () => {
                  retries++;
                  return Promise.resolve();
                },
              };
            },
          },
        },
      },
    },
    "~/state/isOpenAtom": { isOpenAtom: "open" },
    "~/state/errorAtom": { errorAtom: "error" },
  };
  for (const [path, names] of [
    ["button", ["Button"]],
    [
      "dialog",
      [
        "Dialog",
        "DialogContent",
        "DialogHeader",
        "DialogTitle",
        "DialogDescription",
        "DialogTrigger",
        "DialogFooter",
      ],
    ],
    ["label", ["Label"]],
    [
      "select",
      ["Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"],
    ],
    ["tabs", ["Tabs", "TabsContent", "TabsList", "TabsTrigger"]],
  ])
    mocks[path === "tabs" ? "./ui/tabs" : `~/components/ui/${path}`] =
      Object.fromEntries(names.map((name) => [name, name]));

  const filename = resolve(__dirname, "../src/components/settings-button.tsx");
  const mod = new Module(filename);
  mod.require = (id) => {
    assert.ok(
      id in mocks || id === "react/jsx-runtime",
      `Unexpected dependency: ${id}`,
    );
    return id in mocks ? mocks[id] : require(id);
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
  let tree;
  function withoutStorage(callback) {
    const previousWindow = global.window;
    global.window = {
      get localStorage() {
        throw new Error("Settings must not access localStorage");
      },
    };
    try {
      return callback();
    } finally {
      global.window = previousWindow;
    }
  }
  function render() {
    return withoutStorage(() => {
      for (let pass = 0; pass < 20; pass++) {
        cursor = 0;
        dirty = false;
        effects = [];
        tree = mod.exports.default();
        effects.forEach((effect) => effect());
        if (!dirty) return tree;
      }
      throw new Error("Render did not settle");
    });
  }
  function nodes(node = tree) {
    if (!React.isValidElement(node)) return [];
    return [
      node,
      ...React.Children.toArray(node.props.children).flatMap(nodes),
    ];
  }
  function select(id) {
    return nodes().find(
      (node) =>
        node.type === "Select" &&
        nodes(node).some((child) => child.props.id === id),
    );
  }
  function text(node = tree) {
    if (React.isValidElement(node))
      return React.Children.toArray(node.props.children).map(text).join(" ");
    return node == null ? "" : String(node);
  }
  function button(label) {
    return nodes().find(
      (node) => node.type === "Button" && text(node) === label,
    );
  }
  function save() {
    return button("Prikaži raspored");
  }
  render();
  return {
    atoms,
    state,
    pushes,
    queries,
    calls,
    cacheWrites,
    results,
    mutation,
    render,
    nodes,
    select,
    text,
    button,
    save,
    clickSave: () => withoutStorage(() => save().props.onClick()),
    toggle: (mode) =>
      nodes()
        .find((node) => node.type === "Tabs")
        .props.onValueChange(mode),
    succeed(data) {
      mutation.isPending = false;
      mutation.isError = false;
      mutationOptions.onSuccess(data);
      if (mounted) currentCall.onSuccess(data);
      if (mounted) render();
    },
    fail(code = "INTERNAL_SERVER_ERROR") {
      mutation.isPending = false;
      mutation.isError = true;
      mutation.error = { data: { code } };
      render();
    },
    unmount() {
      mounted = false;
    },
    get retries() {
      return retries;
    },
    get accountRetries() {
      return accountRetries;
    },
    options: () =>
      nodes(select("group-select"))
        .filter((node) => node.type === "SelectItem")
        .map((node) => node.props.value),
  };
}

test("guest saves URL selection without account writes or storage", () => {
  const h = harness({ group: { year: 3, name: "DB / grupa" } });
  h.results.set(3, { data: [{ id: "db", name: "DB / grupa" }] });
  h.render();
  assert.equal(h.save().props.disabled, false);
  h.clickSave();
  assert.deepEqual(h.pushes, ["/?year=3&group=DB%20%2F%20grupa"]);
  assert.equal(h.atoms.open, false);
  assert.deepEqual(h.calls, []);
});

test("DB group policy applies to guests, signed-in search, and unknown auth", () => {
  for (const signedIn of [false, true, undefined]) {
    const h = harness({
      signedIn,
      isLoaded: signedIn !== undefined,
      group: { id: "db", year: 3, name: "C1" },
    });
    assert.deepEqual(h.queries.at(-1), {
      input: { year: signedIn === undefined ? 1 : 3 },
      options: { enabled: true, staleTime: 300000, retry: false },
    });
    if (signedIn === undefined) assert.equal(h.save().props.disabled, true);
  }
  for (const options of [
    { open: false },
    { signedIn: true, mode: "account" },
  ]) {
    const h = harness(options);
    assert.ok(h.queries.every(({ options }) => !options.enabled));
  }
});

for (const signedIn of [false, true]) {
  test(`loading, error, retry, empty, stale, placeholder groups (${signedIn ? "account" : "guest"})`, () => {
    const h = harness({
      signedIn,
      group: { id: "saved", year: 1, name: "A1" },
    });
    assert.equal(h.select("group-select").props.disabled, true);
    assert.equal(h.save().props.disabled, true);
    assert.ok(
      h
        .nodes()
        .some((node) => node.props.placeholder === "Učitavanje grupa..."),
    );
    h.clickSave();
    assert.deepEqual(h.pushes, []);
    h.results.set(1, { isError: true, data: [{ id: "saved", name: "A1" }] });
    h.render();
    assert.deepEqual(h.options(), []);
    assert.match(h.text(), /Grupe nije moguće učitati/);
    h.button("Pokušaj ponovo").props.onClick();
    assert.equal(h.retries, 1);
    h.results.set(1, { isError: true, isFetching: true });
    h.render();
    assert.equal(h.button("Pokušaj ponovo").props.disabled, true);
    h.results.set(1, { data: [] });
    h.render();
    assert.match(h.text(), /Nema dostupnih grupa/);
    assert.equal(h.save().props.disabled, true);
    h.results.set(1, { data: [{ id: "new", name: "New group" }] });
    h.render();
    assert.match(h.text(), /Sačuvana grupa nije dostupna/);
    assert.equal(h.select("group-select").props.value, "");
    assert.equal(h.save().props.disabled, true);
    h.select("group-select").props.onValueChange("New group");
    h.render();
    assert.equal(h.save().props.disabled, false);
    h.select("group-year-select").props.onValueChange("year2");
    h.results.set(2, {
      data: [{ id: "new", name: "New group" }],
      isPlaceholderData: true,
    });
    h.render();
    assert.equal(h.queries.at(-1).input.year, 2);
    assert.deepEqual(h.options(), []);
    assert.equal(h.save().props.disabled, true);
  });
}

test("account group save uses DB id, strict patch and canonical cache; pending/failure retry", () => {
  const h = harness({
    signedIn: true,
    group: { id: "old", year: 1, name: "Old" },
  });
  h.results.set(1, { data: [{ id: "db-new", name: "New" }] });
  h.render();
  h.select("group-select").props.onValueChange("New");
  h.render();
  h.clickSave();
  assert.deepEqual(h.calls, [
    { expectedRevision: 7, mode: "search", groupId: "db-new" },
  ]);
  h.render();
  assert.equal(h.save().props.disabled, true);
  assert.equal(h.select("group-select").props.disabled, true);
  assert.ok(
    h
      .nodes()
      .filter((node) => node.type === "TabsTrigger")
      .every((node) => node.props.disabled),
  );
  h.clickSave();
  assert.equal(h.calls.length, 1);
  h.fail();
  assert.match(h.text(), /Podešavanja nije moguće sačuvati/);
  assert.equal(h.atoms.open, true);
  assert.deepEqual(h.pushes, []);
  h.button("Pokušaj ponovo").props.onClick();
  assert.deepEqual(h.calls[1], h.calls[0]);
  const canonical = accountState(
    "search",
    { id: "db-new", year: 1, name: "New" },
    8,
  );
  h.succeed(canonical);
  assert.deepEqual(h.cacheWrites, [{ key: undefined, data: canonical }]);
  assert.deepEqual(h.pushes, ["/"]);
});

test("immediate mode write advances own revision and preserves unsaved group draft", () => {
  const h = harness({
    signedIn: true,
    mode: "account",
    group: { id: "old", year: 1, name: "Old" },
  });
  h.toggle("search");
  assert.deepEqual(h.calls, [{ expectedRevision: 7, mode: "search" }]);
  h.render();
  h.toggle("account");
  assert.equal(h.calls.length, 1);
  h.succeed(accountState("search", { id: "old", year: 1, name: "Old" }, 8));
  assert.deepEqual(h.pushes, []);
  assert.equal(h.queries.at(-1).options.enabled, true);
  h.results.set(1, { data: [{ id: "new", name: "New" }] });
  h.render();
  h.select("group-select").props.onValueChange("New");
  h.render();
  h.state.account.data = accountState(
    "account",
    { id: "other", year: 4, name: "Other" },
    12,
  );
  h.state.group = h.state.account.data.preferences.group;
  h.state.mode = "account";
  h.render();
  assert.equal(h.select("group-select").props.value, "New");
  assert.equal(h.select("group-year-select").props.value, "year1");
  h.clickSave();
  assert.deepEqual(h.calls[1], {
    expectedRevision: 8,
    mode: "search",
    groupId: "new",
  });
});

test("mode mutation failure is retryable without closing or navigation", () => {
  const h = harness({ signedIn: true, mode: "account" });
  h.toggle("search");
  h.fail();
  assert.equal(h.atoms.open, true);
  h.button("Pokušaj ponovo").props.onClick();
  h.succeed(accountState("search", null, 8));
  assert.equal(h.atoms.open, true);
  assert.deepEqual(h.pushes, []);
});

test("conflict reload waits for fresh query state before discarding draft and saving new revision", async () => {
  const h = harness({
    signedIn: true,
    group: { id: "old", year: 1, name: "Old" },
  });
  h.results.set(1, { data: [{ id: "draft", name: "Draft" }] });
  h.render();
  h.select("group-select").props.onValueChange("Draft");
  h.render();
  h.clickSave();
  h.fail("CONFLICT");
  assert.match(h.text(), /Podešavanja naloga su promenjena/);
  assert.equal(h.button("Pokušaj ponovo"), undefined);
  assert.equal(h.save().props.disabled, true);
  h.clickSave();
  h.toggle("account");
  assert.equal(h.calls.length, 1);

  let resolveReload;
  h.state.account.refetch = () => {
    h.state.account.isFetching = true;
    return new Promise((resolve) => {
      resolveReload = resolve;
    });
  };
  const reload = h.button("Učitaj najnovija podešavanja").props.onClick();
  h.render();
  assert.equal(h.button("Učitaj najnovija podešavanja").props.disabled, true);
  await h.button("Učitaj najnovija podešavanja").props.onClick();
  assert.equal(h.select("group-select").props.value, "Draft");
  const canonical = accountState(
    "search",
    { id: "server", year: 2, name: "Server" },
    12,
  );
  resolveReload({ isSuccess: true, data: canonical });
  await reload;
  // Refetch has resolved, but the hook still exposes its previous cached state.
  h.render();
  assert.equal(h.mutation.isError, true);
  assert.equal(h.select("group-year-select").props.value, "year1");
  assert.equal(h.select("group-select").props.value, "Draft");
  assert.equal(h.calls.length, 1);

  h.state.account = { ...h.state.account, data: canonical, isFetching: false };
  h.state.group = canonical.preferences.group;
  h.state.mode = canonical.preferences.mode;
  h.results.set(2, {
    data: [
      { id: "server", name: "Server" },
      { id: "new", name: "New" },
    ],
  });
  h.render();
  assert.equal(h.mutation.isError, false);
  assert.equal(h.select("group-year-select").props.value, "year2");
  assert.equal(h.select("group-select").props.value, "Server");
  h.select("group-select").props.onValueChange("New");
  h.render();
  h.clickSave();
  assert.deepEqual(h.calls, [
    { expectedRevision: 7, mode: "search", groupId: "draft" },
    { expectedRevision: 12, mode: "search", groupId: "new" },
  ]);
  assert.deepEqual(h.pushes, []);
});

test("failed conflict reload preserves error and draft and permits another reload", async () => {
  const h = harness({
    signedIn: true,
    group: { id: "db", year: 1, name: "DB" },
  });
  h.results.set(1, { data: [{ id: "db", name: "DB" }] });
  h.render();
  h.clickSave();
  h.fail("CONFLICT");
  for (const rejects of [false, true]) {
    h.state.account.refetch = async () => {
      h.state.account.isError = true;
      if (rejects) throw new Error("Reload failed");
      return { isSuccess: false, isError: true, data: h.state.account.data };
    };
    await h.button("Učitaj najnovija podešavanja").props.onClick();
    h.render();
    assert.equal(h.mutation.isError, true);
    assert.equal(h.select("group-select").props.value, "DB");
    assert.equal(
      h.button("Učitaj najnovija podešavanja").props.disabled,
      false,
    );
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.pushes, []);
  }
});

test("account-only save closes without a redundant write and preserves navigation links", () => {
  const h = harness({ signedIn: true, mode: "account" });
  assert.deepEqual(
    h
      .nodes()
      .filter((node) => node.type === "Link")
      .map((node) => node.props.href),
    ["/predmeti", "/termini"],
  );
  h.clickSave();
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.pushes, ["/"]);
});

test("auth loading never hydrates stale account data; account errors retry instead of guest fallback", () => {
  const h = harness({
    signedIn: true,
    isLoaded: false,
    group: { id: "stale", year: 4, name: "Stale" },
  });
  h.results.set(1, { data: [{ id: "guest", name: "Guest" }] });
  h.render();
  assert.equal(h.select("group-year-select").props.value, "year1");
  assert.equal(h.save().props.disabled, true);
  h.clickSave();
  assert.deepEqual(h.calls, []);
  h.state.isLoaded = true;
  h.state.account.isError = true;
  h.render();
  assert.match(h.text(), /Podešavanja naloga nije moguće učitati/);
  assert.equal(h.save().props.disabled, true);
  h.button("Pokušaj ponovo").props.onClick();
  assert.equal(h.accountRetries, 1);
  h.state.account.isError = false;
  h.state.account.data = undefined;
  h.render();
  assert.match(h.text(), /Učitavanje podešavanja/);
  assert.equal(h.save().props.disabled, true);
  h.state.account.data = accountState(
    "search",
    { id: "db", year: 2, name: "DB" },
    9,
  );
  h.state.group = h.state.account.data.preferences.group;
  h.render();
  assert.equal(h.select("group-year-select").props.value, "year2");
});

test("reopening hydrates fresh URL selection but background updates do not replace drafts", () => {
  const h = harness({ group: { year: 2, name: "Original" } });
  h.select("group-year-select").props.onValueChange("year3");
  h.state.group = { year: 4, name: "Updated" };
  h.render();
  assert.equal(h.select("group-year-select").props.value, "year3");
  h.atoms.open = false;
  h.render();
  h.atoms.open = true;
  h.render();
  assert.equal(h.select("group-year-select").props.value, "year4");
});

test("unmounted mutation caches canonical state but cannot close or navigate", () => {
  const h = harness({
    signedIn: true,
    group: { id: "db", year: 1, name: "DB" },
  });
  h.results.set(1, { data: [{ id: "db", name: "DB" }] });
  h.render();
  h.clickSave();
  h.unmount();
  h.succeed(accountState("search", { id: "db", year: 1, name: "DB" }, 8));
  assert.equal(h.cacheWrites.length, 1);
  assert.equal(h.atoms.open, true);
  assert.deepEqual(h.pushes, []);
});

test("settings owns only ephemeral atoms, no JSON, storage or anonymous preference copy", () => {
  const source = readFileSync(
    resolve(__dirname, "../src/components/settings-button.tsx"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /localStorage|settingsAtom|scheduleModeAtom|localSettings|\.json|lastName|useUser/,
  );
  assert.match(source, /useScheduleState/);
  assert.match(source, /utils\.account\.get\.setData\(undefined, data\)/);
  assert.doesNotMatch(source, /\bany\b/);
});
