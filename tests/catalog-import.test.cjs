const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const subjects = require("../src/data/predmeti.json");
const terms = require("../src/data/termini.json");
const importer = import("../scripts/import-catalog.mjs");

const first = {
  dan: "Ponedeljak",
  od: "08:15",
  do: "09:00",
  sala: "13",
  grupe: ["A1"],
};
const second = { ...first, dan: "Utorak", do: "10:00" };
const fixture = {
  subjects: {
    year1: { ISiT: ["Example", "Example", "No sessions"], MiO: ["Example"] },
    year2: { ISiT: ["Example"] },
  },
  terms: {
    year1: {
      Example: {
        P: [first],
        V: [first, { ...first, sala: "14" }, { ...first, do: "10:00" }],
      },
    },
    year2: {
      Example: { V: [{ ...first, grupe: ["B1", "A1", "B1"] }, second] },
    },
  },
};

function database(failures = {}) {
  let state = {
    subjects: new Map(),
    programs: new Map(),
    studyGroups: new Map(),
    timeslots: new Map(),
    subjectPrograms: new Map(),
    timeslotGroups: new Map(),
  };
  let transactions = 0;
  return {
    get state() {
      return state;
    },
    get transactions() {
      return transactions;
    },
    async $transaction(callback, options) {
      transactions++;
      assert.ok(options.timeout > 0);
      const draft = structuredClone(state);
      const hasId = (table, id) =>
        [...draft[table].values()].some((record) => record.id === id);
      const tx = {};
      for (const [model, table, fields, unique] of [
        ["subject", "subjects", ["name"], null],
        ["program", "programs", ["name"], null],
        ["studyGroup", "studyGroups", ["year", "name"], "year_name"],
        [
          "timeslot",
          "timeslots",
          ["subjectId", "type", "day", "startTime", "endTime", "room"],
          "subjectId_type_day_startTime_endTime_room",
        ],
      ]) {
        tx[model] = {
          async upsert({ where, create, update }) {
            assert.deepEqual(Object.keys(create).sort(), [...fields].sort());
            assert.deepEqual(update, {});
            assert.deepEqual(where, unique ? { [unique]: create } : create);
            if (model === "studyGroup")
              assert.ok(
                Number.isInteger(create.year) &&
                  create.year >= 1 &&
                  create.year <= 4,
              );
            if (model === "timeslot") {
              assert.ok(hasId("subjects", create.subjectId));
              if (create.room === failures.failOnRoom)
                throw new Error("Simulated write failure");
            }
            const key = unique
              ? JSON.stringify(fields.map((field) => create[field]))
              : create.name;
            const previous = draft[table].get(key);
            const record = previous
              ? previous
              : { id: `${model}-${draft[table].size + 1}`, ...create };
            draft[table].set(key, record);
            return record;
          },
        };
      }
      for (const [model, table, owner, fields, references] of [
        [
          "subjectProgram",
          "subjectPrograms",
          "subjectId",
          ["subjectId", "programId", "year"],
          { subjectId: "subjects", programId: "programs" },
        ],
        [
          "timeslotGroup",
          "timeslotGroups",
          "timeslotId",
          ["timeslotId", "groupId"],
          { timeslotId: "timeslots", groupId: "studyGroups" },
        ],
      ]) {
        tx[model] = {
          async deleteMany({ where }) {
            assert.deepEqual(Object.keys(where), [owner]);
            assert.deepEqual(Object.keys(where[owner]), ["in"]);
            assert.ok(Array.isArray(where[owner].in));
            let count = 0;
            for (const [key, record] of draft[table]) {
              if (where[owner].in.includes(record[owner])) {
                draft[table].delete(key);
                count++;
              }
            }
            return { count };
          },
          async createMany({ data }) {
            if (model === "timeslotGroup" && failures.failOnGroupLinks)
              throw new Error("Simulated relation failure");
            for (const record of data) {
              assert.deepEqual(Object.keys(record).sort(), [...fields].sort());
              for (const [field, referencedTable] of Object.entries(references))
                assert.ok(hasId(referencedTable, record[field]));
              if (model === "subjectProgram")
                assert.ok(
                  Number.isInteger(record.year) &&
                    record.year >= 1 &&
                    record.year <= 4,
                );
              const key = JSON.stringify(fields.map((field) => record[field]));
              assert.ok(!draft[table].has(key), `Duplicate ${model} relation`);
              draft[table].set(key, { ...record });
            }
            return { count: data.length };
          },
        };
      }
      const result = await callback(tx);
      state = draft;
      return result;
    },
  };
}

