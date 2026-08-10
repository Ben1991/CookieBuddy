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
  contacts: { dpo: { kind: "dpo", email: "privacy@example.com", source: "Privacy policy", sourceUrl: "https://example.com/privacy" }, authority: { name: "Federal data protection authority", key: "fallback", note: "Review the privacy notice." } },
  storage: { items: [{ key: "consent_state", scope: "localStorage", valuePreview: "denied", inBanner: true }] }
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
  denyAction: { clicked: true, label: "Reject all" },
  remainingCookies: [{ name: "_ga", domain: "example.com", service: "Google Analytics" }],
  newCookies: [],
  remainingStorageEntries: fixtureAnalysis.storage.items,
  thirdPartyHosts: ["analytics.example.net"],
  essentialThirdPartyHosts: [],
  serviceAudit: [
    { name: "Essential services", category: "essential", source: "Banner text", listedInBanner: true, essential: true, status: "allowed-essential" },
    { name: "Google Analytics", category: "analytics", source: "analytics.example.net", listedInBanner: false, essential: false, status: "active" },
    { name: "extension.example.net", category: "unlisted", source: "Third-party traffic", listedInBanner: false, essential: false, status: "unclear" }
  ],
  beforeCounts: { cookies: 2, thirdPartyHosts: 1 },
  afterDenyCounts: { cookies: 1, thirdPartyHosts: 1, storageEntries: 1 }
};

const server = createServer(async (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const filePath = join(root, requestPath === "/" ? "popup.html" : requestPath.slice(1));
  try {
    const contentTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
    response.setHeader("Content-Type", contentTypes[filePath.slice(filePath.lastIndexOf("."))] || "application/octet-stream");
    response.end(await readFile(filePath));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
});

function chromeFixtureScript() {
  return `
    (() => {
      const analysis = ${JSON.stringify(fixtureAnalysis)};
      const cookies = ${JSON.stringify(fixtureCookies)};
      const delta = ${JSON.stringify(fixtureDelta)};
      const storage = { cookiebuddyLanguage: "en", cookiebuddyLastScan: { analysis, cookies, traffic: [] }, cookiebuddyLastDelta: delta };
      globalThis.chrome = {
        runtime: { getURL: (path) => path, onMessage: { addListener: () => {} }, sendMessage: async () => ({ traffic: [] }) },
        i18n: { getUILanguage: () => "en-US" },
        storage: { local: { get: async (key) => typeof key === "string" ? { [key]: storage[key] } : storage, set: async (values) => Object.assign(storage, values) } },
        tabs: { query: async () => [{ id: 1, url: analysis.url }], sendMessage: async (_id, message) => message.type === "TRY_DENY_ALL" ? { found: true, clicked: true, label: "Reject all" } : analysis, create: async () => {} },
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
  await popup.getByText("Detected", { exact: false }).first().waitFor({ state: "visible", timeoutMs: 10000 });
  assert.ok((await popup.screenshot()).length > 10000, "popup screenshot should contain rendered UI");
  assert.ok(await popup.locator("#deltaButton").isVisible(), "delta action should be visible");
  assert.ok(await popup.locator("#heroScanButton").isVisible(), "primary scan action should be visible in the redesigned header");
  assert.ok(await popup.locator("#currentPageLabel").isVisible(), "current page context should be visible in the redesigned header");
  assert.equal(await popup.locator("#overviewGrid").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length), 1, "overview metrics should stack vertically");
  assert.ok((await popup.evaluate(() => document.documentElement.scrollWidth)) <= (await popup.evaluate(() => document.documentElement.clientWidth)) + 1, "popup should not overflow horizontally");
  await popup.locator("#languageSelect").selectOption("de");
  await popup.getByText("Consent-Delta prüfen", { exact: true }).waitFor({ state: "visible", timeoutMs: 10000 });
  assert.equal(await popup.locator("html").getAttribute("lang"), "de", "popup should switch the document language to German");
  assert.equal(await popup.locator("#bannerOverviewButton").getAttribute("title"), "Banner-Einstellungen oder die zweite Ebene des Cookie-Banners anzeigen");
  assert.ok(await popup.getByText("Gefällt dir CookieBuddy?", { exact: true }).isVisible(), "support prompt should be localized");
  assert.doesNotMatch(await popup.locator("body").innerText(), /pr\?ft|Ã|Â/, "German popup should not contain corrupted copy");
  await popup.locator("#languageSelect").selectOption("en");
  await captureDocumentationScreenshot(popup, "popup-overview.png", { fullPage: true });

  const details = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await details.addInitScript({ content: chromeFixtureScript() });
  await details.goto(`http://127.0.0.1:${port}/details.html?view=delta`);
  await details.getByText("CookieBuddy delta report", { exact: false }).waitFor({ state: "visible", timeoutMs: 10000 });
  assert.ok((await details.screenshot()).length > 10000, "details screenshot should contain rendered UI");
  assert.ok(await details.locator("#copyDeltaReportButton").isVisible(), "copy-for-email action should be visible");
  assert.ok(await details.locator("#downloadDeltaHtmlButton").isVisible(), "HTML export action should be visible");
  assert.ok(await details.locator("#downloadDeltaPdfButton").isVisible(), "print/PDF export action should be visible");
  assert.ok(await details.getByText("Still active", { exact: true }).isVisible(), "active services should be labeled");
  assert.ok(await details.getByText("Unclear", { exact: true }).isVisible(), "unlisted signals should be labeled unclear");
  assert.ok(await details.getByText("Stored locally", { exact: true }).isVisible(), "local-only status should be visible in the redesigned details header");
  await details.locator("#languageSelect").selectOption("de");
  await details.getByText("CookieBuddy-Delta-Bericht", { exact: true }).waitFor({ state: "visible", timeoutMs: 10000 });
  assert.equal(await details.locator("html").getAttribute("lang"), "de", "details should switch the document language to German");
  assert.ok(await details.getByText("Bericht für E-Mail kopieren", { exact: true }).isVisible(), "details actions should be localized");
  assert.doesNotMatch(await details.locator("body").innerText(), /pr\?ft|Ã|Â/, "German details should not contain corrupted copy");
  await details.locator("#languageSelect").selectOption("en");
  await captureDocumentationScreenshot(details, "delta-audit.png", { fullPage: true });
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
