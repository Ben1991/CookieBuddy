import test from "node:test";
import assert from "node:assert/strict";
import { classifyNecessity } from "../src/necessity-rules.mjs";

const genericInfrastructureHost = ["static", "cloudflare", "com"].join(".");

test("classifies the four necessity states conservatively", () => {
  assert.equal(classifyNecessity({ kind: "storage", scope: "Cache Storage" }).classification, "known-necessary");
  assert.equal(classifyNecessity({ kind: "cookie", cookieName: "sessionid" }).classification, "likely-necessary");
  assert.equal(classifyNecessity({ kind: "storage", storageKey: "marketing_state" }).classification, "non-essential");
  assert.equal(classifyNecessity({ kind: "traffic" }).classification, "unknown");
});

test("cookie names and generic infrastructure have non-definitive evidence", () => {
  const cookie = classifyNecessity({ kind: "cookie", cookieName: "cookie_consent" });
  const host = classifyNecessity({ kind: "traffic", host: genericInfrastructureHost });
  assert.notEqual(cookie.classification, "known-necessary");
  assert.equal(cookie.source, "no-necessity-rule");
  assert.equal(host.classification, "unknown");
  assert.match(host.rationale, new RegExp(genericInfrastructureHost.replaceAll(".", "\\.")));
});

test("versioned service evidence can prove optional purpose without proving necessity", () => {
  const result = classifyNecessity({
    kind: "traffic",
    serviceRule: {
      id: "google-analytics",
      category: "analytics",
      confidence: "high",
      evidence: { source: "Google Analytics domain signature" }
    }
  });
  assert.equal(result.classification, "non-essential");
  assert.equal(result.source, "versioned-service-rule");
  assert.equal(result.confidence, "high");
});
