import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
const english = JSON.parse(await readFile(new URL("../_locales/en/messages.json", import.meta.url), "utf8"));
const german = JSON.parse(await readFile(new URL("../_locales/de/messages.json", import.meta.url), "utf8"));

test("store metadata is valid and localized descriptions fit Chrome limits", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+(?:\.\d+){1,3}$/);
  assert.equal(manifest.homepage_url, "https://github.com/Ben1991/CookieBuddy");
  assert.ok(manifest.icons?.["128"]);
  for (const messages of [english, german]) {
    assert.ok(messages.extensionName?.message);
    assert.ok(messages.extensionDescription?.message);
    assert.ok(messages.extensionDescription.message.length <= 132);
  }
});

test("store release kit keeps public privacy and review guidance present", async () => {
  const files = [
    "PRIVACY.md",
    "docs/chrome-web-store/store-listing.md",
    "docs/chrome-web-store/assets/cookiebuddy-evidence-1280x800.png",
    "docs/chrome-web-store/privacy-disclosure.md",
    "docs/chrome-web-store/test-instructions.md",
    "docs/chrome-web-store/release-checklist.md",
    "scripts/package-store.mjs"
  ];
  for (const file of files) await access(new URL(`../${file}`, import.meta.url));

  const listing = await readFile(new URL("../docs/chrome-web-store/store-listing.md", import.meta.url), "utf8");
  const privacy = await readFile(new URL("../PRIVACY.md", import.meta.url), "utf8");
  assert.match(listing, /PRIVACY\.md/);
  assert.match(listing, /1280×800/);
  assert.match(privacy, /Limited Use requirements/);
  assert.match(privacy, /does not upload scans/);
});
