(() => {
  const MAX_SURFACES = 24;
  const MAX_NODES_PER_SURFACE = 4_000;

  function sanitizeUrl(value, baseUrl = "") {
    try {
      const parsed = new URL(value || baseUrl, baseUrl || undefined);
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      return parsed.href;
    } catch {
      return "";
    }
  }

  function originOf(value, baseUrl = "") {
    try {
      return new URL(value || baseUrl, baseUrl || undefined).origin;
    } catch {
      return "";
    }
  }

  function describeContext({ rootType, frameUrl, frameOrigin, framePath = [], shadowHost = "", accessible = true, reason = "" }) {
    const context = {
      rootType,
      domContext: rootType === "document"
        ? "top-document"
        : rootType === "iframe"
          ? "same-origin-frame"
          : rootType === "shadow-root"
            ? "open-shadow-root"
            : "inaccessible-cross-origin-frame",
      frameUrl: sanitizeUrl(frameUrl),
      frameOrigin: frameOrigin || originOf(frameUrl),
      framePath: framePath.slice(0, 8),
      accessible: Boolean(accessible)
    };
    if (shadowHost) context.shadowHost = String(shadowHost).slice(0, 80);
    if (reason) context.reason = String(reason).slice(0, 120);
    return context;
  }

  function collect(documentRef = globalThis.document, locationRef = globalThis.location) {
    const surfaces = [];
    const visitedRoots = new Set();
    const inaccessibleKeys = new Set();
    const pageUrl = sanitizeUrl(locationRef?.href || "");
    const pageOrigin = locationRef?.origin || originOf(pageUrl);

    const addInaccessible = (context) => {
      const key = `${context.frameUrl}|${context.framePath.join(".")}`;
      if (inaccessibleKeys.has(key) || surfaces.length >= MAX_SURFACES) return;
      inaccessibleKeys.add(key);
      surfaces.push({ root: null, context });
    };

    const visit = (root, context) => {
      if (!root || visitedRoots.has(root) || surfaces.length >= MAX_SURFACES) return;
      visitedRoots.add(root);
      surfaces.push({ root, context });

      let nodes = [];
      try {
        nodes = Array.from(root.querySelectorAll?.("*") || []).slice(0, MAX_NODES_PER_SURFACE);
      } catch {
        return;
      }

      nodes.forEach((element, index) => {
        if (surfaces.length >= MAX_SURFACES) return;
        if (element.shadowRoot) {
          visit(element.shadowRoot, describeContext({
            ...context,
            rootType: "shadow-root",
            shadowHost: element.tagName || "host"
          }));
        }

        const tagName = String(element.tagName || "").toLowerCase();
        if (tagName !== "iframe" && tagName !== "frame") return;

        const framePath = [...context.framePath, index].slice(0, 8);
        let frameDocument = null;
        try {
          frameDocument = element.contentDocument || null;
        } catch {
          frameDocument = null;
        }
        const rawFrameUrl = element.getAttribute?.("src") || element.src || "";
        const frameUrl = sanitizeUrl(rawFrameUrl, context.frameUrl || pageUrl);
        const frameContext = describeContext({
          ...context,
          rootType: "iframe",
          frameUrl: frameUrl || context.frameUrl || pageUrl,
          frameOrigin: originOf(frameUrl, context.frameUrl || pageUrl),
          framePath
        });
        if (frameDocument) {
          visit(frameDocument, frameContext);
        } else {
          addInaccessible(describeContext({
            ...frameContext,
            rootType: "iframe-inaccessible",
            accessible: false,
            reason: "cross-origin-frame-inaccessible"
          }));
        }
      });
    };

    visit(documentRef, describeContext({
      rootType: "document",
      frameUrl: pageUrl,
      frameOrigin: pageOrigin,
      framePath: []
    }));
    return surfaces;
  }

  globalThis.CookieBuddyConsentSurfaces = Object.freeze({ collect, describeContext });
})();
