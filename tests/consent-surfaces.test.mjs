import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/consent-surfaces.js", import.meta.url), "utf8");

function loadCollector() {
  const context = { globalThis: {}, URL };
  vm.runInNewContext(source, context, { filename: "consent-surfaces.js" });
  return context.globalThis.CookieBuddyConsentSurfaces;
}

function root(elements = []) {
  return {
    querySelectorAll(selector) {
      return selector === "*" ? elements : [];
    }
  };
}

function element(tagName, { src = "", contentDocument = null, shadowRoot = null, throws = false } = {}) {
  return {
    nodeType: 1,
    tagName,
    shadowRoot,
    src,
    contentDocument,
    getAttribute(name) {
      if (name === "src") return src;
      return "";
    },
    get contentDocument() {
      if (throws) throw new Error("cross-origin");
      return contentDocument;
    }
  };
}

test("collects top-document, same-origin iframe, and open shadow-root contexts", () => {
  const collector = loadCollector();
  const frameDocument = root([]);
  const shadowRoot = root([]);
  const frame = element("IFRAME", { src: "https://cmp.example.test/banner?session=secret#banner", contentDocument: frameDocument });
  const host = element("DIV", { shadowRoot });
  const surfaces = collector.collect(root([frame, host]), { href: "https://site.example.test/page?user=secret#top", origin: "https://site.example.test" });

  assert.equal(Array.from(surfaces, ({ context }) => context.rootType).join(","), "document,iframe,shadow-root");
  assert.equal(surfaces[1].context.frameUrl, "https://cmp.example.test/banner");
  assert.equal(surfaces[1].context.frameOrigin, "https://cmp.example.test");
  assert.equal(surfaces[1].context.domContext, "same-origin-frame");
  assert.equal(surfaces[2].context.domContext, "open-shadow-root");
  assert.equal(surfaces[2].context.accessible, true);
});

test("keeps a cross-origin iframe explicit instead of treating it as absent", () => {
  const collector = loadCollector();
  const frame = element("IFRAME", { src: "https://blocked.example.test/cmp?token=secret", throws: true });
  const surfaces = collector.collect(root([frame]), { href: "https://site.example.test/", origin: "https://site.example.test" });
  const inaccessible = surfaces.find(({ context }) => context.accessible === false);

  assert.ok(inaccessible);
  assert.equal(inaccessible.context.rootType, "iframe-inaccessible");
  assert.equal(inaccessible.context.domContext, "inaccessible-cross-origin-frame");
  assert.equal(inaccessible.context.frameUrl, "https://blocked.example.test/cmp");
  assert.equal(inaccessible.context.frameOrigin, "https://blocked.example.test");
  assert.equal(inaccessible.context.reason, "cross-origin-frame-inaccessible");
});
