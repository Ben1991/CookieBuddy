import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDelta,
  buildServiceAudit,
  capitalize,
  cookieKey,
  createCoverageSummary,
  deriveAuditVerdict,
  deriveHeuristicSignals,
  formatCookie,
  formatDeltaReport,
  getBaseDomain,
  isEssentialCookie,
  isEssentialHost,
  normalizeTraffic,
  serviceForCookie,
  serviceRuleForCookie
} from "../src/core.js";

test("capitalizes labels for category headings", () => {
  assert.equal(capitalize("analytics"), "Analytics");
});

test("builds stable cookie keys", () => {
  assert.equal(cookieKey({ domain: ".example.com", path: "/", name: "sid" }), ".example.com|/|sid");
});

test("detects essential cookies by name", () => {
  assert.equal(isEssentialCookie({ name: "cookie_consent" }), true);
  assert.equal(isEssentialCookie({ name: "__cf_bm" }), true);
  assert.equal(isEssentialCookie({ name: "ga_id" }), false);
});

test("keeps observable evidence, scope limitations, and heuristic signals separate", () => {
  const coverage = createCoverageSummary({
    delta: {
      banner: { confidence: "high", evidence: [{ source: "DOM marker" }] },
      beforeCounts: { cookies: 2, thirdPartyHosts: 1 },
      afterDenyCounts: { cookies: 1, thirdPartyHosts: 1, storageEntries: 0 },
      cookieCoverage: { complete: true, requestedHosts: ["example.test"], unavailableHosts: [], thirdPartyHosts: [] },
      thirdPartyHosts: ["fpjs.example.net"]
    }
  });

  assert.equal(coverage.auditComplete, true);
  assert.deepEqual(coverage.observed.map((item) => item.state), ["observed", "observed", "observed", "observed", "not-observed", "observed", "not-observed"]);
  assert.equal(coverage.limitations.find((item) => item.key === "server-side-tagging").state, "not-technically-inspectable");
  assert.equal(coverage.limitations.find((item) => item.key === "first-party-proxy").state, "not-detected");
  assert.equal(coverage.limitations.find((item) => item.key === "opaque-client-signal").state, "not-observed");
  assert.equal(coverage.heuristicSignals[0].key, "fingerprinting");
  assert.equal(coverage.heuristicSignals[0].confirmed, false);
  assert.equal(deriveHeuristicSignals({ thirdPartyHosts: ["analytics.example.net"] }).length, 0);
});

test("keeps inaccessible consent surfaces incomplete and explicit", () => {
  const inaccessibleConsentSurfaces = [{
    domContext: "inaccessible-cross-origin-frame",
    frameUrl: "https://cmp.example.test/banner",
    frameOrigin: "https://cmp.example.test",
    reason: "cross-origin-frame-inaccessible"
  }];
  const delta = buildDelta({
    beforeCookies: [],
    afterCookies: [],
    beforeTraffic: [],
    afterTraffic: [],
    banner: { confidence: "high", evidence: [{ type: "inaccessible-surface" }] },
    inaccessibleConsentSurfaces,
    denyClicked: true,
    denyVerified: true,
    labels: { deltaFoundSummary: "found", noDeltaSummary: "none" },
    tabUrl: "https://example.com"
  });

  const verdict = deriveAuditVerdict(delta);
  assert.equal(verdict.status, "incomplete");
  assert.ok(verdict.reasons.includes("consent-surface-inaccessible"));
  const coverage = createCoverageSummary({ delta });
  assert.equal(coverage.auditComplete, false);
  assert.equal(coverage.observed.find((item) => item.key === "consent-surface").state, "not-technically-inspectable");
  assert.match(formatDeltaReport(delta), /INACCESSIBLE CONSENT SURFACES/);
  assert.match(formatDeltaReport(delta), /cmp\.example\.test/);
  assert.match(formatDeltaReport(delta), /AUDIT INTEGRITY/);
});

