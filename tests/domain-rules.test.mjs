import test from "node:test";
import assert from "node:assert/strict";
import "../src/domain-rules.js";

const rules = globalThis.CookieBuddyDomainRules;

test("uses offline registrable-domain rules for common multi-level suffixes", () => {
  assert.equal(rules.registrableDomain("shop.example.co.uk"), "example.co.uk");
  assert.equal(rules.registrableDomain("cdn.example.com.au"), "example.com.au");
  assert.equal(rules.registrableDomain("assets.example.co.jp"), "example.co.jp");
  assert.equal(rules.registrableDomain("tenant.example.github.io"), "example.github.io");
});

test("normalizes IDNs and keeps localhost and IP addresses as their own hosts", () => {
  assert.equal(rules.normalizeHostname("bücher.example"), "xn--bcher-kva.example");
  assert.equal(rules.registrableDomain("xn--bcher-kva.example"), "xn--bcher-kva.example");
  assert.equal(rules.registrableDomain("localhost"), "localhost");
  assert.equal(rules.registrableDomain("127.0.0.1"), "127.0.0.1");
  assert.equal(rules.registrableDomain("[::1]"), "[::1]");
});

test("distinguishes same-site, first-party subdomains, third parties, and possible cloaking", () => {
  assert.equal(rules.classifyEndpointRelationship({ host: "example.co.uk", pageHost: "example.co.uk", path: "/" }).relationship, "same-site");
  assert.equal(rules.classifyEndpointRelationship({ host: "cdn.example.co.uk", pageHost: "www.example.co.uk", path: "/app.js" }).relationship, "first-party-subdomain");
  assert.equal(rules.classifyEndpointRelationship({ host: "tracker.other.co.uk", pageHost: "www.example.co.uk", path: "/pixel" }).relationship, "third-party");

  const possible = rules.classifyEndpointRelationship({ host: "analytics.example.co.uk", pageHost: "www.example.co.uk", path: "/collect" });
  assert.equal(possible.relationship, "possible-cloaked-tracker");
  assert.equal(possible.cnameStatus, "unknown");
  assert.equal(possible.cnameRule.id, "analytics-host-label");

  const ordinary = rules.classifyEndpointRelationship({ host: "cdn.example.co.uk", pageHost: "www.example.co.uk", path: "/collective/app.js" });
  assert.equal(ordinary.relationship, "first-party-subdomain");
  assert.equal(rules.classifyEndpointRelationship({ host: "", pageHost: "www.example.co.uk" }).relationship, "unknown");
});
