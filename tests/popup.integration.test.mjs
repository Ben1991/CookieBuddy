import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const localeMessages = {
  en: JSON.parse(await readFile(new URL("../_locales/en/messages.json", import.meta.url), "utf8")),
  de: JSON.parse(await readFile(new URL("../_locales/de/messages.json", import.meta.url), "utf8"))
};

test("popup renders scan results and toggles help", async () => {
  const document = createDocument();
  const window = { Node: class {}, HTMLElement: class {}, URL };

  setupChromeMock("en");
  setupDomGlobals({ document, window });

  await import(`../src/popup.js?test=${Date.now()}`);
  await flush();

  assert.match(document.getElement("bannerResult").innerHTML, /Detected|Erkannt/);
  assert.match(document.getElement("cookieResult").textContent, /cookie/i);
  assert.match(document.getElement("contactResult").textContent, /Federal Commissioner|Bundesbeauftragte/);

  const helpButton = document.getElement("helpButton");
  const helpPanel = document.getElement("helpPanel");
  assert.equal(helpPanel.hidden, true);
  helpButton.click();
  assert.equal(helpPanel.hidden, false);
});

function createDocument() {
  const elements = new Map();
  const defs = [
    "statusPill",
    "bannerResult",
    "categoryResult",
    "cookieResult",
    "cookieCount",
    "deltaResult",
    "contactResult",
    "detailsLink",
    "refreshButton",
    "deltaButton",
    "languageSelect",
    "helpButton",
    "helpPanel"
  ];
  for (const id of defs) elements.set(id, new FakeElement(id));
  elements.get("helpPanel").hidden = true;

  return {
    documentElement: { lang: "en" },
    querySelector: (selector) => selector.startsWith("#") ? elements.get(selector.slice(1)) || null : null,
    querySelectorAll: (selector) => {
      if (selector === "[data-i18n]" || selector === "[data-i18n-aria-label]") return [];
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
      dpo: null,
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
        if (message.type === "ANALYZE_PAGE") return analysis;
        if (message.type === "TRY_DENY_ALL") return { clicked: true, label: "Reject all" };
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
