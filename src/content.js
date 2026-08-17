// Fallback embedded CMP signatures for when external fetch unavailable
// Reviewed against common operational CMPs and IAB Europe TCF resources in June 2026.
const FALLBACK_CMP_SIGNATURES = [
  { name: "Usercentrics", patterns: ["usercentrics", "uc-settings", "uc-center-container", "uc-privacy", "cmp.usercentrics"] },
  { name: "OneTrust", patterns: ["onetrust", "ot-sdk", "optanon", "cookiepro", "optanonconsent"] },
  { name: "Cookiebot", patterns: ["cookiebot", "cybotcookiebot", "cookiebot.com"] },
  { name: "Didomi", patterns: ["didomi", "didomi-popup", "didomi.io"] },
  { name: "TrustArc", patterns: ["trustarc", "truste", "trustarc.com"] },
  { name: "Sourcepoint", patterns: ["sourcepoint", "sp_message", "privacy-manager", "cmp-cdn.cdn.privacy-mgmt.com"] },
  { name: "Quantcast Choice", patterns: ["quantcast", "quantcastchoice", "choice.quantcast.com", "__tcfapi"] },
  { name: "Osano", patterns: ["osano", "cmp.osano.com", "osano-cm"] },
  { name: "Axeptio", patterns: ["axeptio", "axeptio.eu"] },
  { name: "CookieYes", patterns: ["cookieyes", "cky-consent", "cookieyes.com"] },
  { name: "Complianz", patterns: ["complianz", "cmplz-", "complianz.io"] },
  { name: "Termly", patterns: ["termly", "termly.io"] },
  { name: "iubenda", patterns: ["iubenda", "iubenda_cs"] },
  { name: "Borlabs Cookie", patterns: ["borlabs", "borlabs-cookie"] },
  { name: "Consentmanager", patterns: ["consentmanager", "consentmanager.net", "cmpconsent"] },
  { name: "Cookie Information", patterns: ["cookieinformation", "cookieinformation.com"] },
  { name: "Klaro", patterns: ["klaro", "klaro-consent"] },
  { name: "Civic Cookie Control", patterns: ["civicuk", "cookiecontrol", "cookie-control"] },
  { name: "Google Funding Choices", patterns: ["fundingchoicesmessages.google.com", "googlefc", "fc-consent-root"] },
  { name: "CookieScript", patterns: ["cookie-script.com", "cookiescript", "cookie-script"] },
  { name: "CookieFirst", patterns: ["cookiefirst", "cookiefirst.com"] },
  { name: "CookieHub", patterns: ["cookiehub", "cookiehub.com"] },
  { name: "Secure Privacy", patterns: ["secureprivacy", "secureprivacy.ai"] },
  { name: "Ketch", patterns: ["ketch", "ketchcdn.com", "ketchjs"] },
  { name: "Piwik PRO Consent Manager", patterns: ["piwik.pro", "ppms.js", "piwikpro"] },
  { name: "Matomo Consent Manager", patterns: ["matomo", "matomo-consent", "_pk_id"] },
  { name: "WebToffee GDPR Cookie Consent", patterns: ["webtoffee", "gdpr-cookie-consent", "cookielawinfo-checkbox", "viewed_cookie_policy"] },
  { name: "Seers CMP", patterns: ["seersco", "seers-cmp", "seers-cookie"] },
  { name: "TrustCommander", patterns: ["trustcommander", "commandersact", "privacy.trustcommander.net"] },
  { name: "SFBX", patterns: ["sfbx", "sfbx.io"] }
];

const FALLBACK_CMP_GLOBALS = [
  { name: "IAB TCF compatible CMP", keys: ["__tcfapi", "__cmp"] },
  { name: "Google Consent Mode", keys: ["google_tag_data"] },
  { name: "Usercentrics", keys: ["UC_UI", "UC_UI_SUPPRESS_CMP_DISPLAY"] },
  { name: "Cookiebot", keys: ["Cookiebot"] },
  { name: "Didomi", keys: ["Didomi"] },
  { name: "OneTrust", keys: ["OneTrust", "Optanon"] },
  { name: "Osano", keys: ["Osano"] },
  { name: "Axeptio", keys: ["axeptioSDK"] },
  { name: "Klaro", keys: ["klaro"] },
  { name: "Google Funding Choices", keys: ["googlefc"] },
  { name: "Ketch", keys: ["ketch"] },
  { name: "CookieScript", keys: ["CookieScript"] },
  { name: "Piwik PRO Consent Manager", keys: ["ppms"] }
];

