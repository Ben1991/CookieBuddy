import test from "node:test";
import assert from "node:assert/strict";

await import("../src/service-rules.js");
const serviceRules = globalThis.CookieBuddyServiceRules;

test("local service rules are versioned and validate without conflicts", () => {
  assert.match(serviceRules.version, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(serviceRules.rules.length >= 15);
  assert.deepEqual(serviceRules.validate(), { valid: true, errors: [] });
});

test("known domain and cookie signals expose their matching evidence", () => {
  const domainMatch = serviceRules.match({ url: "https://region1.analytics.google-analytics.com/collect" });
  assert.equal(domainMatch.name, "Google Analytics");
  assert.equal(domainMatch.category, "analytics");
  assert.equal(domainMatch.confidence, "high");
  assert.deepEqual(domainMatch.evidence, {
    source: "Google Analytics domain or cookie signature",
    version: serviceRules.version,
    matchedBy: "domain"
  });

  const cookieMatch = serviceRules.match({ cookieName: "_clsk", cookieDomain: ".example.test" });
  assert.equal(cookieMatch.name, "Microsoft Clarity");
  assert.equal(cookieMatch.evidence.matchedBy, "cookie-name");
});

test("unknown signals remain unmapped instead of being guessed", () => {
  assert.equal(serviceRules.match({ url: "https://unknown-tracker.example/pixel.js" }), null);
  assert.equal(serviceRules.match({ cookieName: "mystery_id", cookieDomain: ".example.test" }), null);
});

test("rule validation reports duplicate and conflicting signatures", () => {
  const [first] = serviceRules.rules;
  const result = serviceRules.validate([
    first,
    { ...first, id: "duplicate-id" },
    { ...first, id: "conflict-id", domains: [first.domains[0]], cookieNames: [], cookiePrefixes: [] }
  ]);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("conflicting signature domain:googletagmanager.com")));
});
