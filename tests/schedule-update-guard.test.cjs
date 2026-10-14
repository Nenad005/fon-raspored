const { test } = require("node:test");
const assert = require("node:assert/strict");
const guard = import("../scripts/check-schedule-update.mjs");

function catalog(count = 10) {
  return [
    {
      name: "Example",
      timeslots: [1, 2, 3, 4].flatMap((year) =>
        Array.from({ length: count }, (_, index) => ({
          type: "P",
          day: 1,
          startTime: "08:00",
          endTime: "09:00",
          room: `${year}-${index}`,
          groups: [{ year, name: `${year}-${index}` }],
        })),
      ),
    },
  ];
}

test("guard accepts identical, growing and modestly reduced schedules", async () => {
  const { assertSafeUpdate } = await guard;
  for (const count of [8, 10, 12]) assertSafeUpdate(catalog(), catalog(count));
});

test("guard blocks empty catalogs and drops greater than 20 percent", async () => {
  const { assertSafeUpdate } = await guard;
  assert.throws(() => assertSafeUpdate([], catalog()), /manual review/i);
  assert.throws(() => assertSafeUpdate(catalog(), []), /manual review/i);
  assert.throws(() => assertSafeUpdate(catalog(), catalog(7)), /suspicious/i);
});

test("guard blocks replacing over 30 percent and checks each year separately", async () => {
  const { assertSafeUpdate } = await guard;
  const current = catalog();
  current[0].timeslots
    .filter((slot) => slot.groups[0].year === 4)
    .slice(0, 4)
    .forEach((slot) => {
      slot.room = "replacement-" + slot.room;
    });
  assert.throws(() => assertSafeUpdate(catalog(), current), /Year 4/);
});