const CONSENT_SOURCE_PATTERNS = [
  "cmp",
  "consent",
  "cookie",
  "privacy",
  "gdpr",
  "tcf",
  "optanon",
  "uc-",
  "truste",
  "didomi",
  "osano",
  "axeptio",
  "klaro"
];

const CATEGORY_KEYWORDS = {
  essential: ["essential", "necessary", "strictly necessary", "required", "security", "technically"],
  marketing: ["marketing", "advertising", "ads", "retargeting", "targeting", "personalization"],
  analytics: ["analytics", "statistics", "measurement", "performance", "tracking"],
  functional: ["functional", "preferences", "comfort", "features", "customization"],
  social: ["social", "media", "embed", "video"]
};

const SERVICE_HINTS = [
  { name: "Google Analytics", patterns: ["_ga", "_gid", "google-analytics.com", "googletagmanager.com"], category: "analytics" },
  { name: "Google Ads", patterns: ["_gcl", "doubleclick.net", "googleadservices.com"], category: "marketing" },
  { name: "Meta Pixel", patterns: ["_fbp", "facebook.com", "connect.facebook.net"], category: "marketing" },
  { name: "Hotjar", patterns: ["_hj", "hotjar.com"], category: "analytics" },
  { name: "HubSpot", patterns: ["hubspot", "__hstc", "hs-"], category: "marketing" },
  { name: "LinkedIn Insight", patterns: ["linkedin.com", "li_gc", "bcookie"], category: "marketing" },
  { name: "YouTube", patterns: ["youtube.com", "ytimg.com"], category: "social" },
  { name: "Vimeo", patterns: ["vimeo.com", "player.vimeo.com"], category: "social" }
];

const DENY_SELECTORS = [
  "#onetrust-reject-all-handler",
  ".ot-pc-refuse-all-handler",
  "[data-testid*='deny' i]",
  "[data-testid*='reject' i]",
  "[aria-label*='deny' i]",
  "[aria-label*='reject' i]",
  "button"
];

function getCmpSignatures() {
  return FALLBACK_CMP_SIGNATURES;
}

function getCmpGlobals() {
  // TODO: Extend this when public CMP list includes global API information
  return FALLBACK_CMP_GLOBALS;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "cookiebuddy-content") return false;

  if (message.type === "ANALYZE_PAGE") {
    analyzePage().then(sendResponse);
    return true;
  }

  if (message.type === "TRY_DENY_ALL") {
    tryDenyAll().then(sendResponse);
    return true;
  }

  if (message.type === "OPEN_BANNER_OVERVIEW") {
    openBannerOverview().then(sendResponse);
    return true;
  }

  return false;
});

async function analyzePage() {
  const pageText = document.body?.innerText || "";
  const htmlSample = document.documentElement.outerHTML.slice(0, 250000).toLowerCase();
  const resources = collectResources();
  const banner = detectBanner({ htmlSample, pageText, resources });
  const categories = detectCategories(pageText, htmlSample, resources, collectBannerText());
  const contacts = await detectContacts();
  const storage = collectStoredData({ banner, categories, pageText, htmlSample });

  return {
    url: location.href,
    host: location.hostname,
    title: document.title,
    banner,
    categories,
    resources,
    contacts,
    storage,
    scannedAt: new Date().toISOString()
  };
}

