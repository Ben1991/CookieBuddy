import { applyI18n, getLanguage, initI18n, setLanguage, t } from "./i18n.js";
import { buildDelta, capitalize, getBaseDomain, normalizeTraffic, serviceForCookie } from "./core.js";

const state = {
  tab: null,
  analysis: null,
  cookies: [],
  traffic: [],
  statusMode: "ok",
  statusKey: "statusReady"
};

const elements = {
  statusPill: document.querySelector("#statusPill"),
  bannerResult: document.querySelector("#bannerResult"),
  categoryResult: document.querySelector("#categoryResult"),
  cookieResult: document.querySelector("#cookieResult"),
  cookieCount: document.querySelector("#cookieCount"),
  deltaResult: document.querySelector("#deltaResult"),
  contactResult: document.querySelector("#contactResult"),
  detailsLink: document.querySelector("#detailsLink"),
  refreshButton: document.querySelector("#refreshButton"),
  deltaButton: document.querySelector("#deltaButton"),
  languageSelect: document.querySelector("#languageSelect"),
  helpButton: document.querySelector("#helpButton"),
  helpPanel: document.querySelector("#helpPanel")
};

elements.refreshButton.addEventListener("click", () => scanCurrentTab());
elements.deltaButton.addEventListener("click", () => runDeltaCheck());
elements.helpButton.addEventListener("click", () => {
  const isOpen = !elements.helpPanel.hidden;
  elements.helpPanel.hidden = isOpen;
  elements.helpButton.setAttribute("aria-expanded", String(!isOpen));
});
elements.languageSelect.addEventListener("change", async (event) => {
  await setLanguage(event.target.value);
  applyLocalizedText();
  if (state.analysis) render();
  setStatus(state.statusKey, state.statusMode);
});

await initI18n();
applyLocalizedText();
scanCurrentTab();

async function scanCurrentTab() {
  setStatus("statusScanning", "busy");
  elements.bannerResult.classList.add("skeleton");
  elements.bannerResult.textContent = t("scanningCurrentTab");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tab = tab;
    await ensureContentScript(tab.id);

    const [analysis, cookies, trafficResponse] = await Promise.all([
      sendToTab(tab.id, { target: "cookiebuddy-content", type: "ANALYZE_PAGE" }),
      getCookiesForTab(tab),
      chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "GET_TRAFFIC", tabId: tab.id })
    ]);

    state.analysis = analysis;
    state.cookies = cookies;
    state.traffic = trafficResponse?.traffic || [];
    await persistLastScan();
    render();
    setStatus("statusReady", "ok");
  } catch (error) {
    setStatus("statusNeedsAccess", "warn");
    renderError(error);
  }
}

async function runDeltaCheck() {
  if (!state.tab || !state.analysis) {
    elements.deltaResult.innerHTML = `<p class="error">${escapeHtml(t("deltaNeedsPageAccess"))}</p>`;
    setStatus("statusNeedsAccess", "warn");
    return;
  }

  setStatus("statusChecking", "busy");
  elements.deltaButton.disabled = true;
  elements.deltaResult.innerHTML = `<p class="muted">${escapeHtml(t("deltaCheckingDescription"))}</p>`;

  try {
    await chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "CLEAR_TRAFFIC", tabId: state.tab.id });
    const before = await snapshot(t("snapshotCurrentState"));
    const denyResult = await sendToTab(state.tab.id, { target: "cookiebuddy-content", type: "TRY_DENY_ALL" });
    await wait(1800);
    const afterDeny = await snapshot(t("snapshotAfterDenyAll"));
    const delta = buildDelta({
      beforeCookies: before.cookies,
      afterCookies: afterDeny.cookies,
      beforeTraffic: before.thirdPartyTraffic,
      afterTraffic: afterDeny.thirdPartyTraffic,
      denyClicked: denyResult.clicked,
      denyLabel: denyResult.label,
      labels: {
        deltaFoundSummary: t("deltaFoundSummary"),
        noDeltaSummary: t("noDeltaSummary")
      },
      tabUrl: state.tab.url
    });

    await chrome.storage.local.set({ cookiebuddyLastDelta: delta });
    renderDelta(delta);
    setStatus(delta.riskLevel === "high" ? "statusDeltaFound" : "statusChecked", delta.riskLevel === "high" ? "warn" : "ok");
  } catch (error) {
    elements.deltaResult.innerHTML = `<p class="error">${escapeHtml(error.message || t("deltaCheckFailed"))}</p>`;
    setStatus("statusCheckFailed", "warn");
  } finally {
    elements.deltaButton.disabled = false;
  }
}

