const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");

test("public cache reuses datasets, isolates keys, follows releases and retries failed reads", async () => {
  const entries = new Map();
  let version = 1;
  let versionChecks = 0;
  let datasetReads = 0;
  const mod = new Module(resolve("src/server/api/public-cache.ts"));
  mod.require = (id) => {
    if (id === "next/cache")
      return {
        unstable_cache: (read, key, options) => {
          assert.equal(options.revalidate, 3600);
          return async () => {
            const serialized = JSON.stringify(key);
            if (!entries.has(serialized)) entries.set(serialized, await read());
            return entries.get(serialized);
          };
        },
      };
    if (id === "~/server/api/schedule-version")
      return {
        getScheduleVersion: async () => {
          versionChecks++;
          return { version };
        },
      };
    return require(id);
  };
  mod._compile(
    ts.transpileModule(readFileSync(mod.id, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    mod.id,
  );
  const { readPublicData } = mod.exports;
  const ctx = { db: {}, cachePublicReads: true };
  const read = async () => ({ generation: ++datasetReads });
  const first = await readPublicData(ctx, ["catalog"], read);
  assert.deepEqual(await readPublicData(ctx, ["catalog"], read), first);
  assert.equal(datasetReads, 1);
  assert.equal(versionChecks, 2);
  assert.notDeepEqual(await readPublicData(ctx, ["groups", "1"], read), first);
  assert.notDeepEqual(await readPublicData(ctx, ["groups", "2"], read), first);
  version++;
  assert.notDeepEqual(await readPublicData(ctx, ["catalog"], read), first);
  const failure = new Error("DB unavailable");
  await assert.rejects(
    readPublicData(ctx, ["schedule", "1", "A1"], async () => {
      throw failure;
    }),
    failure,
  );
  assert.ok(await readPublicData(ctx, ["schedule", "1", "A1"], read));
  const checksBefore = versionChecks;
  const uncached = await readPublicData({ db: {} }, ["catalog"], read);
  assert.notDeepEqual(
    await readPublicData({ db: {} }, ["catalog"], read),
    uncached,
  );
  assert.equal(versionChecks, checksBefore);
});
