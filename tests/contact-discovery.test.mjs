import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyPageSource,
  contactLinkPriority,
  dedupeContacts,
  extractContactsFromText,
  getContactLinkMetadata
} from "../src/contact-discovery.js";

test("prioritizes privacy links in the footer over other legal links", () => {
  const privacy = getContactLinkMetadata("https://example.com/privacy", "Datenschutz", true);
  const imprint = getContactLinkMetadata("https://example.com/impressum", "Impressum", true);
  assert.ok(privacy);
  assert.ok(imprint);
  assert.ok(contactLinkPriority(privacy) > contactLinkPriority(imprint));
});

test("classifies a page URL as privacy policy or imprint", () => {
  assert.deepEqual(classifyPageSource("https://example.de/datenschutz", "Datenschutz"), { sourceType: "privacy", source: "Privacy policy" });
  assert.deepEqual(classifyPageSource("https://example.de/impressum", "Impressum"), { sourceType: "imprint", source: "Imprint" });
});

test("minimizes contact source URLs without changing source classification", () => {
  const link = getContactLinkMetadata("https://example.de/datenschutz?email=alice%40example.com#dpo", "Datenschutz", true);
  const contacts = extractContactsFromText("Datenschutzbeauftragter: dpo@example.com", "https://example.de/impressum?token=secret#contact", "Imprint", "imprint");

  assert.equal(link.href, "https://example.de/datenschutz");
  assert.equal(contacts[0].sourceUrl, "https://example.de/impressum");
  assert.doesNotMatch(JSON.stringify({ link, contacts }), /alice|secret|#dpo|#contact/);
});

test("classifies the DPO email from its local context instead of the whole page", () => {
  const contacts = extractContactsFromText(
    "Allgemeine Anfragen: hello@example.com. Datenschutzbeauftragter: dpo@example.com.",
    "https://example.com/impressum",
    "Imprint",
    "imprint"
  );
  assert.equal(contacts.find((contact) => contact.email === "hello@example.com").kind, "contact");
  assert.equal(contacts.find((contact) => contact.email === "dpo@example.com").kind, "dpo");
});

test("prefers a DPO email from the imprint over a generic privacy-page email", () => {
  const contacts = dedupeContacts([
    ...extractContactsFromText("Privacy contact: privacy@example.com", "https://example.com/privacy", "Privacy policy", "privacy"),
    ...extractContactsFromText("Datenschutzbeauftragter: dpo@example.com", "https://example.com/impressum", "Imprint", "imprint")
  ]);
  assert.equal(contacts[0].email, "dpo@example.com");
  assert.equal(contacts[0].source, "Imprint");
});
