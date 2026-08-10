import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const readMessages = (language) => JSON.parse(fs.readFileSync(`_locales/${language}/messages.json`, "utf8"));

test("English and German locale files contain the same message keys", () => {
  const enKeys = Object.keys(readMessages("en")).sort();
  const deKeys = Object.keys(readMessages("de")).sort();
  assert.deepEqual(deKeys, enKeys);
});

test("German messages contain valid UTF-8 copy without mojibake or replacement text", () => {
  const messages = readMessages("de");
  for (const [key, entry] of Object.entries(messages)) {
    assert.doesNotMatch(entry.message, /[ÃÂ�]/, `${key} contains corrupted characters`);
  }
  assert.equal(messages.helpIntro.message, "CookieBuddy prüft die aktuelle Seite darauf, ob nach dem Klick auf „Alle ablehnen“ weiterhin Cookies oder Drittanbieter-Anfragen auftreten.");
});

test("visible shell copy has localization hooks for language-dependent text", () => {
  for (const file of ["popup.html", "details.html"]) {
    const html = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(html, /aria-label="(?:Current page|Language|Scan overview)"/i, `${file} contains a hardcoded English accessibility label`);
  }

  const popup = fs.readFileSync("popup.html", "utf8");
  assert.match(popup, /data-i18n="supportPrompt"/);
  assert.match(popup, /data-i18n="supportDescription"/);
  assert.match(popup, /data-i18n-title="bannerOverviewTitle"/);
});
