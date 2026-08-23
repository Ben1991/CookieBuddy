import { minimizeUrlEvidence } from "./url-evidence.mjs";
import { assessAuditIntegrity } from "./audit-integrity.mjs";
import { mergeCookieCoverage } from "./cookie-evidence.mjs";
import "./domain-rules.js";
import "./service-rules.js";

export function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getBaseDomain(hostname) {
  return globalThis.CookieBuddyDomainRules?.registrableDomain(hostname) || "";
}

export function cookieKey(cookie) {
  return `${cookie.domain}|${cookie.path}|${cookie.name}`;
}

export function isEssentialCookie(cookie) {
  return /session|csrf|xsrf|auth|consent|cookie|privacy|necessary|required|essential|cf_bm|cf_clearance/i.test(cookie.name);
}

// Treat common security and delivery infrastructure as allowed after opt-out.
export function isEssentialHost(hostname) {
  return /(^|\.)cloudflare\.com$|(^|\.)cloudflare\.net$|(^|\.)cloudfront\.net$|(^|\.)akamaihd\.net$|(^|\.)fastly\.net$|(^|\.)hcaptcha\.com$|(^|\.)recaptcha\.net$|(^|\.)gstatic\.com$/i.test(hostname);
}

export function serviceForCookie(cookie, unknownServiceLabel = "Unknown service") {
  return serviceRuleForCookie(cookie)?.name || unknownServiceLabel;
}

export function serviceRuleForCookie(cookie = {}) {
  return globalThis.CookieBuddyServiceRules?.match({ cookieName: cookie.name, cookieDomain: cookie.domain }) || null;
}

export function serviceRuleForSignal(signal = {}) {
  return globalThis.CookieBuddyServiceRules?.match(signal) || null;
}

export function formatCookie(cookie, unknownServiceLabel = "Unknown service") {
  const rule = serviceRuleForCookie(cookie);
  return {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    service: rule?.name || unknownServiceLabel,
    serviceRuleId: rule?.id || "",
    serviceRuleVersion: rule?.ruleVersion || "",
    serviceEvidence: rule?.evidence || null,
    serviceConfidence: rule?.confidence || "none"
  };
}