test("detects essential infrastructure hosts", () => {
  assert.equal(isEssentialHost("static.cloudflare.com"), true);
  assert.equal(isEssentialHost("assets.cloudfront.net"), true);
  assert.equal(isEssentialHost("google-analytics.com"), false);
});

test("maps known cookie services and falls back cleanly", () => {
  assert.equal(serviceForCookie({ name: "_ga", domain: ".example.com" }, "Unknown service"), "Google Analytics");
  assert.equal(serviceForCookie({ name: "x", domain: ".example.com" }, "Unknown service"), "Unknown service");
  assert.equal(serviceRuleForCookie({ name: "_ga", domain: ".example.com" }).evidence.matchedBy, "cookie-name");
});

test("formats cookies with service labels", () => {
  const result = formatCookie({ name: "_hjSession", domain: ".example.com", path: "/", secure: true, sameSite: "Lax" }, "Unknown service");
  assert.equal(result.service, "Hotjar");
  assert.equal(result.serviceRuleId, "hotjar");
  assert.equal(result.serviceEvidence.matchedBy, "cookie-name");
  assert.equal(result.path, "/");
});

test("extracts base domains", () => {
  assert.equal(getBaseDomain("sub.example.com"), "example.com");
  assert.equal(getBaseDomain("example.de"), "example.de");
  assert.equal(getBaseDomain("shop.example.co.uk"), "example.co.uk");
  assert.equal(getBaseDomain("cdn.example.com.au"), "example.com.au");
  assert.equal(getBaseDomain("assets.example.co.jp"), "example.co.jp");
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
  assert.equal(result[0].url, "https://analytics.other.com/pixel.js");
});

test("minimizes request URLs before traffic classification", () => {
  const result = normalizeTraffic([
    { url: "https://analytics.other.com/pixel?email=alice%40example.com&query=private%20term#section", type: "xmlhttprequest" }
  ], "www.example.com");

  assert.equal(result[0].url, "https://analytics.other.com/pixel");
  assert.deepEqual(result[0].queryKeys, ["email", "query"]);
  assert.doesNotMatch(JSON.stringify(result[0]), /alice|private|section/);
});

test("keeps possible first-party-cloaked trackers unknown instead of treating them as safe", () => {
  const traffic = normalizeTraffic([
    { url: "https://analytics.example.co.uk/collect", type: "xmlhttprequest" },
    { url: "https://tracker.other.co.uk/pixel", type: "script" }
  ], "www.example.co.uk");

  assert.deepEqual(traffic.map((item) => item.relationship), ["possible-cloaked-tracker", "third-party"]);
  const delta = buildDelta({
    beforeCookies: [],
    afterCookies: [],
    beforeTraffic: [],
    afterTraffic: traffic,
    denyClicked: true,
    denyVerified: true,
    banner: { confidence: "high" },
    labels: { deltaFoundSummary: "found", noDeltaSummary: "none" },
    tabUrl: "https://www.example.co.uk"
  });

  assert.deepEqual(delta.thirdPartyHosts, ["tracker.other.co.uk"]);
  assert.equal(delta.possibleCloakedTrackers[0].host, "analytics.example.co.uk");
  assert.equal(delta.cnameCoverage.status, "unknown");
  assert.match(formatDeltaReport(delta), /CNAME ROUTING COVERAGE/);
  const verdict = deriveAuditVerdict({
    ...delta,
    integrity: { status: "clean", uncertain: false },
    cookieCoverage: { complete: true, requestedHosts: ["example.co.uk"], unavailableHosts: [] },
    browserStorage: { after: { indexedDB: { status: "observed" }, cacheStorage: { status: "observed" }, serviceWorkers: { status: "observed" } } }
  });
  assert.equal(verdict.status, "incomplete");
  assert.ok(verdict.reasons.includes("cname-routing"));
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
    afterTraffic: [{ host: "cdn.example.com" }, { host: "tracker.example.net" }, { host: "static.cloudflare.com" }],
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
  assert.equal(delta.thirdPartyHosts.includes("static.cloudflare.com"), false);
  assert.equal(delta.essentialThirdPartyHosts.includes("static.cloudflare.com"), true);
  assert.equal(delta.summary, "found");
});

