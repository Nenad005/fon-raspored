const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

function harness() {
  const listeners = new Map();
  const stores = new Map();
  const calls = [];
  let failure = false;
  let status = 200;
  const key = (request) =>
    typeof request === "string" ? request : new URL(request.url).pathname;
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      addAll: async (urls) =>
        urls.forEach((url) => store.set(url, new Response(url))),
      match: async (request) => store.get(key(request))?.clone(),
      put: async (request, response) => store.set(key(request), response),
    };
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL,
    Response,
    self: {
      location: { origin: "https://app.test" },
      addEventListener: (name, callback) => listeners.set(name, callback),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
      match: async (request, options) =>
        (await open(options.cacheName)).match(request),
    },
    fetch: async (request) => {
      calls.push(request.url);
      if (failure) throw new Error("Network offline");
      const response = new Response("NETWORK", { status });
      Object.defineProperty(response, "type", { value: "basic" });
      return response;
    },
  });
  async function lifecycle(name) {
    let promise;
    listeners.get(name)({
      waitUntil: (value) => {
        promise = value;
      },
    });
    await promise;
  }
  async function request(path, options = {}) {
    let response;
    const background = [];
    listeners.get("fetch")({
      request: {
        url: path.startsWith("https:") ? path : `https://app.test${path}`,
        method: "GET",
        mode: "cors",
        ...options,
      },
      respondWith: (value) => {
        response = value;
      },
      waitUntil: (value) => background.push(value),
    });
    const result = await response;
    await Promise.all(background);
    return result;
  }
  return {
    stores,
    calls,
    lifecycle,
    request,
    offline: () => {
      failure = true;
    },
    serverError: () => {
      status = 503;
    },
  };
}

test("worker precaches the complete offline shell and removes only its obsolete caches", async () => {
  const h = harness();
  h.stores.set("fon-pwa-old", new Map());
  h.stores.set("unrelated-cache", new Map());
  await h.lifecycle("install");
  await h.lifecycle("activate");
  assert.ok(!h.stores.has("fon-pwa-old"));
  assert.ok(h.stores.has("unrelated-cache"));
  for (const path of [
    "/offline.html",
    "/offline.js",
    "/offline.css",
    "/pwa-192.png",
    "/pwa-maskable-512.png",
    "/apple-touch-icon.png",
  ])
    assert.ok(h.stores.get("fon-pwa-v1").has(path));
});

test("navigation is network-only when online and falls back without storing private HTML", async () => {
  const h = harness();
  await h.lifecycle("install");
  assert.equal(
    await (await h.request("/", { mode: "navigate" })).text(),
    "NETWORK",
  );
  assert.ok(!h.stores.get("fon-pwa-v1").has("/"));
  h.offline();
  assert.equal(
    await (await h.request("/termini", { mode: "navigate" })).text(),
    "/offline.html",
  );
  assert.ok(!h.stores.get("fon-pwa-v1").has("/termini"));
});

test("server failures also show the offline shell, while API, POST, RSC and external requests are untouched", async () => {
  const h = harness();
  await h.lifecycle("install");
  h.serverError();
  assert.equal(
    await (await h.request("/", { mode: "navigate" })).text(),
    "/offline.html",
  );
  for (const [path, options] of [
    ["/api/trpc/account.get", { mode: "navigate" }],
    ["/api/trpc/catalog.get", {}],
    ["/trpc/account.get", {}],
    ["/", { method: "POST" }],
    ["/?_rsc=test", {}],
    ["https://auth.test/clerk.js", {}],
  ])
    assert.equal(await h.request(path, options), undefined);
});

test("immutable Next.js assets are cached and available after losing the network", async () => {
  const h = harness();
  await h.lifecycle("install");
  const path = "/_next/static/chunks/build-hash.js";
  assert.equal(await (await h.request(path)).text(), "NETWORK");
  h.offline();
  assert.equal(await (await h.request(path)).text(), "NETWORK");
  assert.equal(h.calls.length, 1);
  assert.equal(await (await h.request("/offline.css")).text(), "/offline.css");
});
