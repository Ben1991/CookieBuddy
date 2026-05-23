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
  return /session|csrf|xsrf|auth|consent|cookie|privacy|necessary/i.test(cookie.name);
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
          host: url.hostname,
          url: url.href,
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

export function buildDelta({ beforeCookies, afterCookies, beforeTraffic, afterTraffic, denyClicked, denyLabel, labels, tabUrl }) {
  const beforeCookieKeys = new Set(beforeCookies.map(cookieKey));
  const remainingCookies = afterCookies.filter((cookie) => beforeCookieKeys.has(cookieKey(cookie)) || !isEssentialCookie(cookie));
  const newCookies = afterCookies.filter((cookie) => !beforeCookieKeys.has(cookieKey(cookie)));
  const thirdPartyHosts = Array.from(new Set(afterTraffic.map((item) => item.host))).sort();
  const suspiciousCookies = remainingCookies.filter((cookie) => !isEssentialCookie(cookie));
  const hasDelta = suspiciousCookies.length > 0 || newCookies.length > 0 || thirdPartyHosts.length > 0 || !denyClicked;

  return {
    checkedAt: new Date().toISOString(),
    url: tabUrl,
    denyAction: {
      clicked: Boolean(denyClicked),
      label: denyLabel || ""
    },
    riskLevel: hasDelta ? "high" : "low",
    summary: hasDelta ? labels.deltaFoundSummary : labels.noDeltaSummary,
    remainingCookies: suspiciousCookies,
    newCookies,
    thirdPartyHosts,
    beforeCounts: {
      cookies: beforeCookies.length,
      thirdPartyHosts: Array.from(new Set(beforeTraffic.map((item) => item.host))).length
    },
    afterDenyCounts: {
      cookies: afterCookies.length,
      thirdPartyHosts: thirdPartyHosts.length
    }
  };
}