test("keeps report evidence metadata without cookie, storage, or URL values", () => {
  const delta = buildDelta({
    beforeCookies: [{ name: "_ga", domain: ".example.com", path: "/", value: "cookie-secret", secure: true, sameSite: "lax" }],
    afterCookies: [{ name: "_ga", domain: ".example.com", path: "/", value: "cookie-secret", secure: true, sameSite: "lax" }],
    beforeTraffic: [{ url: "https://analytics.example.net/pixel?email=alice@example.com", type: "xmlhttprequest", timeStamp: 100 }],
    afterTraffic: [{ url: "https://analytics.example.net/pixel?email=alice@example.com", type: "xmlhttprequest", timeStamp: 200 }],
    beforeAnalysis: {
      storage: { items: [{ key: "consent_state", scope: "localStorage", valuePreview: "storage-secret", inBanner: true }] },
      consentState: { bannerVisible: true, bannerSignature: "before" }
    },
    afterAnalysis: { consentState: { bannerVisible: false, bannerSignature: "after" } },
    afterStorageEntries: [{ key: "consent_state", scope: "localStorage", valuePreview: "storage-secret", inBanner: true }],
    denyClicked: true,
    denyLabel: "Reject all",
    labels: { deltaFoundSummary: "found", noDeltaSummary: "none" },
    tabUrl: "https://example.com"
  });

  assert.equal("value" in delta.cookieEvidence.after[0], false);
  assert.equal("valuePreview" in delta.storageEvidence.after[0], false);
  assert.equal(delta.networkEvidence.after[0].timeStamp, 200);
  assert.deepEqual(delta.networkEvidence.after[0].queryKeys, ["email"]);
  assert.doesNotMatch(JSON.stringify(delta.networkEvidence), /alice|example\.com\/pixel\?/);
  assert.equal(delta.consentEvidence.before.bannerSignature, "before");
  assert.equal(delta.consentEvidence.after.bannerVisible, false);
});

test("turns a verified optional consent contradiction into a high-confidence negative verdict", () => {
  const consentState = (value) => ({
    apiSupport: { tcf: "observed", googleConsentMode: "observed" },
    frameworks: ["iab-tcf", "google-consent-mode"],
    signals: [
      { framework: "iab-tcf", key: "purpose:3", value, optional: true, source: "__tcfapi:getTCData", observedAt: "2026-08-23T10:00:00.000Z" },
      { framework: "google-consent-mode", key: "analytics_storage", value: "denied", optional: true, source: "dataLayer:update", observedAt: "2026-08-23T10:00:00.000Z" }
    ]
  });
  const delta = buildDelta({
    beforeCookies: [],
    afterCookies: [],
    beforeTraffic: [],
    afterTraffic: [],
    beforeAnalysis: { consentState: consentState("granted") },
    afterAnalysis: { consentState: consentState("granted") },
    banner: { name: "Test CMP", confidence: "high", evidence: [{ type: "fixture" }] },
    denyClicked: true,
    denyVerified: true,
    labels: { deltaFoundSummary: "found", noDeltaSummary: "none" },
    tabUrl: "https://example.com"
  });
  const verdict = deriveAuditVerdict({
    ...delta,
    integrity: { uncertain: false },
    cookieCoverage: { complete: true },
    browserStorage: { after: { indexedDB: { status: "observed" }, cacheStorage: { status: "observed" }, serviceWorkers: { status: "observed" } } }
  });

  assert.equal(delta.consentContradictions[0].key, "purpose:3");
  assert.equal(verdict.status, "negative");
  assert.ok(verdict.reasons.includes("consent-signal-contradiction"));
});

