// Local, versioned service signatures. This file is intentionally a classic
// script so the same data can be loaded by extension modules and content scripts.
const SERVICE_RULE_VERSION = "2026-08-23";

const SERVICE_RULES = [
  {
    id: "google-tag-manager",
    name: "Google Tag Manager",
    category: "functional",
    domains: ["googletagmanager.com"],
    cookieNames: [],
    cookiePrefixes: [],
    evidenceSource: "Google Tag Manager domain signature",
    confidence: "high"
  },
  {
    id: "google-analytics",
    name: "Google Analytics",
    category: "analytics",
    domains: ["google-analytics.com"],
    cookieNames: ["_ga", "_gid", "_gat"],
    cookiePrefixes: ["_ga_", "_gat_", "_gac_"],
    evidenceSource: "Google Analytics domain or cookie signature",
    confidence: "high"
  },
  {
    id: "google-ads",
    name: "Google Ads",
    category: "marketing",
    domains: ["doubleclick.net", "googleadservices.com", "googlesyndication.com"],
    cookieNames: [],
    cookiePrefixes: ["_gcl"],
    evidenceSource: "Google advertising domain or cookie signature",
    confidence: "high"
  },
  {
    id: "meta-pixel",
    name: "Meta Pixel",
    category: "marketing",
    domains: ["facebook.com", "connect.facebook.net"],
    cookieNames: ["_fbp", "_fbc"],
    cookiePrefixes: [],
    evidenceSource: "Meta Pixel domain or cookie signature",
    confidence: "high"
  },
  {
    id: "hotjar",
    name: "Hotjar",
    category: "analytics",
    domains: ["hotjar.com", "hotjar.io"],
    cookieNames: [],
    cookiePrefixes: ["_hj"],
    evidenceSource: "Hotjar domain or cookie signature",
    confidence: "high"
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "marketing",
    domains: ["hubspot.com", "hubspot.net"],
    cookieNames: ["__hstc", "hubspotutk", "__hssc", "__hssrc"],
    cookiePrefixes: ["_hs"],
    evidenceSource: "HubSpot domain or cookie signature",
    confidence: "high"
  },
  {
    id: "linkedin-insight",
    name: "LinkedIn Insight",
    category: "marketing",
    domains: ["linkedin.com", "licdn.com"],
    cookieNames: ["li_gc", "bcookie", "lidc", "UserMatchHistory"],
    cookiePrefixes: [],
    evidenceSource: "LinkedIn Insight domain or cookie signature",
    confidence: "high"
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "social",
    domains: ["youtube.com", "youtube-nocookie.com", "ytimg.com"],
    cookieNames: ["PREF", "VISITOR_INFO1_LIVE", "YSC"],
    cookiePrefixes: [],
    evidenceSource: "YouTube embed domain or cookie signature",
    confidence: "high"
  },
  {
    id: "vimeo",
    name: "Vimeo",
    category: "social",
    domains: ["vimeo.com", "player.vimeo.com"],
    cookieNames: ["vuid"],
    cookiePrefixes: [],
    evidenceSource: "Vimeo embed domain or cookie signature",
    confidence: "high"
  },
  {
    id: "tiktok-pixel",
    name: "TikTok Pixel",
    category: "marketing",
    domains: ["tiktok.com", "tiktokcdn.com"],
    cookieNames: [],
    cookiePrefixes: ["_ttp"],
    evidenceSource: "TikTok Pixel domain or cookie signature",
    confidence: "high"
  },
  {
    id: "microsoft-clarity",
    name: "Microsoft Clarity",
    category: "analytics",
    domains: ["clarity.ms"],
    cookieNames: ["_clck", "_clsk"],
    cookiePrefixes: [],
    evidenceSource: "Microsoft Clarity domain or cookie signature",
    confidence: "high"
  },
  {
    id: "adobe-analytics",
    name: "Adobe Analytics",
    category: "analytics",
    domains: ["omtrdc.net", "2o7.net"],
    cookieNames: [],
    cookiePrefixes: ["s_"],
    evidenceSource: "Adobe Analytics domain or cookie signature",
    confidence: "medium"
  },
  {
    id: "segment",
    name: "Segment",
    category: "analytics",
    domains: ["segment.io", "segment.com"],
    cookieNames: [],
    cookiePrefixes: ["ajs_"],
    evidenceSource: "Segment domain or cookie signature",
    confidence: "high"
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    category: "analytics",
    domains: ["mixpanel.com"],
    cookieNames: [],
    cookiePrefixes: ["mp_"],
    evidenceSource: "Mixpanel domain or cookie signature",
    confidence: "high"
  },
  {
    id: "pinterest-tag",
    name: "Pinterest Tag",
    category: "marketing",
    domains: ["pinterest.com", "pinimg.com"],
    cookieNames: [],
    cookiePrefixes: ["_pin_"],
    evidenceSource: "Pinterest Tag domain or cookie signature",
    confidence: "high"
  },
  {
    id: "reddit-pixel",
    name: "Reddit Pixel",
    category: "marketing",
    domains: ["reddit.com", "redditmedia.com"],
    cookieNames: ["reddit_conversion_pixel"],
    cookiePrefixes: [],
    evidenceSource: "Reddit Pixel domain or cookie signature",
    confidence: "high"
  },
  {
    id: "criteo",
    name: "Criteo",
    category: "marketing",
    domains: ["criteo.com", "criteo.net"],
    cookieNames: ["cto_lwid", "cto_bundle"],
    cookiePrefixes: [],
    evidenceSource: "Criteo domain or cookie signature",
    confidence: "high"
  },
  {
    id: "taboola",
    name: "Taboola",
    category: "marketing",
    domains: ["taboola.com"],
    cookieNames: ["taboola_vmp"],
    cookiePrefixes: [],
    evidenceSource: "Taboola domain or cookie signature",
    confidence: "high"
  },
  {
    id: "outbrain",
    name: "Outbrain",
    category: "marketing",
    domains: ["outbrain.com"],
    cookieNames: ["obuid"],
    cookiePrefixes: [],
    evidenceSource: "Outbrain domain or cookie signature",
    confidence: "high"
  }
];

