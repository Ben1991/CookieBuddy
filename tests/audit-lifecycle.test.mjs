import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_LIFECYCLE_STATUS,
  createAuditLifecycleState,
  getAuditLifecycleEvidence,
  isAuditLifecycleTerminal,
  transitionAuditLifecycle
} from "../src/audit-lifecycle.mjs";

function runningState() {
  return createAuditLifecycleState({
    auditId: "audit-test",
    tabId: 7,
    tabUrl: "https://example.com/start?token=remove#section",
    startedAt: "2026-08-23T10:00:00.000Z"
  });
}

test("creates a resumable local audit state without sensitive URL parts", () => {
  const state = runningState();
  assert.equal(state.status, AUDIT_LIFECYCLE_STATUS.running);
  assert.equal(state.tabUrl, "https://example.com/start");
  assert.equal(state.events[0].url, "https://example.com/start");
  assert.equal(isAuditLifecycleTerminal(state.status), false);
});

test("records SPA routes, redirects, tab switches, and late-observation progress", () => {
  let state = runningState();
  state = transitionAuditLifecycle(state, "tab-switched", { tabId: 8 });
  state = transitionAuditLifecycle(state, "navigation", { kind: "spa", url: "https://example.com/next?secret=remove", reason: "spa-navigation-during-audit" });
  assert.equal(state.status, AUDIT_LIFECYCLE_STATUS.incomplete);
  assert.equal(state.reason, "spa-navigation-during-audit");
  assert.deepEqual(state.events.slice(-2).map((event) => event.type), ["tab-switched", "navigation"]);
  assert.equal(state.events.at(-1).url, "https://example.com/next");
  assert.equal(state.events.at(-1).kind, "spa");
});

test("classifies popup reopen, worker restart, timeout, and tab closure deterministically", () => {
  for (const [event, expectedStatus] of [
    ["popup-reopened", AUDIT_LIFECYCLE_STATUS.incomplete],
    ["service-worker-restarted", AUDIT_LIFECYCLE_STATUS.incomplete],
    ["timeout", AUDIT_LIFECYCLE_STATUS.incomplete],
    ["tab-closed", AUDIT_LIFECYCLE_STATUS.failed]
  ]) {
    const state = transitionAuditLifecycle(runningState(), event, { reason: "test-interruption" });
    assert.equal(state.status, expectedStatus, event);
    assert.equal(isAuditLifecycleTerminal(state.status), true);
  }
});

test("terminal lifecycle evidence cannot be changed back to green completion", () => {
  const incomplete = transitionAuditLifecycle(runningState(), "timeout", { reason: "observation-timeout" });
  const stillIncomplete = transitionAuditLifecycle(incomplete, "complete");
  assert.equal(stillIncomplete.status, AUDIT_LIFECYCLE_STATUS.incomplete);
  assert.equal(getAuditLifecycleEvidence(stillIncomplete).reason, "observation-timeout");
});
