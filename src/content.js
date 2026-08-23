// Fallback embedded CMP signatures for when external fetch unavailable
// Reviewed against common operational CMPs and IAB Europe TCF resources in June 2026.
// Consent verification is loaded as a module in tests and mirrored here because
// content scripts are injected as classic scripts in the extension.
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

const DENY_SELECTORS = [
  "#onetrust-reject-all-handler",
  ".ot-pc-refuse-all-handler",
  "[data-testid*='deny' i]",
  "[data-testid*='reject' i]",
  "[aria-label*='deny' i]",
  "[aria-label*='reject' i]",
  "button",
  "[role='button' i]",
  "[role='menuitem' i]",
  "input[type='button' i]",
  "input[type='submit' i]",
  "a"
];

const consentControls = globalThis.CookieBuddyConsentControls;
const consentSurfaceCollector = globalThis.CookieBuddyConsentSurfaces;

// These are local collection limits, not telemetry. They keep ordinary page
// browsing responsive while preserving enough evidence for an audit.
const PAGE_ANALYSIS_BUDGETS = Object.freeze({
  maxPageTextChars: 120_000,
  maxHtmlSampleChars: 250_000,
  maxResources: 250,
  maxConsentNodes: 96,
  maxBannerTextChars: 20_000,
  maxStorageEntries: 50,
  maxCacheStorageNames: 20,
  maxCacheStorageKeys: 20,
  maxServiceWorkerRegistrations: 20,
  maxContactPages: 8,
  maxContactResponseChars: 200_000,
  contactTimeoutMs: 1_500
});

function getCmpSignatures() {
  return FALLBACK_CMP_SIGNATURES;
}

function getCmpGlobals() {
  // TODO: Extend this when public CMP list includes global API information
  return FALLBACK_CMP_GLOBALS;
}

function reportAuditNavigation(kind, url) {
  if (!globalThis.chrome?.runtime?.sendMessage) return;
  void Promise.resolve(chrome.runtime.sendMessage({
    target: "cookiebuddy-background",
    type: "AUDIT_NAVIGATION",
    kind,
    url: sanitizePageUrl(url || location.href)
  })).catch(() => {});
}

globalThis.addEventListener?.("message", (event) => {
  if (event.source !== globalThis || event.data?.source !== "cookiebuddy-navigation-monitor") return;
  reportAuditNavigation(event.data.kind || "spa", event.data.url);
});

globalThis.addEventListener?.("popstate", () => reportAuditNavigation("spa", location.href));
globalThis.addEventListener?.("hashchange", () => reportAuditNavigation("spa", location.href));

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
  const analysisStartedAt = performance.now();
  const consentSurfaces = collectConsentSurfaceContexts();
  const pageText = (document.body?.innerText || "").slice(0, PAGE_ANALYSIS_BUDGETS.maxPageTextChars);
  const htmlSample = document.documentElement.outerHTML.slice(0, PAGE_ANALYSIS_BUDGETS.maxHtmlSampleChars).toLowerCase();
  const resources = collectResources();
  const banner = detectBanner({ htmlSample, pageText, resources }, consentSurfaces);
  const categories = detectCategories(pageText, htmlSample, resources, collectBannerText(consentSurfaces));
  const contacts = await detectContacts();
  const storage = await collectStoredData({ banner, categories, pageText, htmlSample });

  return {
    url: sanitizePageUrl(location.href),
    host: location.hostname,
    title: document.title,
    banner,
    categories,
    resources,
    contacts,
    storage,
    consentSurfaces: consentSurfaces.map(({ context }) => context),
    inaccessibleConsentSurfaces: consentSurfaces
      .filter(({ context }) => context.accessible === false)
      .map(({ context }) => context),
    performance: {
      durationMs: Math.round(performance.now() - analysisStartedAt),
      pageTextChars: pageText.length,
      htmlSampleChars: htmlSample.length,
      resourceCount: resources.length,
      storageEntryCount: storage.items.length
    },
    scannedAt: new Date().toISOString()
  };
}

