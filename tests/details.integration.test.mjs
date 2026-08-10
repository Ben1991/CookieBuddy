import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Blob } from "node:buffer";

const localeMessages = {
  en: JSON.parse(await readFile(new URL("../_locales/en/messages.json", import.meta.url), "utf8")),
  de: JSON.parse(await readFile(new URL("../_locales/de/messages.json", import.meta.url), "utf8"))
};

test("details page opens a mail draft from the delta report", async () => {
  const document = createDocument("en");
  const window = createWindow("?view=delta");

  setupGlobals({ document, window, locale: "en" });

  globalThis.chrome.storage.local.get = async () => ({
    cookiebuddyLastScan: {
      checkedAt: "2026-05-31T10:00:00Z",
      analysis: { contacts: buildContactsFixture() }
    },
    cookiebuddyLastDelta: buildDeltaFixture()
  });

  await import(`../src/details.js?test=${Date.now()}`);
  await flush();

  assert.equal(element(document, "sendDeltaMailActions").hidden, false);
  assert.equal(element(document, "sendDeltaMailHeading").textContent, "Send delta by email");
  assert.match(element(document, "sendDeltaMailHint").textContent, /review and adjust/i);

  element(document, "sendDeltaMailActions").querySelectorAll("button[data-mail-target]")[0].click();
  assert.match(window.location.lastAssignedUrl, /^mailto:privacy%40example\.com\?/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /Question regarding cookies and third-party requests after opt-out/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /After selecting "reject all", "deny all"/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /Browser storage entries/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /consent_state \(localStorage\)/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /Detection evidence/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /Usercentrics/);

  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /Google Analytics: Still active/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /Not listed in banner/);

  element(document, "sendDeltaMailActions").querySelector("#downloadDeltaHtmlButton").click();
  await flush();
  assert.equal(window.lastDownloadedName, "cookiebuddy-delta-report.html");
  assert.match(await window.lastDownloadedTextPromise, /CookieBuddy delta report/);

  element(document, "sendDeltaMailActions").querySelector("#downloadDeltaPdfButton").click();
  assert.equal(window.lastPrinted, true);
});

test("details page offers authority mail when available", async () => {
  const document = createDocument("de");
  const window = createWindow("?view=delta");

  setupGlobals({ document, window, locale: "de" });

  globalThis.chrome.storage.local.get = async () => ({
    cookiebuddyLastScan: {
      checkedAt: "2026-05-31T10:00:00Z",
      analysis: {
        host: "example.de",
        contacts: buildContactsFixture()
      }
    },
    cookiebuddyLastDelta: buildDeltaFixture()
  });

  await import(`../src/details.js?test=${Date.now()}-authority`);
  await flush();

  const mailButtons = element(document, "sendDeltaMailActions").querySelectorAll("button[data-mail-target]");
  assert.equal(mailButtons.length, 2);
  assert.equal(mailButtons[0].dataset.mailTarget, "dpo");
  assert.equal(mailButtons[1].dataset.mailTarget, "authority");
  assert.ok(mailButtons[0].textContent.length > 0);
  assert.ok(mailButtons[1].textContent.length > 0);

  mailButtons[1].click();
  assert.match(window.location.lastAssignedUrl, /^mailto:poststelle%40bfdi\.bund\.de\?/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /Bitte um Prüfung: mögliche Cookies und Drittanbieter-Requests nach Opt-out/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /Nach Auswahl von "Alle ablehnen", "Ablehnen"/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /Browser-Speicher-Einträge/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /Bitte verstehen Sie diese Nachricht als Bitte um Klärung/);
});

test("details page hides mail drafting outside the delta view", async () => {
  const document = createDocument("de");
  const window = createWindow("?view=summary");

  setupGlobals({ document, window, locale: "de" });

  globalThis.chrome.storage.local.get = async () => ({
    cookiebuddyLastScan: { checkedAt: "2026-05-31T10:00:00Z" },
    cookiebuddyLastDelta: buildDeltaFixture()
  });

  await import(`../src/details.js?test=${Date.now()}-summary`);
  await flush();

  assert.equal(element(document, "sendDeltaMailActions").hidden, true);
});

test("details page still offers downloads when no email recipient is available", async () => {
  const document = createDocument("en");
  const window = createWindow("?view=delta");

  setupGlobals({ document, window, locale: "en" });

  globalThis.chrome.storage.local.get = async () => ({
    cookiebuddyLastScan: {
      checkedAt: "2026-05-31T10:00:00Z",
      analysis: { host: "example.com", contacts: {} }
    },
    cookiebuddyLastDelta: buildDeltaFixture()
  });

  await import(`../src/details.js?test=${Date.now()}-download-only`);
  await flush();

  assert.equal(element(document, "sendDeltaMailActions").hidden, false);
  assert.equal(element(document, "sendDeltaMailActions").querySelectorAll("button[data-mail-target]").length, 0);

  element(document, "sendDeltaMailActions").querySelector("#downloadDeltaHtmlButton").click();
  await flush();
  assert.equal(window.lastDownloadedName, "cookiebuddy-delta-report.html");
});