function detectBanner({ htmlSample, pageText, resources }) {
  const lowerText = pageText.toLowerCase();
  const scripts = collectScriptSources();
  const domSignals = collectDomConsentSignals();
  const sourceSignals = collectConsentSourceSignals([...scripts, ...resources.map((resource) => resource.url)]);
  const haystack = [
    htmlSample,
    lowerText,
    ...scripts,
    ...resources.map((resource) => resource.url),
    ...domSignals.map((signal) => signal.value)
  ].join(" ").toLowerCase();

  const cmpSignatures = getCmpSignatures();
  const matches = cmpSignatures
    .map((cmp) => ({
      name: cmp.name,
      score: cmp.patterns.filter((item) => haystack.includes(item)).length,
      evidence: cmp.patterns
        .filter((item) => haystack.includes(item))
        .map((item) => ({ type: "signature", value: item }))
    }))
    .filter((cmp) => cmp.score > 0)
    .sort((a, b) => b.score - a.score);

  const globalMatches = detectGlobalCmpApis();
  for (const globalMatch of globalMatches) {
    const existingMatch = matches.find((match) => match.name === globalMatch.name);
    if (existingMatch) {
      existingMatch.score += globalMatch.evidence.length;
      existingMatch.evidence.push(...globalMatch.evidence);
    } else {
      matches.push({
        name: globalMatch.name,
        score: globalMatch.evidence.length,
        evidence: globalMatch.evidence
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  if (matches.length > 0) {
    return {
      name: matches[0].name,
      confidence: matches[0].score > 1 ? "high" : "medium",
      source: sourceSignals[0] || null,
      evidence: matches[0].evidence.slice(0, 8),
      alternatives: matches.slice(1, 4).map((match) => ({
        name: match.name,
        confidence: match.score > 1 ? "medium" : "low",
        evidence: match.evidence.slice(0, 4)
      }))
    };
  }

  const genericCookieLanguage = /cookie|consent|privacy settings|datenschutz|einwilligung/i.test(pageText);
  const source = sourceSignals[0] || domSignals[0] || null;
  const hasDynamicEvidence = genericCookieLanguage || sourceSignals.length > 0 || domSignals.length > 0;

  return {
    name: hasDynamicEvidence ? "Unknown or self-made consent banner" : "No visible banner detected",
    confidence: sourceSignals.length > 0 || domSignals.length > 0 ? "medium" : genericCookieLanguage ? "low" : "none",
    source,
    evidence: [...sourceSignals, ...domSignals].slice(0, 8),
    alternatives: []
  };
}

function collectScriptSources() {
  return Array.from(document.scripts)
    .map((script) => script.src || script.id || script.getAttribute("data-src") || "")
    .filter(Boolean);
}

function collectDomConsentSignals() {
  const selectors = [
    "[id*='cookie' i]",
    "[class*='cookie' i]",
    "[id*='consent' i]",
    "[class*='consent' i]",
    "[id*='privacy' i]",
    "[class*='privacy' i]",
    "[data-testid*='cookie' i]",
    "[data-testid*='consent' i]",
    "[aria-label*='cookie' i]",
    "[aria-label*='consent' i]"
  ];

  return selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)).slice(0, 8))
    .map((element) => ({
      type: "dom",
      value: [
        element.id ? `#${element.id}` : "",
        element.className && typeof element.className === "string" ? `.${element.className.trim().replace(/\s+/g, ".")}` : "",
        element.getAttribute("data-testid") ? `[data-testid="${element.getAttribute("data-testid")}"]` : "",
        element.getAttribute("aria-label") ? `[aria-label="${element.getAttribute("aria-label")}"]` : ""
      ].filter(Boolean).join(" ")
    }))
    .filter((signal, index, list) => signal.value && list.findIndex((item) => item.value === signal.value) === index)
    .slice(0, 12);
}

function collectConsentSourceSignals(urls) {
  return urls
    .map((value) => {
      const url = safeUrl(value);
      if (!url) return null;
      const searchable = `${url.hostname}${url.pathname}`.toLowerCase();
      const matched = CONSENT_SOURCE_PATTERNS.find((pattern) => searchable.includes(pattern));
      if (!matched) return null;

      return {
        type: "source",
        host: url.hostname,
        value: url.href
      };
    })
    .filter(Boolean)
    .filter((signal, index, list) => list.findIndex((item) => item.value === signal.value) === index)
    .slice(0, 12);
}

function detectGlobalCmpApis() {
  const cmpGlobals = getCmpGlobals();
  return cmpGlobals
    .map((candidate) => ({
      name: candidate.name,
      evidence: candidate.keys
        .filter((key) => key in window)
        .map((key) => ({ type: "global", value: key }))
    }))
    .filter((candidate) => candidate.evidence.length > 0);
}

function detectCategories(pageText, htmlSample, resources, bannerText = "") {
  const lowerText = pageText.toLowerCase();
  const lowerBannerText = bannerText.toLowerCase();
  const categories = Object.fromEntries(
    Object.keys(CATEGORY_KEYWORDS).map((category) => [category, { count: 0, services: [] }])
  );

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const present = keywords.some((keyword) => lowerText.includes(keyword) || htmlSample.includes(keyword));
    if (present) {
      categories[category].count += 1;
      categories[category].services.push({
        name: `${capitalize(category)} services`,
        source: keywords.some((keyword) => lowerBannerText.includes(keyword)) ? "Banner text" : "Page text"
      });
    }
  }

  for (const resource of resources) {
    const matchedService = matchService(resource.url);
    if (!matchedService) continue;
    const category = categories[matchedService.category] ? matchedService.category : "functional";
    if (!categories[category].services.some((service) => service.name === matchedService.name)) {
      categories[category].services.push({
        name: matchedService.name,
        source: resource.host
      });
      categories[category].count += 1;
    }
  }

  return categories;
}