function detectBanner({ htmlSample, pageText, resources }, consentSurfaces = collectConsentSurfaceContexts()) {
  const lowerText = pageText.toLowerCase();
  const scripts = collectScriptSources();
  const domSignals = collectDomConsentSignals(consentSurfaces);
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
  const inaccessibleSignals = consentSurfaces
    .filter(({ context }) => context.accessible === false)
    .map(({ context }) => ({ type: "inaccessible-surface", value: context.reason, context }));

  if (matches.length > 0) {
    return {
      name: matches[0].name,
      confidence: matches[0].score > 1 ? "high" : "medium",
      source: sourceSignals[0] || null,
      evidence: [...matches[0].evidence, ...domSignals.slice(0, 4), ...inaccessibleSignals].slice(0, 8),
      inaccessible: inaccessibleSignals.length > 0,
      alternatives: matches.slice(1, 4).map((match) => ({
        name: match.name,
        confidence: match.score > 1 ? "medium" : "low",
        evidence: match.evidence.slice(0, 4)
      }))
    };
  }

  const genericCookieLanguage = /cookie|consent|privacy settings|datenschutz|einwilligung/i.test(pageText);
  const source = sourceSignals[0] || domSignals[0] || inaccessibleSignals[0] || null;
  const hasDynamicEvidence = genericCookieLanguage || sourceSignals.length > 0 || domSignals.length > 0 || inaccessibleSignals.length > 0;

  return {
    name: inaccessibleSignals.length > 0 && !sourceSignals.length && !domSignals.length
      ? "Consent surface inaccessible"
      : hasDynamicEvidence ? "Unknown or self-made consent banner" : "No visible banner detected",
    confidence: sourceSignals.length > 0 || domSignals.length > 0 ? "medium" : genericCookieLanguage ? "low" : "none",
    source,
    evidence: [...sourceSignals, ...domSignals, ...inaccessibleSignals].slice(0, 8),
    inaccessible: inaccessibleSignals.length > 0,
    alternatives: []
  };
}

function collectScriptSources() {
  return Array.from(document.scripts)
    .map((script) => script.src || script.id || script.getAttribute("data-src") || "")
    .filter(Boolean);
}

function collectDomConsentSignals(consentSurfaces = collectConsentSurfaceContexts()) {
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

  const semanticSelectors = ["button", "a", "[role='button' i]", "[role='menuitem' i]"];
  return consentSurfaces
    .filter(({ root }) => root)
    .flatMap(({ root, context }) => {
      const semanticElements = semanticSelectors
        .flatMap((selector) => Array.from(root.querySelectorAll(selector)).slice(0, 8))
        .filter((element) => ["deny-all", "essential-only", "settings"].includes(classifyConsentElement(element).kind));
      const elements = [
        ...selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)).slice(0, 8)),
        ...semanticElements
      ];
      return Array.from(new Set(elements)).map((element) => ({
        type: "dom",
        context,
        value: [
          element.id ? `#${element.id}` : "",
          element.className && typeof element.className === "string" ? `.${element.className.trim().replace(/\s+/g, ".")}` : "",
          element.getAttribute("data-testid") ? `[data-testid="${element.getAttribute("data-testid")}"]` : "",
          element.getAttribute("aria-label") ? `[aria-label="${element.getAttribute("aria-label")}"]` : "",
          consentControls ? consentControls.getAccessibleName(element) : ""
        ].filter(Boolean).join(" ")
      }));
    })
    .filter((signal, index, list) => signal.value && list.findIndex((item) => item.value === signal.value && item.context?.domContext === signal.context?.domContext) === index)
    .slice(0, PAGE_ANALYSIS_BUDGETS.maxConsentNodes);
}

function collectConsentSurfaceContexts() {
  if (consentSurfaceCollector?.collect) {
    try {
      return consentSurfaceCollector.collect(document, location);
    } catch {
      // Fall back to the top document if a browser implementation blocks a DOM read.
    }
  }
  return [{
    root: document,
    context: {
      rootType: "document",
      domContext: "top-document",
      frameUrl: sanitizePageUrl(location.href),
      frameOrigin: location.origin,
      framePath: [],
      accessible: true
    }
  }];
}

