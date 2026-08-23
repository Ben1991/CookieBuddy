import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = 4173;
const fixtureAnalysis = {
  url: "https://example.com/article",
  host: "example.com",
  title: "Example article",
  banner: { name: "Cookiebot", confidence: "high", evidence: [{ type: "signature", value: "cookiebot" }] },
  categories: {
    analytics: { services: [{ name: "Google Analytics", count: 1 }] },
    essential: { services: [{ name: "Essential infrastructure", count: 1 }] }
  },
  resources: [{ url: "https://analytics.example.net/script.js", host: "analytics.example.net", thirdParty: true }],
  contacts: { dpo: { kind: "dpo", email: "privacy@example.com", source: "Privacy policy", sourceUrl: "https://example.com/privacy" }, authority: { name: "Federal data protection authority", key: "fallback", note: "Review the privacy notice.", url: "https://authority.example.test/complaints" } },
  storage: {
    items: [{ key: "session_state", scope: "localStorage", valuePreview: "active", inBanner: false }],
    localStorageKeys: ["session_state"],
    sessionStorageKeys: [],
    indexedDbNames: ["consent-db"],
    indexedDb: { status: "observed", databases: [{ name: "consent-db", version: 1 }] },
    cacheStorage: { status: "observed", caches: [{ name: "app-shell", status: "observed", keys: [{ url: "https://example.com/app.js", method: "GET", queryKeys: [] }] }] },
    serviceWorkers: { status: "observed", registrations: [{ scope: "https://example.com/", scriptUrl: "https://example.com/sw.js", state: "activated" }] },
    coverage: { indexedDB: "observed", cacheStorage: "observed", serviceWorkers: "observed" }
  }
};
const fixtureCookies = [
  { name: "_ga", domain: "example.com", path: "/", secure: true, sameSite: "lax" },
  { name: "session_id", domain: "example.com", path: "/", secure: true, sameSite: "lax" }
];
const fixtureDelta = {
  url: fixtureAnalysis.url,
  checkedAt: "2026-08-09T12:00:00.000Z",
  riskLevel: "high",
  summary: "Review signal: non-essential activity remained after opt-out.",
  banner: fixtureAnalysis.banner,
  denyAction: { clicked: true, verified: true, label: "Reject all", verification: { status: "verified", evidence: ["banner-state-changed"], actions: [{ label: "Reject all", source: "locale", confidence: "medium" }] } },
  remainingCookies: [{ name: "_ga", domain: "example.com", service: "Google Analytics" }],
  newCookies: [],
  remainingStorageEntries: fixtureAnalysis.storage.items,
  thirdPartyHosts: ["analytics.example.net"],
  essentialThirdPartyHosts: [],
  serviceAudit: [
    { name: "Essential services", category: "essential", source: "Banner text", listedInBanner: true, essential: true, status: "allowed-essential" },
    { name: "Google Analytics", category: "analytics", source: "Google Analytics domain or cookie signature", ruleId: "google-analytics", ruleVersion: "2026-08-23", confidence: "high", evidence: { source: "Google Analytics domain or cookie signature", version: "2026-08-23", matchedBy: "domain" }, listedInBanner: false, essential: false, status: "active" },
    { name: "extension.example.net", category: "unlisted", source: "Third-party traffic", listedInBanner: false, essential: false, status: "unclear" }
  ],
  integrity: { status: "clean", uncertain: false, knownStartingState: "clean", limitations: [], evidence: [], recommendation: "none" },
  cookieCoverage: { complete: true, requestedHosts: ["example.com", "analytics.example.net"], thirdPartyHosts: ["analytics.example.net"], unavailableHosts: [] },
  beforeCounts: { cookies: 2, thirdPartyHosts: 1 },
  afterDenyCounts: { cookies: 1, thirdPartyHosts: 1, storageEntries: 1 },
  auditLifecycle: {
    status: "incomplete",
    reason: "redirect-during-audit",
    events: [{ type: "navigation", kind: "redirect", url: "https://example.com/redirected" }]
  },
  consentEvidence: {
    before: { status: "observed", frameworks: ["iab-tcf", "google-consent-mode"], apiSupport: { tcf: "observed", googleConsentMode: "observed" }, signals: [{ framework: "iab-tcf", key: "purpose:3", value: "granted", source: "__tcfapi:getTCData" }], limitations: [] },
    after: { status: "observed", frameworks: ["iab-tcf", "google-consent-mode"], apiSupport: { tcf: "observed", googleConsentMode: "observed" }, signals: [{ framework: "iab-tcf", key: "purpose:3", value: "granted", optional: true, source: "__tcfapi:getTCData" }, { framework: "google-consent-mode", key: "analytics_storage", value: "denied", optional: true, source: "dataLayer:update" }], limitations: [] }
  },
  consentContradictions: [{ framework: "iab-tcf", key: "purpose:3", value: "granted", source: "__tcfapi:getTCData", severity: "high", before: "granted", rationale: "Optional TCF purpose remained granted after verified rejection" }],
  report: { reportVersion: 1, payload: { audit: { hostname: "example.com", extension: { name: "CookieBuddy", version: "2.4.0" }, browser: { userAgent: "TestBrowser/1.0", platform: "test" } } }, integrity: { algorithm: "SHA-256", payloadHash: "b".repeat(64) } },
  browserStorage: {
    before: {
      indexedDB: { status: "observed", names: ["consent-db"] },
      cacheStorage: { status: "observed", caches: [{ name: "app-shell", status: "observed", keys: [{ url: "https://example.com/app.js", method: "GET", queryKeys: [] }] }] },
      serviceWorkers: { status: "observed", registrations: [{ scope: "https://example.com/", scriptUrl: "https://example.com/sw.js", state: "activated" }] }
    },
    after: {
      indexedDB: { status: "observed", names: ["consent-db"] },
      cacheStorage: { status: "observed", caches: [{ name: "app-shell", status: "observed", keys: [{ url: "https://example.com/app.js", method: "GET", queryKeys: [] }] }] },
      serviceWorkers: { status: "observed", registrations: [{ scope: "https://example.com/", scriptUrl: "https://example.com/sw.js", state: "activated" }] }
    }
  }
};