async function snapshot(label) {
  const [analysis, cookies, trafficResponse] = await Promise.all([
    sendToTab(state.tab.id, { target: "cookiebuddy-content", type: "ANALYZE_PAGE" }),
    getCookiesForTab(state.tab),
    chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "GET_TRAFFIC", tabId: state.tab.id })
  ]);

  return {
    label,
    analysis,
    cookies,
    thirdPartyTraffic: normalizeTraffic(trafficResponse?.traffic || [], analysis.host)
  };
}

function render() {
  renderBanner();
  renderCategories();
  renderCookies();
  renderContacts();
}

function renderBanner() {
  const banner = state.analysis.banner;
  const sourceLabel = banner.source?.host || banner.source?.value || banner.evidence?.[0]?.value || t("noSourceDetected");
  elements.bannerResult.classList.remove("skeleton");
  elements.bannerResult.innerHTML = `
    <div>
      <span class="label">${escapeHtml(t("detectedLabel"))}</span>
      <strong>${escapeHtml(banner.name)}</strong>
    </div>
    <div>
      <span class="label">${escapeHtml(t("confidenceLabel"))}</span>
      <strong>${escapeHtml(banner.confidence)}</strong>
    </div>
    <div class="full-width">
      <span class="label">${escapeHtml(t("sourceEvidenceLabel"))}</span>
      <strong>${escapeHtml(sourceLabel)}</strong>
    </div>
  `;
}

function renderCategories() {
  const categories = state.analysis.categories;
  elements.categoryResult.innerHTML = Object.entries(categories)
    .map(([name, data]) => `
      <article class="category-card">
        <span>${escapeHtml(t(`category${capitalize(name)}`))}</span>
        <strong>${data.services.length}</strong>
      </article>
    `)
    .join("");
}

function renderCookies() {
  const storageItems = state.analysis.storage?.items || [];
  const totalCookies = state.cookies.length;
  const totalLocalItems = storageItems.length;
  elements.cookieCount.textContent = `${t("cookieCount", totalCookies)} · ${totalLocalItems} ${t("localStorageHeading").toLowerCase()}`;

  const cookies = state.cookies.slice(0, 8);
  const storage = storageItems.slice(0, 8);
  elements.cookieResult.innerHTML = `
    <div class="storage-summary">
      <div class="metric-row">
        <span>${escapeHtml(t("cookieCount", totalCookies))}</span>
        <span>${escapeHtml(t("storageCount", [state.analysis.storage?.localStorageKeys?.length || 0, state.analysis.storage?.sessionStorageKeys?.length || 0]))}</span>
      </div>
      <p class="muted">${escapeHtml(t("storageOverview", [state.analysis.storage?.localStorageKeys?.length || 0, state.analysis.storage?.sessionStorageKeys?.length || 0, state.analysis.storage?.indexedDbNames?.length || 0]))}</p>
    </div>
    <div class="storage-columns">
      <div>
        <h3>${escapeHtml(t("visibleCookiesHeading"))}</h3>
        ${cookies.length
          ? cookies.map((cookie) => `
              <div class="list-row">
                <div>
                  <strong>${escapeHtml(cookie.name)}</strong>
                  <span>${escapeHtml(cookie.domain)}</span>
                </div>
                <span>${escapeHtml(serviceForCookie(cookie))}</span>
              </div>
            `).join("")
          : `<p class="muted">${escapeHtml(t("noCookiesVisible"))}</p>`}
      </div>
      <div>
        <h3>${escapeHtml(t("localStorageHeading"))}</h3>
        ${storage.length
          ? storage.map((item) => `
              <div class="list-row">
                <div>
                  <strong>${escapeHtml(item.key)}</strong>
                  <span>${escapeHtml(item.scope)}${item.inBanner ? ` · ${escapeHtml(t("inBannerMarker"))}` : ""}</span>
                </div>
                <span>${escapeHtml(item.valuePreview)}</span>
              </div>
            `).join("")
          : `<p class="muted">${escapeHtml(t("noLocalStorageVisible"))}</p>`}
      </div>
    </div>
  `;
}

