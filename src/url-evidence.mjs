const MAX_QUERY_KEYS = 20;
const MAX_QUERY_KEY_LENGTH = 80;

export function minimizeUrlEvidence(rawUrl = "", { retainQueryKeys = true } = {}) {
  try {
    const url = new URL(rawUrl);
    const queryKeys = [...new Set([...url.searchParams.keys()]
      .map((key) => key.trim().slice(0, MAX_QUERY_KEY_LENGTH))
      .filter(Boolean))]
      .slice(0, MAX_QUERY_KEYS);

    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";

    return {
      url: url.href,
      protocol: url.protocol,
      host: url.hostname,
      path: url.pathname || "/",
      queryKeys: retainQueryKeys ? queryKeys : []
    };
  } catch {
    return null;
  }
}

export function sanitizeEvidenceUrl(rawUrl = "") {
  return minimizeUrlEvidence(rawUrl, { retainQueryKeys: false })?.url || "";
}
