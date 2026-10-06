const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");
const React = require("react");
const catalog = require("../src/data/termini.json");
const subjectCatalog = require("../src/data/predmeti.json");

function load(file, mocks = {}) {
  const filename = resolve(__dirname, "..", file);
  const mod = new Module(filename);
  mod.require = (id) => {
    if (id in mocks) return mocks[id];
    return require(id);
  };
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(outputText, filename);
  return mod.exports;
}

const storage = load("src/lib/schedule-storage.ts");
const {
  termKey,
  intervalKey,
  getMultiSessionGroups,
  selectionKeys,
  retainSubjectTerms,
} = storage;
const subject = { year: "year1", name: "Menadžment" };
const key = subject.name;
const options = catalog.year1[subject.name].V.filter(
  (term) => term.dan === "Sreda" && term.od === "08:15",
);

test("unchanged subjects preserve saved lectures and exercises", () => {
  const saved = { [key]: { P: "lecture", V: "exercise" } };
  assert.deepEqual(retainSubjectTerms([subject], saved), saved);
});

test("adding subjects preserves existing terms; removing subjects only prunes theirs", () => {
  const other = { year: "year2", name: "Marketing" };
  const saved = {
    [key]: { V: "exercise" },
    Marketing: { P: "marketing" },
  };
  assert.deepEqual(retainSubjectTerms([subject, other], saved), saved);
  assert.deepEqual(retainSubjectTerms([subject], saved), { [key]: saved[key] });
});

test("retention migrates year keys with unified then source-year precedence per type", () => {
  assert.deepEqual(
    retainSubjectTerms([subject], { "year1:Menadžment": { P: "legacy" } }),
    {
      [key]: { P: "legacy" },
    },
  );
  const saved = {
    "year2:Menadžment": { P: "second-year", V: "other-exercise" },
    "year1:Menadžment": { P: "first-year", V: [] },
    [key]: { P: "unified", V: "" },
  };
  assert.deepEqual(retainSubjectTerms([subject], saved), {
    [key]: { P: "unified", V: "other-exercise" },
  });
  delete saved[key];
  assert.deepEqual(retainSubjectTerms([subject], saved), {
    [key]: { P: "first-year", V: "other-exercise" },
  });
  delete saved["year1:Menadžment"];
  saved["year4:Menadžment"] = { P: "fourth-year", V: ["fourth-exercise"] };
  assert.deepEqual(retainSubjectTerms([subject], saved), {
    [key]: { P: "second-year", V: "other-exercise" },
  });
  saved[key] = { P: ["unified", "", "unified", null], V: [null, ""] };
  saved["year1:Menadžment"] = {
    P: "source",
    V: ["source-exercise", "source-exercise"],
  };
  assert.deepEqual(retainSubjectTerms([subject], saved), {
    [key]: { P: ["unified"], V: ["source-exercise"] },
  });
});

test("retention tolerates invalid storage shapes without mutating the source", () => {
  for (const invalid of [null, [], "bad", 4, { [key]: null }]) {
    assert.deepEqual(retainSubjectTerms([subject], invalid), {});
  }
  const saved = { [key]: { P: "lecture", V: "" } };
  assert.deepEqual(retainSubjectTerms([subject], saved), {
    [key]: { P: "lecture" },
  });
  assert.deepEqual(saved, { [key]: { P: "lecture", V: "" } });
});

test("term identity distinguishes simultaneous rooms and different durations", () => {
  assert.notEqual(termKey(options[0]), termKey(options[1]));
  assert.notEqual(termKey(options[0]), termKey({ ...options[0], do: "09:00" }));
});

test("catalog index matches merged terms and weekly metadata for every subject and type", () => {
  const original = JSON.stringify(catalog);
  const index = storage.createCatalogIndex(catalog);
  const names = new Set(Object.values(catalog).flatMap(Object.keys));
  assert.equal(index.size, names.size);
  for (const name of names) {
    const indexed = index.get(name);
    assert.deepEqual(
      indexed.years,
      Object.keys(catalog).filter((year) => catalog[year][name]),
    );
    const merged = storage.getSubjectTerms(catalog, name);
    for (const type of ["P", "V"]) {
      const entry = indexed[type];
      assert.deepEqual(entry.terms, merged[type]);
      assert.equal(entry.byKey.size, entry.terms.length);
      for (const term of entry.terms) {
        assert.strictEqual(entry.byKey.get(termKey(term)), term);
      }
      assert.deepEqual(
        entry.weeklySessions.counts,
        storage.getWeeklySessionCounts(merged[type]),
      );
      assert.deepEqual(
        entry.weeklySessions.multiSessionGroups,
        storage.getMultiSessionGroups(merged[type]),
      );
      assert.equal(entry.byKey.get("unavailable"), undefined);
    }
  }
  assert.equal(index.get("unavailable"), undefined);
  assert.equal(JSON.stringify(catalog), original);
});

const shortSession = {
  dan: "Ponedeljak",
  od: "08:15",
  do: "09:00",
  sala: "1",
  grupe: ["G1"],
};
const longSession = {
  ...shortSession,
  dan: "Utorak",
  od: "10:15",
  do: "12:00",
  sala: "2",
};
const regularSession = { ...longSession, dan: "Petak", grupe: ["G2"] };
const multiOptions = [shortSession, longSession, regularSession];

test("catalog index merges cross-year groups while keeping type and room alternatives distinct", () => {
  const alternateRoom = { ...shortSession, sala: "3" };
  const index = storage.createCatalogIndex({
    year1: { Example: { P: [shortSession], V: [shortSession, alternateRoom] } },
    year2: {
      Example: {
        V: [{ ...shortSession, grupe: ["G2"] }, longSession],
      },
      Empty: {},
    },
  });
  const subject = index.get("Example");
  assert.deepEqual(subject.years, ["year1", "year2"]);
  assert.deepEqual(subject.P.byKey.get(termKey(shortSession)).grupe, ["G1"]);
  assert.deepEqual(subject.V.byKey.get(termKey(shortSession)).grupe, [
    "G1",
    "G2",
  ]);
  assert.equal(subject.V.terms.length, 3);
  assert.deepEqual(
    [...subject.V.weeklySessions.counts],
    [
      ["G1", 2],
      ["G2", 1],
    ],
  );
  assert.deepEqual([...subject.V.weeklySessions.multiSessionGroups], ["G1"]);
  assert.equal(
    storage.getSelectionLimit(
      subject.V.terms,
      [],
      subject.V.weeklySessions.counts,
    ),
    2,
  );
  assert.equal(
    storage.getSelectionLimit(
      subject.V.terms,
      [subject.V.byKey.get(termKey(shortSession))],
      subject.V.weeklySessions.counts,
    ),
    2,
  );
  assert.deepEqual(index.get("Empty").P.terms, []);
  assert.equal(index.get("Empty").V.byKey.size, 0);
  assert.equal(storage.createCatalogIndex({}).size, 0);
});

test("multi-session detection identifies distinct 45/105-minute sessions per group", () => {
  assert.deepEqual([...getMultiSessionGroups(multiOptions)], ["G1"]);
  const theory = catalog.year3["Teorija sistema"].V;
  assert.deepEqual([...getMultiSessionGroups(theory)].sort(), [
    "C1",
    "C2",
    "C3",
    "C4",
    "C5",
    "C6",
    "C7",
  ]);
  assert.equal(getMultiSessionGroups(catalog.year1[subject.name].V).size, 0);
});

test("room duplicates and unrelated groups do not enable multiple sessions", () => {
  for (const terms of [
    [shortSession, { ...shortSession, sala: "other" }],
    [longSession, { ...longSession, sala: "other" }],
    [shortSession, { ...longSession, grupe: ["G2"] }],
  ])
    assert.equal(getMultiSessionGroups(terms).size, 0);
  assert.equal(intervalKey(shortSession), "Ponedeljak|08:15|09:00");
  assert.equal(
    intervalKey(shortSession),
    intervalKey({ ...shortSession, sala: "other" }),
  );
});

test("distinct weekly sessions qualify even when both have standard duration", () => {
  assert.deepEqual(
    [...getMultiSessionGroups([longSession, { ...longSession, dan: "Sreda" }])],
    ["G1"],
  );
});

test("selection keys normalize scalar and array storage without accepting invalid entries", () => {
  assert.deepEqual(selectionKeys("legacy"), ["legacy"]);
  assert.deepEqual(selectionKeys(["first", "", null, "second", "first", 4]), [
    "first",
    "second",
  ]);
  for (const invalid of [null, undefined, "", 4, {}]) {
    assert.deepEqual(selectionKeys(invalid), []);
  }
});

test("retention preserves multi-session arrays alongside legacy scalar selections", () => {
  const saved = { [key]: { P: "lecture", V: ["short", "long"] } };
  assert.deepEqual(retainSubjectTerms([subject], saved), saved);
  assert.deepEqual(
    retainSubjectTerms([subject], { "year1:Menadžment": saved[key] }),
    saved,
  );
  assert.deepEqual(saved[key].V, ["short", "long"]);
});

// Exercise component event handlers with controlled hooks, without a browser or DB.
const controls = Object.fromEntries(
  [
    "Dialog",
    "DialogContent",
    "DialogHeader",
    "DialogTitle",
    "DialogDescription",
    "DialogTrigger",
    "DialogFooter",
    "Button",
    "Badge",
    "Input",
    "Label",
    "Select",
    "SelectContent",
    "SelectItem",
    "SelectTrigger",
    "SelectValue",
  ].map((name) => [name, () => null]),
);
let hookState;
let hookIndex;
const Selector = load("src/components/time-slot-selector.tsx", {
  react: {
    ...React,
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hookState)) hookState[index] = initial;
      return [
        hookState[index],
        (value) => {
          hookState[index] =
            typeof value === "function" ? value(hookState[index]) : value;
        },
      ];
    },
  },
  "~/components/ui/button": controls,
  "~/components/ui/dialog": controls,
  "./ui/badge": controls,
  "~/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
  "~/lib/schedule-storage": storage,
}).default;

function nodes(element) {
  if (!React.isValidElement(element)) return [];
  return [
    element,
    ...React.Children.toArray(element.props.children).flatMap(nodes),
  ];
}

function text(element) {
  if (typeof element === "string" || typeof element === "number")
    return String(element);
  if (!React.isValidElement(element)) return "";
  return React.Children.toArray(element.props.children).map(text).join("");
}

function harness(props) {
  const state = [];
  let saved;
  let tree;
  const render = () => {
    hookState = state;
    hookIndex = 0;
    tree = Selector({
      slots_input: Object.fromEntries(
        props.termini.map((term) => [`${term.dan}-${term.od}`, "available"]),
      ),
      ...props,
      onSave: (term) => {
        saved = term;
      },
      onSaveMultiple: props.onSaveMultiple
        ? (terms) => {
            saved = terms;
            props.onSaveMultiple(terms);
          }
        : undefined,
    });
  };
  render();
  tree.props.onOpenChange(true);
  render();
  return {
    get saved() {
      return saved;
    },
    find(predicate) {
      const node = nodes(tree).find(predicate);
      assert.ok(node, "Expected control was rendered");
      return node;
    },
    click(node) {
      node.props.onClick();
      render();
    },
    openChange(open) {
      tree.props.onOpenChange(open);
      render();
    },
    button(label) {
      return this.find(
        (node) => node.type === controls.Button && text(node) === label,
      );
    },
    cell(term) {
      return this.find((node) =>
        node.props["aria-label"]?.startsWith(`${term.dan} at ${term.od},`),
      );
    },
    alternative(term) {
      return this.find(
        (node) =>
          node.type === controls.Button &&
          text(node).includes(`· ${term.sala} · ${term.grupe.join(", ")}`),
      );
    },
    warningOpen() {
      return nodes(tree).filter((node) => node.type === controls.Dialog)[1]
        .props.open;
    },
    hasText(value) {
      return text(tree).includes(value);
    },
  };
}

