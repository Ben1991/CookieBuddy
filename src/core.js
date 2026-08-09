export function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getBaseDomain(hostname) {
  const parts = hostname.split(".").filter(Boolean);
  return parts.slice(-2).join(".");
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
  const value = `${cookie.name} ${cookie.domain}`.toLowerCase();
  const match = [
    ["Google Analytics", ["_ga", "_gid"]],
    ["Google Ads", ["_gcl", "doubleclick"]],
    ["Meta Pixel", ["_fbp", "facebook"]],
    ["Hotjar", ["_hj"]],
    ["HubSpot", ["hubspot", "__hstc"]]
  ].find(([, patterns]) => patterns.some((pattern) => value.includes(pattern)));
  return match?.[0] || unknownServiceLabel;
}

export function formatCookie(cookie, unknownServiceLabel = "Unknown service") {
  return {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    service: serviceForCookie(cookie, unknownServiceLabel)
  };
}

export function normalizeTraffic(traffic, firstPartyHost) {
  const firstPartyBase = getBaseDomain(firstPartyHost);
  return traffic
    .map((item) => {
      try {
        const url = new URL(item.url);
        return {
          host: url.hostname || url.protocol,
          url: url.href,
          protocol: url.protocol,
          type: item.type,
          thirdParty: getBaseDomain(url.hostname) !== firstPartyBase
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((item) => item.thirdParty);
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
      .map((item) => ({
        name: /^(chrome-extension|moz-extension):/i.test(item.protocol || item.url || "") ? `Browser extension ${item.host || "unknown"}` : item.host,
        category: "unlisted",
        source: /^(chrome-extension|moz-extension):/i.test(item.protocol || item.url || "") ? "Browser extension traffic" : "Third-party traffic",
        listedInBanner: false,
        essential: false,
        observedBefore: false,
        observedAfter: true,
        status: "unclear"
      }))),
    ...afterCookies
      .map((cookie) => ({ ...cookie, service: cookie.service || serviceForCookie(cookie) }))
      .filter((cookie) => !isEssentialCookie(cookie) && !knownNames.has(cookie.service.toLowerCase()))
      .map((cookie) => ({ name: cookie.service, category: "unlisted", source: `Cookie: ${cookie.name}`, listedInBanner: false, essential: false, observedBefore: false, observedAfter: true, status: "unclear" })),
    ...afterStorageEntries
      .filter((entry) => !isEssentialStorageEntry(entry) && !entry.inBanner)
      .map((entry) => ({ name: entry.key, category: "unlisted", source: entry.scope || "Browser storage", listedInBanner: false, essential: false, observedBefore: false, observedAfter: true, status: "unclear" }))
  ];

  return [...audit, ...dedupeServices(unlisted)];
}

export function isEssentialStorageEntry(entry = {}) {
  return Boolean(entry.inBanner) || /consent|session|csrf|xsrf|auth|necessary|essential|privacy|security|required/i.test(entry.key || "");
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
  banner = null,
  bannerCategories = {},
  denyClicked,
  denyLabel,
  manualConsentConfirmed,
  labels,
  tabUrl
}) {
  const beforeCookieKeys = new Set(beforeCookies.map(cookieKey));
  const remainingCookies = afterCookies.filter((cookie) => beforeCookieKeys.has(cookieKey(cookie)) && !isEssentialCookie(cookie));
  const newCookies = afterCookies.filter((cookie) => !beforeCookieKeys.has(cookieKey(cookie)) && !isEssentialCookie(cookie));
  const essentialCookies = afterCookies.filter((cookie) => isEssentialCookie(cookie));
  const allThirdPartyHosts = Array.from(new Set(afterTraffic.map((item) => item.host))).sort();
  const thirdPartyHosts = allThirdPartyHosts.filter((host) => !isEssentialHost(host));
  const essentialThirdPartyHosts = allThirdPartyHosts.filter((host) => isEssentialHost(host));
  const remainingStorageEntries = afterStorageEntries.filter(Boolean);
  const nonEssentialStorageEntries = remainingStorageEntries.filter((entry) => !isEssentialStorageEntry(entry));
  const essentialStorageEntries = remainingStorageEntries.filter(isEssentialStorageEntry);
  const serviceAudit = buildServiceAudit({ bannerCategories, beforeCookies, afterCookies, beforeTraffic, afterTraffic, afterStorageEntries: remainingStorageEntries });
  const suspiciousCookies = remainingCookies.filter((cookie) => !isEssentialCookie(cookie));
  const hasDelta = suspiciousCookies.length > 0 || newCookies.length > 0 || thirdPartyHosts.length > 0 || nonEssentialStorageEntries.length > 0 || serviceAudit.some((service) => service.status === "active") || (!denyClicked && !manualConsentConfirmed);

  return {
    checkedAt: new Date().toISOString(),
    url: tabUrl,
    denyAction: {
      clicked: Boolean(denyClicked),
      label: denyLabel || "",
      manual: Boolean(manualConsentConfirmed && !denyClicked)
    },
    riskLevel: hasDelta ? "high" : "low",
    summary: hasDelta ? labels.deltaFoundSummary : labels.noDeltaSummary,
    remainingCookies: suspiciousCookies,
    newCookies,
    thirdPartyHosts,
    essentialCookies,
    essentialThirdPartyHosts,
    banner,
    afterStorageEntries: remainingStorageEntries,
    remainingStorageEntries,
    nonEssentialStorageEntries,
    essentialStorageEntries,
    serviceAudit,
    beforeCounts: {
      cookies: beforeCookies.length,
      thirdPartyHosts: Array.from(new Set(beforeTraffic.map((item) => item.host))).length
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

/**
 * Generate a formatted delta report for auditing and email communication.
 * Returns a plain-text report that can be sent to DPO/authority.
 * @param {object} delta - The delta object from buildDelta
 * @param {string} url - The checked website URL
 * @returns {string} Plain-text formatted report
 */
export function formatDeltaReport(delta, url = "") {
  const date = new Date(delta.checkedAt).toLocaleString();
  const website = url || delta.url || "unknown";
  
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

  report += "═════════════════════════════════════════\n";
  report += "DENY ACTION DETAILS\n";
  report += "═════════════════════════════════════════\n\n";

  if (delta.denyAction.clicked) {
    report += `✓ Deny button successfully clicked: "${delta.denyAction.label}"\n`;
  } else {
    report += `✗ Deny button could NOT be clicked automatically\n`;
    if (delta.denyAction.label) {
      report += `  Expected button label: "${delta.denyAction.label}"\n`;
    }
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
      report += `  - ${service.name}: ${status}; ${listed}; source: ${service.source || service.category}\n`;
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
