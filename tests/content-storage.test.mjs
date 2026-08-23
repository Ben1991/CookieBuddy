import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");

function createStorage(values) {
  const storage = { ...values };
  Object.defineProperty(storage, "getItem", { value: (key) => storage[key] ?? null });
  return storage;
}

function createContext({ supported = true } = {}) {
  const localStorage = createStorage({ consent_state: "granted" });
  const sessionStorage = createStorage({ session_id: "session-only" });
  const context = {
    URL,
    URLSearchParams,
    clearTimeout,
    setTimeout,
    console,
    performance: { now: () => 0, getEntriesByType: () => [] },
    location: new URL("https://example.test/article"),
    document: { body: { innerText: "" }, documentElement: { outerHTML: "<html></html>" }, scripts: [], querySelectorAll: () => [] },
    localStorage,
    sessionStorage,
    navigator: {},
    chrome: { runtime: { onMessage: { addListener: () => {} } } },
    addEventListener: () => {},
    CookieBuddyServiceRules: { match: () => null }
  };

  if (supported) {
    context.indexedDB = { databases: async () => [{ name: "consent-db", version: 3 }] };
    context.caches = {
      keys: async () => ["app-shell"],
      open: async () => ({ keys: async () => [{ url: "https://cdn.example.test/app.js?token=secret", method: "GET" }] })
    };
    context.navigator.serviceWorker = {
      getRegistrations: async () => [{
        scope: "https://example.test/",
        active: { scriptURL: "https://example.test/sw.js?token=secret", state: "activated" }
      }]
    };
  } else {
    context.indexedDB = {};
    context.caches = undefined;
  }

  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(`${contentSource}\n globalThis.__collectStoredData = collectStoredData;`, context, { filename: "content.js" });
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("content storage collection records metadata without values or cache response bodies", async () => {
  const context = createContext();
  const storage = await context.__collectStoredData({ banner: { name: "Cookiebot" }, categories: {}, pageText: "", htmlSample: "" });

  assert.deepEqual(plain(storage.coverage), { indexedDB: "observed", cacheStorage: "observed", serviceWorkers: "observed" });
  assert.deepEqual(plain(storage.indexedDb.databases), [{ name: "consent-db", version: 3 }]);
  assert.equal(storage.cacheStorage.caches[0].name, "app-shell");
  assert.deepEqual(plain(storage.cacheStorage.caches[0].keys[0]), {
    url: "https://cdn.example.test/app.js",
    method: "GET",
    queryKeys: ["token"]
  });
  assert.equal(storage.serviceWorkers.registrations[0].scope, "https://example.test/");
  assert.equal(storage.serviceWorkers.registrations[0].scriptUrl, "https://example.test/sw.js");
  assert.equal("body" in storage.cacheStorage.caches[0].keys[0], false);
  assert.deepEqual(new Set(storage.items.map((item) => item.scope)), new Set(["localStorage", "sessionStorage", "IndexedDB", "Cache Storage", "Service worker"]));
});

test("unsupported storage APIs remain explicit and are not treated as empty evidence", async () => {
  const context = createContext({ supported: false });
  const storage = await context.__collectStoredData({ banner: { name: "Cookiebot" }, categories: {}, pageText: "", htmlSample: "" });

  assert.deepEqual(plain(storage.coverage), { indexedDB: "not-inspected", cacheStorage: "not-inspected", serviceWorkers: "not-inspected" });
  assert.equal(storage.indexedDb.databases.length, 0);
  assert.equal(storage.cacheStorage.caches.length, 0);
  assert.equal(storage.serviceWorkers.registrations.length, 0);
});