function renderContacts() {
  const contacts = state.analysis.contacts;
  const dpo = contacts.dpo;
  const authority = contacts.authority;
  const subject = encodeURIComponent(t("mailSubject", state.analysis.host));
  const body = encodeURIComponent(t("mailBody", state.analysis.url));
  const dpoMail = dpo?.email ? `mailto:${encodeURIComponent(dpo.email)}?subject=${subject}&body=${body}` : "";
  const authorityMail = authority.url;
  const authorityName = authority.key === "german" ? t("germanAuthorityName") : authority.key === "fallback" ? t("bfdiName") : authority.name;
  const authorityNote = authority.key === "german" ? t("germanAuthorityNote") : authority.key === "fallback" ? t("bfdiNote") : authority.note;

  elements.contactResult.innerHTML = `
    <div class="contact-item">
      <span class="label">${escapeHtml(t("dpoLabel"))}</span>
      <strong>${escapeHtml(dpo?.email || t("noDpoEmailFound"))}</strong>
      ${dpoMail ? `<a class="primary-button small" href="${dpoMail}">${escapeHtml(t("draftEmailButton"))}</a>` : ""}
    </div>
    <div class="contact-item">
      <span class="label">${escapeHtml(t("authorityLabel"))}</span>
      <strong>${escapeHtml(authorityName)}</strong>
      <p class="muted">${escapeHtml(authorityNote)}</p>
      <a class="ghost-button small" href="${escapeHtml(authorityMail)}" target="_blank" rel="noreferrer">${escapeHtml(t("openAuthorityDetails"))}</a>
    </div>
  `;
}

function renderDelta(delta) {
  const cookieItems = [...delta.remainingCookies, ...delta.newCookies].slice(0, 8);
  elements.deltaResult.innerHTML = `
    <div class="risk ${delta.riskLevel}">
      <strong>${delta.riskLevel === "high" ? escapeHtml(t("deltaFoundTitle")) : escapeHtml(t("noObviousDeltaTitle"))}</strong>
      <p>${escapeHtml(delta.summary)}</p>
    </div>
    <div class="metric-row">
      <span>${escapeHtml(t("cookiesMetric", [delta.beforeCounts.cookies, delta.afterDenyCounts.cookies]))}</span>
      <span>${escapeHtml(t("thirdPartyHostsMetric", [delta.beforeCounts.thirdPartyHosts, delta.afterDenyCounts.thirdPartyHosts]))}</span>
    </div>
    ${delta.denyAction.clicked ? `<p class="muted">${escapeHtml(t("clickedDenyControl", delta.denyAction.label || t("detectedButton")))}</p>` : `<p class="error">${escapeHtml(t("noDenyButtonClicked"))}</p>`}
    ${cookieItems.length ? `<h3>${escapeHtml(t("cookiesStillPresent"))}</h3>${cookieItems.map((cookie) => `<p class="chip">${escapeHtml(cookie.name)} · ${escapeHtml(cookie.domain)} · ${escapeHtml(cookie.service)}</p>`).join("")}` : ""}
    ${delta.thirdPartyHosts.length ? `<h3>${escapeHtml(t("thirdPartyTrafficAfterOptOut"))}</h3>${delta.thirdPartyHosts.slice(0, 10).map((host) => `<p class="chip">${escapeHtml(host)}</p>`).join("")}` : ""}
  `;
}

function renderError(error) {
  elements.bannerResult.classList.remove("skeleton");
  elements.bannerResult.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
}

async function ensureContentScript(tabId) {
  try {
    await sendToTab(tabId, { target: "cookiebuddy-content", type: "ANALYZE_PAGE" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content.js"]
    });
  }
}

async function getCookiesForTab(tab) {
  const url = new URL(tab.url);
  return chrome.cookies.getAll({ domain: url.hostname });
}

async function persistLastScan() {
  await chrome.storage.local.set({
    cookiebuddyLastScan: {
      analysis: state.analysis,
      cookies: state.cookies.map(formatCookie),
      traffic: normalizeTraffic(state.traffic, state.analysis.host)
    }
  });
}

function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

function setStatus(key, mode) {
  state.statusKey = key;
  state.statusMode = mode;
  elements.statusPill.textContent = t(key);
  elements.statusPill.dataset.mode = mode;
}

function formatCookie(cookie) {
  return {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    service: serviceForCookie(cookie)
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyLocalizedText() {
  elements.languageSelect.value = getLanguage();
  applyI18n();
  document.querySelector("#languageSelect").setAttribute("aria-label", t("languageLabel"));
}
