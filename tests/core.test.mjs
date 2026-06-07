import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDelta,
  capitalize,
  cookieKey,
  formatCookie,
  formatDeltaReport,
  getBaseDomain,
  isEssentialCookie,
  normalizeTraffic,
  serviceForCookie
} from "../src/core.js";

test("capitalizes labels for category headings", () => {
  assert.equal(capitalize("analytics"), "Analytics");
});

test("builds stable cookie keys", () => {
  assert.equal(cookieKey({ domain: ".example.com", path: "/", name: "sid" }), ".example.com|/|sid");
});

test("detects essential cookies by name", () => {
  assert.equal(isEssentialCookie({ name: "cookie_consent" }), true);
  assert.equal(isEssentialCookie({ name: "ga_id" }), false);
});

test("maps known cookie services and falls back cleanly", () => {
  assert.equal(serviceForCookie({ name: "_ga", domain: ".example.com" }, "Unknown service"), "Google Analytics");
  assert.equal(serviceForCookie({ name: "x", domain: ".example.com" }, "Unknown service"), "Unknown service");
});

test("formats cookies with service labels", () => {
  const result = formatCookie({ name: "_hjSession", domain: ".example.com", path: "/", secure: true, sameSite: "Lax" }, "Unknown service");
  assert.equal(result.service, "Hotjar");
  assert.equal(result.path, "/");
});

test("extracts base domains", () => {
  assert.equal(getBaseDomain("sub.example.com"), "example.com");
  assert.equal(getBaseDomain("example.de"), "example.de");
});

test("keeps only third-party traffic", () => {
  const result = normalizeTraffic(
    [
      { url: "https://cdn.example.com/script.js", type: "script" },
      { url: "https://analytics.other.com/pixel.js", type: "script" },
      { url: "not-a-url", type: "script" }
    ],
    "www.example.com"
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].host, "analytics.other.com");
});

test("builds a delta summary from the before and after states", () => {
  const delta = buildDelta({
    beforeCookies: [
      { domain: ".example.com", path: "/", name: "session" },
      { domain: ".example.com", path: "/", name: "_ga" }
    ],
    afterCookies: [
      { domain: ".example.com", path: "/", name: "session" },
      { domain: ".example.com", path: "/", name: "_ga" },
      { domain: ".example.com", path: "/", name: "_hjSession" }
    ],
    beforeTraffic: [{ host: "cdn.example.com" }],
    afterTraffic: [{ host: "cdn.example.com" }, { host: "tracker.example.net" }],
    afterStorageEntries: [],
    denyClicked: true,
    denyLabel: "Reject all",
    labels: {
      deltaFoundSummary: "found",
      noDeltaSummary: "none"
    },
    tabUrl: "https://example.com"
  });

  assert.equal(delta.riskLevel, "high");
  assert.equal(delta.thirdPartyHosts.includes("tracker.example.net"), true);
  assert.equal(delta.summary, "found");
});

test("treats remaining storage entries as part of the delta", () => {
  const delta = buildDelta({
    beforeCookies: [{ domain: ".example.com", path: "/", name: "session" }],
    afterCookies: [{ domain: ".example.com", path: "/", name: "session" }],
    beforeTraffic: [],
    afterTraffic: [],
    afterStorageEntries: [
      { key: "consent_state", scope: "localStorage" }
    ],
    denyClicked: true,
    denyLabel: "Reject all",
    labels: {
      deltaFoundSummary: "found",
      noDeltaSummary: "none"
    },
    tabUrl: "https://example.com"
  });

  assert.equal(delta.riskLevel, "high");
  assert.equal(delta.afterDenyCounts.storageEntries, 1);
  assert.equal(delta.afterStorageEntries.length, 1);
});

test("formats delta report as plain text", () => {
  const delta = buildDelta({
    beforeCookies: [
      { domain: ".example.com", path: "/", name: "session" }
    ],
    afterCookies: [
      { domain: ".example.com", path: "/", name: "session" },
      { domain: ".example.com", path: "/", name: "_ga" }
    ],
    beforeTraffic: [{ host: "cdn.example.com" }],
    afterTraffic: [{ host: "cdn.example.com" }, { host: "tracker.example.net" }],
    afterStorageEntries: [],
    denyClicked: true,
    denyLabel: "Reject all",
    labels: {
      deltaFoundSummary: "Delta found",
      noDeltaSummary: "No delta"
    },
    tabUrl: "https://example.com"
  });

  const report = formatDeltaReport(delta, "https://example.com");
  
  assert.match(report, /COOKIE CONSENT DELTA REPORT/);
  assert.match(report, /example.com/);
  assert.match(report, /HIGH RISK/);
  assert.match(report, /Delta found/);
  assert.match(report, /_ga/);
  assert.match(report, /tracker.example.net/);
});

test("formats delta report with low risk", () => {
  const delta = buildDelta({
    beforeCookies: [
      { domain: ".example.com", path: "/", name: "session" }
    ],
    afterCookies: [
      { domain: ".example.com", path: "/", name: "session" }
    ],
    beforeTraffic: [],
    afterTraffic: [],
    afterStorageEntries: [],
    denyClicked: true,
    denyLabel: "Reject all",
    labels: {
      deltaFoundSummary: "Delta found",
      noDeltaSummary: "No delta"
    },
    tabUrl: "https://example.com"
  });

  const report = formatDeltaReport(delta, "https://example.com");
  
  assert.match(report, /LOW RISK/);
  assert.match(report, /no obvious concerns/i);
  assert.match(report, /No new cookies created/);
  assert.match(report, /No third-party traffic/);
});

test("formats delta report without deny click", () => {
  const delta = buildDelta({
    beforeCookies: [
      { domain: ".example.com", path: "/", name: "session" }
    ],
    afterCookies: [
      { domain: ".example.com", path: "/", name: "session" }
    ],
    beforeTraffic: [],
    afterTraffic: [],
    afterStorageEntries: [],
    denyClicked: false,
    denyLabel: "",
    labels: {
      deltaFoundSummary: "Delta found",
      noDeltaSummary: "No delta"
    },
    tabUrl: "https://example.com"
  });

  const report = formatDeltaReport(delta);
  
  assert.match(report, /HIGH RISK/);
  assert.match(report, /Deny button could NOT be clicked/);
});
