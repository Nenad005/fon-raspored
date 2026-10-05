const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");
const React = require("react");

function harness(data, signedIn = true) {
  const calls = [];
  const effects = [];
  const values = [];
  const dependencies = [];
  let cursor = 0;
  let mutationOptions;
  let tree;
  const state = { isLoaded: true, isSignedIn: signedIn, data };
  const mutation = {
    isPending: false, isError: false,
    mutate(input) { calls.push(["acknowledge", input]); mutation.isPending = true; },
  };
  const router = { replace: (path) => calls.push(["redirect", path]) };
  const utils = {
    catalog: { get: { invalidate: () => { calls.push(["catalog"]); return Promise.resolve(); } } },
    schedule: { invalidate: () => { calls.push(["schedule"]); return Promise.resolve(); } },
    account: { get: { setData: (_, data) => { state.data = data; } } },
  };
  const mocks = {
    react: {
      ...React,
      useState(initial) {
        const i = cursor++;
        if (!(i in values)) values[i] = initial;
        return [values[i], (value) => { values[i] = value; }];
      },
      useEffect(effect, deps) {
        const i = cursor++;
        if (!dependencies[i] || deps.some((dep, index) => dep !== dependencies[i][index])) {
          dependencies[i] = deps;
          effects.push(effect);
        }
      },
    },
    "@clerk/nextjs": { useUser: () => state },
    "next/navigation": { useRouter: () => router },
    "~/components/ui/button": { Button: "Button" },
    "~/components/ui/dialog": Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"].map((name) => [name, name])),
    "~/trpc/react": { api: {
      useUtils: () => utils,
      account: {
        get: { useQuery: (_, options) => {
          assert.equal(options.enabled, Boolean(state.isLoaded && state.isSignedIn));
          return { data: state.data, refetch: () => { calls.push(["refetch"]); } };
        } },
        acknowledgeSchedule: { useMutation: (options) => { mutationOptions = options; return mutation; } },
      },
    } },
  };
  const filename = resolve("src/components/schedule-update-notice.tsx");
  const mod = new Module(filename);
  mod.require = (id) => id in mocks ? mocks[id] : require(id);
  mod._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  const Component = mod.exports.default;
  function render() {
    cursor = 0;
    tree = Component();
    effects.splice(0).forEach((effect) => effect());
  }
  function nodes(node = tree) {
    return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
  }
  function text(node = tree) {
    return React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join(" ") : node == null ? "" : String(node);
  }
  render();
  return { state, calls, mutation, render, text, nodes,
    get tree() { return tree; },
    button() { return nodes().find((node) => node.type === "Button"); },
    succeed(data) { mutation.isPending = false; mutationOptions.onSuccess(data); render(); },
    fail() { mutation.isPending = false; mutation.isError = true; mutationOptions.onError(); render(); },
  };
}

const release = (version = 1, removedTimeslots = []) => ({
  scheduleVersion: version,
  scheduleUpdate: { pending: true, publishedAt: new Date(), removedTimeslots },
});

test("an update opens a modal and redirects once, refreshes catalog, then acknowledges this exact version", () => {
  const data = release(2, [{ id: "old", subjectName: "Matematika", type: "V", dan: "Utorak", od: "08:00", do: "09:00", sala: "101" }]);
  const h = harness(data);
  assert.equal(h.tree.type, "Dialog");
  assert.equal(h.tree.props.open, true);
  assert.match(h.text(), /Matematika/);
  assert.match(h.text(), /Utorak\s*,\s*08:00\s*–\s*09:00\s*, sala\s+101/);
  assert.deepEqual(h.calls, [["catalog"], ["schedule"], ["redirect", "/termini"]]);
  h.render();
  assert.equal(h.calls.filter(([kind]) => kind === "redirect").length, 1);
  h.button().props.onClick();
  assert.deepEqual(h.calls.at(-1), ["acknowledge", { expectedScheduleVersion: 2 }]);
  h.render();
  assert.equal(h.button().props.disabled, true);
  h.fail();
  assert.ok(h.nodes().some((node) => node.props.role === "alert"));
  assert.equal(h.tree.props.open, true);
  h.succeed({ ...data, scheduleUpdate: { ...data.scheduleUpdate, pending: false } });
  assert.equal(h.tree, null);
  h.state.data = release(3);
  h.render();
  assert.equal(h.calls.filter(([kind]) => kind === "redirect").length, 2);
  assert.match(h.text(), /Svi tvoji sačuvani termini su i dalje dostupni/);
});

test("guests, auth loading and acknowledged versions do not show an update or redirect", () => {
  const guest = harness(release(), false);
  assert.equal(guest.tree, null);
  assert.deepEqual(guest.calls, []);
  guest.state.isLoaded = false;
  guest.state.isSignedIn = true;
  guest.render();
  assert.equal(guest.tree, null);
  assert.deepEqual(guest.calls, []);
  const known = release();
  known.scheduleUpdate.pending = false;
  const user = harness(known);
  assert.equal(user.tree, null);
  assert.deepEqual(user.calls, []);
});