test("opening and saving an alternative preserves its exact room/group", () => {
  const ui = harness({ termini: options, value: options[1] });
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, options[1]);
});

test("an ambiguous cell requires an explicit room/group choice", () => {
  const ui = harness({ termini: options });
  ui.click(ui.cell(options[0]));
  assert.equal(ui.button("Sačuvaj").props.disabled, true);
  ui.click(ui.alternative(options[1]));
  assert.equal(ui.button("Sačuvaj").props.disabled, false);
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, options[1]);
});

test("conflict checks use each alternative's duration, not a collapsed cell", () => {
  const longer = { ...options[1], do: "12:00" };
  const ui = harness({
    termini: [options[0], longer],
    isOccupied: (term) => term.do === "12:00",
  });
  assert.ok(ui.cell(options[0]).props["aria-label"].endsWith("occupied"));
  ui.click(ui.cell(options[0]));
  ui.click(ui.alternative(options[0]));
  assert.equal(ui.warningOpen(), false);
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, options[0]);
});

test("occupied alternatives can be confirmed or cancelled without overwriting the old choice", () => {
  const ui = harness({
    termini: options,
    value: options[0],
    isOccupied: (term) => term.sala === options[1].sala,
  });
  ui.click(ui.cell(options[1]));
  ui.click(ui.alternative(options[1]));
  assert.equal(ui.warningOpen(), true);
  ui.click(ui.button("Otkaži"));
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, options[0]);

  const confirmed = harness({
    termini: options,
    value: options[0],
    isOccupied: (term) => term.sala === options[1].sala,
  });
  confirmed.click(confirmed.cell(options[1]));
  confirmed.click(confirmed.alternative(options[1]));
  confirmed.click(confirmed.button("Izaberi ipak"));
  confirmed.click(confirmed.button("Sačuvaj"));
  assert.deepEqual(confirmed.saved, options[1]);
});

test("Bez termina still clears a selection", () => {
  const ui = harness({ termini: options, value: options[1] });
  ui.click(ui.button("Bez termina"));
  ui.click(ui.button("Sačuvaj"));
  assert.equal(ui.saved, null);
});

test("multiple sessions require detected groups and explicit callback opt-in", () => {
  const scalar = harness({ termini: multiOptions, value: shortSession });
  scalar.click(scalar.cell(longSession));
  scalar.click(scalar.button("Sačuvaj"));
  assert.deepEqual(scalar.saved, longSession);
  assert.equal(scalar.hasText("više sesija"), false);

  let multipleCalled = false;
  const regular = harness({
    termini: options,
    value: options[0],
    onSaveMultiple: () => {
      multipleCalled = true;
    },
  });
  regular.click(regular.button("Sačuvaj"));
  assert.deepEqual(regular.saved, options[0]);
  assert.equal(multipleCalled, false);
  assert.equal(regular.hasText("više sesija"), false);
});

test("multi mode initializes old scalar values and explicit arrays without selecting related sessions", () => {
  for (const props of [
    { value: shortSession },
    { values: [shortSession] },
    { value: regularSession, values: [shortSession] },
  ]) {
    const ui = harness({
      termini: multiOptions,
      onSaveMultiple: () => {},
      ...props,
    });
    assert.equal(ui.hasText("više sesija"), true);
    ui.click(ui.button("Sačuvaj"));
    assert.deepEqual(ui.saved, [shortSession]);
  }
  const ui = harness({
    termini: multiOptions,
    values: [shortSession, longSession],
    onSaveMultiple: () => {},
  });
  assert.ok(ui.hasText("08:15-09:00 · 45 min"));
  assert.ok(ui.hasText("10:15-12:00 · 105 min"));
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, [shortSession, longSession]);
});

test("eligible sessions append, exact toggles remove only one, and clear removes all", () => {
  const ui = harness({ termini: multiOptions, onSaveMultiple: () => {} });
  ui.click(ui.cell(shortSession));
  ui.click(ui.cell(longSession));
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, [shortSession, longSession]);
  ui.click(ui.cell(shortSession));
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, [longSession]);
  ui.click(ui.button("Bez termina"));
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, []);
});

test("mixed eligible and ineligible groups replace rather than retain unrelated choices", () => {
  for (const [initial, next] of [
    [[shortSession, longSession], regularSession],
    [[regularSession], shortSession],
    [[shortSession, regularSession], longSession],
  ]) {
    const ui = harness({
      termini: multiOptions,
      values: initial,
      onSaveMultiple: () => {},
    });
    ui.click(ui.cell(next));
    ui.click(ui.button("Sačuvaj"));
    assert.deepEqual(ui.saved, [next]);
  }
  const otherShort = { ...shortSession, dan: "Sreda", grupe: ["G3"] };
  const otherLong = { ...longSession, dan: "Četvrtak", grupe: ["G3"] };
  const ui = harness({
    termini: [...multiOptions, otherShort, otherLong],
    values: [shortSession],
    onSaveMultiple: () => {},
  });
  ui.click(ui.cell(otherLong));
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, [shortSession, otherLong]);
});

test("multi mode keeps explicit alternatives and replaces rooms within an interval", () => {
  const otherRoom = { ...shortSession, sala: "other" };
  const ui = harness({
    termini: [...multiOptions, otherRoom],
    values: [shortSession, longSession],
    onSaveMultiple: () => {},
  });
  ui.click(ui.cell(otherRoom));
  assert.equal(ui.alternative(shortSession).props["aria-pressed"], true);
  assert.equal(ui.alternative(otherRoom).props["aria-pressed"], false);
  assert.equal(ui.alternative(otherRoom).props.disabled, false);
  ui.click(ui.alternative(otherRoom));
  assert.equal(ui.warningOpen(), false);
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, [longSession, otherRoom]);
  ui.click(ui.alternative(otherRoom));
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, [longSession]);
});

test("weekly session counts ignore room alternatives and respect each group's limit", () => {
  const third = { ...longSession, dan: "Sreda" };
  const counts = storage.getWeeklySessionCounts([
    ...multiOptions,
    { ...shortSession, sala: "other" },
  ]);
  assert.equal(counts.get("G1"), 2);
  assert.equal(counts.get("G2"), 1);
  const threeSessionGroup = [...multiOptions, third];
  assert.equal(
    storage.getSelectionLimit(threeSessionGroup, [shortSession, third]),
    3,
  );
  assert.equal(
    storage.getSelectionLimit(threeSessionGroup, [
      shortSession,
      regularSession,
    ]),
    1,
  );
});

test("a full two-session selection blocks additions until an existing session is removed", () => {
  const otherShort = { ...shortSession, dan: "Sreda", grupe: ["G3"] };
  const otherLong = { ...longSession, dan: "Četvrtak", grupe: ["G3"] };
  const ui = harness({
    termini: [...multiOptions, otherShort, otherLong],
    values: [shortSession, longSession],
    onSaveMultiple: () => {},
    isOccupied: () => true,
  });
  assert.equal(ui.cell(otherShort).props.disabled, true);
  ui.click(ui.cell(otherShort));
  assert.equal(ui.warningOpen(), false);
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, [shortSession, longSession]);
  ui.click(ui.cell(longSession));
  assert.equal(ui.cell(otherShort).props.disabled, false);
  ui.click(ui.cell(otherShort));
  ui.click(ui.button("Izaberi ipak"));
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, [shortSession, otherShort]);
});

test("Teorija sistema cannot select a third exercise from another group", () => {
  const terms = catalog.year3["Teorija sistema"].V;
  const chosen = terms.filter((term) => term.grupe.includes("C1"));
  const third = terms.find(
    (term) => term.grupe.includes("C7") && term.od === "09:15",
  );
  const ui = harness({
    termini: terms,
    values: chosen,
    onSaveMultiple: () => {},
  });
  assert.ok(ui.hasText("Izabrano: 2/2"));
  assert.equal(ui.cell(third).props.disabled, true);
  ui.click(ui.cell(third));
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, chosen);
});

test("selector preserves selection limits using indexed weekly-session metadata", () => {
  const indexed = storage.createCatalogIndex(catalog).get("Teorija sistema").V;
  const chosen = indexed.terms.filter((term) => term.grupe.includes("C1"));
  const third = indexed.terms.find(
    (term) => term.grupe.includes("C7") && term.od === "09:15",
  );
  const ui = harness({
    termini: indexed.terms,
    weeklySessions: indexed.weeklySessions,
    values: chosen,
    onSaveMultiple: () => {},
  });
  assert.ok(ui.hasText("Izabrano: 2/2"));
  assert.equal(ui.cell(third).props.disabled, true);
  ui.click(ui.cell(chosen[0]));
  assert.equal(ui.cell(third).props.disabled, false);
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, [chosen[1]]);
});

test("a three-session group allows three choices but not a smaller group's extra session", () => {
  const third = { ...shortSession, dan: "Sreda" };
  const otherShort = { ...shortSession, dan: "Četvrtak", grupe: ["G3"] };
  const otherLong = { ...longSession, dan: "Petak", grupe: ["G3"] };
  const ui = harness({
    termini: [...multiOptions, third, otherShort, otherLong],
    values: [shortSession, longSession],
    onSaveMultiple: () => {},
  });
  assert.equal(ui.cell(third).props.disabled, false);
  assert.equal(ui.cell(otherShort).props.disabled, true);
  ui.click(ui.cell(third));
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, [shortSession, longSession, third]);
});

test("previously saved over-limit choices must be reduced before saving", () => {
  const otherShort = { ...shortSession, dan: "Sreda", grupe: ["G3"] };
  const otherLong = { ...longSession, dan: "Četvrtak", grupe: ["G3"] };
  const ui = harness({
    termini: [...multiOptions, otherShort, otherLong],
    values: [shortSession, longSession, otherShort],
    onSaveMultiple: () => {},
  });
  assert.equal(ui.button("Sačuvaj").props.disabled, true);
  ui.click(ui.button("Sačuvaj"));
  assert.equal(ui.saved, undefined);
  ui.click(ui.cell(otherShort));
  assert.equal(ui.button("Sačuvaj").props.disabled, false);
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, [shortSession, longSession]);
});

test("multi conflicts cancel without losing selections and confirm retains eligible choices", () => {
  const retained = { ...longSession, dan: "Četvrtak" };
  for (const local of [false, true]) {
    const conflict = local
      ? { ...longSession, dan: shortSession.dan, od: "08:45", do: "10:30" }
      : longSession;
    const ui = harness({
      termini: [shortSession, retained, conflict],
      values: [shortSession, retained],
      onSaveMultiple: () => {},
      isOccupied: () => !local,
    });
    ui.click(ui.cell(conflict));
    assert.equal(ui.warningOpen(), true);
    ui.click(ui.button("Otkaži"));
    ui.click(ui.button("Sačuvaj"));
    assert.deepEqual(ui.saved, [shortSession, retained]);
    ui.click(ui.cell(conflict));
    ui.click(ui.button("Izaberi ipak"));
    ui.click(ui.button("Sačuvaj"));
    assert.deepEqual(ui.saved, [shortSession, retained, conflict]);
  }
});