function collectConsentSourceSignals(urls) {
  return urls
    .map((value) => {
      const evidence = minimizePageEvidence(value);
      if (!evidence) return null;
      const searchable = `${evidence.host}${evidence.path}`.toLowerCase();
      const matched = CONSENT_SOURCE_PATTERNS.find((pattern) => searchable.includes(pattern));
      if (!matched) return null;

      return {
        type: "source",
        host: evidence.host,
        value: evidence.url,
        queryKeys: evidence.queryKeys
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
        source: matchedService.evidence.source,
        ruleId: matchedService.id,
        ruleVersion: matchedService.ruleVersion,
        evidence: matchedService.evidence,
        confidence: matchedService.confidence
      });
      categories[category].count += 1;
    }
  }

  return categories;
}

async function collectStoredData({ banner, categories, pageText, htmlSample }) {
  const localStorageKeys = Object.keys(localStorage || {});
  const sessionStorageKeys = Object.keys(sessionStorage || {});
  const [indexedDb, cacheStorage, serviceWorkers] = await Promise.all([
    collectIndexedDbMetadata(),
    collectCacheStorageMetadata(),
    collectServiceWorkerMetadata()
  ]);
  const indexedDbNames = indexedDb.databases.map((database) => database.name).filter(Boolean);
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
    })),
    ...cacheStorage.caches.map((cache) => ({
      key: cache.name,
      scope: "Cache Storage",
      valuePreview: `${cache.keys.length} request keys`,
      inBanner: matchesBanner(cache.name)
    })),
    ...serviceWorkers.registrations.map((registration) => ({
      key: registration.scope || "Service worker scope",
      scope: "Service worker",
      valuePreview: "Registration",
      inBanner: false
    }))
  ];

  return {
    localStorageKeys,
    sessionStorageKeys,
    indexedDbNames,
    indexedDb,
    cacheStorage,
    serviceWorkers,
    coverage: {
      indexedDB: indexedDb.status,
      cacheStorage: cacheStorage.status,
      serviceWorkers: serviceWorkers.status
    },
    items: items.sort((a, b) => Number(b.inBanner) - Number(a.inBanner) || a.scope.localeCompare(b.scope) || a.key.localeCompare(b.key)).slice(0, PAGE_ANALYSIS_BUDGETS.maxStorageEntries)
  };
}

async function collectIndexedDbMetadata() {
  if (!globalThis.indexedDB || typeof indexedDB.databases !== "function") {
    return { status: "not-inspected", reason: "api-unavailable", databases: [] };
  }
  try {
    const databases = await indexedDB.databases();
    return {
      status: "observed",
      reason: "",
      databases: databases.slice(0, PAGE_ANALYSIS_BUDGETS.maxStorageEntries).map((database) => ({
        name: String(database.name || "").slice(0, 160),
        version: Number.isFinite(database.version) ? database.version : null
      }))
    };
  } catch {
    return { status: "not-inspected", reason: "inspection-error", databases: [] };
  }
}

async function collectCacheStorageMetadata() {
  if (!globalThis.caches || typeof caches.keys !== "function") {
    return { status: "not-inspected", reason: "api-unavailable", caches: [] };
  }
  try {
    const names = (await caches.keys()).slice(0, PAGE_ANALYSIS_BUDGETS.maxCacheStorageNames);
    const cacheEntries = await Promise.all(names.map(async (name) => {
      try {
        const requests = await caches.open(name).then((cache) => cache.keys());
        return {
          name: String(name).slice(0, 160),
          status: "observed",
          keys: requests.slice(0, PAGE_ANALYSIS_BUDGETS.maxCacheStorageKeys).map((request) => {
            const evidence = minimizePageEvidence(request.url);
            return evidence ? { url: evidence.url, method: String(request.method || "GET").slice(0, 12), queryKeys: evidence.queryKeys } : null;
          }).filter(Boolean)
        };
      } catch {
        return { name: String(name).slice(0, 160), status: "not-inspected", keys: [] };
      }
    }));
    const failed = cacheEntries.some((entry) => entry.status === "not-inspected");
    return { status: failed ? "not-inspected" : "observed", reason: failed ? "inspection-error" : "", caches: cacheEntries };
  } catch {
    return { status: "not-inspected", reason: "inspection-error", caches: [] };
  }
}

