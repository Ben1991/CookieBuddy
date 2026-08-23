// Necessity is intentionally stricter than service recognition. A service or
// cookie signature can identify what was observed without proving that it was
// necessary for the page to work after opt-out.
export const NECESSITY_RULE_VERSION = "2026-08-23";

const KNOWN_RUNTIME_STORAGE_SCOPES = new Set(["Cache Storage", "Service worker"]);
const NON_ESSENTIAL_SERVICE_CATEGORIES = new Set(["analytics", "marketing", "social"]);
const LIKELY_NECESSARY_COOKIE_NAMES = new Set([
  "asp.net_sessionid",
  "connect.sid",
  "csrftoken",
  "jsessionid",
  "phpsessid",
  "sessionid",
  "xsrf-token",
  "xsrf_token"
]);
const OPTIONAL_STORAGE_PURPOSE = /analytics|advert|marketing|tracking|pixel/i;

function result(classification, confidence, source, rationale, ruleId = "") {
  return { classification, confidence, source, rationale, ruleId, ruleVersion: NECESSITY_RULE_VERSION };
}

export function classifyNecessity({
  kind = "unknown",
  cookieName = "",
  storageKey = "",
  host = "",
  scope = "",
  inBanner = false,
  bannerCategory = "",
  serviceRule = null,
  observedPurpose = ""
} = {}) {
  if (kind === "storage" && KNOWN_RUNTIME_STORAGE_SCOPES.has(scope)) {
    return result(
      "known-necessary",
      "high",
      "explicit-storage-scope",
      "Browser runtime metadata is retained as technical evidence and is not treated as optional tracking.",
      "browser-runtime-storage"
    );
  }

  const category = String(serviceRule?.category || bannerCategory || "").toLowerCase();
  if (NON_ESSENTIAL_SERVICE_CATEGORIES.has(category)) {
    return result(
      "non-essential",
      serviceRule?.confidence || "high",
      serviceRule ? "versioned-service-rule" : "observed-banner-purpose",
      serviceRule?.evidence?.source || `The observed service is labelled ${category}, which is not necessary evidence.`,
      serviceRule?.id || ""
    );
  }

  if (observedPurpose === "consent-management" || category === "consent-management") {
    return result(
      "likely-necessary",
      serviceRule?.confidence || "medium",
      serviceRule ? "versioned-service-rule" : "observed-purpose",
      serviceRule?.evidence?.source || "The signal is associated with displaying or applying consent choices, but runtime necessity is not proven.",
      serviceRule?.id || ""
    );
  }

  if (inBanner || category === "essential") {
    return result(
      "likely-necessary",
      "medium",
      "observed-consent-banner",
      "The site consent banner labels this item essential; the banner declaration is not independent proof of necessity.",
      "banner-essential-category"
    );
  }

  if (kind === "storage" && OPTIONAL_STORAGE_PURPOSE.test(String(storageKey))) {
    return result(
      "non-essential",
      "low",
      "storage-purpose-hint",
      "The storage key contains an optional tracking-purpose marker; the key is retained as evidence for review.",
      "optional-storage-purpose"
    );
  }

  if (LIKELY_NECESSARY_COOKIE_NAMES.has(String(cookieName).toLowerCase())) {
    return result(
      "likely-necessary",
      "low",
      "cookie-name-purpose-hint",
      "The cookie name resembles a session or request-protection cookie; a name alone cannot prove necessity.",
      "common-purpose-cookie-name"
    );
  }

  if (observedPurpose === "browser-runtime") {
    return result(
      "known-necessary",
      "high",
      "explicit-runtime-purpose",
      "The observed purpose is browser runtime metadata rather than consent-dependent tracking.",
      "browser-runtime-purpose"
    );
  }

  return result(
    "unknown",
    "none",
    "no-necessity-rule",
    host
      ? `No explicit necessity rule matches ${host}; review is required and this infrastructure signal is not treated as necessary.`
      : "No explicit necessity evidence was observed; review is required and this item is not treated as necessary."
  );
}
