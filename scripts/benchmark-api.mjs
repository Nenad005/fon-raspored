import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";

// Read-only benchmark: never imports data or changes user settings.
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const runs = Number(option("--runs", "5"));
if (!Number.isInteger(runs) || runs < 1 || runs > 50)
  throw new Error("--runs must be between 1 and 50");
const base = option("--url", "https://fon-raspored.vercel.app");
const checksum = (result) =>
  createHash("sha256")
    .update(
      JSON.stringify(result, (key, value) =>
        key === "grupe" && Array.isArray(value) ? [...value].sort() : value,
      ),
    )
    .digest("hex");
const summary = (name, samples) => {
  const sorted = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      name,
      medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]),
      samples,
    }),
  );
};

if (args.includes("--db")) {
  const { PrismaClient } = require("@prisma/client");
  const ts = require("typescript");
  const client = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  let strategy = option("--strategy", "join");
  if (!["query", "join"].includes(strategy))
    throw new Error("Invalid --strategy");
  const db = client.$extends({
    query: {
      $allModels: {
        $allOperations({ operation, args, query }) {
          if (["findMany", "findUnique", "findFirst"].includes(operation))
            args.relationLoadStrategy = strategy;
          return query(args);
        },
      },
    },
  });
  let queries = [];
  client.$on("query", (event) => {
    queries.push({
      ms: event.duration,
      sql: event.query,
      params: event.params,
    });
  });
  const modules = new Map();
  function load(file) {
    const filename = resolve(file);
    if (modules.has(filename)) return modules.get(filename).exports;
    const mod = new Module(filename);
    modules.set(filename, mod);
    mod.require = (id) => {
      if (id === "@clerk/nextjs/server")
        return { auth: () => ({ userId: null }) };
      if (id === "~/server/db") return { db };
      if (id.startsWith("~/")) return load(`src/${id.slice(2)}.ts`);
      return require(id);
    };
    mod._compile(
      ts.transpileModule(readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
      filename,
    );
    return mod.exports;
  }
  try {
    const { appRouter } = load("src/server/api/root.ts");
    const caller = appRouter.createCaller({
      db,
      userId: null,
      headers: new Headers(),
    });
    const tasks = [
      ["catalog.get", () => caller.catalog.get()],
      ["schedule.groups", () => caller.schedule.groups({ year: 1 })],
      [
        "schedule.getSchedule",
        () => caller.schedule.getSchedule({ year: 1, group: "A1" }),
      ],
      // A nonexistent synthetic identity measures the default account read without exposing user data.
      [
        "account.get (empty)",
        () =>
          appRouter
            .createCaller({
              db,
              userId: "benchmark-nonexistent-account",
              headers: new Headers(),
            })
            .account.get(),
      ],
    ];
    for (const [name, run] of tasks) {
      const strategies = args.includes("--compare")
        ? ["query", "join"]
        : [strategy];
      const samples = Object.fromEntries(strategies.map((item) => [item, []]));
      let expectedChecksum;
      for (let i = 0; i < runs; i++) {
        // Alternate order to reduce bias from connection warmup/network drift.
        for (const current of i % 2 ? [...strategies].reverse() : strategies) {
          strategy = current;
          queries = [];
          const start = performance.now();
          const result = await run();
          const resultChecksum = checksum(result);
          if (expectedChecksum && expectedChecksum !== resultChecksum)
            throw new Error(
              `${name}: dataset changed or query/join results differ`,
            );
          expectedChecksum = resultChecksum;
          samples[current].push({
            ms: Math.round(performance.now() - start),
            queries: queries.length,
            queryMs: queries.reduce((sum, query) => sum + query.ms, 0),
            bytes: Buffer.byteLength(JSON.stringify(result)),
          });
          if (args.includes("--sql") && i === 0) console.log({ name, queries });
          if (args.includes("--explain") && i === 0) {
            const selects = queries.filter((query) =>
              query.sql.startsWith("SELECT"),
            );
            for (const query of selects) {
              const rows = await client.$queryRawUnsafe(
                `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
                ...JSON.parse(query.params),
              );
              const plan = rows[0]["QUERY PLAN"][0];
              console.log(
                JSON.stringify({
                  name,
                  dbExecutionMs: plan["Execution Time"],
                  dbPlanningMs: plan["Planning Time"],
                  observedQueryMs: query.ms,
                }),
              );
            }
          }
        }
      }
      for (const item of strategies)
        summary(`${name} (${item})`, samples[item]);
    }
  } finally {
    await client.$disconnect();
  }
} else {
  for (const [path, input] of [
    ["catalog.get", undefined],
    ["schedule.groups", { year: 1 }],
    ["schedule.getSchedule", { year: 1, group: "A1" }],
  ]) {
    const samples = [];
    for (let i = 0; i < runs; i++) {
      const encoded =
        input === undefined
          ? { json: null, meta: { values: ["undefined"] } }
          : { json: input };
      const start = performance.now();
      const response = await fetch(
        `${base}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(encoded))}`,
        { signal: AbortSignal.timeout(30_000) },
      );
      const ttfb = performance.now() - start;
      const body = await response.text();
      if (!response.ok)
        throw new Error(
          `${path}: HTTP ${response.status}: ${body.slice(0, 300)}`,
        );
      samples.push({
        ms: Math.round(performance.now() - start),
        ttfb: Math.round(ttfb),
        bytes: Buffer.byteLength(body),
        region: response.headers.get("x-vercel-id"),
        serverTiming: response.headers.get("server-timing"),
      });
    }
    summary(path, samples);
  }
}
