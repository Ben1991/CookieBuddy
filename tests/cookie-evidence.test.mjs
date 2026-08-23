import test from "node:test";
import assert from "node:assert/strict";
import { createCookieCoverage, getObservedCookieHosts, isThirdPartyHost, mergeCookieCoverage } from "../src/cookie-evidence.mjs";

test("limits cookie queries to the visited page and observed request/resource hosts", () => {
  const hosts = getObservedCookieHosts(
    "https://www.example.test/article?private=value",
    [{ url: "https://analytics.vendor.test/pixel", host: "analytics.vendor.test" }],
    [{ url: "https://cdn.example.test/script.js", host: "cdn.example.test" }, { url: "https://unrelated.test/nope", host: "unrelated.test" }]
  );

  assert.deepEqual(hosts, ["analytics.vendor.test", "cdn.example.test", "example.test", "unrelated.test", "www.example.test"]);
  assert.equal(hosts.includes("other.example.test"), false);
});

test("classifies first-party and subdomain cookies separately from third-party cookies", () => {
  assert.equal(isThirdPartyHost("www.example.test", "example.test"), false);
  assert.equal(isThirdPartyHost("cdn.example.test", "example.test"), false);
  assert.equal(isThirdPartyHost("tracker.vendor.test", "example.test"), true);

  const coverage = createCookieCoverage({
    pageHost: "www.example.test",
    requestedHosts: ["www.example.test", "cdn.example.test", "tracker.vendor.test"],
    unavailableHosts: []
  });
  assert.equal(coverage.complete, true);
  assert.deepEqual(coverage.thirdPartyHosts, ["tracker.vendor.test"]);
});

test("marks an unavailable third-party host as incomplete and preserves it across before/after", () => {
  const before = createCookieCoverage({ pageHost: "example.test", requestedHosts: ["example.test", "tracker.vendor.test"], unavailableHosts: [] });
  const after = createCookieCoverage({ pageHost: "example.test", requestedHosts: ["example.test", "tracker.vendor.test"], unavailableHosts: ["tracker.vendor.test"] });
  const merged = mergeCookieCoverage(before, after);

  assert.equal(merged.complete, false);
  assert.deepEqual(merged.unavailableHosts, ["tracker.vendor.test"]);
  assert.deepEqual(merged.thirdPartyHosts, ["tracker.vendor.test"]);
});
