const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");
const React = require("react");

function account(theme = "system", revision = 7) {
  return { revision, preferences: { theme }, subjectIds: [], timeslotIds: [] };
}

function harness(options = {}, appearance = { theme: "dark", calls: [] }) {
  let retries = 0;
  let mounted = true;
  let cursor = 0;
  let effects = [];
  const slots = [];
  const calls = [];
  const cacheWrites = [];
  const state = {
    isLoaded: options.isLoaded ?? true,
    isSignedIn: options.signedIn ?? false,
    account: {
      data: options.signedIn ? account(options.theme) : undefined,
      isError: false,
      isFetching: false,
      refetch() {
        retries++;
        return Promise.resolve({ isError: state.account.isError });
      },
    },
  };
  const mutation = {
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    mutate(input) {
      calls.push(input);
      mutation.variables = input;
      mutation.isPending = true;
      mutation.isError = false;
      mutation.error = null;
    },
    reset() {
      mutation.isError = false;
      mutation.error = null;
    },
  };
  let mutationOptions;
  const setTheme = (theme) => {
    appearance.theme = theme;
    appearance.calls.push(theme);
  };
  const mocks = {
    react: {
      ...React,
      useEffect(callback, deps) {
        const index = cursor++;
        if (!slots[index] || deps.some((dep, i) => dep !== slots[index][i])) {
          slots[index] = deps;
          effects.push(callback);
        }
      },
    },
    "next-themes": {
      ThemeProvider: "NextThemesProvider",
      useTheme: () => ({ theme: appearance.theme, setTheme }),
    },
    "~/hooks/use-schedule-state": { useScheduleState: () => state },
    "lucide-react": { Moon: "Moon", Sun: "Sun" },
    "~/components/ui/button": { Button: "Button" },
    "~/components/ui/dropdown-menu": Object.fromEntries(
      [
        "DropdownMenu",
        "DropdownMenuContent",
        "DropdownMenuItem",
        "DropdownMenuTrigger",
      ].map((name) => [name, name]),
    ),
    "~/trpc/react": {
      api: {
        useUtils: () => ({
          account: {
            get: {
              setData(key, data) {
                cacheWrites.push({ key, data });
                state.account.data = data;
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
      },
    },
  };
  function load(path) {
    const filename = resolve(__dirname, "../src/components", path);
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
    return mod.exports;
  }
  const { ThemeProvider } = load("theme-provider.tsx");
  const { ModeToggle } = load("ui/mode-toggle.tsx");
  let tree;
  function render() {
    cursor = 0;
    effects = [];
    const provider = ThemeProvider({ children: "content", attribute: "class" });
    assert.equal(provider.type, "NextThemesProvider");
    assert.equal(provider.props.attribute, "class");
    const sync = React.Children.toArray(provider.props.children)[0];
    sync.type(sync.props);
    tree = ModeToggle();
    effects.forEach((effect) => effect());
  }
  function nodes(node = tree) {
    if (!React.isValidElement(node)) return [];
    return [
      node,
      ...React.Children.toArray(node.props.children).flatMap(nodes),
    ];
  }
  function text(node = tree) {
    if (React.isValidElement(node))
      return React.Children.toArray(node.props.children).map(text).join(" ");
    return node == null ? "" : String(node);
  }
  function button(label) {
    return nodes().find(
      (node) => node.type === "Button" && text(node).trim() === label,
    );
  }
  render();
  return {
    state,
    appearance,
    calls,
    cacheWrites,
    mutation,
    render,
    nodes,
    text,
    button,
    choose(label) {
      nodes()
        .find(
          (node) => node.type === "DropdownMenuItem" && text(node) === label,
        )
        .props.onClick();
    },
    succeed(data) {
      mutation.isPending = false;
      mutation.isError = false;
      mutationOptions.onSuccess(data);
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
  };
}

test("DB theme overrides next-themes cache and follows canonical query changes", () => {
  const h = harness({ signedIn: true, theme: "light" });
  assert.equal(h.appearance.theme, "light");
  h.state.account.data = account("dark", 12);
  h.render();
  assert.equal(h.appearance.theme, "dark");
  h.state.account.isError = true;
  h.render();
  assert.equal(h.appearance.theme, "system");
  h.state.account.isError = false;
  h.state.account.data = undefined;
  h.render();
  assert.equal(h.appearance.theme, "system");
});

test("theme choices send only theme and current revision; success applies canonical theme", () => {
  for (const [label, theme] of [
    ["Light", "light"],
    ["Dark", "dark"],
    ["System", "system"],
  ]) {
    const h = harness({ signedIn: true });
    h.choose(label);
    assert.deepEqual(h.calls, [{ expectedRevision: 7, theme }]);
    assert.equal(h.appearance.theme, "system");
    assert.deepEqual(h.cacheWrites, []);
    h.render();
    assert.equal(h.button("Promeni temu").props.disabled, true);
    assert.ok(
      h
        .nodes()
        .filter((node) => node.type === "DropdownMenuItem")
        .every((node) => node.props.disabled),
    );
    h.choose("Dark");
    assert.equal(h.calls.length, 1);
    const canonical = account("light", 8);
    h.succeed(canonical);
    assert.deepEqual(h.cacheWrites, [{ key: undefined, data: canonical }]);
    assert.equal(h.appearance.theme, "light");
    h.choose("Dark");
    assert.deepEqual(h.calls[1], { expectedRevision: 8, theme: "dark" });
  }
});

test("failed saves preserve appearance and cache, with accessible retry", () => {
  const h = harness({ signedIn: true, theme: "light" });
  h.choose("Dark");
  h.fail();
  assert.equal(h.appearance.theme, "light");
  assert.deepEqual(h.cacheWrites, []);
  assert.match(h.text(), /Tema nije sačuvana/);
  assert.ok(h.nodes().some((node) => node.props.role === "alert"));
  h.state.account.data = account("light", 10);
  h.render();
  h.button("Pokušaj ponovo").props.onClick();
  assert.deepEqual(h.calls[1], { expectedRevision: 10, theme: "dark" });
});

test("conflict reloads canonical state instead of replaying stale revision", async () => {
  const h = harness({ signedIn: true, theme: "light" });
  h.choose("Dark");
  h.fail("CONFLICT");
  h.button("Ponovo učitaj temu").props.onClick();
  await Promise.resolve();
  assert.equal(h.retries, 1);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.cacheWrites, []);
  h.state.account.data = account("system", 20);
  h.render();
  h.choose("Dark");
  assert.deepEqual(h.calls[1], { expectedRevision: 20, theme: "dark" });
});

test("guest choices are visual only and survive rerenders; pending auth cannot write", () => {
  const h = harness();
  assert.equal(h.appearance.theme, "system");
  for (const [label, theme] of [
    ["Light", "light"],
    ["Dark", "dark"],
    ["System", "system"],
  ]) {
    h.choose(label);
    h.render();
    assert.equal(h.appearance.theme, theme);
  }
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.cacheWrites, []);
  h.state.isLoaded = false;
  h.state.isSignedIn = undefined;
  h.render();
  assert.equal(h.button("Promeni temu").props.disabled, true);
  h.choose("Dark");
  assert.equal(h.appearance.theme, "system");
  assert.deepEqual(h.calls, []);
  assert.ok(h.nodes().some((node) => node.props.role === "status"));
  assert.match(h.text(), /Učitavanje teme/);
});

test("account loading and errors disable choices, with a reachable refetch", () => {
  const h = harness({ signedIn: true, isLoaded: false, theme: "dark" });
  assert.equal(h.appearance.theme, "system");
  h.choose("Light");
  h.state.isLoaded = true;
  h.state.account.isError = true;
  h.render();
  assert.equal(h.button("Promeni temu").props.disabled, true);
  assert.match(h.text(), /Tema nije dostupna/);
  h.choose("Light");
  h.button("Ponovo učitaj temu").props.onClick();
  assert.equal(h.retries, 1);
  h.state.account.isFetching = true;
  h.render();
  assert.equal(h.button("Ponovo učitaj temu").props.disabled, true);
  h.state.account.isError = false;
  h.state.account.data = undefined;
  h.render();
  assert.equal(h.button("Promeni temu").props.disabled, true);
  h.choose("Light");
  assert.deepEqual(h.calls, []);
});

test("identity remount clears A appearance and late A success cannot affect B", () => {
  const a = harness({ signedIn: true, theme: "dark" });
  a.choose("Light");
  a.unmount();
  const b = harness({ signedIn: true }, a.appearance);
  b.state.account.data = undefined;
  b.render();
  assert.equal(b.appearance.theme, "system");
  a.succeed(account("light", 8));
  assert.equal(b.appearance.theme, "system");
  assert.deepEqual(b.cacheWrites, []);
  assert.equal(b.state.account.data, undefined);
  b.state.account.data = account("dark", 3);
  b.render();
  assert.equal(b.appearance.theme, "dark");
  const guest = harness({}, b.appearance);
  assert.equal(guest.appearance.theme, "system");
});

test("theme components have no business storage or JSON dependencies", () => {
  for (const path of ["theme-provider.tsx", "ui/mode-toggle.tsx"]) {
    const source = readFileSync(
      resolve(__dirname, "../src/components", path),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /localStorage|\.json|settingsAtom|schedule-storage|\bany\b/,
    );
    assert.match(source, /useScheduleState/);
  }
});