const server = createServer(async (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const filePath = join(root, requestPath === "/" ? "popup.html" : requestPath.slice(1));
  try {
    const contentTypes = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
    response.setHeader("Content-Type", contentTypes[filePath.slice(filePath.lastIndexOf("."))] || "application/octet-stream");
    response.end(await readFile(filePath));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
});

function chromeFixtureScript(mode = "negative") {
  return `
    (() => {
      const reviewMode = ${JSON.stringify(mode === "review")};
      const analysis = ${JSON.stringify(fixtureAnalysis)};
      const cookies = ${JSON.stringify(fixtureCookies)};
      if (reviewMode) {
        analysis.resources = [];
        analysis.categories = { ...analysis.categories, analytics: { services: [{ name: "Unmapped analytics service", count: 1 }] } };
        cookies.splice(0, cookies.length);
      }
      const delta = ${JSON.stringify(fixtureDelta)};
      const storage = { cookiebuddyLanguage: "en", cookiebuddyLastScan: { analysis, cookies, traffic: [] }, cookiebuddyLastDelta: delta };
      globalThis.chrome = {
        runtime: { getURL: (path) => path, onMessage: { addListener: () => {} }, sendMessage: async () => ({ traffic: [] }) },
        i18n: { getUILanguage: () => "en-US" },
        storage: { local: { get: async (key) => typeof key === "string" ? { [key]: storage[key] } : storage, set: async (values) => Object.assign(storage, values) } },
        tabs: { query: async () => [{ id: 1, url: analysis.url }], sendMessage: async (_id, message) => message.type === "TRY_DENY_ALL" ? { found: true, clicked: true, verified: true, label: "Reject all", verification: { status: "verified", evidence: ["banner-state-changed"] } } : analysis, create: async () => {} },
        cookies: { getAll: async () => cookies },
        scripting: { executeScript: async () => {} }
      };
      globalThis.confirm = () => true;
    })();
  `;
}

async function captureDocumentationScreenshot(page, fileName, options = {}) {
  const screenshotDir = process.env.COOKIEBUDDY_SCREENSHOT_DIR;
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: join(screenshotDir, fileName), ...options });
}

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
try {
  const popup = await browser.newPage({ viewport: { width: 460, height: 900 } });
  await popup.addInitScript({ content: chromeFixtureScript() });
  await popup.goto(`http://127.0.0.1:${port}/popup.html`);
  await popup.getByText("example.com", { exact: false }).first().waitFor({ state: "visible", timeoutMs: 10000 });
  assert.ok((await popup.screenshot()).length > 10000, "popup screenshot should contain rendered UI");
  assert.ok(await popup.locator("#deltaButton").isVisible(), "one-click audit action should be visible");
  assert.ok(await popup.locator("#auditQuestion").isVisible(), "the main popup should lead with the audit question");
  assert.ok((await popup.locator("#deltaButton").boundingBox()).y < (await popup.locator("#auditExplainerHeading").boundingBox()).y, "the primary action should precede the explainer");
  assert.ok(await popup.locator("#auditSteps").isVisible(), "audit progress steps should be visible");
  assert.equal(await popup.locator("#visualEvidenceToggle").isChecked(), false, "visual evidence must be opt-in");
  assert.ok(await popup.getByText("Screenshots may contain page content or personal information.", { exact: false }).isVisible(), "visual evidence privacy warning should be visible");
  assert.match(await popup.locator("#cookieResult").innerHTML(), /Extended browser storage metadata/, "popup should render extended browser storage metadata");
  assert.equal(await popup.locator("#overviewGrid").isVisible(), false, "technical metrics should remain progressive disclosure");
  assert.ok((await popup.evaluate(() => document.documentElement.scrollWidth)) <= (await popup.evaluate(() => document.documentElement.clientWidth)) + 1, "popup should not overflow horizontally");
  await popup.locator("#languageSelect").selectOption("de");
  await popup.locator("html[lang='de']").waitFor({ state: "attached", timeout: 10000 });
  await popup.getByText("Ist das Tracking technisch korrekt umgesetzt?", { exact: true }).waitFor({ state: "visible", timeoutMs: 10000 });
  assert.equal(await popup.locator("html").getAttribute("lang"), "de", "popup should switch the document language to German");
  assert.equal(await popup.locator("#bannerOverviewButton").getAttribute("title"), "Banner-Einstellungen oder die zweite Ebene des Cookie-Banners anzeigen");
  assert.ok(await popup.getByText("Gefällt dir CookieBuddy?", { exact: true }).isVisible(), "support prompt should be localized");
  assert.doesNotMatch(await popup.locator("body").innerText(), /pr\?ft|Ã|Â/, "German popup should not contain corrupted copy");
  await popup.locator("#languageSelect").selectOption("en");
  await popup.locator("#deltaButton").click();
  await popup.getByText("Likely incorrectly implemented", { exact: true }).waitFor({ state: "visible", timeoutMs: 10000 });
  assert.ok(await popup.locator('[data-verdict="negative"]').isVisible(), "negative audit verdict should be visible");
  assert.ok(await popup.getByText("Audit complete", { exact: true }).isVisible(), "verdict should disclose audit completeness");
  assert.ok(await popup.locator('[data-complaint-action="true"]').isVisible(), "supported negative findings should expose a complaint action");
  assert.ok(await popup.locator('[data-authority-complaint-action="true"]').isVisible(), "negative findings should expose the authority preparation action");
  assert.equal(await popup.locator('#auditSteps [data-state="complete"]').count(), 8, "completed audit should mark every progress step complete");
  await captureDocumentationScreenshot(popup, "popup-overview.png", { fullPage: true });

  const reviewPopup = await browser.newPage({ viewport: { width: 460, height: 900 } });
  await reviewPopup.addInitScript({ content: chromeFixtureScript("review") });
  await reviewPopup.goto(`http://127.0.0.1:${port}/popup.html?review=1`);
  await reviewPopup.locator("#deltaButton").waitFor({ state: "visible", timeoutMs: 10000 });
  await reviewPopup.locator("#deltaButton").click();
  await reviewPopup.getByRole("heading", { name: "Review recommended", exact: true }).waitFor({ state: "visible", timeoutMs: 10000 });
  assert.ok(await reviewPopup.locator('[data-verdict="review"]').isVisible(), "ambiguous complete findings should use the review verdict");
  assert.ok(await reviewPopup.getByText("Unresolved signals", { exact: true }).isVisible(), "review verdict should expose unresolved signals");
  assert.match(await reviewPopup.locator('[data-verdict="review"] a').first().getAttribute("href"), /details\.html\?view=delta/);
  await captureDocumentationScreenshot(reviewPopup, "popup-review.png", { fullPage: true });
  await reviewPopup.close();

  const details = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await details.addInitScript({ content: chromeFixtureScript() });
  await details.goto(`http://127.0.0.1:${port}/details.html?view=delta`);
  await details.getByText("Technische Details", { exact: true }).waitFor({ state: "visible", timeoutMs: 10000 });
  assert.ok((await details.screenshot()).length > 10000, "details screenshot should contain rendered UI");
  assert.ok(await details.locator("#copyDeltaReportButton").isVisible(), "copy-for-email action should be visible");
  assert.ok(await details.locator("#complaintDraft").isVisible(), "details should expose an editable complaint draft");
  assert.ok(await details.getByText("Candidate only", { exact: true }).isVisible(), "uncertain authority should be labeled as a candidate");
  assert.ok(await details.getByText("Open authority details", { exact: true }).isVisible(), "uncertain authority should be shown as a candidate");
  assert.ok(await details.locator("#downloadDeltaHtmlButton").isVisible(), "HTML export action should be visible");
  assert.ok(await details.locator("#downloadDeltaJsonButton").isVisible(), "JSON export action should be visible");
  assert.ok(await details.locator("#downloadDeltaPdfButton").isVisible(), "print/PDF export action should be visible");
  assert.ok(await details.getByText("Still active", { exact: true }).isVisible(), "active services should be labeled");
  assert.ok(await details.getByText("Unclear", { exact: true }).first().isVisible(), "unlisted signals should be labeled unclear");
  assert.ok(await details.getByText("Reject action verification", { exact: true }).isVisible(), "the report should show rejection verification evidence");
  assert.ok(await details.getByText("Coverage and limits", { exact: true }).isVisible(), "coverage limits should be visible in the evidence report");
  assert.ok(await details.getByText("Extended browser storage metadata", { exact: true }).isVisible(), "delta report should show extended browser storage metadata");
  assert.ok(await details.getByText("app-shell", { exact: true }).isVisible(), "delta report should show Cache Storage names and keys");
  assert.ok(await details.getByText("Audit integrity", { exact: true }).isVisible(), "audit integrity should be visible in the evidence report");
  assert.ok(await details.getByText("Minimized URL evidence", { exact: true }).isVisible(), "URL minimization should be disclosed in the evidence report");
  assert.ok(await details.getByText("Not technically inspectable", { exact: false }).count() > 0, "unsupported techniques should be labeled as not technically inspectable");
  assert.ok(await details.getByText("Heuristic indicators (not confirmed evidence)", { exact: true }).isVisible(), "heuristics should be separated from confirmed evidence");
  assert.ok(await details.getByText("Audit lifecycle evidence", { exact: true }).isVisible(), "lifecycle evidence should be visible in the report");
  assert.ok(await details.getByText("Report context", { exact: true }).isVisible(), "report context should be visible in the evidence report");
  assert.ok(await details.getByText("Consent-state evidence", { exact: true }).isVisible(), "consent state evidence should be visible in the report");
  assert.ok(await details.locator("li").filter({ hasText: "iab-tcf:purpose:3" }).first().isVisible(), "TCF purpose evidence should be visible in the report");
  assert.ok(await details.getByText("Report integrity", { exact: true }).isVisible(), "report integrity should be visible in the evidence report");
  assert.ok(await details.getByText("Navigation interrupted the audit", { exact: false }).count() > 0, "navigation interruptions should be explained");
  assert.ok(await details.getByText("Stored locally", { exact: true }).isVisible(), "local-only status should be visible in the redesigned details header");
  await details.locator("#languageSelect").selectOption("de");
  await details.locator("html[lang='de']").waitFor({ state: "attached", timeout: 10000 });
  await details.getByText("Technische Details", { exact: true }).waitFor({ state: "visible", timeoutMs: 10000 });
  assert.equal(await details.locator("html").getAttribute("lang"), "de", "details should switch the document language to German");
  assert.ok(await details.getByText("Bericht für E-Mail kopieren", { exact: true }).isVisible(), "details actions should be localized");
  assert.doesNotMatch(await details.locator("body").innerText(), /pr\?ft|Ã|Â/, "German details should not contain corrupted copy");
  await details.locator("#languageSelect").selectOption("en");
  await captureDocumentationScreenshot(details, "delta-audit.png", { fullPage: true });
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
