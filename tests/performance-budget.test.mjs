import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PERFORMANCE_BUDGETS, isWithinBudget, summarizeAuditBudget } from "../src/performance-budgets.mjs";

const background = await readFile(new URL("../src/background.js", import.meta.url), "utf8");
const content = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
const lifecycle = await readFile(new URL("../src/audit-lifecycle.mjs", import.meta.url), "utf8");

test("performance budgets define bounded idle, active-audit, and page-analysis work", () => {
  assert.equal(PERFORMANCE_BUDGETS.idle.capturedRequests, 0);
  assert.equal(PERFORMANCE_BUDGETS.idle.sessionWritesPerRequest, 0);
  assert.ok(isWithinBudget(PERFORMANCE_BUDGETS.activeAudit.maxDurationMs, 30_000));
  assert.ok(isWithinBudget(PERFORMANCE_BUDGETS.activeAudit.maxRequestsPerTab, 500));
  assert.equal(PERFORMANCE_BUDGETS.pageAnalysis.maxContactPages, 8);
  assert.equal(PERFORMANCE_BUDGETS.pageAnalysis.maxStorageEntries, 50);
});

test("budget summaries expose over-budget measurements for CI regression tests", () => {
  assert.deepEqual(summarizeAuditBudget({ durationMs: 1_000, requestCount: 10 }), {
    durationMs: 1_000,
    requestCount: 10,
    durationWithinBudget: true,
    requestsWithinBudget: true
  });
  const overBudget = summarizeAuditBudget({ durationMs: 30_001, requestCount: 501 });
  assert.equal(overBudget.durationWithinBudget, false);
  assert.equal(overBudget.requestsWithinBudget, false);
});

test("idle monitoring and page analysis enforce their limits in production code", () => {
  assert.match(background, /activeAuditTabs\.get\(details\.tabId\)/);
  assert.match(background, /type === "START_AUDIT"/);
  assert.match(background, /type === "STOP_AUDIT"/);
  assert.match(background, /AUDIT_STATE_STORAGE_KEY/);
  assert.match(background, /service-worker-restarted/);
  assert.match(background, /tab-closed/);
  assert.match(background, /minimizeUrlEvidence/);
  assert.doesNotMatch(background, /url: details\.url/);
  assert.match(content, /AUDIT_NAVIGATION/);
  assert.match(content, /sanitizePageUrl/);
  assert.match(content, /minimizePageEvidence/);
  assert.match(lifecycle, /not technically inspectable|incomplete/);
  assert.match(content, /maxPageTextChars/);
  assert.match(content, /maxHtmlSampleChars/);
  assert.match(content, /maxResources/);
  assert.match(content, /fetchWithTimeout/);
  assert.match(content, /maxContactResponseChars/);
  assert.match(content, /analysisStartedAt = performance\.now\(\)/);
  assert.match(content, /durationMs: Math\.round\(performance\.now\(\) - analysisStartedAt\)/);
});
