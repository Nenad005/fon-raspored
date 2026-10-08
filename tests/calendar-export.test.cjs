const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");

function load(file) {
  const filename = resolve(file);
  const mod = new Module(filename);
  mod.require = require;
  mod._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return mod.exports;
}
const { createCalendar, calendarToday, addCalendarDays } = load(
  "src/lib/calendar.ts",
);
const { saveOfflineSchedule, clearOtherOfflineSchedule, offlineScheduleKey } =
  load("src/lib/offline-schedule.ts");
const term = {
  id: "slot1",
  predmet: "Matematika",
  tip: "P",
  od: "10:15",
  do: "12:00",
  sala: "Amfiteatar 3",
  grupe: ["A1", "A2"],
};
const make = (options = {}) =>
  createCalendar({
    schedule: { Ponedeljak: [term] },
    title: "FON A1",
    startDate: "2026-10-06",
    endDate: "2026-11-02",
    now: new Date("2026-10-07T10:20:30Z"),
    ...options,
  });
const unfold = (content) => content.replace(/\r\n /g, "");

test("export starts at the first matching weekday and ends inclusively using weekly counts", () => {
  const calendar = unfold(make());
  assert.match(calendar, /DTSTART;TZID=Europe\/Belgrade:20261012T101500/);
  assert.match(calendar, /DTEND;TZID=Europe\/Belgrade:20261012T120000/);
  assert.match(calendar, /RRULE:FREQ=WEEKLY;COUNT=4/);
  assert.match(calendar, /DTSTAMP:20261007T102030Z/);
  assert.match(calendar, /TZID:Europe\/Belgrade/);
  assert.match(calendar, /TZOFFSETFROM:\+0200\r\nTZOFFSETTO:\+0100/);
  assert.match(calendar, /BYMONTH=10;BYDAY=-1SU/);
  assert.ok(calendar.endsWith("END:VCALENDAR\r\n"));
});

test("partial weeks skip out-of-range weekdays and retain separate rooms and exercise types", () => {
  const calendar = unfold(
    make({
      startDate: "2026-10-06",
      endDate: "2026-10-09",
      schedule: {
        Ponedeljak: [term],
        Utorak: [term, term, { ...term, id: "slot2", sala: "15", tip: "V" }],
      },
    }),
  );
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((calendar.match(/RRULE:FREQ=WEEKLY;COUNT=1/g) || []).length, 2);
  assert.match(calendar, /DTSTART;TZID=Europe\/Belgrade:20261006T101500/);
  assert.match(calendar, /SUMMARY:Matematika — Vežbe/);
  assert.match(calendar, /LOCATION:15/);
  assert.doesNotMatch(calendar, /20261012/);
});

test("UTF-8 line folding and text escaping preserve Serbian names without content-line injection", () => {
  const name = "Čćžšđ😀".repeat(30) + ", test; \\ kraj\nBEGIN:VALARM";
  const calendar = make({
    schedule: { Ponedeljak: [{ ...term, predmet: name }] },
  });
  for (const line of calendar.split("\r\n"))
    assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  const unfolded = unfold(calendar);
  assert.ok(unfolded.includes("\\, test\\; \\\\ kraj\\nBEGIN:VALARM"));
  assert.doesNotMatch(unfolded, /\r\nBEGIN:VALARM/);
  assert.equal((unfolded.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test("date/time validation rejects impossible ranges and empty schedules", () => {
  for (const options of [
    { startDate: "2026-02-30" },
    { endDate: "" },
    { endDate: "2026-10-05" },
    { endDate: "2028-01-01" },
    { schedule: {} },
    { schedule: { Ponedeljak: [{ ...term, od: "25:00" }] } },
    { schedule: { Ponedeljak: [{ ...term, do: "10:00" }] } },
  ])
    assert.throws(() => make(options));
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(calendarToday(new Date("2026-10-07T22:30:00Z")), "2026-10-08");
});

test("repeat exports have stable event IDs independent of creation time", () => {
  const uids = (content) =>
    unfold(content)
      .split("\r\n")
      .filter((line) => line.startsWith("UID:"));
  assert.deepEqual(
    uids(make()),
    uids(make({ now: new Date("2026-10-08T01:00:00Z") })),
  );
});

test("offline snapshot stores only display fields, and logout/identity changes discard the previous owner", () => {
  const entries = new Map();
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  saveOfflineSchedule(storage, "user-A", "Moj raspored", {
    Ponedeljak: [{ ...term, token: "not-for-storage" }],
  });
  const snapshot = JSON.parse(storage.getItem(offlineScheduleKey));
  assert.equal(snapshot.owner, "user-A");
  assert.equal(snapshot.schedule.Ponedeljak[0].token, undefined);
  clearOtherOfflineSchedule(storage, "user-A");
  assert.ok(storage.getItem(offlineScheduleKey));
  clearOtherOfflineSchedule(storage, "guest");
  assert.equal(storage.getItem(offlineScheduleKey), null);
  saveOfflineSchedule(storage, "guest", "A1", {});
  clearOtherOfflineSchedule(storage, "user-B");
  assert.equal(storage.getItem(offlineScheduleKey), null);
  storage.setItem(offlineScheduleKey, "invalid JSON");
  assert.doesNotThrow(() => clearOtherOfflineSchedule(storage, "guest"));
  assert.equal(storage.getItem(offlineScheduleKey), null);
});