test("closing without saving discards draft multi selections on reopening", () => {
  const initial = [shortSession, longSession];
  const ui = harness({
    termini: multiOptions,
    values: initial,
    onSaveMultiple: () => {},
  });
  ui.click(ui.cell(shortSession));
  ui.openChange(false);
  assert.equal(ui.saved, undefined);
  ui.openChange(true);
  ui.click(ui.button("Sačuvaj"));
  assert.deepEqual(ui.saved, initial);
  assert.deepEqual(initial, [shortSession, longSession]);
});

test("every catalog alternative round-trips unchanged through the selector", () => {
  for (const subjects of Object.values(catalog)) {
    for (const types of Object.values(subjects)) {
      for (const terms of Object.values(types)) {
        for (const term of terms) {
          const ui = harness({ termini: terms, value: term });
          ui.click(ui.button("Sačuvaj"));
          assert.deepEqual(ui.saved, term);
        }
      }
    }
  }
});

const Calendar = load("src/components/selected-slots-calendar.tsx", {
  react: {
    ...React,
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hookState)) hookState[index] = initial;
      return [
        hookState[index],
        (value) => {
          hookState[index] =
            typeof value === "function" ? value(hookState[index]) : value;
        },
      ];
    },
  },
  "~/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
  "~/lib/schedule-storage": storage,
});

function calendarHarness(slots) {
  const state = [];
  let tree;
  const render = () => {
    hookState = state;
    hookIndex = 0;
    tree = Calendar.default({ slots });
  };
  render();
  return {
    dayButton(day) {
      const button = nodes(tree).find(
        (node) =>
          node.type === "button" &&
          node.props["aria-label"]?.startsWith(
            `${day}, broj izabranih termina:`,
          ),
      );
      assert.ok(button, "Mobile calendar day control exists");
      return button;
    },
    cell(day, time) {
      const cell = nodes(tree).find(
        (node) =>
          node.type === "button" &&
          node.props["aria-label"]?.startsWith(`${day} ${time}:`),
      );
      assert.ok(cell, "Calendar cell exists");
      return cell;
    },
    event(cell, name) {
      cell.props[name]();
      render();
    },
    details() {
      return text(
        nodes(tree).find((node) => node.props["aria-live"] === "polite"),
      );
    },
    update(next) {
      slots = next;
      render();
    },
    rows() {
      return nodes(tree)
        .filter((node) => node.props.role === "rowheader")
        .map(text);
    },
    rowStyle(day, time) {
      const label = this.cell(day, time).props["aria-label"];
      const row = nodes(tree).find(
        (node) =>
          node.props.role === "row" &&
          nodes(node).some((child) => child.props["aria-label"] === label),
      );
      assert.ok(row, "Calendar cell has a fixed row");
      return row.props.style;
    },
  };
}

const calendarSlot = {
  key,
  name: "Menadžment",
  type: "V",
  term: options[0],
};

test("empty calendar shows setup hint and disabled cells", () => {
  const ui = calendarHarness([]);
  assert.equal(ui.cell("Sreda", "08:15").props.disabled, true);
  assert.ok(ui.details().includes("Izabrani termini će se pojaviti"));
});

test("hover and keyboard focus expose the selected subject and room", () => {
  const ui = calendarHarness([calendarSlot]);
  ui.event(ui.cell("Sreda", "08:15"), "onMouseEnter");
  assert.ok(ui.details().includes("Menadžment"));
  assert.ok(ui.details().includes(options[0].sala));
  ui.event(ui.cell("Sreda", "08:15"), "onMouseLeave");
  assert.ok(ui.details().includes("Izaberi polje"));
  ui.event(ui.cell("Sreda", "08:15"), "onFocus");
  assert.ok(ui.details().includes("Menadžment"));
});

test("click pins details after hover ends and a second click unpins", () => {
  const ui = calendarHarness([calendarSlot]);
  ui.event(ui.cell("Sreda", "08:15"), "onClick");
  ui.event(ui.cell("Sreda", "08:15"), "onMouseLeave");
  assert.equal(ui.cell("Sreda", "08:15").props["aria-pressed"], true);
  assert.ok(ui.details().includes("Menadžment"));
  ui.event(ui.cell("Sreda", "08:15"), "onClick");
  assert.equal(ui.cell("Sreda", "08:15").props["aria-pressed"], false);
});

test("mobile day navigation clears pinned details and retains selected slots", () => {
  const ui = calendarHarness([calendarSlot]);
  assert.equal(ui.dayButton("Ponedeljak").props["aria-pressed"], true);
  ui.event(ui.dayButton("Sreda"), "onClick");
  assert.equal(ui.dayButton("Sreda").props["aria-pressed"], true);
  assert.equal(ui.dayButton("Ponedeljak").props["aria-pressed"], false);
  assert.ok(ui.dayButton("Sreda").props["aria-label"].endsWith(": 1"));
  ui.event(ui.cell("Sreda", "08:15"), "onClick");
  assert.ok(ui.details().includes("Menadžment"));
  ui.event(ui.dayButton("Petak"), "onClick");
  assert.equal(ui.cell("Sreda", "08:15").props["aria-pressed"], false);
  assert.ok(ui.details().includes("Izaberi polje"));
  ui.event(ui.dayButton("Sreda"), "onClick");
  assert.equal(ui.cell("Sreda", "08:15").props.disabled, false);
  ui.event(ui.cell("Sreda", "08:15"), "onClick");
  assert.ok(ui.details().includes(options[0].sala));
});

test("calendar displays every overlapping selection and marks the conflict", () => {
  const ui = calendarHarness([
    calendarSlot,
    { ...calendarSlot, key: "Marketing", name: "Marketing", type: "P" },
  ]);
  assert.ok(ui.cell("Sreda", "08:15").props.className.includes("border-amber"));
  ui.event(ui.cell("Sreda", "08:15"), "onClick");
  assert.ok(ui.details().includes("Menadžment"));
  assert.ok(ui.details().includes("Marketing"));
});

test("long classes occupy later rows, without occupying their end boundary", () => {
  const ui = calendarHarness([
    { ...calendarSlot, term: { ...calendarSlot.term, do: "12:15" } },
  ]);
  assert.equal(ui.cell("Sreda", "10:15").props.disabled, false);
  assert.equal(ui.cell("Sreda", "12:15").props.disabled, true);
});

test("calendar reflects selection removals and nonstandard start times", () => {
  const ui = calendarHarness([
    { ...calendarSlot, term: { ...calendarSlot.term, od: "09:00" } },
  ]);
  assert.deepEqual(ui.rows(), [
    "08:15",
    "10:15",
    "12:15",
    "14:15",
    "16:15",
    "18:15",
  ]);
  ui.event(ui.cell("Sreda", "08:15"), "onClick");
  assert.ok(ui.details().includes("Menadžment"));
  assert.ok(ui.details().includes("09:00"));
  ui.update([]);
  assert.ok(ui.details().includes("Izabrani termini će se pojaviti"));
});

test("calendar keeps six fixed two-hour rows when selections change", () => {
  const ui = calendarHarness([]);
  const expected = ["08:15", "10:15", "12:15", "14:15", "16:15", "18:15"];
  assert.deepEqual(ui.rows(), expected);
  for (const slots of [
    [{ ...calendarSlot, term: shortSession }],
    [{ ...calendarSlot, term: longSession }],
    [{ ...calendarSlot, term: { ...shortSession, od: "09:15", do: "10:00" } }],
    [],
  ]) {
    ui.update(slots);
    assert.deepEqual(ui.rows(), expected);
    for (const time of expected) {
      assert.deepEqual(ui.rowStyle("Ponedeljak", time), { height: 96 });
    }
  }
});

test("45-minute sessions occupy exactly the upper or lower 48px half with an empty other half", () => {
  for (const [start, end, empty] of [
    ["08:15", "09:00", "09:15"],
    ["09:15", "10:00", "08:15"],
  ]) {
    const ui = calendarHarness([
      { ...calendarSlot, term: { ...shortSession, od: start, do: end } },
    ]);
    const occupied = ui.cell("Ponedeljak", start);
    assert.equal(occupied.props.style.height, 48);
    assert.equal(occupied.props.disabled, false);
    assert.ok(text(occupied).includes(`${start}-${end}`));
    const other = ui.cell("Ponedeljak", empty);
    assert.equal(other.props.style.height, 48);
    assert.equal(other.props.disabled, true);
    assert.equal(text(other), "");
    assert.equal(ui.cell("Utorak", "08:15").props.style.height, 96);
    assert.ok(
      ui.cell("Utorak", "08:15").props.className.includes("rounded-md"),
    );
    ui.event(occupied, "onFocus");
    assert.ok(ui.details().includes(`${start}-${end}`));
    ui.event(ui.cell("Ponedeljak", start), "onBlur");
    assert.ok(ui.details().includes("Izaberi polje"));
  }
});

test("105-minute standard classes use a full 96px cell without splitting other cells", () => {
  const ui = calendarHarness([{ ...calendarSlot, term: longSession }]);
  const cell = ui.cell("Utorak", "10:15");
  assert.equal(cell.props.style.height, 96);
  assert.ok(cell.props.className.includes("rounded-md"));
  assert.ok(text(cell).includes("Menadžment"));
  assert.equal(ui.cell("Utorak", "12:15").props.disabled, true);
});

test("adjacent short sessions share a row without artificial conflict warnings", () => {
  const ui = calendarHarness([
    { ...calendarSlot, term: shortSession },
    {
      ...calendarSlot,
      key: "other",
      name: "Marketing",
      type: "P",
      term: { ...shortSession, od: "09:15", do: "10:00" },
    },
  ]);
  for (const [time, name, absent] of [
    ["08:15", "Menadžment", "Marketing"],
    ["09:15", "Marketing", "Menadžment"],
  ]) {
    const cell = ui.cell("Ponedeljak", time);
    assert.equal(cell.props.style.height, 48);
    assert.equal(cell.props.className.includes("border-amber"), false);
    assert.equal(
      nodes(cell).some((node) => node.props.className?.includes("text-amber")),
      false,
    );
    ui.event(cell, "onClick");
    assert.ok(ui.details().includes(name));
    assert.equal(ui.details().includes(absent), false);
  }
});

