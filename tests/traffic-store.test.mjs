import test from "node:test";
import assert from "node:assert/strict";
import { createSerializedTrafficStore } from "../src/traffic-store.mjs";

const tick = () => Promise.resolve();

function createMemoryAdapter(limit, options = {}) {
  const trafficByKey = new Map();
  const store = createSerializedTrafficStore({
    limit,
    ...options,
    read: async (key) => {
      await tick();
      return trafficByKey.get(key) || [];
    },
    write: async (key, next) => {
      await tick();
      trafficByKey.set(key, next);
    },
    remove: async (key) => {
      await tick();
      trafficByKey.delete(key);
    }
  });
  return { store, read: (key = "7") => trafficByKey.get(String(key)) || [] };
}

test("serializes 150 concurrent request captures without lost updates", async () => {
  const { store, read } = createMemoryAdapter(200);
  const requests = Array.from({ length: 150 }, (_, id) => ({ id, timeStamp: id + 1 }));

  await Promise.all(requests.map((request) => store.append(7, request)));

  assert.deepEqual(read(), requests);
  assert.deepEqual(await store.snapshot(7), requests);
});

test("serializes writes across tabs sharing the session storage object", async () => {
  const { store, read } = createMemoryAdapter(200, { queueKey: () => "shared-storage" });
  const requests = Array.from({ length: 150 }, (_, id) => ({ id, timeStamp: id + 1 }));

  await Promise.all(requests.map((request, id) => store.append(id % 2 ? "tab-a" : "tab-b", request)));

  assert.equal(read("tab-a").length + read("tab-b").length, 150);
});

test("retains the newest requests deterministically at the configured cap", async () => {
  const { store, read } = createMemoryAdapter(100);
  const requests = Array.from({ length: 150 }, (_, id) => ({ id, timeStamp: id + 1 }));

  await Promise.all(requests.map((request) => store.append("tab-7", request)));

  assert.deepEqual(read("tab-7"), requests.slice(-100));
});

test("serializes reset with captures so post-reset evidence starts cleanly", async () => {
  const { store, read } = createMemoryAdapter(100);
  await store.append(7, { id: "before-navigation" });

  const reset = store.clear(7);
  const afterNavigation = store.append(7, { id: "after-navigation" });
  await Promise.all([reset, afterNavigation]);

  assert.deepEqual(read(), [{ id: "after-navigation" }]);
});

test("can reject a stale capture that was queued before a reset", async () => {
  const { store, read } = createMemoryAdapter(100);
  let generation = 0;
  const captureGeneration = generation;
  const staleCapture = store.append(7, { id: "stale" }, { accept: () => generation === captureGeneration });
  generation += 1;
  await store.clear(7);
  await staleCapture;

  assert.deepEqual(read(), []);
});
