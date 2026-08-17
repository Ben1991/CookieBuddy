// Classic content-script bundle for Chrome's page context.
// Keep this copy dependency-free because content.js is injected on real pages.
const PRIVACY_PATTERN = /privacy|datenschutz|data[- ]?protection|privacy[- ]?policy/i;
const IMPRINT_PATTERN = /imprint|impressum|legal[- ]?notice/i;
const CONTACT_PATTERN = /contact|kontakt/i;
const DPO_CONTEXT_PATTERN = /data protection officer|datenschutzbeauftrag|privacy officer|dpo\b/i;

function getContactLinkMetadata(href, text, inFooter = false) {
  const value = `${href || ""} ${text || ""}`;
  const sourceType = classifySourceType(value);
  if (!sourceType) return null;
  return { href, text: String(text || "").trim().toLowerCase(), inFooter: Boolean(inFooter), sourceType, source: sourceLabel(sourceType) };
}

function classifyPageSource(sourceUrl, pageTitle = "") {
  const sourceType = classifySourceType(`${sourceUrl || ""} ${pageTitle || ""}`) || "page";
  return { sourceType, source: sourceLabel(sourceType) };
}

function contactLinkPriority(link) {
  const sourceScores = { privacy: 40, imprint: 30, contact: 20 };
  return (sourceScores[link.sourceType] || 10) + (link.inFooter ? 10 : 0);
}

function extractContactsFromText(text, sourceUrl, source, sourceType) {
  const value = String(text || "");
  const emails = [];
  const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  for (const match of value.matchAll(emailPattern)) {
    const email = match[0];
    const before = value.slice(0, match.index).split(/[.!?\n]/).pop() || "";
    const after = value.slice(match.index + email.length).split(/[.!?\n]/)[0] || "";
    const context = `${before} ${after}`;
    const localPart = email.split("@", 1)[0];
    const kind = DPO_CONTEXT_PATTERN.test(context) || /^(dpo|datenschutz|data[-_.]?protection)/i.test(localPart) ? "dpo" : "contact";
    emails.push({ kind, email, phone: "", source: source || "Visited page", sourceUrl, sourceType: sourceType || "page" });
  }
  const phoneMatches = Array.from(new Set(value.match(/(?:\+|00)\d[\d\s()./-]{6,}\d/g) || []));
  return emails.map((contact) => ({ ...contact, phone: phoneMatches[0] || "" }));
}

function dedupeContacts(contacts) {
  const bestByEmail = new Map();
  for (const contact of contacts) {
    const key = contact.email.toLowerCase();
    const previous = bestByEmail.get(key);
    if (!previous || contactScore(contact) > contactScore(previous)) bestByEmail.set(key, contact);
  }
  return rankContacts([...bestByEmail.values()]);
}

function rankContacts(contacts) {
  return [...contacts].sort((a, b) => contactScore(b) - contactScore(a));
}

function contactScore(contact) {
  const sourceScores = { privacy: 400, imprint: 300, contact: 200, page: 100 };
  return (contact.kind === "dpo" ? 1000 : 0) + (sourceScores[contact.sourceType] || 0);
}

function classifySourceType(value) {
  if (PRIVACY_PATTERN.test(value)) return "privacy";
  if (IMPRINT_PATTERN.test(value)) return "imprint";
  if (CONTACT_PATTERN.test(value)) return "contact";
  return null;
}

function sourceLabel(sourceType) {
  return { privacy: "Privacy policy", imprint: "Imprint", contact: "Contact page", page: "Visited page" }[sourceType] || "Visited page";
}