export function normalizeTraffic(traffic, firstPartyHost) {
  return traffic
    .map((item) => {
      const minimized = minimizeUrlEvidence(item.url);
      if (!minimized?.url) return null;
      try {
        const relationship = globalThis.CookieBuddyDomainRules?.classifyEndpointRelationship({
          host: minimized.host,
          pageHost: firstPartyHost,
          path: minimized.path
        }) || { relationship: "unknown", cnameStatus: "unknown", cnameRule: null };
        if (!["third-party", "possible-cloaked-tracker"].includes(relationship.relationship)) return null;
        return {
          host: minimized.host || minimized.protocol,
          url: minimized.url,
          protocol: minimized.protocol,
          path: minimized.path,
          queryKeys: minimized.queryKeys,
          type: item.type,
          blocked: Boolean(item.blocked),
          error: item.blocked ? String(item.error || "blocked").slice(0, 100) : "",
          thirdParty: relationship.relationship === "third-party",
          relationship: relationship.relationship,
          cnameStatus: relationship.cnameStatus,
          cnameRule: relationship.cnameRule
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function buildServiceAudit({
  bannerCategories = {},
  beforeCookies = [],
  afterCookies = [],
  beforeTraffic = [],
  afterTraffic = [],
  afterStorageEntries = []
}) {
  const bannerServices = Object.entries(bannerCategories).flatMap(([category, data]) =>
    (data?.services || []).map((service) => ({
      name: service.name,
      category,
      source: service.source || "Banner text",
      ruleId: service.ruleId || "",
      ruleVersion: service.ruleVersion || "",
      evidence: service.evidence || null,
      confidence: service.confidence || "none",
      listedInBanner: service.source === "Banner text" || Boolean(service.listedInBanner),
      essential: category === "essential" || /essential|necessary|required/i.test(`${category} ${service.name}`)
    }))
  );
  const before = { cookies: beforeCookies, traffic: beforeTraffic, storage: [] };
  const after = { cookies: afterCookies, traffic: afterTraffic, storage: afterStorageEntries };
  const audit = bannerServices.map((service) => {
    const observedBefore = serviceHasEvidence(service, before);
    const observedAfter = serviceHasEvidence(service, after);
    return {
      ...service,
      observedBefore,
      observedAfter,
      status: service.essential ? "allowed-essential" : observedAfter ? "active" : observedBefore ? "disabled" : "unclear"
    };
  });

  const knownNames = new Set(audit.map((service) => service.name.toLowerCase()));
  const unlisted = [
    ...dedupeServices(afterTraffic
      .filter((item) => !isEssentialHost(item.host) && !matchesKnownService(`${item.host || ""} ${item.url || ""}`, audit))
      .map((item) => {
        const rule = serviceRuleForSignal(item);
        const browserExtension = /^(chrome-extension|moz-extension):/i.test(item.protocol || item.url || "");
        return {
          name: browserExtension ? `Browser extension ${item.host || "unknown"}` : rule?.name || item.host,
          category: browserExtension ? "unlisted" : rule?.category || "unlisted",
          source: browserExtension ? "Browser extension traffic" : rule?.evidence?.source || "Third-party traffic",
          ruleId: rule?.id || "",
          ruleVersion: rule?.ruleVersion || "",
          evidence: rule?.evidence || null,
          confidence: rule?.confidence || "none",
          listedInBanner: false,
          essential: false,
          observedBefore: false,
          observedAfter: true,
          status: "unclear"
        };
      })),
    ...afterCookies
      .map((cookie) => ({ ...cookie, service: cookie.service || serviceForCookie(cookie), rule: serviceRuleForCookie(cookie) }))
      .filter((cookie) => !isEssentialCookie(cookie) && !knownNames.has(cookie.service.toLowerCase()))
      .map((cookie) => ({
        name: cookie.service,
        category: cookie.rule?.category || "unlisted",
        source: cookie.rule?.evidence?.source || `Cookie: ${cookie.name}`,
        ruleId: cookie.rule?.id || "",
        ruleVersion: cookie.rule?.ruleVersion || "",
        evidence: cookie.rule?.evidence || null,
        confidence: cookie.rule?.confidence || "none",
        listedInBanner: false,
        essential: false,
        observedBefore: false,
        observedAfter: true,
        status: "unclear"
      })),
    ...afterStorageEntries
      .filter((entry) => !isEssentialStorageEntry(entry) && !entry.inBanner)
      .map((entry) => ({ name: entry.key, category: "unlisted", source: entry.scope || "Browser storage", listedInBanner: false, essential: false, observedBefore: false, observedAfter: true, status: "unclear" }))
  ];

  return [...audit, ...dedupeServices(unlisted)];
}

export function isEssentialStorageEntry(entry = {}) {
  if (["Cache Storage", "Service worker"].includes(entry.scope)) return true;
  return Boolean(entry.inBanner) || /consent|session|csrf|xsrf|auth|necessary|essential|privacy|security|required/i.test(entry.key || "");
}

function summarizeBrowserStorage(storage) {
  if (!storage) return null;
  const coverage = storage.coverage || {};
  return {
    localStorage: { status: "observed", count: (storage.localStorageKeys || []).length },
    sessionStorage: { status: "observed", count: (storage.sessionStorageKeys || []).length },
    indexedDB: {
      status: coverage.indexedDB || storage.indexedDb?.status || "not-recorded",
      names: (storage.indexedDbNames || []).slice(0, 50)
    },
    cacheStorage: {
      status: coverage.cacheStorage || storage.cacheStorage?.status || "not-recorded",
      caches: (storage.cacheStorage?.caches || []).slice(0, 20).map((cache) => ({
        name: cache.name,
        status: cache.status || "observed",
        keys: (cache.keys || []).slice(0, 20).map((key) => ({ url: key.url, method: key.method, queryKeys: key.queryKeys || [] }))
      }))
    },
    serviceWorkers: {
      status: coverage.serviceWorkers || storage.serviceWorkers?.status || "not-recorded",
      registrations: (storage.serviceWorkers?.registrations || []).slice(0, 20).map((registration) => ({
        scope: registration.scope || "",
        scriptUrl: registration.scriptUrl || "",
        state: registration.state || "unknown"
      }))
    }
  };
}

function serviceHasEvidence(service, state) {
  return state.cookies.some((cookie) => {
    const cookieService = cookie.service || serviceForCookie(cookie);
    return cookieService === service.name || matchesServiceText(service, `${cookie.name} ${cookie.domain} ${cookieService}`);
  }) || state.traffic.some((item) => matchesServiceText(service, `${item.host || ""} ${item.url || ""}`)) || state.storage.some((entry) => matchesServiceText(service, `${entry.key || ""} ${entry.valuePreview || ""}`));
}

function matchesServiceText(service, value) {
  const haystack = value.toLowerCase();
  const nameTokens = service.name.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const source = String(service.source || "").toLowerCase();
  return (source && haystack.includes(source)) || nameTokens.some((token) => haystack.includes(token));
}

function matchesKnownService(value, services) {
  return services.some((service) => matchesServiceText(service, value));
}

function dedupeServices(services) {
  const seen = new Set();
  return services.filter((service) => {
    const key = `${service.name}:${service.source}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildDelta({
  beforeCookies,
  afterCookies,
  beforeTraffic,
  afterTraffic,
  afterStorageEntries = [],
  beforeCookieCoverage = null,
  afterCookieCoverage = null,
  afterStorage = null,
  banner = null,
  bannerCategories = {},
  denyClicked,
  denyVerified = false,
  denyLabel,
  denyVerification = null,
  inaccessibleConsentSurfaces = [],
  beforeAnalysis = null,
  blockedRequests = [],
  manualConsentConfirmed,
  labels,
  tabUrl
}) {
  const beforeCookieKeys = new Set(beforeCookies.map(cookieKey));
  const remainingCookies = afterCookies.filter((cookie) => beforeCookieKeys.has(cookieKey(cookie)) && !isEssentialCookie(cookie));
  const newCookies = afterCookies.filter((cookie) => !beforeCookieKeys.has(cookieKey(cookie)) && !isEssentialCookie(cookie));
  const essentialCookies = afterCookies.filter((cookie) => isEssentialCookie(cookie));
  const observedBeforeTraffic = beforeTraffic.filter((item) => !item.blocked);
  const observedAfterTraffic = afterTraffic.filter((item) => !item.blocked);
  const isConfirmedThirdParty = (item) => item.relationship ? item.relationship === "third-party" : item.thirdParty !== false;
  const possibleCloakedBefore = observedBeforeTraffic.filter((item) => item.relationship === "possible-cloaked-tracker");
  const possibleCloakedAfter = observedAfterTraffic.filter((item) => item.relationship === "possible-cloaked-tracker");
  const allThirdPartyHosts = Array.from(new Set(observedAfterTraffic.filter(isConfirmedThirdParty).map((item) => item.host))).sort();
  const thirdPartyHosts = allThirdPartyHosts.filter((host) => !isEssentialHost(host));
  const essentialThirdPartyHosts = allThirdPartyHosts.filter((host) => isEssentialHost(host));
  const remainingStorageEntries = afterStorageEntries.filter(Boolean);
  const nonEssentialStorageEntries = remainingStorageEntries.filter((entry) => !isEssentialStorageEntry(entry));
  const essentialStorageEntries = remainingStorageEntries.filter(isEssentialStorageEntry);
  const serviceAudit = buildServiceAudit({ bannerCategories, beforeCookies, afterCookies, beforeTraffic: observedBeforeTraffic, afterTraffic: observedAfterTraffic, afterStorageEntries: remainingStorageEntries });
  const integrity = assessAuditIntegrity({ beforeCookies, beforeStorageEntries: beforeAnalysis?.storage?.items || [], beforeAnalysis, blockedRequests });
  const cookieCoverage = mergeCookieCoverage(beforeCookieCoverage, afterCookieCoverage);
  const suspiciousCookies = remainingCookies.filter((cookie) => !isEssentialCookie(cookie));
  const cnameCoverage = {
    status: possibleCloakedBefore.length || possibleCloakedAfter.length ? "unknown" : "not-observed",
    reason: possibleCloakedBefore.length || possibleCloakedAfter.length ? "browser-dns-unavailable" : "no-known-pattern-observed",
    beforeCount: possibleCloakedBefore.length,
    afterCount: possibleCloakedAfter.length
  };
  const hasDelta = suspiciousCookies.length > 0 || newCookies.length > 0 || thirdPartyHosts.length > 0 || possibleCloakedAfter.length > 0 || nonEssentialStorageEntries.length > 0 || serviceAudit.some((service) => service.status === "active") || (!denyClicked && !manualConsentConfirmed);

  return {
    checkedAt: new Date().toISOString(),
    url: minimizeUrlEvidence(tabUrl, { retainQueryKeys: false })?.url || "",
    denyAction: {
      clicked: Boolean(denyClicked),
      verified: Boolean(denyVerified),
      label: denyLabel || "",
      manual: Boolean(manualConsentConfirmed && !denyClicked),
      verification: denyVerification || { status: denyVerified ? "verified" : "unverified", evidence: [], actions: [] }
    },
    riskLevel: hasDelta ? "high" : "low",
    summary: hasDelta ? labels.deltaFoundSummary : labels.noDeltaSummary,
    remainingCookies: suspiciousCookies,
    newCookies,
    thirdPartyHosts,
    possibleCloakedTrackers: possibleCloakedAfter,
    cnameCoverage,
    essentialCookies,
    essentialThirdPartyHosts,
    banner,
    integrity,
    cookieCoverage,
    inaccessibleConsentSurfaces: inaccessibleConsentSurfaces.slice(0, 12),
    afterStorageEntries: remainingStorageEntries,
    remainingStorageEntries,
    nonEssentialStorageEntries,
    essentialStorageEntries,
    browserStorage: {
      before: summarizeBrowserStorage(beforeAnalysis?.storage),
      after: summarizeBrowserStorage(afterStorage)
    },
    serviceAudit,
    beforeCounts: {
      cookies: beforeCookies.length,
      thirdPartyHosts: Array.from(new Set(observedBeforeTraffic.filter(isConfirmedThirdParty).map((item) => item.host))).length
    },
    afterDenyCounts: {
      cookies: afterCookies.length,
      thirdPartyHosts: allThirdPartyHosts.length,
      suspiciousThirdPartyHosts: thirdPartyHosts.length,
      essentialThirdPartyHosts: essentialThirdPartyHosts.length,
      storageEntries: remainingStorageEntries.length
    }
  };
}

const COVERAGE_LIMITATIONS = [
  { key: "fingerprinting", state: "not-technically-inspectable", confidence: "high" },
  { key: "server-side-tagging", state: "not-technically-inspectable", confidence: "high" },
  { key: "backend-enrichment", state: "not-technically-inspectable", confidence: "high" },
  { key: "first-party-proxy", state: "not-detected", confidence: "medium" },
  { key: "cname-routing", state: "not-detected", confidence: "medium" },
  { key: "opaque-client-signal", state: "not-observed", confidence: "medium" }
];

const FINGERPRINTING_HINT = /fingerprint|fpjs|deviceprint|canvas|webgl/i;

function normalizeHeuristicSignal(signal) {
  if (!signal || typeof signal !== "object" || !signal.key) return null;
  return {
    key: String(signal.key),
    confidence: String(signal.confidence || "low"),
    evidence: Array.isArray(signal.evidence) ? signal.evidence.map(String).slice(0, 5) : [],
    confirmed: false
  };
}

export function deriveHeuristicSignals(delta = {}) {
  const supplied = (delta.heuristicSignals || []).map(normalizeHeuristicSignal).filter(Boolean);
  const candidates = [
    ...(delta.thirdPartyHosts || []),
    ...(delta.serviceAudit || []).flatMap((service) => [service.name, service.source, service.category])
  ].filter(Boolean);
  const fingerprintEvidence = candidates.filter((value) => FINGERPRINTING_HINT.test(String(value))).slice(0, 5);
  if (fingerprintEvidence.length && !supplied.some((signal) => signal.key === "fingerprinting")) {
    supplied.push({ key: "fingerprinting", confidence: "low", evidence: fingerprintEvidence, confirmed: false });
  }
  return supplied;
}

/**
 * Describe what this audit observed in the browser and what remains outside
 * reliable browser-side inspection. Scope limitations are explicit and do
 * not turn a complete browser audit into a claim of complete tracking
 * detection.
 */
export function createCoverageSummary({ delta = {}, analysisComplete = true, heuristicSignals } = {}) {
  const hasCookieObservation = Number.isFinite(delta.beforeCounts?.cookies) && Number.isFinite(delta.afterDenyCounts?.cookies);
  const hasTrafficObservation = Number.isFinite(delta.beforeCounts?.thirdPartyHosts) && Number.isFinite(delta.afterDenyCounts?.thirdPartyHosts);
  const hasStorageObservation = Number.isFinite(delta.afterDenyCounts?.storageEntries);
  const storageCoverage = delta.browserStorage?.after || null;
  const storageMechanisms = storageCoverage ? [
    { key: "indexeddb", coverageKey: "indexedDB", evidenceCount: storageCoverage.indexedDB?.names?.length || 0 },
    { key: "cache-storage", coverageKey: "cacheStorage", evidenceCount: storageCoverage.cacheStorage?.caches?.length || 0 },
    { key: "service-workers", coverageKey: "serviceWorkers", evidenceCount: storageCoverage.serviceWorkers?.registrations?.length || 0 }
  ] : [];
  const storageInspectionIncomplete = storageMechanisms.some(({ coverageKey }) => storageCoverage[coverageKey]?.status === "not-inspected");
  const cnameCoverage = delta.cnameCoverage || { status: "not-observed", beforeCount: 0, afterCount: 0 };
  const inaccessibleConsentSurfaces = Array.isArray(delta.inaccessibleConsentSurfaces) ? delta.inaccessibleConsentSurfaces : [];
  const hasConsentObservation = Boolean(delta.banner && delta.banner.confidence !== "none") && inaccessibleConsentSurfaces.length === 0;
  const hasCookieCoverage = delta.cookieCoverage?.complete === true;
  return {
    auditComplete: Boolean(analysisComplete && delta.beforeCounts && delta.afterDenyCounts && inaccessibleConsentSurfaces.length === 0 && (!delta.integrity || delta.integrity.uncertain === false) && hasCookieCoverage && !storageInspectionIncomplete && cnameCoverage.status !== "unknown"),
    observed: [
      { key: "cookies", state: hasCookieObservation ? "observed" : "not-observed", confidence: hasCookieObservation ? "confirmed" : "limited", evidenceCount: delta.afterDenyCounts?.cookies || 0 },
      { key: "browser-storage", state: storageInspectionIncomplete ? "not-inspected" : hasStorageObservation ? "observed" : "not-observed", confidence: storageInspectionIncomplete ? "limited" : hasStorageObservation ? "confirmed" : "limited", evidenceCount: delta.afterDenyCounts?.storageEntries || 0 },
      { key: "network-requests", state: hasTrafficObservation ? "observed" : "not-observed", confidence: hasTrafficObservation ? "confirmed" : "limited", evidenceCount: delta.afterDenyCounts?.thirdPartyHosts || 0 },
      { key: "consent-surface", state: inaccessibleConsentSurfaces.length ? "not-technically-inspectable" : hasConsentObservation ? "observed" : "not-observed", confidence: inaccessibleConsentSurfaces.length ? "high" : hasConsentObservation ? (delta.banner.confidence || "confirmed") : "limited", evidenceCount: delta.banner?.evidence?.length || 0 },
      { key: "audit-integrity", state: delta.integrity?.uncertain === false ? "observed" : "not-observed", confidence: delta.integrity?.uncertain === false ? "confirmed" : "limited", evidenceCount: delta.integrity?.evidence?.length || 0 },
      { key: "cookie-coverage", state: delta.cookieCoverage?.complete ? "observed" : "not-observed", confidence: delta.cookieCoverage?.complete ? "confirmed" : "limited", evidenceCount: delta.cookieCoverage?.requestedHosts?.length || 0 },
      { key: "cname-routing", state: cnameCoverage.status === "unknown" ? "unknown" : "not-observed", confidence: cnameCoverage.status === "unknown" ? "limited" : "medium", evidenceCount: (cnameCoverage.beforeCount || 0) + (cnameCoverage.afterCount || 0) },
      ...storageMechanisms.map(({ key, coverageKey, evidenceCount }) => ({
        key,
        state: storageCoverage[coverageKey]?.status === "observed" ? "observed" : "not-inspected",
        confidence: storageCoverage[coverageKey]?.status === "observed" ? "confirmed" : "limited",
        evidenceCount
      }))
    ],
    limitations: COVERAGE_LIMITATIONS.map((limitation) => ({ ...limitation })),
    heuristicSignals: heuristicSignals || deriveHeuristicSignals(delta)
  };
}

/**
 * Convert the observed delta into the conservative top-level answer shown in
 * the popup. A green answer requires a verified reject action and a complete
 * set of before/after observations; a missing control or incomplete snapshot
 * is never presented as success.
 */
export function deriveAuditVerdict(delta, { analysisComplete = true } = {}) {
  const coverage = delta?.coverage || createCoverageSummary({ delta, analysisComplete });
  const evidenceLinks = [{ key: "delta-report", href: "details.html?view=delta" }];
  const missingCoverage = [];
  if (!delta?.denyAction?.clicked || !delta?.denyAction?.verified) missingCoverage.push("rejection-verification");
  if (!delta?.banner || delta.banner.confidence === "none") missingCoverage.push("consent-surface");
  if (delta?.inaccessibleConsentSurfaces?.length) missingCoverage.push("consent-surface-inaccessible");
  if (!delta?.integrity || delta.integrity.uncertain) missingCoverage.push("audit-integrity");
  if (!delta?.cookieCoverage || !delta.cookieCoverage.complete) missingCoverage.push("cookie-coverage");
  if (delta?.cnameCoverage?.status === "unknown") missingCoverage.push("cname-routing");
  const storageCoverage = delta?.browserStorage?.after;
  if (storageCoverage && ["indexedDB", "cacheStorage", "serviceWorkers"].some((key) => storageCoverage[key]?.status === "not-inspected")) missingCoverage.push("storage-coverage");
  if (!delta?.beforeCounts || !delta?.afterDenyCounts) missingCoverage.push("before-after-observation");
  if (!analysisComplete) missingCoverage.push("page-analysis");
  if (delta?.auditLifecycle?.status && delta.auditLifecycle.status !== "completed") missingCoverage.push("audit-lifecycle");

  const reasons = [];
  if (delta?.thirdPartyHosts?.length) reasons.push("third-party-traffic");
  if (delta?.remainingCookies?.length || delta?.newCookies?.length) reasons.push("non-essential-cookies");
  if (delta?.nonEssentialStorageEntries?.length) reasons.push("non-essential-storage");
  if (delta?.serviceAudit?.some((service) => service.status === "active")) reasons.push("active-service");
  const unclearServices = (delta?.serviceAudit || []).filter((service) => service.status === "unclear" || (!service.essential && service.confidence === "none" && service.status === "disabled"));
  if (unclearServices.length) reasons.push("unclear-service");
  const unresolvedSignals = [
    ...missingCoverage.map((key) => ({ key, evidence: [] })),
    ...(unclearServices.length ? [{ key: "unclear-service", evidence: unclearServices.map((service) => service.name).filter(Boolean).slice(0, 5) }] : []),
    ...(coverage.heuristicSignals || []).map((signal) => ({ key: "heuristic-signal", evidence: [signal.key, ...(signal.evidence || [])].filter(Boolean).slice(0, 5) }))
  ];
  const strongContradiction = delta.riskLevel === "high" || reasons.some((reason) => reason !== "unclear-service");

  if (missingCoverage.length) {
    return {
      status: "incomplete",
      confidence: "limited",
      reasons: missingCoverage,
      coverage: { ...coverage, complete: false, missing: missingCoverage },
      unresolvedSignals,
      evidenceLinks
    };
  }

  if (strongContradiction) {
    return {
      status: "negative",
      confidence: "evidence-backed",
      reasons,
      coverage: { ...coverage, complete: true, missing: [] },
      unresolvedSignals,
      evidenceLinks
    };
  }

  if (unresolvedSignals.length) {
    return {
      status: "review",
      confidence: "limited",
      reasons: reasons.length ? reasons : ["unclear-service"],
      coverage: { ...coverage, complete: true, missing: [] },
      unresolvedSignals,
      evidenceLinks
    };
  }

  return {
    status: "positive",
    confidence: "evidence-backed",
    reasons: ["no-contradictory-evidence"],
    coverage: { ...coverage, complete: true, missing: [] },
    unresolvedSignals,
    evidenceLinks
  };
}

/**
 * Generate a formatted delta report for auditing and email communication.
 * Returns a plain-text report that can be sent to DPO/authority.
 * @param {object} delta - The delta object from buildDelta
 * @param {string} url - The checked website URL
 * @returns {string} Plain-text formatted report
 */
export function formatDeltaReport(delta, url = "") {
  const date = new Date(delta.checkedAt).toLocaleString();
  const website = minimizeUrlEvidence(url || delta.url, { retainQueryKeys: false })?.url || "unknown";
  
  let report = "═════════════════════════════════════════\n";
  report += "       COOKIE CONSENT DELTA REPORT\n";
  report += "═════════════════════════════════════════\n\n";

  report += "DATE OF CHECK:\n";
  report += `  ${date}\n\n`;

  report += "WEBSITE CHECKED:\n";
  report += `  ${website}\n\n`;

  report += "RISK ASSESSMENT:\n";
  report += `  ${delta.riskLevel === "high" ? "⚠ HIGH RISK" : "✓ LOW RISK"}\n\n`;

  report += "SUMMARY:\n";
  report += `  ${delta.summary}\n\n`;

  report += "URL DATA MINIMIZATION:\n";
  report += "  Request, page, and contact-source URLs were minimized when captured. Query values, fragments, and URL credentials were removed; query key names may remain for local classification.\n\n";

  const coverage = delta.coverage || createCoverageSummary({ delta });
  report += "COVERAGE AND LIMITATIONS:\n";
  report += `  Browser audit complete: ${coverage.auditComplete ? "yes" : "no"}\n`;
  report += "  Observed browser evidence:\n";
  (coverage.observed || []).forEach((item) => {
    report += `    - ${item.key}: ${item.state}; confidence: ${item.confidence}; evidence count: ${item.evidenceCount}\n`;
  });
  report += "  Techniques outside reliable browser-side inspection:\n";
  (coverage.limitations || []).forEach((item) => {
    report += `    - ${item.key}: ${item.state}; confidence: ${item.confidence}\n`;
  });
  report += "  Heuristic indicators (not confirmed evidence):\n";
  if (coverage.heuristicSignals?.length) {
    coverage.heuristicSignals.forEach((signal) => {
      report += `    - ${signal.key}: ${signal.confidence}; evidence: ${(signal.evidence || []).join(", ")}\n`;
    });
  } else {
    report += "    - none recorded\n";
  }
  report += "\n";

  if (delta.cookieCoverage) {
    report += "COOKIE COVERAGE:\n";
    report += `  Requested hosts: ${(delta.cookieCoverage.requestedHosts || []).join(", ") || "none recorded"}\n`;
    report += `  Observed third-party hosts: ${(delta.cookieCoverage.thirdPartyHosts || []).join(", ") || "none recorded"}\n`;
    report += `  Unavailable hosts: ${(delta.cookieCoverage.unavailableHosts || []).join(", ") || "none"}\n`;
    report += `  Coverage complete: ${delta.cookieCoverage.complete ? "yes" : "no"}\n\n`;
  }

  if (delta.cnameCoverage?.status === "unknown") {
    report += "CNAME ROUTING COVERAGE:\n";
    report += "  Status: unknown; browser APIs do not provide a local DNS CNAME resolution result.\n";
    (delta.possibleCloakedTrackers || []).slice(0, 8).forEach((item) => {
      report += `  - Possible cloaked tracker: ${item.host || "unknown"}${item.path ? `; path: ${item.path}` : ""}${item.cnameRule?.id ? `; rule: ${item.cnameRule.id}` : ""}\n`;
    });
    report += "  These endpoints are not treated as confirmed third-party traffic, but the audit cannot produce a positive result from this unknown state.\n\n";
  }

  if (delta.inaccessibleConsentSurfaces?.length) {
    report += "INACCESSIBLE CONSENT SURFACES:\n";
    delta.inaccessibleConsentSurfaces.slice(0, 12).forEach((surface) => {
      report += `  - ${surface.domContext || "inaccessible frame"}; URL: ${surface.frameUrl || "unknown"}; origin: ${surface.frameOrigin || "unknown"}; reason: ${surface.reason || "inaccessible"}\n`;
    });
    report += "  These surfaces were not treated as absent; the audit remains incomplete.\n\n";
  }

  const integrity = delta.integrity || { status: "unknown", knownStartingState: "unknown", uncertain: true, limitations: ["integrity-not-recorded"], evidence: [], recommendation: "rerun-clean-environment" };
  report += "AUDIT INTEGRITY:\n";
  report += `  Status: ${integrity.status || "unknown"}\n`;
  report += `  Starting consent state: ${integrity.knownStartingState || "unknown"}\n`;
  report += `  Integrity uncertain: ${integrity.uncertain ? "yes" : "no"}\n`;
  if (integrity.limitations?.length) report += `  Limitations: ${integrity.limitations.join(", ")}\n`;
  if (integrity.evidence?.length) {
    integrity.evidence.slice(0, 12).forEach((item) => {
      report += `  - Evidence: ${item.type || "integrity-signal"}; ${item.scope || "unknown"}; ${item.name || item.key || item.host || item.url || "recorded"}${item.error ? `; ${item.error}` : ""}\n`;
    });
  }
  if (integrity.recommendation && integrity.recommendation !== "none") report += "  Recommendation: rerun in a clean browser environment before relying on a positive result.\n";
  report += "\n";

  if (delta.auditLifecycle) {
    report += "AUDIT LIFECYCLE:\n";
    report += `  Status: ${delta.auditLifecycle.status || "unknown"}\n`;
    if (delta.auditLifecycle.reason) report += `  Reason: ${delta.auditLifecycle.reason}\n`;
    (delta.auditLifecycle.events || []).filter((event) => event.type !== "step").forEach((event) => {
      report += `  - ${event.type}${event.kind ? ` (${event.kind})` : ""}${event.url ? `: ${event.url}` : ""}\n`;
    });
    report += "\n";
  }

  report += "═════════════════════════════════════════\n";
  report += "DENY ACTION DETAILS\n";
  report += "═════════════════════════════════════════\n\n";

  if (delta.denyAction.clicked && delta.denyAction.verified) {
    report += `✓ Deny button successfully clicked: "${delta.denyAction.label}"\n`;
  } else if (delta.denyAction.clicked) {
    report += `? Deny button clicked, but the consent change could NOT be verified: "${delta.denyAction.label}"\n`;
  } else {
    report += `✗ Deny button could NOT be clicked automatically\n`;
    if (delta.denyAction.label) {
      report += `  Expected button label: "${delta.denyAction.label}"\n`;
    }
  }
  if (delta.denyAction.verification) {
    report += `  Verification status: ${delta.denyAction.verification.status}\n`;
    (delta.denyAction.verification.evidence || []).forEach((item) => {
      report += `  - Verification evidence: ${item}\n`;
    });
  }
  report += "\n";

  report += "═════════════════════════════════════════\n";
  report += "COOKIE METRICS\n";
  report += "═════════════════════════════════════════\n\n";

  report += `BEFORE OPT-OUT:\n`;
  report += `  Total cookies: ${delta.beforeCounts.cookies}\n`;
  report += `  Third-party hosts: ${delta.beforeCounts.thirdPartyHosts}\n\n`;

  report += `AFTER DENY-ALL ATTEMPT:\n`;
  report += `  Total cookies: ${delta.afterDenyCounts.cookies}\n`;
  report += `  Third-party hosts: ${delta.afterDenyCounts.thirdPartyHosts}\n\n`;

  report += "═════════════════════════════════════════\n";
  report += "SUSPICIOUS FINDINGS\n";
  report += "═════════════════════════════════════════\n\n";

  if (delta.remainingCookies.length > 0) {
    report += `COOKIES REMAINING AFTER OPT-OUT (${delta.remainingCookies.length}):\n`;
    delta.remainingCookies.forEach((cookie) => {
      report += `  • ${cookie.name}\n`;
      report += `    Domain: ${cookie.domain}\n`;
      report += `    Service: ${cookie.service || "Unknown"}\n`;
    });
    report += "\n";
  } else {
    report += "✓ No non-essential cookies remaining after opt-out.\n\n";
  }

  if (delta.newCookies.length > 0) {
    report += `NEW COOKIES CREATED AFTER OPT-OUT (${delta.newCookies.length}):\n`;
    delta.newCookies.forEach((cookie) => {
      report += `  • ${cookie.name}\n`;
      report += `    Domain: ${cookie.domain}\n`;
      report += `    Service: ${cookie.service || "Unknown"}\n`;
    });
    report += "\n";
  } else {
    report += "✓ No new cookies created after opt-out.\n\n";
  }

  if (delta.thirdPartyHosts.length > 0) {
    report += `THIRD-PARTY TRAFFIC DETECTED AFTER OPT-OUT (${delta.thirdPartyHosts.length}):\n`;
    delta.thirdPartyHosts.forEach((host) => {
      report += `  • ${host}\n`;
    });
    report += "\n";
  } else {
    report += "✓ No third-party traffic detected after opt-out.\n\n";
  }

  report += "═════════════════════════════════════════\n";
  if (delta.serviceAudit?.length) {
    report += "BANNER SERVICE AUDIT:\n";
    delta.serviceAudit.forEach((service) => {
      const listed = service.listedInBanner ? "listed in banner" : "not listed in banner / external signal";
      const status = service.status === "allowed-essential" ? "essential / allowed" : service.status === "disabled" ? "successfully disabled" : service.status === "active" ? "still active" : "unclear";
      const rule = service.ruleVersion ? `; rule: ${service.ruleId || "local"}@${service.ruleVersion}; confidence: ${service.confidence || "none"}` : "; rule: unknown";
      report += `  - ${service.name}: ${status}; ${listed}; source: ${service.source || service.category}${rule}\n`;
    });
    report += "\n";
  }

  report += "RECOMMENDATION\n";
  report += "═════════════════════════════════════════\n\n";

  if (delta.riskLevel === "high") {
    report += "This audit found cookies or third-party traffic after the opt-out attempt.\n";
    report += "This may indicate data processing without valid user consent and should\n";
    report += "be reviewed by a Data Protection Officer or compliance team.\n\n";
    report += "Recommended actions:\n";
    report += "  1. Forward this report to the Data Protection Officer (DPO)\n";
    report += "  2. Request clarification on the legal basis for identified tracking\n";
    report += "  3. Verify consent mechanism implementation\n";
    report += "  4. Document findings for compliance records\n";
  } else {
    report += "This audit found no obvious concerns in the opt-out behavior.\n";
    report += "The cookie handling appears compliant with user choices.\n";
  }
  report += "\n";

  report += "═════════════════════════════════════════\n";
  report += "DISCLAIMER\n";
  report += "═════════════════════════════════════════\n\n";
  report += "This is an automated audit report generated by CookieBuddy.\n";
  report += "This is NOT legal advice. Please review findings with legal counsel.\n";
  report += "All findings should be manually verified by qualified personnel.\n\n";

  return report;
}
