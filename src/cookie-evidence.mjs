import "./domain-rules.js";

export function getObservedCookieHosts(pageUrl, traffic = [], resources = []) {
  const hosts = new Set();
  try {
    const pageHost = new URL(pageUrl).hostname.toLowerCase();
    if (pageHost) {
      hosts.add(pageHost);
      const baseHost = registrableDomain(pageHost);
      if (baseHost && baseHost !== pageHost) hosts.add(baseHost);
    }
  } catch {}

  for (const item of [...traffic, ...resources]) {
    const host = String(item?.host || hostFromUrl(item?.url) || "").toLowerCase().replace(/^\.+/, "");
    if (!host || host === "localhost" || host.startsWith("chrome-extension") || host.startsWith("moz-extension")) continue;
    hosts.add(host);
  }
  return [...hosts].sort();
}

export function createCookieCoverage({ pageHost = "", requestedHosts = [], unavailableHosts = [] } = {}) {
  const normalizedPageHost = String(pageHost || "").toLowerCase();
  const uniqueRequested = [...new Set(requestedHosts.map(normalizeHost).filter(Boolean))].sort();
  const uniqueUnavailable = [...new Set(unavailableHosts.map(normalizeHost).filter(Boolean))].sort();
  const thirdPartyHosts = uniqueRequested.filter((host) => isThirdPartyHost(host, normalizedPageHost));
  return {
    pageHost: normalizedPageHost,
    complete: uniqueUnavailable.length === 0,
    requestedHosts: uniqueRequested,
    thirdPartyHosts,
    unavailableHosts: uniqueUnavailable
  };
}

export function mergeCookieCoverage(before, after) {
  if (!before && !after) return null;
  const merged = createCookieCoverage({
    pageHost: before?.pageHost || after?.pageHost || "",
    requestedHosts: [...(before?.requestedHosts || []), ...(after?.requestedHosts || [])],
    unavailableHosts: [...(before?.unavailableHosts || []), ...(after?.unavailableHosts || [])]
  });
  return {
    ...merged,
    thirdPartyHosts: [...new Set([...(before?.thirdPartyHosts || []), ...(after?.thirdPartyHosts || []), ...merged.thirdPartyHosts])].sort(),
    complete: Boolean(before?.complete && after?.complete && merged.unavailableHosts.length === 0)
  };
}

export function isThirdPartyHost(host, pageHost) {
  const normalizedHost = normalizeHost(host);
  const normalizedPageHost = normalizeHost(pageHost);
  if (!normalizedHost || !normalizedPageHost) return false;
  return globalThis.CookieBuddyDomainRules?.classifyEndpointRelationship({ host: normalizedHost, pageHost: normalizedPageHost }).relationship === "third-party";
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function normalizeHost(value) {
  return String(value || "").toLowerCase().replace(/^\.+/, "").replace(/\.$/, "");
}

function registrableDomain(host) {
  return globalThis.CookieBuddyDomainRules?.registrableDomain(host) || "";
}
