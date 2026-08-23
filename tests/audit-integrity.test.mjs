import test from "node:test";
import assert from "node:assert/strict";
import { assessAuditIntegrity, isBlockedRequestError } from "../src/audit-integrity.mjs";

const detectedBanner = { confidence: "high", name: "Cookiebot" };

test("reports a prior consent marker as contaminated starting state", () => {
  const result = assessAuditIntegrity({
    beforeCookies: [{ name: "OptanonConsent", domain: ".example.test" }],
    beforeAnalysis: { banner: detectedBanner }
  });

  assert.equal(result.status, "contaminated");
  assert.equal(result.knownStartingState, "prior-consent");
  assert.equal(result.uncertain, true);
  assert.ok(result.limitations.includes("prior-consent"));
  assert.equal(result.evidence[0].scope, "cookie");
});

test("distinguishes a prior opt-out marker from generic consent state", () => {
  const result = assessAuditIntegrity({
    beforeStorageEntries: [{ key: "cookie_opt_out", scope: "localStorage", valuePreview: "true" }],
    beforeAnalysis: { banner: detectedBanner }
  });

  assert.equal(result.status, "contaminated");
  assert.equal(result.knownStartingState, "prior-opt-out");
  assert.ok(result.evidence.some((item) => item.type === "prior-opt-out-marker"));
  assert.equal(result.recommendation, "rerun-clean-environment");
});

test("keeps blocked tracker requests separate and minimizes their evidence", () => {
  assert.equal(isBlockedRequestError("net::ERR_BLOCKED_BY_CLIENT"), true);
  const result = assessAuditIntegrity({
    beforeAnalysis: { banner: detectedBanner },
    blockedRequests: [{
      url: "https://tracker.example.test/pixel?email=secret#fragment",
      type: "image",
      error: "net::ERR_BLOCKED_BY_CLIENT"
    }]
  });

  assert.equal(result.status, "unknown");
  assert.ok(result.limitations.includes("blocked-tracker-request"));
  assert.equal(result.evidence[0].type, "blocked-tracker-request");
  assert.equal(result.evidence[0].url, "https://tracker.example.test/pixel");
  assert.doesNotMatch(JSON.stringify(result), /secret|fragment/);
});

test("marks an observable clean baseline only when a banner is present and no contamination is found", () => {
  const result = assessAuditIntegrity({ beforeAnalysis: { banner: detectedBanner } });
  assert.equal(result.status, "clean");
  assert.equal(result.uncertain, false);
  assert.equal(result.knownStartingState, "clean");
});
