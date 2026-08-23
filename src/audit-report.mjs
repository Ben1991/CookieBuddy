import { minimizeUrlEvidence } from "./url-evidence.mjs";

export const AUDIT_REPORT_VERSION = 1;

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

export function stableReportStringify(value) {
  return JSON.stringify(sortObject(value));
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle || typeof globalThis.TextEncoder !== "function") {
    throw new Error("Web Crypto is unavailable; report integrity cannot be calculated");
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function browserMetadata(browser = null) {
  if (browser) return browser;
  const navigatorObject = globalThis.navigator || {};
  return {
    userAgent: String(navigatorObject.userAgent || "unknown").slice(0, 240),
    platform: String(navigatorObject.userAgentData?.platform || navigatorObject.platform || "unknown").slice(0, 80),
    language: String(navigatorObject.language || "unknown").slice(0, 32),
    brands: Array.isArray(navigatorObject.userAgentData?.brands)
      ? navigatorObject.userAgentData.brands.slice(0, 8).map((brand) => ({ name: String(brand.name || "").slice(0, 80), version: String(brand.version || "").slice(0, 32) }))
      : []
  };
}

function extensionMetadata(manifest = null) {
  return {
    name: String(manifest?.name || "CookieBuddy").slice(0, 100),
    version: String(manifest?.version || "unknown").slice(0, 40)
  };
}

function safeHostname(url) {
  return minimizeUrlEvidence(url, { retainQueryKeys: false })?.host || "";
}

function sanitizeBanner(banner) {
  if (!banner) return null;
  return {
    name: String(banner.name || "").slice(0, 160),
    confidence: String(banner.confidence || "none").slice(0, 32),
    evidence: (banner.evidence || []).slice(0, 20).map((item) => ({
      type: String(item.type || "signal").slice(0, 60),
      source: String(item.source || "").slice(0, 120),
      value: String(item.value || "").slice(0, 240)
    }))
  };
}

function findingEvidence(delta) {
  const findings = [];
  if (delta.thirdPartyHosts?.length) findings.push({
    key: "third-party-traffic",
    severity: "high",
    evidence: delta.thirdPartyHosts.slice(0, 20).map((host) => ({ section: "network.after", host }))
  });
  if (delta.remainingCookies?.length || delta.newCookies?.length) findings.push({
    key: "non-essential-cookies",
    severity: "high",
    evidence: [...(delta.remainingCookies || []), ...(delta.newCookies || [])].slice(0, 20).map((cookie) => ({ section: "cookies.after", name: cookie.name, domain: cookie.domain, path: cookie.path }))
  });
  if (delta.nonEssentialStorageEntries?.length) findings.push({
    key: "non-essential-storage",
    severity: "high",
    evidence: delta.nonEssentialStorageEntries.slice(0, 20).map((entry) => ({ section: "storage.after", scope: entry.scope, key: entry.key }))
  });
  const activeServices = (delta.serviceAudit || []).filter((service) => service.status === "active");
  if (activeServices.length) findings.push({
    key: "active-service",
    severity: "high",
    evidence: activeServices.slice(0, 20).map((service) => ({ section: "services", name: service.name, source: service.source || service.category }))
  });
  if (delta.possibleCloakedTrackers?.length) findings.push({
    key: "possible-cloaked-tracker",
    severity: "unknown",
    evidence: delta.possibleCloakedTrackers.slice(0, 20).map((item) => ({ section: "network.after", host: item.host, path: item.path, rule: item.cnameRule?.id || "local-heuristic" }))
  });
  return findings;
}

export function buildAuditReportPayload({ delta = {}, manifest = null, browser = null } = {}) {
  const checkedUrl = minimizeUrlEvidence(delta.url || "", { retainQueryKeys: false })?.url || "";
  return {
    reportVersion: AUDIT_REPORT_VERSION,
    audit: {
      checkedUrl,
      hostname: safeHostname(checkedUrl),
      checkedAt: delta.checkedAt || "",
      extension: extensionMetadata(manifest),
      browser: browserMetadata(browser)
    },
    consent: {
      banner: sanitizeBanner(delta.banner),
      action: delta.denyAction || null,
      stateBeforeAfter: delta.consentEvidence || { before: null, after: null }
    },
    timeline: {
      auditSteps: (delta.auditTimeline || []).slice(0, 60),
      lifecycle: delta.auditLifecycle || null
    },
    evidence: {
      cookies: delta.cookieEvidence || { before: [], after: [] },
      storage: delta.storageEvidence || { before: [], after: [] },
      network: delta.networkEvidence || { before: [], after: [] },
      serviceMappings: (delta.serviceAudit || []).slice(0, 40),
      coverage: delta.coverage || null,
      integrity: delta.integrity || null
    },
    interpretation: {
      summary: delta.summary || "",
      riskLevel: delta.riskLevel || "unknown",
      verdict: delta.verdict ? {
        status: delta.verdict.status,
        confidence: delta.verdict.confidence,
        reasons: delta.verdict.reasons || [],
        unresolvedSignals: delta.verdict.unresolvedSignals || [],
        evidenceLinks: delta.verdict.evidenceLinks || []
      } : null,
      findings: findingEvidence(delta)
    },
    limitations: {
      coverage: delta.coverage?.limitations || [],
      inaccessibleConsentSurfaces: delta.inaccessibleConsentSurfaces || [],
      cookieCoverage: delta.cookieCoverage || null,
      cnameCoverage: delta.cnameCoverage || null
    }
  };
}

export async function createAuditReport({ delta = {}, manifest = null, browser = null } = {}) {
  const payload = buildAuditReportPayload({ delta, manifest, browser });
  const payloadHash = await sha256(stableReportStringify(payload));
  return {
    reportVersion: AUDIT_REPORT_VERSION,
    payload,
    integrity: { algorithm: "SHA-256", payloadHash }
  };
}

export async function verifyAuditReport(report) {
  if (!report?.payload || report.integrity?.algorithm !== "SHA-256" || !/^[a-f0-9]{64}$/.test(report.integrity.payloadHash || "")) return false;
  return (await sha256(stableReportStringify(report.payload))) === report.integrity.payloadHash;
}