async function collectServiceWorkerMetadata() {
  if (!globalThis.navigator?.serviceWorker || typeof globalThis.navigator.serviceWorker.getRegistrations !== "function") {
    return { status: "not-inspected", reason: "api-unavailable", registrations: [] };
  }
  try {
    const registrations = await globalThis.navigator.serviceWorker.getRegistrations();
    return {
      status: "observed",
      reason: "",
      registrations: registrations.slice(0, PAGE_ANALYSIS_BUDGETS.maxServiceWorkerRegistrations).map((registration) => ({
        scope: sanitizePageUrl(registration.scope),
        scriptUrl: sanitizePageUrl(registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || ""),
        state: registration.active?.state || registration.waiting?.state || registration.installing?.state || "unknown"
      }))
    };
  } catch {
    return { status: "not-inspected", reason: "inspection-error", registrations: [] };
  }
}

function collectResources() {
  return performance
    .getEntriesByType("resource")
    .slice(0, PAGE_ANALYSIS_BUDGETS.maxResources)
    .map((entry) => safeUrl(entry.name))
    .filter(Boolean)
    .map((url) => minimizePageEvidence(url.href))
    .filter(Boolean)
    .map((evidence) => {
      const relationship = globalThis.CookieBuddyDomainRules?.classifyEndpointRelationship({ host: evidence.host, pageHost: location.hostname, path: evidence.path }) || { relationship: "unknown", cnameStatus: "unknown", cnameRule: null };
      return {
        url: evidence.url,
        host: evidence.host,
        path: evidence.path,
        queryKeys: evidence.queryKeys,
        relationship: relationship.relationship,
        cnameStatus: relationship.cnameStatus,
        cnameRule: relationship.cnameRule,
        thirdParty: relationship.relationship === "third-party"
      };
    })
    .filter((resource, index, list) => list.findIndex((item) => item.url === resource.url) === index)
    .slice(0, PAGE_ANALYSIS_BUDGETS.maxResources);
}

