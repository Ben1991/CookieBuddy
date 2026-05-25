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
