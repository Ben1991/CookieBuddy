import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const helperSource = await readFile(new URL("../src/consent-controls.js", import.meta.url), "utf8");
const popupHtml = await readFile(new URL("../popup.html", import.meta.url), "utf8");
const detailsHtml = await readFile(new URL("../details.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

function loadControls() {
  const context = { globalThis: {} };
  vm.runInNewContext(helperSource, context, { filename: "consent-controls.js" });
  return context.globalThis.CookieBuddyConsentControls;
}

function control({ name, nameSource = "text", role = "button", tagName = "button", type = "" }) {
  return { name, nameSource, role, tagName, type };
}

test("supports explicit non-DE/EN rejection vocabulary", () => {
  const controls = loadControls();
  for (const [name, language] of [
    ["Tout refuser", "fr"],
    ["Rechazar todo", "es"],
    ["Odrzuć wszystko", "pl"],
    ["すべて拒否", "ja"]
  ]) {
    const result = controls.classifyConsentControl(control({ name }));
    assert.equal(result.kind, "deny-all", name);
    assert.equal(result.language, language, name);
    assert.equal(result.canClick, true, name);
  }
});

test("recognizes icon-only semantic controls through accessible names", () => {
  const controls = loadControls();
  const result = controls.classifyConsentControl(control({
    name: "Reject all cookies",
    nameSource: "aria",
    role: "button",
    tagName: "div"
  }));

  assert.equal(result.kind, "deny-all");
  assert.equal(result.source, "accessibility");
  assert.equal(result.confidence, "high");
  assert.equal(result.canClick, true);
});

test("does not click unknown-language or broad-text controls", () => {
  const controls = loadControls();
  for (const name of ["Continue", "Privacy", "Accept", "拒否する"]) {
    const result = controls.classifyConsentControl(control({ name, nameSource: "aria" }));
    assert.equal(result.kind, "unknown", name);
    assert.equal(result.canClick, false, name);
    assert.equal(result.uncertain, true, name);
  }
});

test("uses an associated label as an accessible name", () => {
  const controls = loadControls();
  const label = { textContent: "Tout refuser" };
  const element = {
    id: "reject-control",
    tagName: "input",
    ownerDocument: {
      querySelectorAll: (selector) => selector === "label" ? [label] : []
    },
    getAttribute(name) {
      return name === "type" ? "button" : "";
    }
  };

  label.getAttribute = (name) => name === "for" ? "reject-control" : "";

  const details = controls.getAccessibleNameDetails(element);
  assert.equal(details.name, "Tout refuser");
  assert.equal(details.source, "label");
});

test("popup and details keep keyboard and screen-reader affordances explicit", () => {
  for (const html of [popupHtml, detailsHtml]) {
    assert.match(html, /data-i18n-aria-label=/, "interactive language controls need localized accessible labels");
    assert.doesNotMatch(html, /tabindex=["'](?:[1-9]|[1-9][0-9]+)/i, "positive tabindex would override the natural focus order");
  }
  assert.match(styles, /select:focus-visible/, "language selection needs a visible focus state");
  assert.match(styles, /button:focus-visible/, "buttons need a visible focus state");
});
