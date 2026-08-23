import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const popupHtml = await readFile(new URL("../popup.html", import.meta.url), "utf8");
const auditCss = await readFile(new URL("../src/audit-flow.css", import.meta.url), "utf8");

test("UC-22 popup prioritizes the one-click tracking audit over technical metrics", () => {
  assert.match(popupHtml, /Ist das Tracking korrekt umgesetzt\?/);
  assert.match(popupHtml, /id="deltaButton"[^>]*>Tracking prüfen<\/button>/);
  assert.match(popupHtml, /Consent erkennen/);
  assert.match(popupHtml, /Optionale Einwilligung ablehnen/);
  assert.match(popupHtml, /Tracking erneut beobachten/);

  const visiblePrefix = popupHtml.split('<div class="cb-functional-sections" hidden>')[0];
  assert.doesNotMatch(visiblePrefix, /Erkannte Kategorien/);
  assert.doesNotMatch(visiblePrefix, /Delta-Check starten/);
});

test("UC-22 keeps technical legacy targets out of the accessibility tree", () => {
  assert.match(popupHtml, /<div class="cb-functional-sections" hidden>/);
  assert.doesNotMatch(popupHtml, /cb-functional-sections" aria-hidden="true"/);
});

test("UC-22 exposes a visible status and result region", () => {
  assert.match(popupHtml, /id="statusCard"[^>]*aria-live="polite"/);
  assert.match(popupHtml, /id="scanStatusText"/);
  assert.match(popupHtml, /id="deltaResult"[^>]*aria-live="polite"/);
  assert.match(popupHtml, /Noch kein Ergebnis/);
});

test("audit popup styling distinguishes status modes without relying on a single color", () => {
  assert.match(auditCss, /audit-state-pill\[data-mode="busy"\]/);
  assert.match(auditCss, /audit-state-pill\[data-mode="warn"\]/);
  assert.match(auditCss, /audit-state-pill\[data-mode="ok"\]/);
  assert.match(auditCss, /border-color/);
});
