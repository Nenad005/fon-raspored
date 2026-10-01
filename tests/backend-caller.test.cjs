const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createRequire, Module } = require("node:module");

// Use the project's installed TypeScript as the runtime, with auth/DB mocked.
const root = process.cwd();
const projectRequire = createRequire(resolve(root, "package.json"));
const ts = projectRequire("typescript");
let verifiedUserId = "verified-user";
const contextDb = {};
let middlewareArgs;
const cache = new Map();
function load(file) {
  const filename = resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  cache.set(filename, mod);
  mod.require = (id) => {
    if (id === "@clerk/nextjs/server")
      return {
        auth: () => ({ userId: verifiedUserId }),
        clerkMiddleware: (...args) => {
          middlewareArgs = args;
          return () => {};
        },
      };
    if (id === "~/server/db") return { db: contextDb };
    if (id.startsWith("~/")) {
      const target = "src/" + id.slice(2);
      return target.endsWith(".json")
        ? projectRequire("./" + target)
        : load(target + ".ts");
    }
    return projectRequire(id);
  };
  const source = readFileSync(filename, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(result.outputText, filename);
  return mod.exports;
}

const { createTRPCContext } = load("src/server/api/trpc.ts");
const { settingsRouter } = load("src/server/api/routers/settings.ts");
const { terminRouter } = load("src/server/api/routers/termin.ts");
const catalog = projectRequire("./src/data/predmeti.json");
const unexpected = () => {
  throw new Error("Unexpected database access");
};
function mockDb() {
  return {
    predmeti: {
      findMany: unexpected,
      create: unexpected,
      createMany: unexpected,
    },
    termin: { findMany: unexpected },
    $transaction: unexpected,
  };
}
function caller(router, db = mockDb(), userId = "verified-user") {
  return router.createCaller({ db, userId, headers: new Headers() });
}
const code = (expected) => (error) => error.code === expected;

test("context uses Clerk identity, not caller-provided headers or fields", async () => {
  const ctx = await createTRPCContext({
    headers: new Headers({ "x-user-id": "victim" }),
    userId: "victim",
  });
  assert.equal(ctx.userId, "verified-user");
  assert.equal(ctx.db, contextDb);
  verifiedUserId = null;
  assert.equal(
    (await createTRPCContext({ headers: new Headers() })).userId,
    null,
  );
  verifiedUserId = "verified-user";
});

test("all private procedures reject anonymous calls before DB access", async () => {
  const settings = caller(settingsRouter, mockDb(), null);
  await assert.rejects(settings.getUserClasses(), code("UNAUTHORIZED"));
  await assert.rejects(
    settings.addClass({ year: "year1", ime: "Matematika 1" }),
    code("UNAUTHORIZED"),
  );
  await assert.rejects(
    settings.addClassesFromSmer({ year: "year1", smer: "ISiT" }),
    code("UNAUTHORIZED"),
  );
  await assert.rejects(
    caller(terminRouter, mockDb(), null).getAll(),
    code("UNAUTHORIZED"),
  );
});

test("settings and schedule reads are scoped to authenticated identity", async () => {
  const db = mockDb();
  db.predmeti.findMany = async (args) => {
    assert.deepEqual(args, { where: { userId: "verified-user" } });
    return [];
  };
  db.termin.findMany = db.predmeti.findMany;
  assert.deepEqual(await caller(settingsRouter, db).getUserClasses(), []);
  assert.deepEqual(await caller(terminRouter, db).getAll(), []);
});

test("individual inserts ignore spoofed userId and preserve all four year encodings", async () => {
  for (const [index, year] of Object.keys(catalog).entries()) {
    const db = mockDb();
    const ime = Object.values(catalog[year])[0][0];
    db.predmeti.findMany = async (args) => {
      assert.deepEqual(args, {
        where: { userId: "verified-user", godina: index },
      });
      return [];
    };
    db.predmeti.create = async (args) => {
      assert.deepEqual(args, {
        data: { userId: "verified-user", godina: index, ime },
      });
    };
    await caller(settingsRouter, db).addClass({ userId: "victim", year, ime });
  }
});

test("invalid years, programs, prototype keys, and subjects fail without DB access", async () => {
  const settings = caller(settingsRouter);
  for (const year of ["year0", "year5", ""]) {
    await assert.rejects(
      settings.addClass({ year, ime: "Matematika 1" }),
      code("BAD_REQUEST"),
    );
    await assert.rejects(
      settings.addClassesFromSmer({ year, smer: "ISiT" }),
      code("BAD_REQUEST"),
    );
  }
  for (const smer of ["missing", "toString", "__proto__", ""]) {
    await assert.rejects(
      settings.addClassesFromSmer({ year: "year1", smer }),
      code("BAD_REQUEST"),
    );
  }
  await assert.rejects(
    settings.addClass({ year: "year1", ime: "missing" }),
    code("BAD_REQUEST"),
  );
  await assert.rejects(
    settings.addClass({ year: "year1", ime: "" }),
    code("BAD_REQUEST"),
  );
});

test("individual duplicate keeps CONFLICT behavior", async () => {
  const db = mockDb();
  db.predmeti.findMany = async () => [{ ime: "Matematika 1" }];
  await assert.rejects(
    caller(settingsRouter, db).addClass({ year: "year1", ime: "Matematika 1" }),
    code("CONFLICT"),
  );
});

test("bulk reads/writes use transaction client and deduplicate existing subjects", async () => {
  for (const [godina, year] of Object.keys(catalog).entries()) {
    const db = mockDb();
    const smer = Object.keys(catalog[year])[0];
    const subjects = catalog[year][smer];
    let committed = false;
    db.$transaction = async (callback) => {
      await callback({
        predmeti: {
          findMany: async (args) => {
            assert.deepEqual(args, {
              where: { userId: "verified-user", godina },
            });
            return [{ ime: subjects[0] }];
          },
          createMany: async ({ data }) => {
            assert.deepEqual(
              data,
              subjects
                .slice(1)
                .map((ime) => ({ userId: "verified-user", godina, ime })),
            );
          },
        },
      });
      committed = true;
    };
    await caller(settingsRouter, db).addClassesFromSmer({
      userId: "victim",
      year,
      smer,
    });
    assert.equal(committed, true);
  }
});

test("bulk mutation waits for write and transaction completion", async () => {
  const db = mockDb();
  let releaseWrite;
  let releaseCommit;
  const writeGate = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const commitGate = new Promise((resolve) => {
    releaseCommit = resolve;
  });
  let writeStarted;
  const started = new Promise((resolve) => {
    writeStarted = resolve;
  });
  let writeFinished = false;
  let settled = false;
  db.$transaction = async (callback) => {
    await callback({
      predmeti: {
        findMany: async () => [],
        createMany: async () => {
          writeStarted();
          await writeGate;
          writeFinished = true;
        },
      },
    });
    assert.equal(writeFinished, true);
    await commitGate;
  };
  const mutation = caller(settingsRouter, db).addClassesFromSmer({
    year: "year1",
    smer: "ISiT",
  });
  mutation.then(() => {
    settled = true;
  });
  await started;
  assert.equal(settled, false);
  releaseWrite();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  releaseCommit();
  await mutation;
  assert.equal(settled, true);
});

test("bulk no-op does not issue empty createMany", async () => {
  const db = mockDb();
  db.$transaction = async (callback) =>
    callback({
      predmeti: {
        findMany: async () => catalog.year1.ISiT.map((ime) => ({ ime })),
        createMany: unexpected,
      },
    });
  await caller(settingsRouter, db).addClassesFromSmer({
    year: "year1",
    smer: "ISiT",
  });
});

test("bulk read, write, and commit failures propagate to caller", async () => {
  for (const stage of ["read", "write", "commit"]) {
    const db = mockDb();
    const failure = new Error(stage + " failed");
    db.$transaction = async (callback) => {
      await callback({
        predmeti: {
          findMany: async () => {
            if (stage === "read") throw failure;
            return [];
          },
          createMany: async () => {
            if (stage === "write") throw failure;
          },
        },
      });
      if (stage === "commit") throw failure;
    };
    await assert.rejects(
      caller(settingsRouter, db).addClassesFromSmer({
        year: "year1",
        smer: "ISiT",
      }),
      (error) =>
        error.code === "INTERNAL_SERVER_ERROR" && error.cause === failure,
    );
  }
});

test("middleware covers pages and API paths without a redirect/protect handler", () => {
  const { config } = load("src/middleware.ts");
  assert.deepEqual(middlewareArgs, []);
  const matches = (path) =>
    config.matcher.some((pattern) =>
      new RegExp("^" + pattern + "$").test(path),
    );
  for (const path of [
    "/",
    "/podesavanja",
    "/api/trpc/settings.getUserClasses",
    "/api/file.json",
    "/trpc/termin.getAll",
  ]) {
    assert.equal(matches(path), true, path);
  }
  for (const path of ["/_next/static/chunk.js", "/favicon.ico", "/image.png"]) {
    assert.equal(matches(path), false, path);
  }
});