function memberships(state, subjectId) {
  return [...state.subjectPrograms.values()]
    .filter((link) => link.subjectId === subjectId)
    .map((link) => ({
      year: link.year,
      name: [...state.programs.values()].find(
        (program) => program.id === link.programId,
      ).name,
    }))
    .sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
}

function slotGroups(state, timeslotId) {
  return [...state.timeslotGroups.values()]
    .filter((link) => link.timeslotId === timeslotId)
    .map((link) => {
      const { year, name } = [...state.studyGroups.values()].find(
        (group) => group.id === link.groupId,
      );
      return { year, name };
    })
    .sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
}

test("import preparation preserves real subjects and merged catalog timeslots", async () => {
  const { prepareCatalog } = await importer;
  const prepared = prepareCatalog(subjects, terms);
  assert.equal(prepared.length, 49);
  assert.equal(
    prepared.reduce((count, subject) => count + subject.timeslots.length, 0),
    394,
  );
  assert.equal(
    new Set(prepared.map((subject) => subject.name)).size,
    prepared.length,
  );
  const theory = prepared.find((subject) => subject.name === "Teorija sistema");
  const shortSlots = theory.timeslots.filter((slot) => {
    const [startHour, startMinute] = slot.startTime.split(":").map(Number);
    const [endHour, endMinute] = slot.endTime.split(":").map(Number);
    return (endHour - startHour) * 60 + endMinute - startMinute === 45;
  });
  assert.equal(
    new Set(
      shortSlots.flatMap((slot) => slot.groups.map((group) => group.name)),
    ).size,
    7,
  );
  for (const subject of prepared) {
    for (const slot of subject.timeslots) {
      assert.ok(slot.day >= 1 && slot.day <= 5);
      assert.ok(slot.startTime < slot.endTime);
      assert.equal(Object.hasOwn(slot, "years"), false);
      assert.ok(slot.groups.length > 0);
      assert.equal(
        new Set(
          slot.groups.map((group) => JSON.stringify([group.year, group.name])),
        ).size,
        slot.groups.length,
      );
      for (const group of slot.groups) {
        assert.deepEqual(Object.keys(group).sort(), ["name", "year"]);
        assert.ok(group.year >= 1 && group.year <= 4);
        assert.ok(
          terms[`year${group.year}`][subject.name][slot.type].some(
            (source) =>
              source.dan ===
                ["Ponedeljak", "Utorak", "Sreda", "\u010Cetvrtak", "Petak"][
                  slot.day - 1
                ] &&
              source.od === slot.startTime &&
              source.do === slot.endTime &&
              source.sala === slot.room &&
              source.grupe.includes(group.name),
          ),
        );
      }
    }
  }
});

test("CLI dry run succeeds without a reachable database and rejects unknown flags", () => {
  const script = resolve(__dirname, "../scripts/import-catalog.mjs");
  const options = {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      DIRECT_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    },
    timeout: 10_000,
  };
  const dryRun = spawnSync(process.execPath, [script, "--dry-run"], options);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /Validated 49 subjects and 394 timeslots/);
  assert.match(dryRun.stdout, /No database connection made/);
  const invalid = spawnSync(process.execPath, [script, "--invalid"], options);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Usage:/);
});

test("import preparation preserves source-year groups and distinct types, rooms, and durations", async () => {
  const { prepareCatalog } = await importer;
  const before = JSON.stringify(fixture);
  const prepared = prepareCatalog(fixture.subjects, fixture.terms);
  assert.equal(prepared.length, 2);
  const example = prepared.find((subject) => subject.name === "Example");
  assert.deepEqual(example.programs, {
    year1: ["ISiT", "MiO"],
    year2: ["ISiT"],
  });
  assert.equal(example.timeslots.length, 5);
  const merged = example.timeslots.find(
    (slot) =>
      slot.type === "V" &&
      slot.day === 1 &&
      slot.room === "13" &&
      slot.endTime === "09:00",
  );
  assert.deepEqual(merged.groups, [
    { year: 1, name: "A1" },
    { year: 2, name: "B1" },
    { year: 2, name: "A1" },
  ]);
  assert.equal(Object.hasOwn(merged, "years"), false);
  for (const slot of example.timeslots.filter((slot) => slot !== merged)) {
    assert.deepEqual(slot.groups, [
      { year: slot.day === 2 ? 2 : 1, name: "A1" },
    ]);
  }
  assert.deepEqual(
    example.timeslots
      .map(({ type, day, startTime, endTime, room }) =>
        [type, day, startTime, endTime, room].join("|"),
      )
      .sort(),
    [
      "P|1|08:15|09:00|13",
      "V|1|08:15|09:00|13",
      "V|1|08:15|09:00|14",
      "V|1|08:15|10:00|13",
      "V|2|08:15|10:00|13",
    ],
  );
  assert.deepEqual(
    prepared.find((subject) => subject.name === "No sessions").timeslots,
    [],
  );
  assert.equal(JSON.stringify(fixture), before);
});