function collectStoredData({ banner, categories, pageText, htmlSample }) {
  const localStorageKeys = Object.keys(localStorage || {});
  const sessionStorageKeys = Object.keys(sessionStorage || {});
  const indexedDbNames = [];
  const matchesBanner = (key) => {
    const haystack = `${banner.name} ${pageText} ${htmlSample} ${Object.values(categories).flatMap((category) => category.services.map((service) => service.name)).join(" ")}`.toLowerCase();
    return haystack.includes(key.toLowerCase());
  };

  const items = [
    ...localStorageKeys.map((key) => ({
      key,
      scope: "localStorage",
      valuePreview: previewStorageValue(localStorage.getItem(key)),
      inBanner: matchesBanner(key)
    })),
    ...sessionStorageKeys.map((key) => ({
      key,
      scope: "sessionStorage",
      valuePreview: previewStorageValue(sessionStorage.getItem(key)),
      inBanner: matchesBanner(key)
    })),
    ...indexedDbNames.map((name) => ({
      key: name,
      scope: "IndexedDB",
      valuePreview: "Database",
      inBanner: matchesBanner(name)
    }))
  ];

  return {
    localStorageKeys,
    sessionStorageKeys,
    indexedDbNames,
    items: items.sort((a, b) => Number(b.inBanner) - Number(a.inBanner) || a.scope.localeCompare(b.scope) || a.key.localeCompare(b.key)).slice(0, 50)
  };
}

function collectResources() {
  return performance
    .getEntriesByType("resource")
    .map((entry) => safeUrl(entry.name))
    .filter(Boolean)
    .map((url) => ({
      url: url.href,
      host: url.hostname,
      thirdParty: getBaseDomain(url.hostname) !== getBaseDomain(location.hostname)
    }))
    .filter((resource, index, list) => list.findIndex((item) => item.url === resource.url) === index)
    .slice(0, 250);
}

async function detectContacts() {
  const currentPageSource = classifyPageSource(location.href, document.title);
  const currentPageContacts = extractContactsFromText(
    document.body?.innerText || "",
    location.href,
    currentPageSource.source,
    currentPageSource.sourceType
  );
  const links = Array.from(document.links)
    .map((link) => getContactLinkMetadata(
        link.href,
        link.textContent,
        Boolean(link.closest("footer, [role='contentinfo'], .footer, #footer"))
      ))
    .filter(Boolean)
    .sort((a, b) => contactLinkPriority(b) - contactLinkPriority(a))
    .filter((link, index, list) => list.findIndex((candidate) => candidate.href === link.href) === index)
    .slice(0, 12);

  const linkedContacts = [];
  for (const link of links) {
    try {
      if (!isSafeContactLink(link.href)) {
        continue;
      }

      const response = await fetch(link.href, { credentials: "include" });
      if (!response.ok) continue;
      const text = await response.text();
      linkedContacts.push(...extractContactsFromText(
        stripHtml(text),
        link.href,
        link.source,
        link.sourceType
      ));
    } catch {
      // Some pages block extension-origin fetches. The current page scan still provides useful fallback data.
    }
  }

  const contacts = rankContacts(dedupeContacts([...linkedContacts, ...currentPageContacts]));
  return {
    dpo: contacts[0] || null,
    candidates: contacts.slice(0, 8),
    authority: inferAuthority(location.hostname)
  };
}

