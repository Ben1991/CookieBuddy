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
    cookiebuddyLastScan: { checkedAt: "2026-05-31T10:00:00Z" },
    cookiebuddyLastDelta: buildDeltaFixture()
  });

  await import(`../src/details.js?test=${Date.now()}`);
  await flush();

  assert.equal(document.getElement("sendDeltaMailActions").hidden, false);
  assert.equal(document.getElement("sendDeltaMailHeading").textContent, "Send delta by email");
  assert.equal(document.getElement("sendDeltaMailHint").textContent, "A mail draft opens with the audit report. Please review and adjust the text before sending.");
  assert.match(document.getElement("sendDeltaMailActions").innerHTML, /Open the browser print dialog, then choose Save as PDF/i);
  assert.match(document.getElement("detailsOutput").innerHTML, /Cookie consent delta report/i);

  document.getElement("sendDeltaMailActions").querySelectorAll("button[data-mail-target]")[0].click();
  assert.match(window.location.lastAssignedUrl, /^mailto:privacy@example\.com\?/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /CookieBuddy audit report for https:\/\/example\.com/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /Cookie consent delta report/i);

  document.getElement("sendDeltaMailActions").querySelector("#downloadDeltaHtmlButton").click();
  await flush();
  assert.equal(window.lastDownloadedName, "cookiebuddy-delta-report.html");
  assert.match(await window.lastDownloadedTextPromise, /CookieBuddy delta report/);

  document.getElement("sendDeltaMailActions").querySelector("#downloadDeltaPdfButton").click();
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

  const mailButtons = document.getElement("sendDeltaMailActions").querySelectorAll("button[data-mail-target]");
  assert.equal(mailButtons.length, 2);
  assert.equal(mailButtons[0].textContent, "Mail an Datenschutzbeauftragten");
  assert.equal(mailButtons[1].textContent, "Mail an Behörde");
  assert.match(document.getElement("sendDeltaMailActions").innerHTML, /Öffne den Druckdialog des Browsers und wähle dann Als PDF speichern/i);

  mailButtons[1].click();
  assert.match(window.location.lastAssignedUrl, /^mailto:poststelle@bfdi\.bund\.de\?/);
  assert.match(decodeURIComponent(window.location.lastAssignedUrl), /CookieBuddy-Auditbericht für Behördenprüfung unter https:\/\/example\.com/);
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

  assert.equal(document.getElement("sendDeltaMailActions").hidden, true);
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

  assert.match(document.getElement("sendDeltaMailActions").innerHTML, /No email address was found automatically/i);
  assert.equal(document.getElement("sendDeltaMailActions").querySelectorAll("button[data-mail-target]").length, 0);
  assert.equal(document.getElement("sendDeltaMailActions").hidden, false);

  document.getElement("sendDeltaMailActions").querySelector("#downloadDeltaHtmlButton").click();
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
    thirdPartyHosts: ["tracker.example.net"]
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
    createElement: (tag) => new FakeElement(tag)
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
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
      { id: "downloadDeltaPdfButton", label: isGerman ? "Als PDF speichern" : "Save as PDF" },
      { id: "sendDeltaMailToDpoButton", label: isGerman ? "Mail an Datenschutzbeauftragten" : "Mail to DPO", mailTarget: "dpo" },
      { id: "sendDeltaMailToAuthorityButton", label: isGerman ? "Mail an Behörde" : "Mail to authority", mailTarget: "authority" }
    ]) {
      if (!this._html.includes(spec.id)) continue;
      const button = new FakeElement("button");
      button.id = spec.id;
      if (spec.mailTarget) button.dataset.mailTarget = spec.mailTarget;
      button.textContent = spec.label;
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