test("invalid catalog data is rejected before importing", async () => {
  const { prepareCatalog } = await importer;
  for (const override of [
    { dan: "Weekend" },
    { od: "8:15" },
    { do: "08:00" },
    { od: "25:00" },
    { sala: "" },
    { grupe: [] },
  ]) {
    assert.throws(() =>
      prepareCatalog(fixture.subjects, {
        year1: { Example: { P: [{ ...first, ...override }] } },
      }),
    );
  }
  assert.throws(
    () =>
      prepareCatalog(fixture.subjects, { year1: { Unknown: { P: [first] } } }),
    /unknown subject/,
  );
  assert.throws(
    () =>
      prepareCatalog(fixture.subjects, { year3: { Example: { P: [first] } } }),
    /catalog years/,
  );
  assert.throws(() =>
    prepareCatalog(fixture.subjects, { year1: { Example: { X: [first] } } }),
  );
  assert.throws(() => prepareCatalog({ year5: { ISiT: ["Example"] } }, {}));
});

test("normalized fixture imports exact memberships and year-scoped group links", async () => {
  const { prepareCatalog, importCatalog } = await importer;
  const prepared = prepareCatalog(fixture.subjects, fixture.terms);
  const db = database();
  assert.deepEqual(await importCatalog(db, prepared), {
    subjects: 2,
    timeslots: 5,
  });
  assert.equal(db.transactions, 1);
  assert.equal(db.state.subjects.size, 2);
  assert.equal(db.state.programs.size, 2);
  assert.equal(db.state.studyGroups.size, 3);
  assert.equal(db.state.timeslots.size, 5);
  assert.equal(db.state.subjectPrograms.size, 4);
  assert.equal(db.state.timeslotGroups.size, 7);
  const example = db.state.subjects.get("Example");
  assert.deepEqual(memberships(db.state, example.id), [
    { year: 1, name: "ISiT" },
    { year: 1, name: "MiO" },
    { year: 2, name: "ISiT" },
  ]);
  assert.deepEqual(
    memberships(db.state, db.state.subjects.get("No sessions").id),
    [{ year: 1, name: "ISiT" }],
  );
  const sameLabel = [...db.state.studyGroups.values()].filter(
    (group) => group.name === "A1",
  );
  assert.equal(sameLabel.length, 2);
  assert.notEqual(sameLabel[0].id, sameLabel[1].id);
  for (const slot of db.state.timeslots.values()) {
    assert.equal(slot.subjectId, example.id);
    const source = prepared
      .find((subject) => subject.name === "Example")
      .timeslots.find((source) =>
        ["type", "day", "startTime", "endTime", "room"].every(
          (field) => source[field] === slot[field],
        ),
      );
    assert.ok(source);
    assert.deepEqual(
      slotGroups(db.state, slot.id),
      [...source.groups].sort(
        (a, b) => a.year - b.year || a.name.localeCompare(b.name),
      ),
    );
  }
});