test("long and short overlaps preserve all subjects on hover, click and keyboard in both halves", () => {
  const ui = calendarHarness([
    {
      ...calendarSlot,
      name: "Dugi predmet",
      type: "P",
      term: { ...shortSession, do: "10:00" },
    },
    {
      ...calendarSlot,
      key: "upper",
      name: "Gornji predmet",
      term: shortSession,
    },
    {
      ...calendarSlot,
      key: "lower",
      name: "Donji predmet",
      term: { ...shortSession, od: "09:15", do: "10:00" },
    },
  ]);
  for (const [time, shortName, absent] of [
    ["08:15", "Gornji predmet", "Donji predmet"],
    ["09:15", "Donji predmet", "Gornji predmet"],
  ]) {
    const cell = ui.cell("Ponedeljak", time);
    assert.equal(cell.props.style.height, 48);
    assert.ok(cell.props.className.includes("border-amber"));
    for (const name of ["Dugi predmet", shortName]) {
      assert.ok(text(cell).includes(name));
      assert.ok(cell.props["aria-label"].includes(name));
      assert.ok(cell.props.title.includes(name));
    }
    for (const event of ["onMouseEnter", "onFocus", "onClick"]) {
      ui.event(ui.cell("Ponedeljak", time), event);
      assert.ok(ui.details().includes("Dugi predmet"));
      assert.ok(ui.details().includes(shortName));
      assert.ok(ui.details().includes("08:15-10:00"));
      assert.ok(ui.details().includes("G1"));
      assert.equal(ui.details().includes(absent), false);
    }
    ui.event(ui.cell("Ponedeljak", time), "onMouseLeave");
    assert.ok(ui.details().includes(shortName));
  }
});

test("calendar extends outside default hours only in fixed two-hour steps", () => {
  const ui = calendarHarness([
    { ...calendarSlot, term: { ...shortSession, od: "07:00", do: "07:45" } },
    { ...calendarSlot, term: { ...longSession, od: "20:30", do: "22:15" } },
  ]);
  assert.deepEqual(ui.rows(), [
    "06:15",
    "08:15",
    "10:15",
    "12:15",
    "14:15",
    "16:15",
    "18:15",
    "20:15",
  ]);
  assert.equal(ui.cell("Ponedeljak", "06:15").props.disabled, false);
  assert.equal(ui.cell("Utorak", "20:15").props.style.height, 96);
});

const theorySubject = { year: "year3", name: "Teorija sistema" };
const theoryKey = storage.subjectKey(theorySubject);
const theoryPair = catalog.year3[theorySubject.name].V.filter((term) =>
  term.grupe.includes("C1"),
);
const slotId = (name, type, term) => `slot:${name}:${type}:${termKey(term)}`;
const dbTerm = (name, type, term) => ({
  ...term,
  id: slotId(name, type, term),
  groupKeys: term.grupe,
});
const dbTheoryPair = theoryPair.map((term) =>
  dbTerm(theorySubject.name, "V", term),
);
const PageSelector = () => null;
const PageCalendar = () => null;
const Schedule = () => null;
const dbCatalog = load("src/lib/schedule-catalog.ts", {
  "~/lib/schedule-storage": storage,
});

function catalogFixture(terms) {
  const merged = storage.createCatalogIndex(terms);
  const programs = new Map();
  const memberships = new Map();
  for (const [yearKey, entries] of Object.entries(subjectCatalog)) {
    const year = Number(yearKey.slice(4));
    for (const [name, names] of Object.entries(entries)) {
      const program = programs.get(name) ?? { id: name, name, years: [] };
      program.years.push(year);
      programs.set(name, program);
      for (const subject of names) {
        const entries = memberships.get(subject) ?? [];
        entries.push({ year, programId: program.id });
        memberships.set(subject, entries);
      }
    }
  }
  const names = new Set([...merged.keys(), ...memberships.keys()]);
  return {
    programs: [...programs.values()],
    subjects: [...names].map((name) => {
      const indexed = merged.get(name);
      return {
        id: `subject:${name}`,
        name,
        years: indexed?.years.map((year) => Number(year.slice(4))) ?? [
          ...new Set(memberships.get(name).map((entry) => entry.year)),
        ],
        memberships: memberships.get(name) ?? [],
        terms: Object.fromEntries(
          ["P", "V"].map((type) => [
            type,
            (indexed?.[type].terms ?? []).map((term) => ({
              ...term,
              id: `slot:${name}:${type}:${termKey(term)}`,
              groupKeys: term.grupe,
            })),
          ]),
        ),
      };
    }),
  };
}

function pageHarness(
  file,
  {
    subjects = [theorySubject],
    selections = {},
    terms = catalog,
    mode = "account",
    groupSchedules = {},
    scheduleQuery,
    auth = { isLoaded: true, isSignedIn: true },
    group = null,
    catalogData = catalogFixture(terms),
    catalogQuery = {},
    accountQuery = {},
    mutationError = false,
    deferSave = false,
  } = {},
) {
  const state = [];
  const dependencies = [];
  let index = 0;
  let effects = [];
  let tree;
  let initialTree;
  let settings = {};
  const pushes = [];
  const scheduleQueries = [];
  const catalogQueries = [];
  let retries = 0;
  const refetchCatalog = () => { retries++; };
  const setSettings = (value) => {
    settings = value;
  };
  const scheduleModeAtom = {};
  const settingsAtom = {};
  const isOpenAtom = {};
  const indexedCatalog = dbCatalog.createScheduleCatalog(catalogData.subjects);
  const retained = retainSubjectTerms(subjects, selections);
  let accountData = {
    revision: 7,
    preferences: {
      mode,
      group,
      catalogYear: 1,
      programFilters: [],
      theme: "system",
    },
    subjectIds: [
      ...new Set(subjects.map((subject) => `subject:${subject.name}`)),
    ],
    timeslotIds: catalogData.subjects.flatMap((subject) =>
      ["P", "V"].flatMap((type) =>
        subject.terms[type]
          .filter((term) =>
            selectionKeys(retained[subject.name]?.[type]).includes(
              termKey(term),
            ),
          )
          .map((term) => term.id),
      ),
    ),
  };
  const saves = [];
  let pendingSave;
  let mounted = true;
  const mutation = { isPending: false, isError: false };
  const accountResult = () => ({
    data: accountData,
    isError: false,
    refetch: () => {
      retries++;
    },
    ...accountQuery,
  });
  const useMutation = (kind) => (options) => ({
    ...mutation,
    mutate(input, callbacks) {
      saves.push({ kind, input });
      mutation.isPending = true;
      pendingSave = () => {
        mutation.isPending = false;
        mutation.isError = mutationError;
        if (mutationError) return;
        const subjectIds = input.subjectIds ?? accountData.subjectIds;
        accountData = {
          ...accountData,
          revision: accountData.revision + 1,
          subjectIds,
          timeslotIds:
            input.timeslotIds ??
            accountData.timeslotIds.filter((id) =>
              catalogData.subjects.some(
                (subject) =>
                  subjectIds.includes(subject.id) &&
                  ["P", "V"].some((type) =>
                    subject.terms[type].some((term) => term.id === id),
                  ),
              ),
            ),
          preferences: {
            ...accountData.preferences,
            catalogYear:
              input.catalogYear ?? accountData.preferences.catalogYear,
            programFilters:
              input.programFilters ?? accountData.preferences.programFilters,
          },
        };
        options.onSuccess(accountData);
        if (mounted) callbacks.onSuccess(accountData);
      };
      if (!deferSave) pendingSave();
    },
  });
  const Page = load(file, {
    react: {
      ...React,
      useState(initial) {
        const current = index++;
        if (!(current in state)) {
          state[current] = typeof initial === "function" ? initial() : initial;
        }
        return [
          state[current],
          (value) => {
            state[current] =
              typeof value === "function" ? value(state[current]) : value;
          },
        ];
      },
      useEffect(effect, deps) {
        const current = index++;
        if (
          !dependencies[current] ||
          deps.some((dep, i) => dep !== dependencies[current][i])
        ) {
          dependencies[current] = deps;
          effects.push(effect);
        }
      },
    },
    "next/link": () => null,
    "next/navigation": {
      useRouter: () => ({ push: (path) => pushes.push(path) }),
    },
    "@clerk/nextjs": { useUser: () => auth, SignInButton: () => null },
    "~/hooks/use-schedule-state": {
      useScheduleState: () => ({
        ...auth,
        account: accountResult(),
        mode: auth.isSignedIn ? mode : "search",
        group,
      }),
    },
    jotai: {
      useSetAtom: (atom) =>
        atom === scheduleModeAtom
          ? (value) => {
              mode = value;
            }
          : () => {},
      useAtomValue: () => mode,
      useAtom: () => [settings, setSettings],
    },
    "~/state/scheduleModeAtom": { scheduleModeAtom },
    "~/state/settingsAtom": { settingsAtom },
    "~/state/isOpenAtom": { isOpenAtom },
    "~/components/ui/button": controls,
    "~/components/ui/dialog": controls,
    "~/components/ui/input": controls,
    "~/components/ui/label": controls,
    "~/components/ui/select": controls,
    "~/components/time-slot-selector": PageSelector,
    "~/components/selected-slots-calendar": PageCalendar,
    "~/components/raspored": Schedule,
    "~/data/termini.json": terms,
    "~/data/predmeti.json": subjectCatalog,
    "~/data/raspored_grupa.json": {},
    "~/data/raspored_nastave.json": groupSchedules,
    "~/lib/schedule-storage": storage,
    "~/lib/schedule-catalog": { ...dbCatalog },
    "~/lib/utils": { latinToCyrillic: (value) => value },
    "~/lib/search": { LAST_NAME_SEARCH_ENABLED: false },
    "~/trpc/react": {
      api: {
        useUtils: () => ({
          account: {
            get: {
              setData: (_input, data) => {
                accountData = data;
              },
            },
          },
        }),
        catalog: {
          get: {
            useQuery: (input, options) => {
              catalogQueries.push({ input, options });
              return {
                data: catalogData,
                isError: false,
                refetch: refetchCatalog,
                ...catalogQuery,
              };
            },
          },
        },
        account: {
          saveSubjects: { useMutation: useMutation("subjects") },
          saveTimeslots: { useMutation: useMutation("timeslots") },
        },
        schedule: {
          getSchedule: {
            useQuery(input, options) {
              scheduleQueries.push({ input, options });
              return {
                data: options.enabled
                  ? {
                      group: input.group,
                      year: input.year,
                      schedule: groupSchedules[input.group] ?? {},
                    }
                  : undefined,
                isError: false,
                isFetching: false,
                refetch: () => {
                  retries++;
                },
                ...scheduleQuery,
              };
            },
          },
        },
      },
    },
  }).default;
  const withWindow = (action) => {
    const previous = global.window;
    global.window = {
      localStorage: {
        getItem: () => {
          throw new Error("Pages must not read localStorage");
        },
        setItem: () => {
          throw new Error("Pages must not write localStorage");
        },
      },
      location: {
        reload: () => {
          retries++;
        },
      },
    };
    try {
      return action();
    } finally {
      if (previous === undefined) delete global.window;
      else global.window = previous;
    }
  };
  const render = () =>
    withWindow(() => {
      index = 0;
      tree = Page();
      if (initialTree === undefined) initialTree = tree;
      while (effects.length) {
        const pending = effects;
        effects = [];
        pending.forEach((effect) => effect());
        index = 0;
        tree = Page();
      }
    });
  render();
  return {
    saves,
    catalogData,
    get accountData() {
      return accountData;
    },
    completeSave() {
      pendingSave();
      render();
    },
    unmount() {
      mounted = false;
    },
    failSave(value) {
      mutationError = value;
    },
    pushes,
    indexedCatalog,
    scheduleQueries,
    catalogQueries,
    get retries() {
      return retries;
    },
    initialTree,
    rerender: render,
    get saved() {
      return accountData.timeslotIds;
    },
    find(predicate) {
      const node = nodes(tree).find(predicate);
      assert.ok(node, "Expected page control was rendered");
      return node;
    },
    all(predicate) {
      return nodes(tree).filter(predicate);
    },
    selectedSubjects() {
      return this.all((node) =>
        node.props["aria-label"]?.startsWith("Ukloni "),
      ).map((node) => node.props["aria-label"].slice("Ukloni ".length));
    },
    aria(label) {
      return this.find((node) => node.props["aria-label"] === label);
    },
    year(label) {
      this.invoke(
        this.find((node) => node.type === "button" && text(node) === label),
        "onClick",
      );
    },
    program(value) {
      this.invoke(
        this.find((node) => node.type === controls.Select),
        "onValueChange",
        value,
      );
    },
    selector(subject, type = "V") {
      return this.find(
        (node) =>
          node.type === PageSelector &&
          node.props.title ===
            `${subject.name}: ${type === "P" ? "predavanje" : "vežbe"}`,
      );
    },
    invoke(node, handler, ...args) {
      withWindow(() => node.props[handler](...args));
      render();
    },
    button(label) {
      return this.find(
        (node) => node.type === controls.Button && text(node).trim() === label,
      );
    },
    slots() {
      return this.find((node) => node.type === PageCalendar).props.slots;
    },
    warning() {
      return this.find((node) => node.type === controls.Dialog);
    },
  };
}

