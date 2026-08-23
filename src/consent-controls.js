(() => {
  // Keep consent vocabulary local and explicit. A phrase must describe a
  // reject/necessary-only action; broad words such as "privacy" are not enough.
  const LOCALE_VOCABULARY = Object.freeze({
    en: { denyAll: ["reject all", "deny all", "decline all", "refuse all"], essentialOnly: ["only necessary", "essential only", "necessary cookies only"] },
    de: { denyAll: ["alle ablehnen", "alles ablehnen", "alle verweigern"], essentialOnly: ["nur notwendige", "nur erforderliche", "nur essenzielle"] },
    fr: { denyAll: ["tout refuser", "refuser tout", "rejeter tout"], essentialOnly: ["uniquement nécessaires", "seulement nécessaires"] },
    es: { denyAll: ["rechazar todo", "denegar todo"], essentialOnly: ["solo necesarias", "únicamente necesarias"] },
    it: { denyAll: ["rifiuta tutto", "rifiutare tutto"], essentialOnly: ["solo necessarie", "soltanto necessarie"] },
    pt: { denyAll: ["rejeitar tudo", "recusar tudo"], essentialOnly: ["apenas necessárias", "somente necessárias"] },
    nl: { denyAll: ["alles weigeren", "alles afwijzen"], essentialOnly: ["alleen noodzakelijke", "alleen strikt noodzakelijke"] },
    pl: { denyAll: ["odrzuć wszystko", "odrzuc wszystko"], essentialOnly: ["tylko niezbędne", "wyłącznie niezbędne"] },
    sv: { denyAll: ["avvisa alla", "neka alla"], essentialOnly: ["endast nödvändiga"] },
    no: { denyAll: ["avvis alle", "avslå alle"], essentialOnly: ["bare nødvendige"] },
    da: { denyAll: ["afvis alle", "afvis alt"], essentialOnly: ["kun nødvendige"] },
    fi: { denyAll: ["hylkää kaikki", "kieltäydy kaikesta"], essentialOnly: ["vain välttämättömät"] },
    cs: { denyAll: ["odmítnout vše", "odmítnout všechno"], essentialOnly: ["pouze nezbytné"] },
    ja: { denyAll: ["すべて拒否", "全て拒否"], essentialOnly: ["必須のみ"] },
    ko: { denyAll: ["모두 거부", "전체 거부"], essentialOnly: ["필수만"] },
    zh: { denyAll: ["拒绝全部", "拒絕全部"], essentialOnly: ["仅必要", "僅必要"] }
  });

  const SETTINGS_PHRASES = Object.freeze([
    "cookie settings", "privacy settings", "consent settings", "manage preferences", "manage consent",
    "customize cookies", "customise cookies", "show details", "einstellungen", "präferenzen", "verwalten",
    "gérer les préférences", "gestionar preferencias", "gestisci preferenze", "gerir preferências",
    "voorkeuren beheren", "zarządzaj preferencjami", "hantera inställningar", "管理設定", "設定を管理"
  ]);

  const INTERACTIVE_ROLES = new Set(["button", "link", "menuitem", "menuitemcheckbox", "menuitemradio", "tab"]);
  const INTERACTIVE_TAGS = new Set(["button", "a", "input", "summary"]);

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKD")
      .toLocaleLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function phraseMatches(value, phrases) {
    const normalized = normalizeText(value);
    return phrases.some((phrase) => {
      const expected = normalizeText(phrase);
      return expected && (normalized === expected || normalized.includes(` ${expected} `) || normalized.startsWith(`${expected} `) || normalized.endsWith(` ${expected}`));
    });
  }

  function getAttribute(element, name) {
    return typeof element?.getAttribute === "function" ? element.getAttribute(name) || "" : element?.[name] || "";
  }

  function getAccessibleNameDetails(element) {
    const labelledBy = getAttribute(element, "aria-labelledby");
    const labelledText = labelledBy && element?.ownerDocument
      ? labelledBy.split(/\s+/).map((id) => element.ownerDocument.getElementById(id)?.textContent || "").join(" ")
      : "";
    const associatedLabel = element?.id && element.ownerDocument?.querySelectorAll
      ? Array.from(element.ownerDocument.querySelectorAll("label"))
        .find((label) => getAttribute(label, "for") === String(element.id))?.textContent || ""
      : element?.parentElement?.tagName?.toLowerCase() === "label"
        ? element.parentElement.textContent || ""
        : "";
    const candidates = [
      [labelledText, "aria"],
      [getAttribute(element, "aria-label"), "aria"],
      [associatedLabel, "label"],
      [getAttribute(element, "title"), "title"],
      [getAttribute(element, "data-label"), "label"],
      [getAttribute(element, "alt"), "label"],
      [getAttribute(element, "value"), "label"],
      [element?.innerText || element?.textContent || "", "text"]
    ];
    const selected = candidates.find(([value]) => normalizeText(value));
    return { name: selected?.[0] || "", source: selected?.[1] || "unknown" };
  }

  function getAccessibleName(element) {
    return getAccessibleNameDetails(element).name;
  }

  function detectLanguage(value, declaredLanguage = "") {
    const declared = normalizeText(declaredLanguage).split(/[-_]/)[0];
    for (const [language, vocabulary] of Object.entries(LOCALE_VOCABULARY)) {
      if (phraseMatches(value, [...vocabulary.denyAll, ...vocabulary.essentialOnly])) return language;
    }
    if (LOCALE_VOCABULARY[declared]) return declared;
    return "unknown";
  }

  function isInteractive({ role = "", tagName = "", type = "" } = {}) {
    return INTERACTIVE_ROLES.has(normalizeText(role))
      || INTERACTIVE_TAGS.has(normalizeText(tagName))
      || (normalizeText(tagName) === "input" && ["button", "submit", "reset"].includes(normalizeText(type)));
  }

  function unknownResult(language = "unknown") {
    return { kind: "unknown", confidence: "none", source: "unknown", language, uncertain: true, canClick: false };
  }

  function classifyConsentControl({ name = "", nameSource = "unknown", role = "", tagName = "", type = "", declaredLanguage = "", cmpHint = false } = {}) {
    if (!isInteractive({ role, tagName, type })) return unknownResult("unknown");
    const language = detectLanguage(name, declaredLanguage);
    const vocabulary = LOCALE_VOCABULARY[language];
    const denyAll = vocabulary && phraseMatches(name, vocabulary.denyAll);
    const essentialOnly = vocabulary && phraseMatches(name, vocabulary.essentialOnly);
    const settings = phraseMatches(name, SETTINGS_PHRASES);
    const kind = denyAll ? "deny-all" : essentialOnly ? "essential-only" : settings ? "settings" : "unknown";
    if (kind === "unknown") return unknownResult(language);

    const source = cmpHint ? "cmp" : nameSource === "aria" || nameSource === "label" ? "accessibility" : language !== "unknown" || kind === "settings" ? "locale" : "text";
    const confidence = cmpHint || source === "accessibility" ? "high" : source === "locale" ? "medium" : "low";
    return { kind, confidence, source, language, uncertain: confidence === "low", canClick: confidence !== "low" };
  }

  globalThis.CookieBuddyConsentControls = Object.freeze({
    getAccessibleName,
    getAccessibleNameDetails,
    classifyConsentControl,
    isInteractive,
    normalizeText,
    vocabulary: LOCALE_VOCABULARY
  });
})();