async function tryDenyAll() {
  const candidates = collectDenyCandidates();
  const clicked = candidates.find((button) => {
    try {
      button.click();
      return true;
    } catch {
      return false;
    }
  });

  await wait(1400);
  return {
    clicked: Boolean(clicked),
    label: clicked?.innerText?.trim() || clicked?.getAttribute("aria-label") || "",
    found: candidates.length > 0
  };
}

async function openBannerOverview() {
  const candidates = collectBannerOverviewCandidates();
  const clicked = candidates.find((element) => {
    try {
      element.click();
      return true;
    } catch {
      return false;
    }
  });

  await wait(900);
  return {
    clicked: Boolean(clicked),
    found: candidates.length > 0,
    label: clicked?.innerText?.trim() || clicked?.getAttribute("aria-label") || ""
  };
}

function collectBannerOverviewCandidates() {
  const selectors = [
    "#onetrust-pc-btn-handler",
    ".ot-pc-refuse-all-handler",
    ".ot-sdk-show-settings",
    "[data-testid*='settings' i]",
    "[data-testid*='preferences' i]",
    "[aria-label*='settings' i]",
    "[aria-label*='preferences' i]",
    "[aria-label*='manage' i]",
    "[aria-label*='consent' i]",
    "button",
    "a"
  ];

  const textMatchers = [
    /settings/i,
    /preferences/i,
    /manage/i,
    /customi[sz]e/i,
    /cookie settings/i,
    /privacy settings/i,
    /consent/i,
    /show details/i,
    /anzeigen/i,
    /einstellungen/i,
    /präferenzen/i,
    /verwalten/i
  ];

  const selectorMatches = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  return Array.from(new Set(selectorMatches))
    .filter((element) => element instanceof HTMLElement)
    .filter((element) => {
      const label = `${element.innerText || ""} ${element.getAttribute("aria-label") || ""}`.trim();
      return textMatchers.some((matcher) => matcher.test(label));
    });
}

function collectDenyCandidates() {
  const textMatchers = [
    /reject all/i,
    /deny all/i,
    /decline all/i,
    /only necessary/i,
    /essential only/i,
    /alle ablehnen/i,
    /ablehnen/i,
    /nur notwendige/i
  ];

  const selectorMatches = DENY_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  return Array.from(new Set(selectorMatches))
    .filter((element) => element instanceof HTMLElement)
    .filter((element) => {
      const label = `${element.innerText || ""} ${element.getAttribute("aria-label") || ""}`.trim();
      return textMatchers.some((matcher) => matcher.test(label));
    });
}

function collectBannerText() {
  const selectors = [
    "[id*='cookie' i]",
    "[class*='cookie' i]",
    "[id*='consent' i]",
    "[class*='consent' i]",
    "[role='dialog']"
  ];
  return selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)).slice(0, 6))
    .map((element) => element.innerText || element.textContent || "")
    .join(" ")
    .slice(0, 20000);
}

function isSafeContactLink(href) {
  try {
    const url = new URL(href);
    return url.origin === location.origin;
  } catch {
    return false;
  }
}

function inferAuthority(hostname) {
  if (hostname.endsWith(".de")) {
    return {
      key: "german",
      name: "German data protection authorities",
      note: "Germany has state-level authorities. The exact authority depends on the company seat shown in the imprint.",
      url: "https://www.bfdi.bund.de/EN/Service/Anschriften/anschriften_table.html"
    };
  }

  return {
    key: "fallback",
    name: "Federal data protection authority",
    note: "CookieBuddy could not infer a state-level authority from the domain. Use the BfDI as the fallback contact and check the imprint or privacy notice for the responsible state authority.",
    url: "https://www.bfdi.bund.de/SharedDocs/Kontaktdaten/DE/BfDI_Kontakt.html"
  };
}

function matchService(value) {
  const lower = value.toLowerCase();
  return SERVICE_HINTS.find((service) => service.patterns.some((pattern) => lower.includes(pattern)));
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function getBaseDomain(hostname) {
  const parts = hostname.split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}

function previewStorageValue(value) {
  if (!value) return "Empty";
  const trimmed = value.trim();
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}...` : trimmed;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
