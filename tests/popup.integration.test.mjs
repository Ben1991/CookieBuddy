import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const localeMessages = {
  en: JSON.parse(await readFile(new URL("../_locales/en/messages.json", import.meta.url), "utf8")),
  de: JSON.parse(await readFile(new URL("../_locales/de/messages.json", import.meta.url), "utf8"))
};

test("popup renders scan results and toggles help in English", async () => {
  const document = createDocument();
  const window = { Node: class {}, HTMLElement: FakeElement, URL };

  setupChromeMock("en");
  setupDomGlobals({ document, window });

  await import(`../src/popup.js?test=${Date.now()}`);
  await flush();

  assert.match(document.getElement("bannerResult").innerHTML, /Detected|Erkannt/);
  assert.match(document.getElement("cookieResult").textContent, /cookie/i);
  assert.match(document.getElement("contactResult").textContent, /Federal Commissioner|Bundesbeauftragte/);
  assert.match(document.getElement("contactResult").textContent, /Auskunft per Mail anfragen|Request access by email/);
  assert.match(document.getElement("contactResult").textContent, /Berichtigung personenbezogener Daten anfragen|Request correction of personal data/);
  assert.match(document.getElement("contactResult").textContent, /Datenlöschung anfragen|Request data deletion/);

  const helpButton = document.getElement("helpButton");
  const helpPanel = document.getElement("helpPanel");
  assert.equal(helpPanel.hidden, true);
  helpButton.click();
  assert.equal(helpPanel.hidden, false);

  const overviewButton = document.getElement("bannerOverviewButton");
  overviewButton.click();
  await flush();
  assert.equal(globalThis.chrome.tabs.lastMessage?.type, "OPEN_BANNER_OVERVIEW");
  assert.match(document.getElement("bannerOverviewStatus").textContent, /Opened|Geöffnet|Looking|Suche/);
});

test("popup loads German texts when German is active", async () => {
  const document = createDocument();
  const window = { Node: class {}, HTMLElement: FakeElement, URL };

  setupChromeMock("de");
  setupDomGlobals({ document, window });

  await import(`../src/popup.js?test=${Date.now()}-de`);
  await flush();

  assert.equal(document.documentElement.lang, "de");
  assert.match(document.getElement("cookiesTrafficHeading").textContent, /Cookies und Traffic/);
  assert.match(document.getElement("cookiesTrafficIntro").textContent, /Übersicht bündelt sichtbare Cookies/);
  assert.match(document.getElement("contactResult").textContent, /Auskunft per Mail anfragen|Berichtigung personenbezogener Daten anfragen|Datenlöschung anfragen|DSB/);
});

test("popup keeps core visible texts aligned with the active locale", async () => {
  await assertPopupLocale("en", {
    intro: "Get a quick read on what the page really does before and after consent.",
    help: "How it works",
    cookies: "Cookies and traffic",
    cookiesIntro: "This overview groups visible cookies and locally stored browser data. The list updates after each scan.",
    contact: "Contact",
    openSource: "Open source"
  });

  await assertPopupLocale("de", {
    intro: "Finde auf einen Blick heraus, was die Seite vor und nach der Einwilligung wirklich macht.",
    help: "So funktioniert es",
    cookies: "Cookies und Traffic",
    cookiesIntro: "Die Übersicht bündelt sichtbare Cookies und lokal gespeicherte Browserdaten. Die Liste aktualisiert sich nach jedem Scan.",
    contact: "Kontakt",
    openSource: "Open Source"
  });
});

test("legend marks the active badge status", async () => {
  const document = createDocument();
  const window = { Node: class {}, HTMLElement: FakeElement, URL };

  setupChromeMock("en");
  setupDomGlobals({ document, window });

  await import(`../src/popup.js?test=${Date.now()}-legend`);
  await flush();

  const legendHtml = document.getElement("legendGrid").innerHTML;
  assert.match(legendHtml, /data-current="true"/);
  assert.match(legendHtml, /current|aktuell/);
});

function createDocument() {
  const elements = new Map();
  const defs = [
    "statusPill",
    "popupIntro",
    "bannerResult",
    "categoryResult",
    "cookieResult",
    "cookieCount",
    "deltaResult",
    "contactResult",
    "contactHeading",
    "cookiesTrafficHeading",
    "cookiesTrafficIntro",
    "openSourceHeading",
    "detailsLink",
    "bannerOverviewButton",
    "bannerOverviewStatus",
    "legendGrid",
    "refreshButton",
    "deltaButton",
    "languageSelect",
    "helpButton",
    "helpPanel",
    "mockBannerSettings"
  ];
  for (const id of defs) elements.set(id, new FakeElement(id));
  elements.get("helpPanel").hidden = true;
  elements.get("mockBannerSettings").textContent = "Cookie settings";
  elements.get("mockBannerSettings").setAttribute("aria-label", "Cookie settings");
  elements.get("popupIntro").dataset.i18n = "popupIntro";
  elements.get("legendGrid").innerHTML = "";
  elements.get("statusPill").dataset.i18n = "statusReady";
  elements.get("helpButton").dataset.i18n = "helpButton";
  elements.get("contactHeading").dataset.i18n = "contactHeading";
  elements.get("openSourceHeading").dataset.i18n = "openSourceHeading";
  elements.get("cookiesTrafficHeading").dataset.i18n = "cookiesTrafficHeading";
  elements.get("cookiesTrafficIntro").dataset.i18n = "cookiesTrafficIntro";

  return {
    documentElement: { lang: "en" },
    querySelector: (selector) => selector.startsWith("#") ? elements.get(selector.slice(1)) || null : null,
    querySelectorAll: (selector) => {
      if (selector === "[data-i18n]") return [...elements.values()].filter((element) => element.dataset.i18n);
      if (selector === "[data-i18n-aria-label]") return [...elements.values()].filter((element) => element.dataset.i18nAriaLabel);
      if (selector === "[data-current='true']") {
        const html = elements.get("legendGrid").innerHTML || "";
        const matchCount = (html.match(/data-current="true"/g) || []).length;
        return Array.from({ length: matchCount }, () => new FakeElement("legend-current"));
      }
      if (selector.includes("button") || selector.includes("a") || selector.includes("settings") || selector.includes("preferences") || selector.includes("manage")) {
        return [elements.get("mockBannerSettings")];
      }
      return [];
    },
    getElement: (id) => elements.get(id)
  };
}

