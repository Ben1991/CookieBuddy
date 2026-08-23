import test from "node:test";
import assert from "node:assert/strict";
import { createAuditReport, verifyAuditReport } from "../src/audit-report.mjs";

test("creates a reproducible hashed report with minimized evidence and finding links", async () => {
  const delta = {
    url: "https://example.com/article?email=alice@example.com#private",
    checkedAt: "2026-08-23T10:00:00.000Z",
    banner: { name: "Example CMP", confidence: "high", evidence: [{ type: "dom", source: "banner", value: "reject-all" }] },
    denyAction: { clicked: true, label: "Reject all", verified: true },
    consentEvidence: { before: { bannerVisible: true }, after: { bannerVisible: false } },
    cookieEvidence: { before: [{ name: "_ga", domain: ".example.com", path: "/", classification: { essential: false } }], after: [] },
    storageEvidence: { before: [{ key: "consent_state", scope: "localStorage" }], after: [] },
    networkEvidence: { before: [{ url: "https://analytics.example.net/pixel", queryKeys: ["email"], timeStamp: 100 }], after: [] },
    serviceAudit: [{ name: "Google Analytics", status: "active", source: "local rule" }],
    thirdPartyHosts: ["analytics.example.net"],
    summary: "Third-party activity remained after rejection.",
    riskLevel: "high",
    verdict: { status: "negative", confidence: "high", reasons: ["third-party-traffic"], unresolvedSignals: [], evidenceLinks: [{ href: "details.html?view=delta" }] },
    auditTimeline: [{ step: "baseline", at: "2026-08-23T10:00:00.000Z" }, { step: "after-deny", at: "2026-08-23T10:00:05.000Z" }],
    auditLifecycle: { status: "complete", events: [] },
    controlledReloads: [{ phase: "baseline-reload", status: "completed" }, { phase: "post-rejection-reload", status: "completed" }],
    observationWindow: { phase: "post-rejection", requestedMs: 1800, observedMs: 1800, status: "completed" },
    coverage: { auditComplete: true, limitations: [] },
    cookieCoverage: { complete: true },
    cnameCoverage: { status: "unknown" }
  };
  const report = await createAuditReport({
    delta,
    manifest: { name: "CookieBuddy", version: "2.4.0" },
    browser: { userAgent: "TestBrowser/1.0", platform: "test", language: "en-US", brands: [] }
  });

  assert.equal(report.payload.audit.checkedUrl, "https://example.com/article");
  assert.equal(report.payload.audit.hostname, "example.com");
  assert.equal(report.payload.audit.extension.version, "2.4.0");
  assert.equal(report.payload.timeline.auditSteps.length, 2);
  assert.equal(report.payload.timeline.controlledReloads.length, 2);
  assert.equal(report.payload.timeline.observationWindow.requestedMs, 1800);
  assert.equal(report.payload.interpretation.findings[0].evidence[0].section, "network.after");
  assert.match(report.integrity.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(await verifyAuditReport(report), true);
  assert.doesNotMatch(JSON.stringify(report), /alice@example\.com|private|cookie-secret|storage-secret/);

  const tampered = JSON.parse(JSON.stringify(report));
  tampered.payload.interpretation.summary = "changed";
  assert.equal(await verifyAuditReport(tampered), false);
});

test("reports unknown context without inventing browser or extension facts", async () => {
  const report = await createAuditReport({ delta: { url: "https://example.com", checkedAt: "2026-08-23T10:00:00.000Z" } });
  assert.equal(report.payload.audit.extension.version, "unknown");
  assert.ok(report.payload.audit.browser.userAgent.length > 0);
  assert.equal(await verifyAuditReport(report), true);
});