async function detectContacts() {
  const currentPageUrl = sanitizePageUrl(location.href);
  const currentPageSource = classifyPageSource(currentPageUrl, document.title);
  const currentPageContacts = extractContactsFromText(
    (document.body?.innerText || "").slice(0, PAGE_ANALYSIS_BUDGETS.maxPageTextChars),
    currentPageUrl,
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
    .slice(0, PAGE_ANALYSIS_BUDGETS.maxContactPages);

  const linkedContacts = [];
  for (const link of links) {
    try {
      const requestHref = link.requestHref || link.href;
      if (!isSafeContactLink(requestHref)) {
        continue;
      }

      const response = await fetchWithTimeout(requestHref, { credentials: "include" }, PAGE_ANALYSIS_BUDGETS.contactTimeoutMs);
      if (!response.ok) continue;
      const text = (await response.text()).slice(0, PAGE_ANALYSIS_BUDGETS.maxContactResponseChars);
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
  let before = collectConsentState();
  const excluded = new Set();
  const actions = [];
  let verification = { status: "unverified", evidence: [] };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidates = collectDenyCandidates(excluded);
    if (!candidates.length) break;
    const candidate = candidates[0];
    excluded.add(candidate.element);
    const label = consentControls?.getAccessibleName(candidate.element) || "";
    let clicked = false;
    try {
      candidate.element.click();
      clicked = true;
    } catch {
      // Continue to the next safe candidate when a control is no longer clickable.
    }
    if (!clicked) continue;

    await wait(700);
    const after = collectConsentState();
    verification = evaluateConsentStateChange(before, after);
    actions.push({
      label: String(label).slice(0, 160),
      source: candidate.classification.source,
      confidence: candidate.classification.confidence,
      context: candidate.context,
      status: verification.status,
      evidence: verification.evidence
    });
    if (verification.status === "verified") break;
    before = after;
  }

  const firstAction = actions[0];
  const clicked = actions.length > 0;
  const found = clicked || collectDenyCandidates().length > 0;
  const status = verification.status === "verified" ? "verified" : clicked ? "unclear" : "not-attempted";
  return {
    clicked,
    verified: status === "verified",
    label: firstAction?.label || "",
    found,
    reason: status === "verified" ? "consent-state-verified" : clicked ? "consent-state-unverified" : "no-safe-control",
    verification: {
      status,
      evidence: [...new Set(actions.flatMap((action) => action.evidence || []))],
      actions
    }
  };
}

async function openBannerOverview() {
  const candidates = collectBannerOverviewCandidates();
  const clicked = candidates.find(({ element }) => {
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
    label: clicked && consentControls ? consentControls.getAccessibleName(clicked.element) : "",
    context: clicked?.context || candidates[0]?.context || null
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
    "a",
    "[role='button' i]",
    "[role='menuitem' i]"
  ];

  return collectConsentSurfaceContexts()
    .filter(({ root }) => root)
    .flatMap(({ root, context }) => selectors
      .flatMap((selector) => Array.from(root.querySelectorAll(selector)))
      .map((element) => ({ element, context })))
    .filter(({ element }) => element?.nodeType === 1)
    .filter(({ element }) => isUsableConsentControl(element))
    .map(({ element, context }) => ({ element, context, classification: classifyConsentElement(element) }))
    .filter(({ classification }) => classification.kind === "settings" && classification.canClick)
    .sort((left, right) => consentControlScore(right.classification) - consentControlScore(left.classification));
}

function collectDenyCandidates(excluded = new Set()) {
  const selectorMatches = collectConsentSurfaceContexts()
    .filter(({ root }) => root)
    .flatMap(({ root, context }) => DENY_SELECTORS
      .flatMap((selector) => Array.from(root.querySelectorAll(selector)))
      .map((element) => ({ element, context })));
  const uniqueElements = new Set();
  return selectorMatches
    .filter(({ element }) => {
      if (uniqueElements.has(element)) return false;
      uniqueElements.add(element);
      return true;
    })
    .filter(({ element }) => element?.nodeType === 1)
    .filter(({ element }) => isUsableConsentControl(element))
    .map(({ element, context }) => ({ element, context, classification: classifyConsentElement(element) }))
    .filter(({ classification }) => ["deny-all", "essential-only"].includes(classification.kind) && classification.canClick)
    .filter(({ element, context, classification }) => !excluded.has(element) && (context.rootType === "shadow-root" || isConsentSurfaceElement(element) || classification.source === "cmp"))
    .sort((left, right) => consentControlScore(right.classification) - consentControlScore(left.classification))
    .slice(0, PAGE_ANALYSIS_BUDGETS.maxConsentNodes)
}

function collectConsentState() {
  const consentSurfaces = collectConsentSurfaceContexts();
  const bannerText = normalizeConsentStateText(collectBannerText(consentSurfaces));
  const signals = collectDomConsentSignals(consentSurfaces).map((signal) => `${signal.value}:${signal.context?.domContext || "unknown"}`).sort();
  const candidates = collectDenyCandidates();
  const controls = candidates.map(({ element, context }) => [
    consentControls?.getAccessibleName(element) || "",
    element.getAttribute("aria-checked") || "",
    element.getAttribute("aria-pressed") || "",
    element.getAttribute("aria-expanded") || "",
    element.getAttribute("disabled") || "",
    context.domContext || ""
  ].join("~")).sort();
  return {
    bannerVisible: Boolean(bannerText || signals.length),
    bannerSignature: bannerText,
    consentSignalSignature: signals.join("|") ,
    controlStateSignature: controls.join("|"),
    rejectCandidateCount: candidates.length
  };
}

function evaluateConsentStateChange(before = {}, after = {}) {
  const evidence = [];
  if (before.rejectCandidateCount > after.rejectCandidateCount) evidence.push("reject-control-removed");
  if (before.consentSignalSignature !== after.consentSignalSignature) evidence.push("consent-signals-changed");
  if (before.bannerSignature !== after.bannerSignature) evidence.push("banner-state-changed");
  if (before.controlStateSignature !== after.controlStateSignature) evidence.push("consent-control-state-changed");
  const changed = evidence.length > 0;
  const completed = changed && (after.rejectCandidateCount === 0 || after.bannerVisible === false);
  return { status: completed ? "verified" : changed ? "changed-not-final" : "unverified", evidence };
}

function normalizeConsentStateText(value) {
  return String(value || "").toLocaleLowerCase().replace(/\s+/g, " ").trim().slice(0, 3000);
}

function isConsentSurfaceElement(element) {
  return Boolean(element.closest?.(
    "[role='dialog'], [aria-modal='true'], [id*='cookie' i], [class*='cookie' i], [id*='consent' i], [class*='consent' i], [id*='privacy' i], [class*='privacy' i], [data-testid*='cookie' i], [data-testid*='consent' i]"
  ));
}

function classifyConsentElement(element) {
  if (!consentControls) return { kind: "unknown", confidence: "none", canClick: false };
  const details = consentControls.getAccessibleNameDetails(element);
  const role = element.getAttribute("role") || "";
  const tagName = element.tagName || "";
  const type = element.getAttribute("type") || "";
  const declaredLanguage = element.closest?.("[lang]")?.getAttribute("lang") || document.documentElement.lang || "";
  const cmpHint = /onetrust|optanon|cookiebot|didomi|trustarc|sourcepoint|quantcast|osano|axeptio|complianz|consentmanager|klaro|cookieyes|cookiehub|ketch|gdpr-cookie/i.test(
    [element.id, element.className, element.getAttribute("data-testid")].filter(Boolean).join(" ")
  );
  return consentControls.classifyConsentControl({
    name: details.name,
    nameSource: details.source,
    role,
    tagName,
    type,
    declaredLanguage,
    cmpHint
  });
}

function consentControlScore(classification) {
  return { cmp: 4, accessibility: 3, locale: 2, text: 1 }[classification.source] || 0;
}

function isUsableConsentControl(element) {
  if (element.disabled || element.getAttribute("aria-disabled") === "true" || element.getAttribute("aria-hidden") === "true") return false;
  if (element.closest?.("[aria-hidden='true'], [hidden]")) return false;
  if (typeof element.getClientRects === "function" && element.isConnected && element.getClientRects().length === 0) return false;
  return true;
}

function collectBannerText(consentSurfaces = collectConsentSurfaceContexts()) {
  const selectors = [
    "[id*='cookie' i]",
    "[class*='cookie' i]",
    "[id*='consent' i]",
    "[class*='consent' i]",
    "[role='dialog']"
  ];
  return consentSurfaces
    .filter(({ root }) => root)
    .flatMap(({ root }) => selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)).slice(0, 6)))
    .map((element) => element.innerText || element.textContent || "")
    .join(" ")
    .slice(0, PAGE_ANALYSIS_BUDGETS.maxBannerTextChars);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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
  return globalThis.CookieBuddyServiceRules?.match({ url: value }) || null;
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function minimizePageEvidence(value) {
  const url = safeUrl(value);
  if (!url) return null;
  url.username = "";
  url.password = "";
  const queryKeys = [...new Set([...url.searchParams.keys()].map((key) => key.trim().slice(0, 80)).filter(Boolean))].slice(0, 20);
  url.search = "";
  url.hash = "";
  return {
    url: url.href,
    host: url.hostname,
    path: url.pathname || "/",
    queryKeys
  };
}

function sanitizePageUrl(value) {
  return minimizePageEvidence(value)?.url || "";
}

function getBaseDomain(hostname) {
  return globalThis.CookieBuddyDomainRules?.registrableDomain(hostname) || "";
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