function buildDeltaFixture() {
  return {
    checkedAt: "2026-05-31T10:00:00Z",
    url: "https://example.com",
    riskLevel: "high",
    summary: "Cookie consent delta report with suspicious findings.",
    denyAction: { clicked: true, label: "Reject all" },
    beforeCounts: { cookies: 5, thirdPartyHosts: 2 },
    afterDenyCounts: { cookies: 4, thirdPartyHosts: 1 },
    remainingCookies: [{ name: "_ga", domain: ".example.com", service: "Google Analytics" }],
    newCookies: [{ name: "_hjSessionUser_123", domain: ".example.com", service: "Hotjar" }],
    thirdPartyHosts: ["tracker.example.net"],
    remainingStorageEntries: [
      { key: "consent_state", scope: "localStorage", inBanner: true },
      { key: "session_prefs", scope: "sessionStorage", inBanner: false }
    ],
    banner: {
      name: "Usercentrics",
      source: { host: "cdn.usercentrics.eu" },
      evidence: [{ source: "DOM marker", value: "#usercentrics-root" }]
    },
    serviceAudit: [
      { name: "Google Analytics", source: "analytics.example.net", listedInBanner: false, status: "active" },
      { name: "Essential services", source: "Banner text", listedInBanner: true, status: "allowed-essential" }
    ]
  };
}

function buildContactsFixture() {
  return {
    dpo: {
      kind: "dpo",
      name: "Data Protection Officer",
      email: "privacy@example.com"
    },
    authority: {
      kind: "authority",
      name: "Federal data protection authority",
      email: "poststelle@bfdi.bund.de"
    }
  };
}

function createWindow(search) {
  const win = {
    location: {
      search,
      assign(url) {
        this.lastAssignedUrl = url;
      }
    },
    open: () => ({
      document: {
        open: () => {},
        write(html) {
          win.lastWrittenHtml = html;
        },
        close: () => {}
      },
      focus: () => {},
      print: () => {
        win.lastPrinted = true;
      }
    })
  };
  return win;
}

function createDocument(locale) {
  const elements = new Map();
  for (const id of ["detailsOutput", "languageSelect", "sendDeltaMailActions", "sendDeltaMailHint", "sendDeltaMailHeading"]) {
    elements.set(id, new FakeElement(id));
  }
  elements.get("languageSelect").value = locale;
  elements.get("detailsOutput").dataset.i18n = "loading";
  elements.get("sendDeltaMailHint").dataset.i18n = "sendDeltaMailHint";
  elements.get("sendDeltaMailHeading").dataset.i18n = "sendDeltaMailHeading";
  return {
    documentElement: { lang: locale },
    querySelector: (selector) => selector.startsWith("#") ? elements.get(selector.slice(1)) || null : null,
    querySelectorAll: (selector) => {
      if (selector === "[data-i18n]") {
        return [...elements.values()].filter((element) => element.dataset.i18n);
      }
      if (selector === "[data-i18n-aria-label]") {
        return [...elements.values()].filter((element) => element.dataset.i18nAriaLabel);
      }
      return [];
    },
    createElement: (tag) => tag === "a" ? new FakeAnchor() : new FakeElement(tag)
  };
}

function setupGlobals({ document, window, locale }) {
  globalThis.window = window;
  globalThis.document = document;
  globalThis.URL = URL;
  globalThis.Blob = Blob;
  globalThis.Node = class {};
  globalThis.HTMLElement = FakeElement;
  globalThis.fetch = async (url) => ({
    async json() {
      const text = String(url);
      return text.includes("_locales/de/messages.json") ? localeMessages.de : localeMessages.en;
    }
  });
  window.fetch = globalThis.fetch;
  globalThis.URL.createObjectURL = (blob) => {
    window.lastDownloadedTextPromise = blob.text();
    return "blob:cookiebuddy";
  };
  globalThis.URL.revokeObjectURL = () => {};
  globalThis.chrome = {
    runtime: {
      getURL: (value) => value
    },
    i18n: { getUILanguage: () => locale },
    storage: {
      local: {
        get: async () => ({ cookiebuddyLanguage: locale }),
        set: async () => {}
      }
    }
  };
  globalThis.__testWindow = window;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function element(document, id) {
  return document.querySelector(`#${id}`);
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = false;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this._text = "";
    this._html = "";
    this._childrenButtons = [];
  }

  set textContent(value) {
    this._text = String(value);
  }

  get textContent() {
    return this._text;
  }

  set innerHTML(value) {
    this._html = String(value);
    this._text = this._html;
    this._childrenButtons = [];

    const isGerman = String(globalThis.document?.documentElement?.lang || "").startsWith("de");
    for (const spec of [
      { id: "downloadDeltaHtmlButton", label: isGerman ? "Bericht als HTML herunterladen" : "Download HTML report" },
      { id: "downloadDeltaPdfButton", label: isGerman ? "Als PDF speichern" : "Save as PDF" }
    ]) {
      if (!this._html.includes(`id=\"${spec.id}\"`)) continue;
      const button = new FakeElement("button");
      button.id = spec.id;
      button.textContent = spec.label;
      this._childrenButtons.push(button);
    }

    for (const match of this._html.matchAll(/<button[^>]*data-mail-target="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)) {
      const button = new FakeElement("button");
      button.dataset.mailTarget = match[1];
      button.textContent = match[2].replace(/[<>]/g, "").trim();
      this._childrenButtons.push(button);
    }
  }

  get innerHTML() {
    return this._html;
  }

  querySelectorAll(selector) {
    if (selector === "button[data-mail-target]") {
      return this._childrenButtons.filter((button) => button.dataset.mailTarget);
    }
    return [];
  }

  querySelector(selector) {
    if (selector.startsWith("#")) {
      return this._childrenButtons.find((button) => `#${button.id}` === selector) || null;
    }
    return null;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  click() {
    this.listeners.get("click")?.({ target: this });
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

class FakeAnchor {
  constructor() {
    this.href = "";
    this.download = "";
  }

  click() {
    const win = globalThis.__testWindow;
    win.lastDownloadedHref = this.href;
    win.lastDownloadedName = this.download;
  }
}