test("keeps extended browser storage metadata as before-and-after evidence", () => {
  const storage = {
    localStorageKeys: [],
    sessionStorageKeys: [],
    indexedDbNames: ["consent-db"],
    indexedDb: { status: "observed", databases: [{ name: "consent-db", version: 2 }] },
    cacheStorage: { status: "observed", caches: [{ name: "app-shell", status: "observed", keys: [{ url: "https://example.com/app.js", method: "GET", queryKeys: [] }] }] },
    serviceWorkers: { status: "observed", registrations: [{ scope: "https://example.com/", scriptUrl: "https://example.com/sw.js", state: "activated" }] },
    coverage: { indexedDB: "observed", cacheStorage: "observed", serviceWorkers: "observed" }
  };
  const delta = buildDelta({
    beforeCookies: [],
    afterCookies: [],
    beforeTraffic: [],
    afterTraffic: [],
    beforeAnalysis: { storage },
    afterStorage: storage,
    denyClicked: true,
    denyVerified: true,
    labels: { deltaFoundSummary: "found", noDeltaSummary: "none" },
    tabUrl: "https://example.com"
  });

  assert.equal(delta.browserStorage.before.indexedDB.names[0], "consent-db");
  assert.equal(delta.browserStorage.after.cacheStorage.caches[0].keys[0].url, "https://example.com/app.js");
  assert.equal(delta.browserStorage.after.serviceWorkers.registrations[0].scriptUrl, "https://example.com/sw.js");
  assert.equal("valuePreview" in delta.browserStorage.after.cacheStorage.caches[0].keys[0], false);
});

test("keeps delta low when only essential cookies and infrastructure remain after manual opt-out", () => {
  const delta = buildDelta({
    beforeCookies: [
      { domain: ".example.com", path: "/", name: "session" }
    ],
    afterCookies: [
      { domain: ".example.com", path: "/", name: "session" },
      { domain: ".example.com", path: "/", name: "__cf_bm" }
    ],
    beforeTraffic: [],
    afterTraffic: [{ host: "static.cloudflare.com" }],
    denyClicked: false,
    manualConsentConfirmed: true,
    denyLabel: "",
    labels: {
      deltaFoundSummary: "Delta found",
      noDeltaSummary: "No delta"
    },
    tabUrl: "https://example.com"
  });

  assert.equal(delta.riskLevel, "low");
  assert.deepEqual(delta.thirdPartyHosts, []);
  assert.deepEqual(delta.essentialThirdPartyHosts, ["static.cloudflare.com"]);
  assert.equal(delta.denyAction.manual, true);
});

