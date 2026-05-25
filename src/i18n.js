const SUPPORTED_LANGUAGES = ["en", "de"];
let activeLanguage = "en";
let messages = {};

export async function initI18n() {
  const stored = await chrome.storage.local.get("cookiebuddyLanguage");
  
  // If user hasn't manually set a language, use browser language; otherwise use stored preference
  let language;
  if (stored.cookiebuddyLanguage) {
    // User has manually set a language, respect it
    language = stored.cookiebuddyLanguage;
  } else {
    // Use browser language, default to EN if not supported
    const browserLanguage = chrome.i18n.getUILanguage?.().slice(0, 2) || "en";
    language = browserLanguage;
  }
  
  activeLanguage = normalizeLanguage(language);
  messages = await loadMessages(activeLanguage);
  document.documentElement.lang = activeLanguage;
  return activeLanguage;
}

export async function setLanguage(language) {
  activeLanguage = normalizeLanguage(language);
  await chrome.storage.local.set({ cookiebuddyLanguage: activeLanguage });
  messages = await loadMessages(activeLanguage);
  document.documentElement.lang = activeLanguage;
  return activeLanguage;
}

export function getLanguage() {
  return activeLanguage;
}

export function t(key, substitutions) {
  const message = messages[key]?.message || key;
  const values = substitutions === undefined ? [] : Array.isArray(substitutions) ? substitutions : [substitutions];
  return values.reduce((text, value, index) => text.replaceAll(`$${index + 1}`, String(value)), message);
}

export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
}

function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language) ? language : "en";
}

async function loadMessages(language) {
  const response = await fetch(chrome.runtime.getURL(`_locales/${language}/messages.json`));
  return response.json();
}