test("TerminiPage exposes multi props only for detected multi-session subjects and types", () => {
  const ui = pageHarness("src/app/termini/page.tsx", {
    subjects: [theorySubject, subject],
  });
  const theory = ui.selector(theorySubject).props;
  assert.deepEqual(theory.values, []);
  assert.equal(typeof theory.onSaveMultiple, "function");
  assert.equal(theory.value, null);
  for (const [selectedSubject, type] of [
    [theorySubject, "P"],
    [subject, "P"],
    [subject, "V"],
  ]) {
    const regular = ui.selector(selectedSubject, type).props;
    assert.equal(regular.values, undefined);
    assert.equal(regular.onSaveMultiple, undefined);
    assert.equal(typeof regular.onSave, "function");
  }
});

test("TerminiPage reuses indexed terms and weekly metadata across selection changes", () => {
  const ui = pageHarness("src/app/termini/page.tsx");
  const indexed = ui.indexedCatalog.get(theorySubject.name).V;
  const before = ui.selector(theorySubject).props;
  assert.strictEqual(before.termini, indexed.terms);
  assert.strictEqual(before.weeklySessions, indexed.weeklySessions);
  ui.invoke(ui.selector(theorySubject), "onSaveMultiple", theoryPair);
  const after = ui.selector(theorySubject).props;
  assert.strictEqual(after.termini, before.termini);
  assert.strictEqual(after.weeklySessions, before.weeklySessions);
  for (const slot of ui.slots()) {
    assert.strictEqual(slot.term, indexed.byKey.get(termKey(slot.term)));
  }
  ui.rerender();
  assert.strictEqual(ui.selector(theorySubject).props.termini, indexed.terms);
});

test("TerminiPage saves and reloads both chosen sessions by database ID", () => {
  assert.equal(theoryPair.length, 2);
  const ui = pageHarness("src/app/termini/page.tsx");
  ui.invoke(ui.selector(theorySubject), "onSaveMultiple", theoryPair);
  assert.deepEqual(ui.selector(theorySubject).props.values, dbTheoryPair);
  assert.deepEqual(
    ui.slots().map((slot) => slot.term),
    dbTheoryPair,
  );
  const save = ui.button("Sačuvaj raspored");
  assert.equal(save.props.disabled, false);
  ui.invoke(save, "onClick");
  assert.deepEqual(
    ui.saved,
    dbTheoryPair.map((term) => term.id),
  );
  assert.deepEqual(ui.saves[0].input, {
    timeslotIds: ui.saved,
    expectedRevision: 7,
    expectedScheduleVersion: 0,
  });
  assert.deepEqual(ui.pushes, ["/"]);
  const restored = pageHarness("src/app/termini/page.tsx", {
    accountQuery: { data: ui.accountData },
  });
  assert.deepEqual(restored.selector(theorySubject).props.values, dbTheoryPair);
  assert.deepEqual(
    restored.slots().map((slot) => slot.term),
    dbTheoryPair,
  );
});

test("TerminiPage rejects oversized drafts and requires old oversized saves to be corrected", () => {
  const extra = catalog.year3[theorySubject.name].V.find(
    (term) => term.grupe.includes("C7") && term.od === "09:15",
  );
  const tooMany = [...theoryPair, extra];
  const ui = pageHarness("src/app/termini/page.tsx");
  ui.invoke(ui.selector(theorySubject), "onSaveMultiple", tooMany);
  assert.deepEqual(ui.slots(), []);
  const restored = pageHarness("src/app/termini/page.tsx", {
    selections: { [theoryKey]: { V: tooMany.map(termKey) } },
  });
  assert.equal(restored.button("Sačuvaj raspored").props.disabled, true);
  restored.invoke(restored.button("Sačuvaj raspored"), "onClick");
  assert.deepEqual(restored.pushes, []);
  assert.equal(restored.slots().length, 3);
  restored.invoke(
    restored.selector(theorySubject),
    "onSaveMultiple",
    theoryPair,
  );
  assert.equal(restored.button("Sačuvaj raspored").props.disabled, false);
  restored.invoke(restored.button("Sačuvaj raspored"), "onClick");
  assert.deepEqual(
    restored.saved,
    dbTheoryPair.map((term) => term.id),
  );
});

test("TerminiPage restores database choices without selecting related sessions", () => {
  const ui = pageHarness("src/app/termini/page.tsx", {
    subjects: [theorySubject, subject],
    selections: {
      "year3:Teorija sistema": { V: termKey(theoryPair[0]) },
      "year1:Menadžment": { V: termKey(options[1]) },
    },
  });
  assert.deepEqual(ui.selector(theorySubject).props.values, [dbTheoryPair[0]]);
  assert.deepEqual(ui.selector(theorySubject).props.value, dbTheoryPair[0]);
  assert.deepEqual(
    ui.selector(subject).props.value,
    dbTerm(subject.name, "V", options[1]),
  );
  assert.equal(ui.slots().length, 2);
  ui.invoke(ui.button("Sačuvaj raspored"), "onClick");
  assert.deepEqual(
    new Set(ui.saved),
    new Set([dbTheoryPair[0].id, slotId(subject.name, "V", options[1])]),
  );
});

test("TerminiPage removes only the conflicting member of a saved session array", () => {
  const conflict = {
    ...theoryPair[0],
    sala: "conflict room",
    grupe: ["regular"],
  };
  const terms = {
    year3: { [theorySubject.name]: { V: theoryPair } },
    year1: { [subject.name]: { V: [conflict] } },
  };
  const ui = pageHarness("src/app/termini/page.tsx", {
    subjects: [theorySubject, subject],
    terms,
    selections: { [theoryKey]: { V: theoryPair.map(termKey) } },
  });
  assert.equal(ui.selector(subject).props.isOccupied(conflict), true);
  ui.invoke(ui.selector(subject), "onSave", conflict);
  assert.equal(ui.warning().props.open, true);
  const pending = nodes(ui.warning()).filter((node) => node.type === "li");
  assert.equal(pending.length, 1);
  assert.ok(
    text(pending[0]).includes(`${theoryPair[0].od}-${theoryPair[0].do}`),
  );
  ui.invoke(ui.button("Ukloni prethodne"), "onClick");
  assert.equal(ui.warning().props.open, false);
  assert.deepEqual(ui.selector(theorySubject).props.values, [dbTheoryPair[1]]);
  assert.deepEqual(
    ui.slots().map((slot) => slot.term),
    [dbTheoryPair[1], dbTerm(subject.name, "V", conflict)],
  );
  ui.invoke(ui.button("Sačuvaj raspored"), "onClick");
  assert.deepEqual(
    new Set(ui.saved),
    new Set([dbTheoryPair[1].id, slotId(subject.name, "V", conflict)]),
  );
});

test("Home resolves all saved timeslot IDs to the account schedule", () => {
  const ui = pageHarness("src/app/page.tsx", {
    subjects: [theorySubject, subject],
    selections: {
      [theoryKey]: { V: theoryPair.map(termKey) },
      [subject.name]: { V: termKey(options[1]) },
    },
  });
  const schedule = ui.find((node) => node.type === Schedule).props;
  assert.equal(schedule.label, "Izabrani raspored");
  assert.deepEqual(schedule.group, { group: "account", year: null });
  const events = Object.values(schedule.raspored.account).flat();
  assert.equal(events.length, 3);
  for (const term of theoryPair) {
    assert.deepEqual(
      events.find((event) => termKey(event) === termKey(term)),
      {
        ...dbTerm(theorySubject.name, "V", term),
        predmet: theorySubject.name,
        tip: "V",
      },
    );
  }
  assert.deepEqual(
    events.find((event) => event.predmet === subject.name),
    {
      ...dbTerm(subject.name, "V", options[1]),
      predmet: subject.name,
      tip: "V",
    },
  );
});

const crossYearName = "Upravljački sistemi";
const crossYearSubjects = [
  { year: "year3", name: crossYearName },
  { year: "year4", name: crossYearName },
];

test("subject identity and stored subjects deduplicate names keeping the first source year", () => {
  for (const subject of crossYearSubjects) {
    assert.equal(storage.subjectKey(subject), crossYearName);
  }
  assert.deepEqual(
    storage.parseStoredSubjects(
      JSON.stringify([
        ...crossYearSubjects,
        crossYearName,
        null,
        {},
        { year: 3, name: "bad" },
        "",
        "   ",
        subject,
        subject.name,
      ]),
    ),
    [crossYearSubjects[0], subject],
  );
  assert.deepEqual(
    storage.parseStoredSubjects(
      JSON.stringify([crossYearName, ...crossYearSubjects]),
      "year2",
    ),
    [{ year: "year2", name: crossYearName }],
  );
  for (const invalid of [null, "bad", "{}", "4"]) {
    assert.deepEqual(storage.parseStoredSubjects(invalid), []);
  }
});

test("getSubjectTerms unions actual cross-year terms and merges groups without mutating the catalog", () => {
  const actual = storage.getSubjectTerms(catalog, crossYearName);
  assert.equal(actual.P.length, 1);
  assert.equal(actual.V.length, 3);
  for (const type of ["P", "V"]) {
    const source = crossYearSubjects.flatMap(
      (subject) => catalog[subject.year][crossYearName][type],
    );
    assert.deepEqual(actual[type].map(termKey), [
      ...new Set(source.map(termKey)),
    ]);
  }
  const injected = {
    year1: { Shared: { P: [shortSession], V: [longSession] } },
    year4: {
      Shared: {
        P: [
          { ...shortSession, grupe: ["G2", "G1"] },
          { ...shortSession, sala: "other" },
        ],
        V: [{ ...longSession, grupe: ["G3"] }, regularSession],
      },
    },
  };
  const original = JSON.stringify(injected);
  assert.deepEqual(storage.getSubjectTerms(injected, "Shared"), {
    P: [
      { ...shortSession, grupe: ["G1", "G2"] },
      { ...shortSession, sala: "other" },
    ],
    V: [{ ...longSession, grupe: ["G1", "G3"] }, regularSession],
  });
  assert.equal(JSON.stringify(injected), original);
  assert.deepEqual(storage.getSubjectTerms(injected, "missing"), {
    P: [],
    V: [],
  });
});

