import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const popupHtml = await readFile(new URL("../popup.html", import.meta.url), "utf8");
const popupScript = await readFile(new URL("../src/popup.js", import.meta.url), "utf8");
const auditCss = await readFile(new URL("../src/audit-flow.css", import.meta.url), "utf8");

test("UC-22 puts the plain-language audit question and action before technical metrics", () => {
  const visiblePrefix = popupHtml.split('<div class="cb-functional-sections" hidden>')[0];
  assert.match(visiblePrefix, /id="auditQuestion"/);
  assert.match(visiblePrefix, /data-i18n="runAuditButton"/);
  assert.match(visiblePrefix, /id="auditSteps"/);
  assert.doesNotMatch(visiblePrefix, /Delta-Check starten|Run delta check|Erkannte Kategorien/);
  assert.ok(visiblePrefix.indexOf('id="deltaButton"') < visiblePrefix.indexOf('id="auditExplainerHeading"'));
  assert.ok(visiblePrefix.indexOf('id="deltaResult"') < visiblePrefix.indexOf('id="auditExplainerHeading"'));
  assert.match(popupHtml, /<div class="cb-functional-sections" hidden>/);
});

test("the popup exposes all required progress phases and progressive evidence actions", () => {
  for (const step of ["prepare", "consent", "baseline", "reject", "verify", "observe", "capture", "analyze"]) {
    assert.match(popupHtml, new RegExp(`data-step="${step}"`));
  }
  assert.match(popupScript, /auditOpenEvidence/);
  assert.match(popupScript, /auditContactWebsite/);
  assert.match(popupScript, /deriveAuditVerdict/);
  assert.match(popupScript, /auditCompletenessComplete/);
  assert.match(popupScript, /slice\(0, 3\)/);
  assert.match(popupScript, /denyAction\?\.verified/);
});

test("incomplete, review, negative, and positive states have non-color styling hooks", () => {
  assert.match(auditCss, /audit-verdict\[data-verdict="positive"\]/);
  assert.match(auditCss, /audit-verdict\[data-verdict="negative"\]/);
  assert.match(auditCss, /audit-verdict\[data-verdict="review"\]/);
  assert.match(auditCss, /audit-verdict\[data-verdict="incomplete"\]/);
  assert.match(auditCss, /border-color/);
});
