import { minimizeUrlEvidence } from "./url-evidence.mjs";

const CONSENT_MARKER = /consent|cookie|privacy|optanon|onetrust|cookiebot|usercentrics|didomi|quantcast|iab|tcstring|gdpr|cmp/i;
const OPT_OUT_MARKER = /reject|rejected|deny|denied|decline|declined|opt[_.-]?out|do[_.-]?not[_.-]?sell|necessary|essential|refuse|refused/i;
const OPT_OUT_VALUE = /reject|den(y|ied)|declin|opt[_. -]?out|necessary|essential|refus|false/i;
const BLOCKED_REQUEST_ERROR = /ERR_BLOCKED_BY_CLIENT|ERR_BLOCKED_BY_ADMINISTRATOR|ERR_BLOCKED_BY_RESPONSE|BLOCKED_BY_CLIENT|BLOCKED_BY_ADMINISTRATOR|ACCESS_DENIED/i;

export function isBlockedRequestError(error = "") {
  return BLOCKED_REQUEST_ERROR.test(String(error));
}

export function assessAuditIntegrity({
  beforeCookies = [],
  beforeStorageEntries = [],
  beforeAnalysis = null,
  blockedRequests = []
} = {}) {
  const evidence = [];
  const consentMarkers = [];
  const optOutMarkers = [];

  for (const cookie of beforeCookies) {
    const name = String(cookie?.name || "").slice(0, 100);
    if (!CONSENT_MARKER.test(name)) continue;
    const marker = { type: "prior-consent-marker", scope: "cookie", name };
    consentMarkers.push(marker);
    if (OPT_OUT_MARKER.test(name)) optOutMarkers.push({ ...marker, type: "prior-opt-out-marker" });
  }

  const storageItems = [
    ...(beforeStorageEntries || []),
    ...(beforeAnalysis?.storage?.items || [])
  ];
  const seenStorage = new Set();
  for (const entry of storageItems) {
    const key = String(entry?.key || "").slice(0, 100);
    const scope = String(entry?.scope || "browser-storage");
    const dedupeKey = `${scope}:${key}`;
    if (!key || seenStorage.has(dedupeKey) || !CONSENT_MARKER.test(key)) continue;
    seenStorage.add(dedupeKey);
    const marker = { type: "prior-consent-marker", scope, key };
    consentMarkers.push(marker);
    if (OPT_OUT_MARKER.test(key) || OPT_OUT_VALUE.test(String(entry?.valuePreview || ""))) {
      optOutMarkers.push({ ...marker, type: "prior-opt-out-marker" });
    }
  }

  evidence.push(...optOutMarkers, ...consentMarkers.filter((marker) => !optOutMarkers.some((item) => item.scope === marker.scope && (item.name || item.key) === (marker.name || marker.key))));

  const blocked = (blockedRequests || [])
    .filter((request) => isBlockedRequestError(request?.error || request?.reason || ""))
    .map((request) => {
      const minimized = minimizeUrlEvidence(request.url);
      return {
        type: "blocked-tracker-request",
        scope: "network",
        url: minimized?.url || "",
        host: minimized?.host || "",
        path: minimized?.path || "",
        requestType: String(request.type || "unknown").slice(0, 40),
        error: String(request.error || request.reason || "blocked").slice(0, 100)
      };
    })
    .filter((item) => item.url || item.host)
    .filter((item, index, list) => list.findIndex((candidate) => candidate.url === item.url && candidate.error === item.error) === index)
    .slice(0, 12);
  evidence.push(...blocked);

  const hasPriorOptOut = optOutMarkers.length > 0;
  const hasPriorConsent = consentMarkers.length > 0;
  const hasBlockedRequests = blocked.length > 0;
  const bannerDetected = Boolean(beforeAnalysis?.banner && beforeAnalysis.banner.confidence !== "none");
  const status = hasPriorOptOut || hasPriorConsent ? "contaminated" : hasBlockedRequests || !bannerDetected ? "unknown" : "clean";
  const limitations = [];
  if (hasPriorOptOut) limitations.push("prior-opt-out");
  else if (hasPriorConsent) limitations.push("prior-consent");
  if (hasBlockedRequests) limitations.push("blocked-tracker-request");
  if (!bannerDetected) limitations.push("starting-consent-state-unknown");

  return {
    status,
    uncertain: status !== "clean",
    knownStartingState: hasPriorOptOut ? "prior-opt-out" : hasPriorConsent ? "prior-consent" : status === "clean" ? "clean" : "unknown",
    evidence: evidence.slice(0, 24),
    limitations,
    recommendation: status === "clean" ? "none" : "rerun-clean-environment"
  };
}