function normalizeHost(value) {
  return String(value || "").toLowerCase().replace(/^\.+/, "").replace(/\.$/, "");
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function hostMatches(host, domain) {
  const normalizedHost = normalizeHost(host);
  const normalizedDomain = normalizeHost(domain);
  return Boolean(normalizedHost && normalizedDomain && (normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`)));
}

function cookieMatches(cookieName, rule) {
  const normalizedName = String(cookieName || "").toLowerCase();
  return rule.cookieNames.some((name) => normalizedName === name.toLowerCase())
    || rule.cookiePrefixes.some((prefix) => normalizedName.startsWith(prefix.toLowerCase()));
}

function matchService(input = {}) {
  const rawValue = String(input.value || input.url || "");
  const host = normalizeHost(input.host || input.cookieDomain || hostFromUrl(input.url) || hostFromUrl(rawValue));
  const cookieName = String(input.cookieName || "");
  const rule = SERVICE_RULES.find((candidate) => {
    const domainMatch = candidate.domains.some((domain) => hostMatches(host, domain));
    const cookieMatch = cookieMatches(cookieName, candidate);
    return domainMatch || cookieMatch;
  });
  if (!rule) return null;

  const matchedBy = rule.cookieNames.some((name) => cookieName.toLowerCase() === name.toLowerCase())
    || rule.cookiePrefixes.some((prefix) => cookieName.toLowerCase().startsWith(prefix.toLowerCase()))
    ? "cookie-name"
    : "domain";
  return {
    ...rule,
    ruleVersion: SERVICE_RULE_VERSION,
    evidence: {
      source: rule.evidenceSource,
      version: SERVICE_RULE_VERSION,
      matchedBy
    }
  };
}

function validateServiceRules(rules = SERVICE_RULES) {
  const errors = [];
  const ids = new Map();
  const names = new Map();
  const signatures = new Map();
  for (const rule of rules) {
    if (ids.has(rule.id)) errors.push(`duplicate rule id: ${rule.id}`);
    ids.set(rule.id, rule.name);
    if (names.has(rule.name)) errors.push(`duplicate rule name: ${rule.name}`);
    names.set(rule.name, rule.id);
    for (const signature of [...rule.domains.map((value) => `domain:${value}`), ...rule.cookieNames.map((value) => `cookie:${value}`), ...rule.cookiePrefixes.map((value) => `prefix:${value}`)]) {
      const previous = signatures.get(signature);
      if (previous && previous !== rule.id) errors.push(`conflicting signature ${signature}: ${previous}/${rule.id}`);
      signatures.set(signature, rule.id);
    }
    if (!rule.name || !rule.category || !rule.evidenceSource || !rule.confidence) errors.push(`incomplete rule: ${rule.id}`);
  }
  return { valid: errors.length === 0, errors };
}

globalThis.CookieBuddyServiceRules = Object.freeze({
  version: SERVICE_RULE_VERSION,
  rules: Object.freeze(SERVICE_RULES.map((rule) => Object.freeze({
    ...rule,
    domains: Object.freeze([...rule.domains]),
    cookieNames: Object.freeze([...rule.cookieNames]),
    cookiePrefixes: Object.freeze([...rule.cookiePrefixes])
  }))),
  match: matchService,
  validate: validateServiceRules
});