test("TerminiPage restores duplicate cross-year subjects as one section without self conflicts", () => {
  const lecture = catalog.year3[crossYearName].P[0];
  const ui = pageHarness("src/app/termini/page.tsx", {
    subjects: crossYearSubjects,
    selections: {
      [`year3:${crossYearName}`]: { P: termKey(lecture) },
      [`year4:${crossYearName}`]: { P: termKey(lecture) },
    },
  });
  assert.equal(ui.all((node) => node.type === "section").length, 1);
  assert.equal(ui.all((node) => node.type === PageSelector).length, 2);
  const terms = storage.getSubjectTerms(catalog, crossYearName);
  for (const type of ["P", "V"]) {
    assert.deepEqual(
      ui.selector(crossYearSubjects[0], type).props.termini,
      terms[type].map((term) => dbTerm(crossYearName, type, term)),
    );
  }
  assert.equal(ui.slots().length, 1);
  assert.equal(
    ui.selector(crossYearSubjects[0], "P").props.isOccupied(lecture),
    false,
  );
  assert.equal(ui.all((node) => node.props.role === "img").length, 0);
  ui.invoke(ui.selector(crossYearSubjects[0], "P"), "onSave", lecture);
  assert.equal(ui.warning().props.open, false);
  ui.invoke(ui.button("Sačuvaj raspored"), "onClick");
  assert.deepEqual(ui.saved, [slotId(crossYearName, "P", lecture)]);
});

test("TerminiPage and Home resolve saved IDs independently of legacy source years", () => {
  for (const [selected, oldYear] of [
    [crossYearSubjects[0], "year4"],
    [crossYearSubjects[1], "year3"],
    [{ year: "year2", name: crossYearName }, "year3"],
  ]) {
    const term = catalog[oldYear][crossYearName].V[0];
    const selections = {
      [`${oldYear}:${crossYearName}`]: { V: termKey(term) },
    };
    const ui = pageHarness("src/app/termini/page.tsx", {
      subjects: [selected],
      selections,
    });
    assert.deepEqual(
      ui.selector(selected).props.value,
      dbTerm(crossYearName, "V", term),
    );
    assert.deepEqual(
      ui.slots().map((slot) => slot.term),
      [dbTerm(crossYearName, "V", term)],
    );
    ui.invoke(ui.button("Sačuvaj raspored"), "onClick");
    assert.deepEqual(ui.saved, [slotId(crossYearName, "V", term)]);
    const home = pageHarness("src/app/page.tsx", {
      subjects: [selected],
      selections,
    });
    const events = Object.values(
      home.find((node) => node.type === Schedule).props.raspored.account,
    ).flat();
    assert.deepEqual(events, [
      { ...dbTerm(crossYearName, "V", term), predmet: crossYearName, tip: "V" },
    ]);
  }
});

test("Home emits one event for duplicate saved cross-year subject picks", () => {
  const term = catalog.year3[crossYearName].P[0];
  const ui = pageHarness("src/app/page.tsx", {
    subjects: crossYearSubjects,
    selections: {
      [crossYearName]: { P: [termKey(term), termKey(term)] },
      [`year3:${crossYearName}`]: { P: termKey(term) },
      [`year4:${crossYearName}`]: { P: termKey(term) },
    },
  });
  const events = Object.values(
    ui.find((node) => node.type === Schedule).props.raspored.account,
  ).flat();
  assert.deepEqual(events, [
    { ...dbTerm(crossYearName, "P", term), predmet: crossYearName, tip: "P" },
  ]);
});

test("PredmetiPage filters never add subjects until an explicit catalog click", () => {
  const ui = pageHarness("src/app/predmeti/page.tsx", { subjects: [] });
  assert.equal(ui.button("Sačuvaj i nastavi").props.disabled, true);
  ui.program("ISiT");
  assert.deepEqual(ui.selectedSubjects(), []);
  assert.equal(ui.aria(`Dodaj ${subject.name}`).props.disabled, false);
  ui.invoke(ui.aria(`Dodaj ${subject.name}`), "onClick");
  assert.deepEqual(ui.selectedSubjects(), [subject.name]);
  ui.program("MiO");
  assert.deepEqual(ui.selectedSubjects(), [subject.name]);
  ui.invoke(ui.aria("Pretraži predmete"), "onChange", {
    target: { value: "no match" },
  });
  assert.deepEqual(ui.selectedSubjects(), [subject.name]);
  assert.equal(
    ui.all((node) => node.props["aria-label"]?.startsWith("Dodaj ")).length,
    0,
  );
  ui.year("II godina");
  ui.program("ISiT");
  assert.deepEqual(ui.selectedSubjects(), [subject.name]);
  ui.invoke(ui.aria("Dodaj Marketing"), "onClick");
  ui.year("I godina");
  assert.deepEqual(ui.selectedSubjects(), [subject.name, "Marketing"]);
  assert.equal(
    ui.find((node) => node.type === controls.Select).props.value,
    "MiO",
  );
  ui.invoke(ui.button("Sačuvaj i nastavi"), "onClick");
  assert.deepEqual(ui.saves[0].input, {
    subjectIds: [`subject:${subject.name}`, "subject:Marketing"],
    catalogYear: 1,
    programFilters: [
      { year: 1, programId: "MiO" },
      { year: 2, programId: "ISiT" },
    ],
    expectedRevision: 7,
  });
  assert.deepEqual(ui.pushes, ["/termini"]);
});

test("PredmetiPage cannot readd a name across years; upper-list removal enables add", () => {
  const ui = pageHarness("src/app/predmeti/page.tsx", { subjects: [] });
  ui.year("III godina");
  ui.program("Operacioni menadžment");
  ui.invoke(ui.aria(`Dodaj ${crossYearName}`), "onClick");
  ui.year("IV godina");
  ui.program("Lin organizacija poslovanja");
  assert.equal(ui.aria(`Dodaj ${crossYearName}`).props.disabled, true);
  ui.invoke(ui.aria(`Dodaj ${crossYearName}`), "onClick");
  assert.deepEqual(ui.selectedSubjects(), [crossYearName]);
  const selectedSection = ui.find(
    (node) => node.props["aria-labelledby"] === "selected-subjects-heading",
  );
  assert.ok(
    nodes(selectedSection).some(
      (node) => node.props["aria-label"] === `Ukloni ${crossYearName}`,
    ),
  );
  ui.invoke(ui.aria(`Ukloni ${crossYearName}`), "onClick");
  assert.deepEqual(ui.selectedSubjects(), []);
  assert.equal(ui.aria(`Dodaj ${crossYearName}`).props.disabled, false);
  ui.invoke(ui.aria(`Dodaj ${crossYearName}`), "onClick");
  ui.invoke(ui.button("Sačuvaj i nastavi"), "onClick");
  assert.deepEqual(ui.accountData.subjectIds, [`subject:${crossYearName}`]);
});

test("PredmetiPage saves subject IDs and accepts server-pruned timeslots", () => {
  const lecture = termKey(catalog.year3[crossYearName].P[0]);
  const exercise = termKey(catalog.year4[crossYearName].V[0]);
  const selections = {
    [`year4:${crossYearName}`]: { P: "other lecture", V: exercise },
    [`year3:${crossYearName}`]: { P: lecture },
    [subject.name]: { V: termKey(options[0]) },
    Marketing: { P: "removed" },
  };
  const ui = pageHarness("src/app/predmeti/page.tsx", {
    subjects: [
      ...crossYearSubjects,
      subject,
      { year: "year2", name: "Marketing" },
    ],
    selections,
  });
  assert.deepEqual(ui.selectedSubjects(), [
    crossYearName,
    subject.name,
    "Marketing",
  ]);
  ui.invoke(ui.aria("Ukloni Marketing"), "onClick");
  ui.year("II godina");
  ui.program("MiO");
  ui.invoke(ui.button("Sačuvaj i nastavi"), "onClick");
  assert.deepEqual(ui.accountData.subjectIds, [
    `subject:${crossYearName}`,
    `subject:${subject.name}`,
  ]);
  assert.deepEqual(
    new Set(ui.saved),
    new Set([
      `slot:${crossYearName}:P:${lecture}`,
      `slot:${crossYearName}:V:${exercise}`,
      slotId(subject.name, "V", options[0]),
    ]),
  );
  assert.deepEqual(selections[`year3:${crossYearName}`], { P: lecture });
});

test("Home displays a schedule skeleton until the account query has loaded", () => {
  const accountQuery = { data: undefined };
  const ui = pageHarness("src/app/page.tsx", {
    accountQuery,
    selections: { [theoryKey]: { V: theoryPair.map(termKey) } },
  });
  const initialNodes = nodes(ui.initialTree);
  assert.equal(
    initialNodes.filter((node) => node.props.role === "status").length,
    1,
  );
  assert.equal(initialNodes.filter((node) => node.type === Schedule).length, 0);
  accountQuery.data = ui.accountData;
  ui.rerender();
  assert.equal(ui.all((node) => node.props.role === "status").length, 0);
  assert.equal(ui.all((node) => node.type === Schedule).length, 1);
});

test("Home waits for account loading before replacing its skeleton with the schedule", () => {
  const auth = { isLoaded: false, isSignedIn: undefined };
  const ui = pageHarness("src/app/page.tsx", {
    auth,
    selections: { [theoryKey]: { V: theoryPair.map(termKey) } },
  });
  assert.equal(ui.aria("Učitavanje rasporeda").props.role, "status");
  assert.equal(ui.all((node) => node.type === Schedule).length, 0);
  assert.equal(
    ui.all((node) => node.props["aria-labelledby"] === "setup-title").length,
    0,
  );
  auth.isLoaded = true;
  auth.isSignedIn = true;
  ui.rerender();
  assert.equal(ui.all((node) => node.props.role === "status").length, 0);
  assert.equal(ui.all((node) => node.type === Schedule).length, 1);
});

test("Home replaces the skeleton with group setup when the loaded account is signed out", () => {
  const auth = { isLoaded: false, isSignedIn: false };
  const ui = pageHarness("src/app/page.tsx", { auth });
  assert.equal(ui.all((node) => node.props.role === "status").length, 1);
  auth.isLoaded = true;
  ui.rerender();
  assert.equal(ui.all((node) => node.props.role === "status").length, 0);
  assert.ok(ui.button("Podesi pretragu"));
});

