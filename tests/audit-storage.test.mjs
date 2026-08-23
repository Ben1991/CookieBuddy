import test from "node:test";
import assert from "node:assert/strict";
import { LOCAL_AUDIT_STORAGE_KEYS, SESSION_AUDIT_STORAGE_KEYS } from "../src/audit-storage.mjs";

test("local audit retention is limited to the latest scan and delta keys", () => {
  assert.deepEqual(LOCAL_AUDIT_STORAGE_KEYS, ["cookiebuddyLastScan", "cookiebuddyLastDelta"]);
});

test("session audit data has one documented deletion boundary", () => {
  assert.deepEqual(SESSION_AUDIT_STORAGE_KEYS, ["cookiebuddyTraffic", "cookiebuddyIconStatus", "cookiebuddyAuditLifecycle"]);
});