function setupDomGlobals({ document, window }) {
  globalThis.window = window;
  globalThis.document = document;
  globalThis.Node = window.Node;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.URL = window.URL;
  globalThis.fetch = async (url) => ({
    async json() {
      const text = String(url);
      return text.includes("_locales/de/messages.json") ? localeMessages.de : localeMessages.en;
    }
  });
  window.fetch = globalThis.fetch;
}

function setupChromeMock(locale) {
  const analysis = {
    url: "https://example.com",
    host: "example.com",
    title: "Example",
    banner: {
      name: "Cookiebot",
      confidence: "high",
      source: { host: "cdn.cookiebot.com" },
      evidence: [{ value: "cookiebot" }]
    },
    categories: {
      essential: { services: [{ name: "Essential services", source: "Banner text" }] },
      marketing: { services: [] },
      analytics: { services: [] },
      functional: { services: [] },
      social: { services: [] }
    },
    storage: {
      localStorageKeys: ["consent_state"],
      sessionStorageKeys: ["session_prefs"],
      indexedDbNames: [],
      items: [
        {
          key: "consent_state",
          scope: "localStorage",
          valuePreview: "granted",
          inBanner: true
        }
      ]
    },
    contacts: {
      dpo: {
        name: "Data Protection Officer",
        email: "privacy@example.com"
      },
      authority: {
        key: "fallback",
        name: "Federal data protection authority",
        note: "Fallback: Graurheindorfer Straße 153, 53117 Bonn, phone +49 (0)228-997799-0, email poststelle@bfdi.bund.de.",
        url: "https://www.bfdi.bund.de/SharedDocs/Kontaktdaten/DE/BfDI_Kontakt.html"
      }
    }
  };

  globalThis.chrome = {
    i18n: {
      getUILanguage: () => locale
    },
    runtime: {
      getURL: (value) => value,
      sendMessage: async ({ type }) => {
        if (type === "GET_TRAFFIC") return { traffic: [{ url: "https://tracker.example.net/pixel.js", type: "script" }] };
        if (type === "CLEAR_TRAFFIC") return {};
        return {};
      }
    },
    storage: {
      local: {
        get: async () => ({ cookiebuddyLanguage: locale }),
        set: async () => {}
      }
    },
    tabs: {
      query: async () => [{ id: 1, url: analysis.url, title: analysis.title }],
      sendMessage: async (_, message) => {
        globalThis.chrome.tabs.lastMessage = message;
        if (message.type === "ANALYZE_PAGE") return analysis;
        if (message.type === "TRY_DENY_ALL") return { clicked: true, label: "Reject all" };
        if (message.type === "OPEN_BANNER_OVERVIEW") return { found: true, clicked: true, label: "Show settings" };
        return {};
      }
    },
    cookies: {
      getAll: async () => [
        { name: "session", domain: ".example.com", path: "/", secure: true, sameSite: "Lax" },
        { name: "_ga", domain: ".example.com", path: "/", secure: false, sameSite: "Lax" }
      ]
    },
    scripting: {
      executeScript: async () => {}
    }
  };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function assertPopupLocale(locale, expected) {
  const document = createDocument();
  const window = { Node: class {}, HTMLElement: FakeElement, URL };

  setupChromeMock(locale);
  setupDomGlobals({ document, window });

  await import(`../src/popup.js?test=${Date.now()}-${locale}-locale`);
  await flush();

  assert.equal(document.documentElement.lang, locale);
  assert.equal(document.getElement("statusPill").textContent, localeMessages[locale].statusReady.message);
  assert.equal(document.getElement("popupIntro").textContent, expected.intro);
  assert.equal(document.getElement("helpButton").textContent, expected.help);
  assert.equal(document.getElement("cookiesTrafficHeading").textContent, expected.cookies);
  assert.equal(document.getElement("cookiesTrafficIntro").textContent, expected.cookiesIntro);
  assert.equal(document.getElement("contactHeading").textContent, expected.contact);
  assert.equal(document.getElement("openSourceHeading").textContent, expected.openSource);
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = false;
    this.dataset = {};
    this.attributes = new Map();
    this._text = "";
    this._html = "";
    this.listeners = new Map();
    this.classList = {
      add: () => {},
      remove: () => {}
    };
  }

  set textContent(value) {
    this._text = String(value);
  }

  get textContent() {
    return this._text;
  }

  set innerHTML(value) {
    this._html = String(value);
    this._text = stripHtml(this._html);
  }

  get innerHTML() {
    return this._html;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "aria-expanded") this.ariaExpanded = String(value);
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  click() {
    this.listeners.get("click")?.({ target: this });
  }
}

function stripHtml(value) {
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
