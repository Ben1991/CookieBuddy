import test from "node:test";
import assert from "node:assert/strict";
import {
  canCaptureVisibleTab,
  createAuditTimelineEvent,
  createVisualEvidenceItem,
  createVisualEvidenceState,
  removeVisualEvidenceItem,
  sanitizeEvidenceUrl
} from "../src/visual-evidence.mjs";
import { minimizeUrlEvidence } from "../src/url-evidence.mjs";

test("retains only bounded query-key names and no sensitive URL values", () => {
  const evidence = minimizeUrlEvidence("https://user:pass@example.com/search?q=private%20term&email=alice%40example.com&token=secret#results");
  assert.deepEqual(evidence, {
    url: "https://example.com/search",
    protocol: "https:",
    host: "example.com",
    path: "/search",
    queryKeys: ["q", "email", "token"]
  });
  assert.doesNotMatch(JSON.stringify(evidence), /private|alice|secret|results|pass/);
});

test("minimizes screenshot metadata URLs before local persistence", () => {
  assert.equal(sanitizeEvidenceUrl("https://example.com/page?email=secret#banner"), "https://example.com/page");
  assert.equal(sanitizeEvidenceUrl("not a URL"), "");
});

test("captures only when the tested tab is the active tab in the same window", () => {
  const testedTab = { id: 7, windowId: 3 };
  assert.equal(canCaptureVisibleTab({ testedTab, activeTab: { id: 7, windowId: 3 }, captureAvailable: true }), true);
  assert.equal(canCaptureVisibleTab({ testedTab, activeTab: { id: 8, windowId: 3 }, captureAvailable: true }), false);
  assert.equal(canCaptureVisibleTab({ testedTab, activeTab: { id: 7, windowId: 4 }, captureAvailable: true }), false);
  assert.equal(canCaptureVisibleTab({ testedTab, activeTab: { id: 7, windowId: 3 }, captureAvailable: false }), false);
});

test("records permission and browser failures without invalidating the audit", () => {
  const item = createVisualEvidenceItem({
    phase: "after",
    status: "unavailable",
    tabUrl: "https://example.com/?token=hidden",
    auditStep: "capture",
    reason: "permission-or-browser-restriction"
  });
  const state = createVisualEvidenceState({ enabled: true, items: [item] });

  assert.equal(state.enabled, true);
  assert.equal(state.items[0].status, "unavailable");
  assert.equal(state.items[0].url, "https://example.com/");
  assert.equal(state.items[0].reason, "permission-or-browser-restriction");
});

test("removes image data while keeping a timeline record", () => {
  const item = createVisualEvidenceItem({
    phase: "before",
    status: "captured",
    dataUrl: "data:image/png;base64,AAAA",
    capturedAt: "2026-08-23T10:00:00.000Z"
  });
  const state = createVisualEvidenceState({ enabled: true, items: [item] });
  const removed = removeVisualEvidenceItem(state, item.id);
  const timeline = createAuditTimelineEvent("baseline", "2026-08-23T10:00:01.000Z", [item.id]);

  assert.equal(removed.items[0].status, "removed");
  assert.equal(removed.items[0].dataUrl, "");
  assert.deepEqual(timeline.evidenceIds, [item.id]);
});