for (const isSignedIn of [true, false]) {
  const accountState = isSignedIn ? "signed in" : "signed out";

  test(`Home search mode waits for auth then shows public setup when ${accountState}`, () => {
    const auth = { isLoaded: false, isSignedIn: undefined };
    const ui = pageHarness("src/app/page.tsx", {
      mode: "search",
      auth,
      selections: { [theoryKey]: { V: theoryPair.map(termKey) } },
    });
    assert.equal(
      nodes(ui.initialTree).filter((node) => node.props.role === "status")
        .length,
      1,
    );
    for (const resolved of [true]) {
      if (resolved) {
        auth.isLoaded = true;
        auth.isSignedIn = isSignedIn;
        ui.rerender();
      }
      assert.equal(ui.all((node) => node.props.role === "status").length, 0);
      assert.ok(ui.button("Podesi pretragu"));
      assert.equal(ui.all((node) => node.type === Schedule).length, 0);
      assert.equal(
        ui.all((node) => node.props["aria-labelledby"] === "setup-title")
          .length,
        0,
      );
    }
  });

  test(`Home search mode renders the URL group during auth loading and remains available when ${accountState}`, () => {
    const auth = { isLoaded: false, isSignedIn: undefined };
    const groupSchedules = {
      G1: {
        Ponedeljak: [{ ...shortSession, predmet: subject.name, tip: "P" }],
      },
    };
    const ui = pageHarness("src/app/page.tsx", {
      mode: "search",
      auth,
      groupSchedules,
      group: { id: "group:G1", year: 1, name: "G1" },
    });
    const initialNodes = nodes(ui.initialTree);
    assert.equal(
      initialNodes.filter((node) => node.props.role === "status").length,
      0,
    );
    assert.equal(
      initialNodes.filter((node) => node.type === Schedule).length,
      1,
    );
    auth.isLoaded = true;
    auth.isSignedIn = isSignedIn;
    ui.rerender();
    const schedule = ui.find((node) => node.type === Schedule).props;
    assert.deepEqual(schedule.group, {
      group: "G1",
      year: "year1",
    });
    assert.deepEqual(schedule.raspored, groupSchedules);
    assert.equal(schedule.label, undefined);
    for (const resolved of [true]) {
      if (resolved) {
        auth.isLoaded = true;
        auth.isSignedIn = isSignedIn;
        ui.rerender();
      }
      assert.equal(ui.all((node) => node.props.role === "status").length, 0);
      assert.equal(ui.all((node) => node.type === Schedule).length, 1);
      assert.deepEqual(
        ui.find((node) => node.type === Schedule).props,
        schedule,
      );
      assert.equal(
        ui.all((node) => node.props["aria-labelledby"] === "setup-title")
          .length,
        0,
      );
      assert.equal(
        ui.all(
          (node) =>
            node.type === controls.Button && text(node) === "Podesi pretragu",
        ).length,
        0,
      );
    }
  });
}

function guestHome(scheduleQuery, overrides = {}) {
  return pageHarness("src/app/page.tsx", {
    auth: { isLoaded: true, isSignedIn: false },
    scheduleQuery,
    group: { name: "C1", year: 3 },
    ...overrides,
  });
}

test("Home fetches the guest schedule using URL-derived year and group", () => {
  const schedule = {
    Ponedeljak: [
      {
        id: "db-slot",
        predmet: "DB subject",
        tip: "V",
        od: "08:15",
        do: "09:00",
        sala: "13",
        grupe: ["C1"],
      },
    ],
  };
  const ui = guestHome({ data: { group: "C1", year: 3, schedule } });
  const enabled = ui.scheduleQueries.filter((query) => query.options.enabled);
  assert.ok(enabled.length > 0);
  assert.deepEqual(enabled[0].input, { year: 3, group: "C1" });
  assert.deepEqual(ui.find((node) => node.type === Schedule).props.raspored, {
    C1: schedule,
  });
  assert.equal(ui.all((node) => node.props.role === "status").length, 0);
});

test("Home keeps the loading skeleton until the database schedule arrives", () => {
  const query = { data: undefined };
  const ui = guestHome(query);
  assert.equal(ui.aria("Učitavanje rasporeda").props.role, "status");
  assert.equal(ui.all((node) => node.type === Schedule).length, 0);
  assert.equal(ui.all((node) => node.props.role === "alert").length, 0);
  query.data = { group: "C1", year: 3, schedule: { Utorak: [] } };
  ui.rerender();
  assert.equal(ui.all((node) => node.props.role === "status").length, 0);
  assert.deepEqual(ui.find((node) => node.type === Schedule).props.raspored, {
    C1: { Utorak: [] },
  });
});

for (const code of ["NOT_FOUND", "INTERNAL_SERVER_ERROR"]) {
  test(`Home shows ${code} as a recoverable error, not a free day`, () => {
    const ui = guestHome({
      data: undefined,
      isError: true,
      error: { data: { code } },
    });
    assert.equal(ui.all((node) => node.type === Schedule).length, 0);
    assert.equal(ui.all((node) => node.props.role === "status").length, 0);
    assert.equal(ui.all((node) => node.props.role === "alert").length, 1);
    assert.ok(ui.button("Podesi pretragu"));
    ui.invoke(ui.button("Pokušaj ponovo"), "onClick");
    assert.equal(ui.retries, 1);
  });
}

test("Home does not fetch a schedule until a group is configured", () => {
  const ui = guestHome(undefined, { group: null });
  assert.ok(ui.button("Podesi pretragu"));
  assert.equal(
    ui.scheduleQueries.some((query) => query.options.enabled),
    false,
  );
});

test("Home fetches signed-in group search from the database too", () => {
  const groupSchedules = { C1: { Ponedeljak: [] } };
  const ui = guestHome(undefined, {
    auth: { isLoaded: true, isSignedIn: true },
    mode: "search",
    groupSchedules,
  });
  assert.equal(
    ui.scheduleQueries.some((query) => query.options.enabled),
    true,
  );
  assert.deepEqual(
    ui.find((node) => node.type === Schedule).props.raspored,
    groupSchedules,
  );
});

test("Home resolves signed-in account IDs from the catalog and disables the public query", () => {
  const ui = pageHarness("src/app/page.tsx", {
    selections: { [theoryKey]: { V: theoryPair.map(termKey) } },
  });
  assert.equal(
    ui.scheduleQueries.some((query) => query.options.enabled),
    false,
  );
  assert.equal(
    ui.find((node) => node.type === Schedule).props.label,
    "Izabrani raspored",
  );
});

for (const file of ["src/app/predmeti/page.tsx", "src/app/termini/page.tsx"]) {
  const saveLabel = file.includes("predmeti")
    ? "Sačuvaj i nastavi"
    : "Sačuvaj raspored";
  test(`${file} gates editing on auth, account and catalog readiness`, () => {
    const auth = { isLoaded: false, isSignedIn: false };
    const accountQuery = { data: undefined };
    const catalogQuery = { data: undefined };
    const ui = pageHarness(file, { auth, accountQuery, catalogQuery });
    assert.equal(ui.all((node) => node.props.role === "status").length, 1);
    assert.equal(ui.catalogQueries.at(-1).options.enabled, false);
    auth.isLoaded = true;
    ui.rerender();
    assert.ok(ui.button("Prijava"));
    assert.equal(
      ui.all(
        (node) => node.type === controls.Button && text(node) === saveLabel,
      ).length,
      0,
    );
    auth.isSignedIn = true;
    ui.rerender();
    assert.equal(ui.all((node) => node.props.role === "status").length, 1);
    assert.deepEqual(ui.catalogQueries.at(-1), {
      input: undefined,
      options: { enabled: true, staleTime: 300000, retry: false },
    });
    accountQuery.data = ui.accountData;
    ui.rerender();
    assert.equal(ui.all((node) => node.props.role === "status").length, 1);
    catalogQuery.data = ui.catalogData;
    ui.rerender();
    assert.ok(ui.button(saveLabel));
  });

  test(`${file} query errors offer a retry instead of an empty editor`, () => {
    const ui = pageHarness(file, {
      catalogQuery: { data: undefined, isError: true },
    });
    assert.equal(ui.all((node) => node.props.role === "alert").length, 1);
    ui.invoke(ui.button("Pokušaj ponovo"), "onClick");
    assert.equal(ui.retries, 2);
  });

  test(`${file} keeps a stale revision and preserves drafts when server subjects change`, () => {
    const accountQuery = {};
    const catalogQuery = {};
    const ui = pageHarness(file, { accountQuery, catalogQuery });
    if (file.includes("predmeti")) {
      ui.year("I godina");
      ui.program("ISiT");
      ui.invoke(ui.aria(`Dodaj ${subject.name}`), "onClick");
    } else ui.invoke(ui.selector(theorySubject), "onSaveMultiple", theoryPair);
    accountQuery.data = {
      ...ui.accountData,
      revision: 99,
      subjectIds: [],
      timeslotIds: [],
    };
    catalogQuery.data = {
      ...ui.catalogData,
      subjects: ui.catalogData.subjects.map((subject) => ({ ...subject })),
    };
    ui.rerender();
    if (file.includes("predmeti"))
      assert.deepEqual(ui.selectedSubjects(), [
        theorySubject.name,
        subject.name,
      ]);
    else assert.equal(ui.slots().length, 2);
    ui.invoke(ui.button(saveLabel), "onClick");
    assert.equal(ui.saves[0].input.expectedRevision, 7);
  });

  test(`${file} rebases theme-only revisions with normalized baseline order without replacing drafts`, () => {
    const initial = {
      revision: 7,
      preferences: {
        mode: "account",
        group: null,
        catalogYear: 1,
        programFilters: [
          { year: 1, programId: "ISiT" },
          { year: 3, programId: "ISiT" },
        ],
        theme: "system",
      },
      subjectIds: [`subject:${theorySubject.name}`, `subject:${subject.name}`],
      timeslotIds: dbTheoryPair.map((term) => term.id),
    };
    const accountQuery = { data: initial };
    const ui = pageHarness(file, { accountQuery });
    if (file.includes("predmeti")) {
      ui.invoke(ui.aria(`Ukloni ${subject.name}`), "onClick");
      ui.year("II godina");
      ui.program("MiO");
    } else
      ui.invoke(ui.selector(theorySubject), "onSaveMultiple", [theoryPair[0]]);
    accountQuery.data = {
      ...initial,
      revision: 99,
      subjectIds: file.includes("predmeti")
        ? initial.subjectIds
        : [...initial.subjectIds].reverse(),
      timeslotIds: [...initial.timeslotIds].reverse(),
      preferences: {
        ...initial.preferences,
        theme: "dark",
        programFilters: [...initial.preferences.programFilters].reverse(),
      },
    };
    ui.rerender();
    if (file.includes("predmeti")) {
      assert.deepEqual(ui.selectedSubjects(), [theorySubject.name]);
      assert.equal(
        ui.find((node) => node.type === controls.Select).props.value,
        "MiO",
      );
    } else
      assert.deepEqual(
        ui.slots().map((slot) => slot.term.id),
        [dbTheoryPair[0].id],
      );
    ui.invoke(ui.button(saveLabel), "onClick");
    assert.equal(ui.saves[0].input.expectedRevision, 99);
    if (file.includes("predmeti")) {
      assert.equal(ui.saves[0].input.catalogYear, 2);
      assert.deepEqual(ui.saves[0].input.programFilters, [
        { year: 1, programId: "ISiT" },
        { year: 2, programId: "MiO" },
        { year: 3, programId: "ISiT" },
      ]);
    }
    assert.equal(initial.revision, 7);
    assert.deepEqual(initial.subjectIds, [
      `subject:${theorySubject.name}`,
      `subject:${subject.name}`,
    ]);
  });

  test(`${file} rebases unrelated mode/group preference changes without replacing drafts`, () => {
    const accountQuery = {};
    const ui = pageHarness(file, { accountQuery });
    if (file.includes("predmeti")) {
      ui.year("II godina");
      ui.program("MiO");
      ui.invoke(ui.aria("Dodaj Marketing"), "onClick");
    } else ui.invoke(ui.selector(theorySubject), "onSaveMultiple", theoryPair);
    accountQuery.data = {
      ...ui.accountData,
      revision: 8,
      preferences: {
        ...ui.accountData.preferences,
        mode: "search",
        group: { id: "group:C1", name: "C1", year: 3 },
      },
    };
    ui.rerender();
    ui.invoke(ui.button(saveLabel), "onClick");
    assert.equal(ui.saves[0].input.expectedRevision, 8);
    if (file.includes("predmeti"))
      assert.deepEqual(ui.saves[0].input.subjectIds, [
        `subject:${theorySubject.name}`,
        "subject:Marketing",
      ]);
    else
      assert.deepEqual(
        ui.saves[0].input.timeslotIds,
        dbTheoryPair.map((term) => term.id),
      );
  });

  const relevantChanges = file.includes("predmeti")
    ? ["catalogYear", "programFilters"]
    : ["timeslotIds"];
  for (const field of relevantChanges) {
    test(`${file} does not rebase when server ${field} changes`, () => {
      const accountQuery = {};
      const ui = pageHarness(file, { accountQuery, mutationError: true });
      if (file.includes("termini"))
        ui.invoke(ui.selector(theorySubject), "onSaveMultiple", theoryPair);
      const data = ui.accountData;
      accountQuery.data =
        field === "timeslotIds"
          ? { ...data, revision: 99, timeslotIds: [dbTheoryPair[1].id] }
          : {
              ...data,
              revision: 99,
              preferences: {
                ...data.preferences,
                [field]:
                  field === "catalogYear"
                    ? 2
                    : [{ year: 1, programId: "ISiT" }],
              },
            };
      ui.rerender();
      ui.invoke(ui.button(saveLabel), "onClick");
      assert.equal(ui.saves[0].input.expectedRevision, 7);
      assert.deepEqual(ui.pushes, []);
      if (file.includes("termini")) assert.equal(ui.slots().length, 2);
      else assert.deepEqual(ui.selectedSubjects(), [theorySubject.name]);
    });
  }

  test(`${file} save failures retain edits, do not navigate and can be retried`, () => {
    const ui = pageHarness(file, { mutationError: true });
    if (file.includes("termini"))
      ui.invoke(ui.selector(theorySubject), "onSaveMultiple", theoryPair);
    ui.invoke(ui.button(saveLabel), "onClick");
    assert.deepEqual(ui.pushes, []);
    assert.equal(ui.accountData.revision, 7);
    assert.equal(ui.all((node) => node.props.role === "alert").length, 1);
    ui.invoke(ui.button("Ponovo učitaj i odbaci izmene"), "onClick");
    assert.equal(ui.retries, 1);
    ui.failSave(false);
    ui.invoke(ui.button(saveLabel), "onClick");
    assert.equal(ui.accountData.revision, 8);
    assert.equal(ui.pushes.length, 1);
  });

  test(`${file} disables pending saves and suppresses old-identity navigation after unmount`, () => {
    const ui = pageHarness(file, { deferSave: true });
    if (file.includes("termini"))
      ui.invoke(ui.selector(theorySubject), "onSaveMultiple", theoryPair);
    ui.invoke(ui.button(saveLabel), "onClick");
    assert.equal(ui.button(saveLabel).props.disabled, true);
    assert.equal(
      ui.find((node) => node.type === "fieldset").props.disabled,
      true,
    );
    ui.invoke(ui.button(saveLabel), "onClick");
    assert.equal(ui.saves.length, 1);
    ui.unmount();
    const nextIdentity = pageHarness(file, { subjects: [] });
    ui.completeSave();
    assert.deepEqual(ui.pushes, []);
    assert.deepEqual(nextIdentity.accountData.subjectIds, []);
    assert.deepEqual(nextIdentity.accountData.timeslotIds, []);
  });
}