test("repeat imports preserve IDs and replace links only for included subjects and slots", async () => {
  const { prepareCatalog, importCatalog } = await importer;
  const prepared = prepareCatalog(fixture.subjects, fixture.terms);
  const db = database();
  await importCatalog(
    db,
    prepareCatalog(
      { year3: { OtherProgram: ["Other"] } },
      { year3: { Other: { P: [{ ...first, grupe: ["A1"] }] } } },
    ),
  );
  const unrelated = structuredClone(db.state);
  await importCatalog(db, prepared);
  const initial = structuredClone(db.state);
  assert.deepEqual(await importCatalog(db, prepared), {
    subjects: 2,
    timeslots: 5,
  });
  assert.deepEqual(db.state, initial);
  assert.equal(db.transactions, 3);
  const changed = structuredClone(fixture);
  delete changed.subjects.year1.MiO;
  delete changed.subjects.year2.ISiT;
  changed.subjects.year2.NewProgram = ["Example"];
  changed.subjects.year1.NewProgram = ["Example"];
  changed.terms.year2.Example.V[0].grupe = ["B2"];
  // An omitted slot must retain its existing links even for an imported subject.
  changed.terms.year1.Example.V = changed.terms.year1.Example.V.filter(
    (slot) => slot.sala !== "14",
  );
  await importCatalog(db, prepareCatalog(changed.subjects, changed.terms));
  assert.equal(db.transactions, 4);
  assert.equal(
    db.state.subjects.get("Example").id,
    initial.subjects.get("Example").id,
  );
  assert.deepEqual(memberships(db.state, db.state.subjects.get("Example").id), [
    { year: 1, name: "ISiT" },
    { year: 1, name: "NewProgram" },
    { year: 2, name: "NewProgram" },
  ]);
  const updated = [...db.state.timeslots.values()].find(
    (slot) =>
      slot.type === "V" &&
      slot.day === 1 &&
      slot.room === "13" &&
      slot.endTime === "09:00",
  );
  assert.deepEqual(slotGroups(db.state, updated.id), [
    { year: 1, name: "A1" },
    { year: 2, name: "B2" },
  ]);
  assert.equal(db.state.subjectPrograms.size, 5);
  assert.equal(db.state.timeslotGroups.size, 7);
  for (const [key, slot] of db.state.timeslots)
    assert.equal(slot.id, initial.timeslots.get(key).id);
  for (const table of ["subjects", "programs", "studyGroups", "timeslots"])
    for (const [key, record] of initial[table])
      assert.deepEqual(db.state[table].get(key), record);
  for (const [table, records] of Object.entries(unrelated))
    for (const [key, record] of records)
      assert.deepEqual(db.state[table].get(key), record);
  const omitted = [...db.state.timeslots.values()].find(
    (slot) => slot.room === "14",
  );
  assert.deepEqual(
    slotGroups(db.state, omitted.id),
    slotGroups(initial, omitted.id),
  );
  const withoutMemberships = prepareCatalog(
    { year1: { ISiT: ["No sessions"] } },
    {},
  );
  withoutMemberships[0].programs = {};
  await importCatalog(db, withoutMemberships);
  assert.deepEqual(
    memberships(db.state, db.state.subjects.get("No sessions").id),
    [],
  );
  const afterUpdate = structuredClone(db.state);
  await importCatalog(db, []);
  assert.deepEqual(db.state, afterUpdate);
  assert.equal(db.state.subjects.size, 3);
  assert.equal(db.state.timeslots.size, 6);
});

test("a timeslot write failure rolls back the complete import", async () => {
  const { prepareCatalog, importCatalog } = await importer;
  const db = database({ failOnRoom: "14" });
  await importCatalog(
    db,
    prepareCatalog({ year1: { OtherProgram: ["Other"] } }, {}),
  );
  const before = structuredClone(db.state);
  await assert.rejects(
    importCatalog(db, prepareCatalog(fixture.subjects, fixture.terms)),
    /Simulated write failure/,
  );
  assert.deepEqual(db.state, before);
});

test("a relation write failure rolls back upserts and deleted old links", async () => {
  const { prepareCatalog, importCatalog } = await importer;
  const failures = {};
  const db = database(failures);
  await importCatalog(db, prepareCatalog(fixture.subjects, fixture.terms));
  const before = structuredClone(db.state);
  const changed = structuredClone(fixture);
  changed.subjects.year1 = { NewProgram: ["Example", "No sessions"] };
  changed.terms.year2.Example.V[0].grupe = ["NewGroup"];
  failures.failOnGroupLinks = true;
  await assert.rejects(
    importCatalog(db, prepareCatalog(changed.subjects, changed.terms)),
    /Simulated relation failure/,
  );
  assert.deepEqual(db.state, before);
});

test("source validation failure leaves an existing database unchanged", async () => {
  const { prepareCatalog, importCatalog } = await importer;
  const db = database();
  await importCatalog(db, prepareCatalog(fixture.subjects, fixture.terms));
  const before = structuredClone(db.state);
  const transactions = db.transactions;
  await assert.rejects(async () => {
    await importCatalog(
      db,
      prepareCatalog(fixture.subjects, {
        year1: { Example: { P: [{ ...first, do: "08:00" }] } },
      }),
    );
  });
  assert.equal(db.transactions, transactions);
  assert.deepEqual(db.state, before);
});