test("treats remaining storage entries as part of the delta", () => {
  const delta = buildDelta({
    beforeCookies: [{ domain: ".example.com", path: "/", name: "session" }],
    afterCookies: [{ domain: ".example.com", path: "/", name: "session" }],
    beforeTraffic: [],
    afterTraffic: [],
    afterStorageEntries: [
      { key: "marketing_state", scope: "localStorage" }
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

test("keeps Cache Storage and service-worker presence as metadata instead of non-essential tracking evidence", () => {
  const delta = buildDelta({
    beforeCookies: [],
    afterCookies: [],
    beforeTraffic: [],
    afterTraffic: [],
    afterStorageEntries: [
      { key: "app-shell", scope: "Cache Storage" },
      { key: "https://example.com/", scope: "Service worker" }
    ],
    denyClicked: true,
    denyVerified: true,
    labels: { deltaFoundSummary: "found", noDeltaSummary: "none" },
    tabUrl: "https://example.com"
  });

  assert.equal(delta.riskLevel, "low");
  assert.deepEqual(delta.nonEssentialStorageEntries, []);
});

test("audits banner services against post-opt-out cookies, storage, and traffic", () => {
  const audit = buildServiceAudit({
    bannerCategories: {
      essential: { services: [{ name: "Essential services", source: "Banner text" }] },
      analytics: { services: [{ name: "Google Analytics", source: "www.google-analytics.com" }] },
      marketing: { services: [{ name: "Marketing services", source: "Banner text" }] }
    },
    beforeCookies: [
      { name: "_ga", domain: ".example.com", service: "Google Analytics" }
    ],
    afterCookies: [
      { name: "session", domain: ".example.com", service: "Unknown service" }
    ],
    beforeTraffic: [{ host: "www.google-analytics.com" }],
    afterTraffic: [{ host: "extension.example.net" }, { host: "abc123", protocol: "chrome-extension:", url: "chrome-extension://abc123/script.js" }],
    afterStorageEntries: [{ key: "extension_state", scope: "localStorage" }]
  });

  assert.equal(audit.find((service) => service.name === "Essential services").status, "allowed-essential");
  assert.equal(audit.find((service) => service.name === "Google Analytics").status, "disabled");
  assert.equal(audit.find((service) => service.name === "Marketing services").status, "unclear");
  assert.equal(audit.some((service) => service.name === "extension.example.net" && service.status === "unclear"), true);
  assert.equal(audit.some((service) => service.name === "Browser extension abc123" && service.source === "Browser extension traffic"), true);
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
  assert.match(report, /COVERAGE AND LIMITATIONS/);
  assert.match(report, /not-technically-inspectable/);
  assert.match(report, /Heuristic indicators/);
  assert.match(report, /URL DATA MINIMIZATION/);
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

test("derives a positive verdict only when rejection and before/after coverage are verified", () => {
  const base = {
    banner: { name: "Cookiebot", confidence: "high" },
    denyAction: { clicked: true, verified: true },
    beforeCounts: { cookies: 1, thirdPartyHosts: 0 },
    afterDenyCounts: { cookies: 0, thirdPartyHosts: 0, storageEntries: 0 },
    riskLevel: "low",
    thirdPartyHosts: [],
    remainingCookies: [],
    newCookies: [],
    nonEssentialStorageEntries: [],
    serviceAudit: [],
    integrity: { status: "clean", uncertain: false, evidence: [] },
    cookieCoverage: { complete: true, requestedHosts: ["example.test"], unavailableHosts: [], thirdPartyHosts: [] },
    browserStorage: {
      after: {
        indexedDB: { status: "observed", names: [] },
        cacheStorage: { status: "observed", caches: [] },
        serviceWorkers: { status: "observed", registrations: [] }
      }
    }
  };

  const positive = deriveAuditVerdict(base);
  assert.equal(positive.status, "positive");
  assert.equal(positive.coverage.limitations.find((item) => item.key === "backend-enrichment").state, "not-technically-inspectable");
  assert.equal(deriveAuditVerdict({ ...base, denyAction: { clicked: false } }).status, "incomplete");
  assert.equal(deriveAuditVerdict({ ...base, denyAction: { clicked: true, verified: false } }).status, "incomplete");
  assert.equal(deriveAuditVerdict({ ...base, integrity: { status: "contaminated", uncertain: true } }).status, "incomplete");
  assert.equal(deriveAuditVerdict({ ...base, cookieCoverage: { complete: false, requestedHosts: ["tracker.example"], unavailableHosts: ["tracker.example"] } }).status, "incomplete");
  const unsupportedStorage = deriveAuditVerdict({
    ...base,
    browserStorage: {
      after: {
        indexedDB: { status: "not-inspected", names: [] },
        cacheStorage: { status: "observed", caches: [] },
        serviceWorkers: { status: "observed", registrations: [] }
      }
    }
  });
  assert.equal(unsupportedStorage.status, "incomplete");
  assert.ok(unsupportedStorage.reasons.includes("storage-coverage"));
  assert.equal(deriveAuditVerdict({ ...base, riskLevel: "high", thirdPartyHosts: ["tracker.example"] }).status, "negative");
  const review = deriveAuditVerdict({
    ...base,
    riskLevel: "low",
    serviceAudit: [{ name: "Unmapped banner service", essential: false, confidence: "none", status: "disabled" }]
  });
  assert.equal(review.status, "review");
  assert.deepEqual(review.reasons, ["unclear-service"]);
  assert.deepEqual(review.unresolvedSignals[0], { key: "unclear-service", evidence: ["Unmapped banner service"] });
  assert.deepEqual(review.evidenceLinks, [{ key: "delta-report", href: "details.html?view=delta" }]);
});