test("PredmetiPage can clear all persisted subjects and return home", () => {
  const ui = pageHarness("src/app/predmeti/page.tsx");
  ui.invoke(ui.aria(`Ukloni ${theorySubject.name}`), "onClick");
  assert.equal(ui.button("Sačuvaj i nastavi").props.disabled, false);
  ui.invoke(ui.button("Sačuvaj i nastavi"), "onClick");
  assert.deepEqual(ui.saves[0].input.subjectIds, []);
  assert.deepEqual(ui.pushes, ["/"]);
});

test("PredmetiPage does not overwrite subject order changed by another editor", () => {
  const accountQuery = {};
  const ui = pageHarness("src/app/predmeti/page.tsx", {
    subjects: [theorySubject, subject],
    accountQuery,
  });
  accountQuery.data = {
    ...ui.accountData,
    revision: 99,
    subjectIds: [...ui.accountData.subjectIds].reverse(),
  };
  ui.rerender();
  ui.invoke(ui.button("Sačuvaj i nastavi"), "onClick");
  assert.equal(ui.saves[0].input.expectedRevision, 7);
});

test("TerminiPage can clear all saved owned timeslots and persist an empty selection", () => {
  const ui = pageHarness("src/app/termini/page.tsx", {
    selections: { [theoryKey]: { V: theoryPair.map(termKey) } },
  });
  assert.deepEqual(
    ui.slots().map((slot) => slot.term.id),
    dbTheoryPair.map((term) => term.id),
  );
  ui.invoke(ui.selector(theorySubject), "onSaveMultiple", []);
  assert.deepEqual(ui.slots(), []);
  assert.equal(ui.button("Sačuvaj raspored").props.disabled, false);
  ui.invoke(ui.button("Sačuvaj raspored"), "onClick");
  assert.deepEqual(ui.saves[0].input, { timeslotIds: [], expectedRevision: 7, expectedScheduleVersion: 0 });
  assert.deepEqual(ui.saved, []);
  assert.deepEqual(ui.pushes, ["/"]);
});

test("TerminiPage onboarding still requires a valid term after adding and clearing a draft", () => {
  const ui = pageHarness("src/app/termini/page.tsx");
  assert.equal(ui.button("Sačuvaj raspored").props.disabled, true);
  ui.invoke(ui.button("Sačuvaj raspored"), "onClick");
  ui.invoke(ui.selector(theorySubject), "onSaveMultiple", theoryPair);
  assert.equal(ui.button("Sačuvaj raspored").props.disabled, false);
  ui.invoke(ui.selector(theorySubject), "onSaveMultiple", []);
  assert.equal(ui.button("Sačuvaj raspored").props.disabled, true);
  ui.invoke(ui.button("Sačuvaj raspored"), "onClick");
  assert.deepEqual(ui.saves, []);
  assert.deepEqual(ui.pushes, []);
});

test("TerminiPage preserves valid choices after a release and lists removed terms with a versioned save", () => {
  const accountQuery = {};
  const catalogData = catalogFixture(catalog);
  const ui = pageHarness("src/app/termini/page.tsx", {
    selections: { [theoryKey]: { V: theoryPair.map(termKey) } },
    accountQuery,
    catalogData,
  });
  const removed = dbTheoryPair[1];
  catalogData.scheduleVersion = 2;
  const theory = catalogData.subjects.find((item) => item.name === theorySubject.name);
  theory.terms.V = theory.terms.V.filter((term) => term.id !== removed.id);
  accountQuery.data = {
    ...ui.accountData,
    scheduleVersion: 2,
    timeslotIds: [dbTheoryPair[0].id],
    scheduleUpdate: { pending: false, removedTimeslots: [{ ...removed, subjectName: theorySubject.name, type: "V" }] },
  };
  ui.rerender();
  assert.deepEqual(ui.slots().map((slot) => slot.term.id), [dbTheoryPair[0].id]);
  const warning = ui.all((node) => node.props.role === "alert").map(text).join(" ");
  assert.match(warning, /Izaberi zamenu za uklonjene termine/);
  assert.ok(warning.includes(removed.sala));
  ui.invoke(ui.button("Sačuvaj raspored"), "onClick");
  assert.equal(ui.saves[0].input.expectedScheduleVersion, 2);
  assert.deepEqual(ui.saves[0].input.timeslotIds, [dbTheoryPair[0].id]);
});

test("TerminiPage allows clearing a schedule when every saved term was removed", () => {
  const accountQuery = {};
  const ui = pageHarness("src/app/termini/page.tsx", { accountQuery });
  accountQuery.data = {
    ...ui.accountData,
    scheduleUpdate: { pending: false, removedTimeslots: [{ ...dbTheoryPair[0], subjectName: theorySubject.name, type: "V" }] },
  };
  // A new release restores the latest server selections, including an empty one.
  ui.catalogData.scheduleVersion = 1;
  accountQuery.data.scheduleVersion = 1;
  ui.rerender();
  assert.equal(ui.button("Sačuvaj raspored").props.disabled, false);
  ui.invoke(ui.button("Sačuvaj raspored"), "onClick");
  assert.deepEqual(ui.saves[0].input.timeslotIds, []);
});

test("PredmetiPage treats same-name database subjects as distinct IDs", () => {
  const catalogData = catalogFixture(catalog);
  const original = catalogData.subjects.find(
    (item) => item.name === subject.name,
  );
  catalogData.subjects = [original, { ...original, id: "distinct-subject" }];
  const ui = pageHarness("src/app/predmeti/page.tsx", {
    subjects: [],
    catalogData,
  });
  ui.program("ISiT");
  const add = () =>
    ui.all((node) => node.props["aria-label"] === `Dodaj ${subject.name}`);
  ui.invoke(add()[0], "onClick");
  assert.equal(add()[0].props.disabled, true);
  assert.equal(add()[1].props.disabled, false);
  ui.invoke(add()[1], "onClick");
  ui.invoke(ui.button("Sačuvaj i nastavi"), "onClick");
  assert.deepEqual(ui.saves[0].input.subjectIds, [
    original.id,
    "distinct-subject",
  ]);
});

test("TerminiPage labels subjects with catalog years, not legacy selection source years", () => {
  const ui = pageHarness("src/app/termini/page.tsx", {
    subjects: [{ name: crossYearName, year: "year2" }],
  });
  const section = ui.find((node) => node.type === "section");
  const label = nodes(section).find(
    (node) => node.type === "p" && text(node).includes("godina"),
  );
  assert.equal(text(label), "III godina · IV godina");
});

test("TerminiPage uses database group keys rather than shared display names for session limits", () => {
  const catalogData = catalogFixture(catalog);
  const selected = catalogData.subjects.find(
    (item) => item.name === theorySubject.name,
  );
  const first = { ...dbTheoryPair[0], grupe: ["G1"], groupKeys: ["year3:G1"] };
  const second = { ...dbTheoryPair[1], grupe: ["G1"], groupKeys: ["year4:G1"] };
  selected.terms.V = [first, second];
  const ui = pageHarness("src/app/termini/page.tsx", { catalogData });
  assert.equal(ui.selector(theorySubject).props.onSaveMultiple, undefined);
  assert.deepEqual(
    [...ui.selector(theorySubject).props.weeklySessions.counts],
    [
      ["year3:G1", 1],
      ["year4:G1", 1],
    ],
  );
});
