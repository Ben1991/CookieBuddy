(() => {
  const RULE_VERSION = "2026-08-23";

  // This is deliberately an offline, reviewable subset of the public suffix
  // list covering common multi-label registries and delegated hosting zones.
  // The rule data is kept local because CookieBuddy never performs DNS lookups.
  const PUBLIC_SUFFIXES = new Set([
    "ac.uk", "asn.au", "co.il", "co.in", "co.id", "co.jp", "co.ke", "co.kr", "co.nz", "co.th", "co.uk", "co.za",
    "com.ar", "com.au", "com.br", "com.cn", "com.hk", "com.mx", "com.my", "com.ph", "com.pl", "com.ru", "com.sg", "com.tr", "com.tw", "com.ua",
    "edu.au", "edu.cn", "firm.in", "gen.in", "go.jp", "gov.au", "gov.uk", "id.au", "ind.in", "lg.jp", "me.uk", "ne.jp", "net.au", "net.cn", "net.in", "net.nz", "net.uk", "net.za",
    "or.jp", "org.au", "org.cn", "org.in", "org.nz", "org.uk", "org.za", "asn.au",
    "appspot.com", "blogspot.com", "github.io", "pages.dev", "vercel.app", "netlify.app"
  ]);

  const POSSIBLE_CNAME_RULES = [
    { id: "analytics-host-label", pattern: /^(analytics|metrics|measurement)$/i, path: /\/(analytics|collect|events?|metrics?|measure)(?:\/|$)/i },
    { id: "tracking-host-label", pattern: /^(track|tracking|pixel|beacon|conversion|telemetry)$/i, path: /\/(track|pixel|beacon|conversion|telemetry|collect)(?:\/|$)/i },
    { id: "tag-host-label", pattern: /^(tag|tags|stats|insights)$/i, path: /\/(tag|collect|events?|stats|insights)(?:\/|$)/i }
  ];

  function normalizeHostname(value) {
    const candidate = String(value || "").trim().replace(/^\.+/, "").replace(/\.+$/, "").toLowerCase();
    if (!candidate) return "";
    try {
      return new URL(`http://${candidate}`).hostname.toLowerCase().replace(/\.$/, "");
    } catch {
      return candidate;
    }
  }

  function isIpAddress(hostname) {
    const host = normalizeHostname(hostname);
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      return host.split(".").every((part) => Number(part) <= 255);
    }
    return host.includes(":") && /^[0-9a-f:]+$/i.test(host);
  }

  function registrableDomain(hostname) {
    const host = normalizeHostname(hostname);
    if (!host || host === "localhost" || isIpAddress(host)) return host;
    const labels = host.split(".").filter(Boolean);
    if (labels.length <= 2) return host;
    const suffix = labels.slice(-2).join(".");
    return PUBLIC_SUFFIXES.has(suffix) ? labels.slice(-3).join(".") : labels.slice(-2).join(".");
  }

  function possibleCnameRule(hostname, path = "") {
    const host = normalizeHostname(hostname);
    const labels = host.split(".");
    const suffix = labels.slice(-2).join(".");
    const registrableLabelCount = PUBLIC_SUFFIXES.has(suffix) ? 3 : 2;
    const label = labels.length > registrableLabelCount ? labels.at(-registrableLabelCount - 1) : labels[0];
    const rule = POSSIBLE_CNAME_RULES.find((candidate) => candidate.pattern.test(label) && candidate.path.test(path || "/"));
    return rule ? { id: rule.id, version: RULE_VERSION, matchedBy: "host-label-and-path" } : null;
  }

  function classifyEndpointRelationship({ host = "", pageHost = "", path = "" } = {}) {
    const normalizedHost = normalizeHostname(host);
    const normalizedPageHost = normalizeHostname(pageHost);
    if (!normalizedHost || !normalizedPageHost || normalizedHost.startsWith("chrome-extension") || normalizedHost.startsWith("moz-extension")) {
      return { relationship: "unknown", host: normalizedHost, pageHost: normalizedPageHost, cnameStatus: "unknown", cnameRule: null };
    }

    const hostDomain = registrableDomain(normalizedHost);
    const pageDomain = registrableDomain(normalizedPageHost);
    if (!hostDomain || !pageDomain) {
      return { relationship: "unknown", host: normalizedHost, pageHost: normalizedPageHost, cnameStatus: "unknown", cnameRule: null };
    }

    if (hostDomain !== pageDomain) {
      return { relationship: "third-party", host: normalizedHost, pageHost: normalizedPageHost, cnameStatus: "not-applicable", cnameRule: null };
    }

    const cnameRule = possibleCnameRule(normalizedHost, path);
    if (cnameRule) {
      return { relationship: "possible-cloaked-tracker", host: normalizedHost, pageHost: normalizedPageHost, cnameStatus: "unknown", cnameRule };
    }

    return {
      relationship: normalizedHost === normalizedPageHost ? "same-site" : "first-party-subdomain",
      host: normalizedHost,
      pageHost: normalizedPageHost,
      cnameStatus: "not-observed",
      cnameRule: null
    };
  }

  globalThis.CookieBuddyDomainRules = Object.freeze({
    ruleVersion: RULE_VERSION,
    normalizeHostname,
    registrableDomain,
    possibleCnameRule,
    classifyEndpointRelationship
  });
})();
