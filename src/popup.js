import { applyI18n, getLanguage, initI18n, setLanguage, t } from "./i18n.js";
import { buildDelta, capitalize, getBaseDomain, isEssentialCookie, isEssentialHost, normalizeTraffic, serviceForCookie } from "./core.js";

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
  statusCard: document.querySelector("#statusCard"),
  scanStatusText: document.querySelector("#scanStatusText"),
  statusCardText: document.querySelector("#statusCardText"),
  currentPageLabel: document.querySelector("#currentPageLabel"),
  overviewGrid: document.querySelector("#overviewGrid"),
  bannerResult: document.querySelector("#bannerResult"),
  categoryResult: document.querySelector("#categoryResult"),
  cookieResult: document.querySelector("#cookieResult"),
  cookieCount: document.querySelector("#cookieCount"),
  deltaResult: document.querySelector("#deltaResult"),
  contactResult: document.querySelector("#contactResult"),
  bannerOverviewButton: document.querySelector("#bannerOverviewButton"),
  bannerOverviewStatus: document.querySelector("#bannerOverviewStatus"),
  detailsLink: document.querySelector("#detailsLink"),
  refreshButton: document.querySelector("#refreshButton"),
  deltaButton: document.querySelector("#deltaButton"),
  languageSelect: document.querySelector("#languageSelect"),
  helpButton: document.querySelector("#helpButton"),
  helpPanel: document.querySelector("#helpPanel")
};

const deltaGuide = "1) Reloads the page without cache.\n2) Tries to find the banner and a reject option.\n3) If no reject option is found, reject cookies manually and run the check again.\n4) Opens the result in a new tab.";

elements.refreshButton.addEventListener("click", () => scanCurrentTab());
document.querySelector("#heroScanButton")?.addEventListener("click", () => scanCurrentTab());
elements.deltaButton.addEventListener("click", () => runDeltaCheck());
elements.bannerOverviewButton?.addEventListener("click", () => openBannerOverview());
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
    await updateIconStatus();
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

  const confirmed = window.confirm(t("deltaConsentPrompt"));
  if (!confirmed) {
    elements.deltaResult.innerHTML = `<p class="muted">${escapeHtml(t("deltaConsentCancelled"))}</p>`;
    setStatus("statusChecked", "ok");
    return;
  }

  setStatus("statusChecking", "busy");
  elements.deltaButton.disabled = true;
  elements.deltaButton.title = deltaGuide;
  elements.deltaResult.innerHTML = `<p class="muted">${escapeHtml(t("deltaCheckingDescription"))}</p>`;

  try {
    const before = await snapshot(t("snapshotCurrentState"));
    const denyResult = await sendToTab(state.tab.id, { target: "cookiebuddy-content", type: "TRY_DENY_ALL" });
    await chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "CLEAR_TRAFFIC", tabId: state.tab.id });
    await wait(1800);
    const afterDeny = await snapshot(t("snapshotAfterDenyAll"));
    const delta = buildDelta({
      beforeCookies: before.cookies,
      afterCookies: afterDeny.cookies,
      beforeTraffic: before.thirdPartyTraffic,
      afterTraffic: afterDeny.thirdPartyTraffic,
      afterStorageEntries: afterDeny.analysis?.storage?.items || [],
      banner: afterDeny.analysis?.banner || before.analysis?.banner || null,
      bannerCategories: afterDeny.analysis?.categories || before.analysis?.categories || {},
      denyClicked: denyResult?.clicked,
      denyLabel: denyResult?.label,
      manualConsentConfirmed: !denyResult?.found,
      labels: {
        deltaFoundSummary: t("deltaFoundSummary"),
        noDeltaSummary: t("noDeltaSummary")
      },
      tabUrl: state.tab.url
    });

    await chrome.storage.local.set({ cookiebuddyLastDelta: delta });
    renderDelta(delta);
    await openDeltaTab(delta);
    await updateIconStatus(delta);
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
  renderCurrentPage();
  renderStatusCard();
  renderOverview();
  renderBanner();
  renderLegend();
  renderCategories();
  renderCookies();
  renderContacts();
}

// Updates the main status card so the toolbar-badge meaning is visible inside the popup.
function renderStatusCard() {
  if (!elements.statusCard) return;
  const badgeStatus = determineIconStatus();
  const statusMeta = {
    green: {
      title: t("legendGreenTitle"),
      body: t("legendGreenBody")
    },
    yellow: {
      title: t("legendYellowTitle"),
      body: t("legendYellowBody")
    },
    red: {
      title: t("legendRedTitle"),
      body: t("legendRedBody")
    }
  }[badgeStatus];

  elements.statusCard.dataset.status = badgeStatus;
  elements.statusCard.querySelector(".status-icon")?.setAttribute("data-status", badgeStatus);
  if (elements.statusCardText) {
  elements.statusCardText.innerHTML = `${escapeHtml(t("statusReady"))}: <strong>${escapeHtml(statusMeta.title)}</strong>`;
    const banner = state.analysis?.banner;
    if (banner) {
      elements.statusCardText.textContent = `${t("detectedLabel")}: ${banner.name} · ${t("confidenceLabel")}: ${banner.confidence}`;
    }
  }
  const intro = elements.statusCard.querySelector(".hero-intro");
  if (intro) intro.textContent = statusMeta.body;
}

// Renders the compact metric tiles at the top of the popup from the latest scan data.
function renderOverview() {
  if (!elements.overviewGrid || !state.analysis) return;

  const categories = state.analysis.categories || {};
  const serviceCount = Object.values(categories).reduce((total, category) => total + (category.services?.length || 0), 0);
  const storage = state.analysis.storage || {};
  const thirdPartyCount = normalizeTraffic(state.traffic || [], state.analysis.host || "").length;
  const suspiciousCookies = (state.cookies || []).filter((cookie) => !/session|csrf|xsrf|auth|consent|cookie|privacy|necessary/i.test(cookie.name)).length;
  const bannerName = state.analysis.banner?.name || t("noSourceDetected");

  elements.overviewGrid.innerHTML = [
    renderOverviewTile("purple", "✓", t("bannerHeading"), bannerName, ""),
    renderOverviewTile("blue", "≡", t("servicesByCategoryHeading"), serviceCount, ""),
    renderOverviewTile("orange", "●", t("cookiesTrafficHeading"), state.cookies.length, suspiciousCookies ? `${suspiciousCookies} ${t("reviewRecommended").toLowerCase()}` : ""),
    renderOverviewTile("navy", "↗", t("thirdPartyTrafficAfterOptOut"), thirdPartyCount, "")
    , renderOverviewTile("green", "▣", t("localStorageHeading"), (storage.items || []).length, t("storageCount", [storage.localStorageKeys?.length || 0, storage.sessionStorageKeys?.length || 0]))
  ].join("");
}

function renderOverviewTile(tone, icon, label, value, note) {
  const valueClass = /^\d+$/.test(String(value)) ? "overview-value numeric" : "overview-value";
  return `
    <article class="overview-tile ${tone}">
      <span class="tile-icon ${tone}" aria-hidden="true">${escapeHtml(icon)}</span>
      <div>
        <span>${escapeHtml(label)}</span>
        <strong class="${valueClass}">${escapeHtml(value)}</strong>
        ${note ? `<small>${escapeHtml(note)}</small>` : ""}
      </div>
    </article>
  `;
}

function renderBanner() {
  const banner = state.analysis.banner;
  const sourceLabel = banner.source?.host || banner.source?.value || banner.evidence?.[0]?.value || t("noSourceDetected");
  elements.bannerResult.classList.remove("skeleton");
  elements.bannerResult.innerHTML = `
    <div class="banner-summary">
      <span class="tile-icon purple" aria-hidden="true">✓</span>
      <div>
        <span class="label">${escapeHtml(t("detectedLabel"))}</span>
        <strong>${escapeHtml(banner.name)}</strong>
        <p class="muted">${escapeHtml(t("confidenceLabel"))}: ${escapeHtml(banner.confidence)}</p>
      </div>
    </div>
    <details class="full-width banner-source">
      <summary class="label">${escapeHtml(t("sourceEvidenceLabel"))}</summary>
      <div class="banner-source-content">
        <strong>${escapeHtml(sourceLabel)}</strong>
      </div>
    </details>
  `;
}

function renderLegend() {
  const badgeStatus = determineIconStatus();
  const legendMeta = {
    green: {
      title: t("legendGreenTitle"),
      body: t("legendGreenBody")
    },
    yellow: {
      title: t("legendYellowTitle"),
      body: t("legendYellowBody")
    },
    red: {
      title: t("legendRedTitle"),
      body: t("legendRedBody")
    }
  };

  const legendMap = [
    ["green", "legendGreen"],
    ["yellow", "legendYellow"],
    ["red", "legendRed"]
  ];

  const legendGrid = document.querySelector("#legendGrid");
  if (!legendGrid) return;

  const items = legendMap.map(([status, key]) => {
    const meta = legendMeta[status];
    const active = status === badgeStatus;
    return `
      <div class="legend-item" data-status="${status}" ${active ? 'data-current="true" aria-current="true"' : ""}>
        <span class="legend-dot ${status}" aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(meta.title)}${active ? ` <span class="legend-current">${escapeHtml(t("legendCurrent"))}</span>` : ""}</strong>
          <p class="muted">${escapeHtml(meta.body)}${status === "green" ? ` ${escapeHtml(t("legendBadgeNote"))}` : ""}</p>
        </div>
      </div>
    `;
  });

  legendGrid.innerHTML = items.join("");
}

function renderCategories() {
  const categories = state.analysis.categories;
  const tones = ["green", "orange", "red", "purple", "blue"];
  elements.categoryResult.innerHTML = Object.entries(categories)
    .map(([name, data], index) => `
      <article class="category-card ${tones[index % tones.length]}">
        <span class="category-dot ${tones[index % tones.length]}" aria-hidden="true"></span>
        <div>
          <span>${escapeHtml(t(`category${capitalize(name)}`))}</span>
          <strong>${data.services.length}</strong>
        </div>
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
    ${totalCookies === 0 && totalLocalItems === 0 ? `<p class="empty-state" role="status" aria-live="polite">${escapeHtml(t("cookiesTrafficEmptyState"))}</p>` : ""}
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
  const dpoEmail = dpo?.email || "";
  const dpoMail = dpoEmail ? `mailto:${encodeURIComponent(dpoEmail)}?subject=${subject}&body=${encodeURIComponent(buildMailBody("access"))}` : "";
  const correctionMail = dpoEmail ? `mailto:${encodeURIComponent(dpoEmail)}?subject=${encodeURIComponent(t("correctionMailSubject", state.analysis.host))}&body=${encodeURIComponent(buildMailBody("correction"))}` : "";
  const deletionMail = dpoEmail ? `mailto:${encodeURIComponent(dpoEmail)}?subject=${encodeURIComponent(t("deletionMailSubject", state.analysis.host))}&body=${encodeURIComponent(buildMailBody("deletion"))}` : "";
  const authorityMail = authority.url;
  const authorityName = authority.key === "german" ? t("germanAuthorityName") : authority.key === "fallback" ? t("bfdiName") : authority.name;
  const authorityNote = authority.key === "german" ? t("germanAuthorityNote") : authority.key === "fallback" ? t("bfdiNote") : authority.note;
  const dpoSourceLink = dpo?.sourceUrl && /^https?:$/.test(new URL(dpo.sourceUrl).protocol)
    ? `<a class="text-link" id="contactSourcePage" href="${escapeHtml(dpo.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(dpo.source || t("privacyPolicySource"))}</a>`
    : `<span class="muted" id="contactSourcePage">${escapeHtml(dpo?.source || t("privacyPolicySource"))}</span>`;
  const dpoName = dpo?.name || t("dpoLabel");
  const accessAria = dpoEmail ? `${t("accessRequestButton")} – ${dpoName}` : t("accessRequestButton");
  const correctionAria = dpoEmail ? `${t("correctionRequestButton")} – ${dpoName}` : t("correctionRequestButton");
  const deletionAria = dpoEmail ? `${t("deletionRequestButton")} – ${dpoName}` : t("deletionRequestButton");

  elements.contactResult.innerHTML = `
    <div class="contact-item" aria-labelledby="contactDpoLabel" aria-describedby="contactDraftHint contactEditReminder contactSourceHint">
      <span class="label">${escapeHtml(t("dpoLabel"))}</span>
      <strong id="contactDpoLabel">${escapeHtml(dpoEmail || t("noDpoEmailFound"))}</strong>
      <p class="muted" id="contactDraftHint">${escapeHtml(t("contactDraftHint"))}</p>
      <div class="contact-actions">
        ${dpoMail ? `<a class="primary-button small" href="${dpoMail}" aria-label="${escapeHtml(accessAria)}" title="${escapeHtml(accessAria)}">${escapeHtml(t("accessRequestButton"))}</a>` : ""}
        ${correctionMail ? `<a class="ghost-button small" href="${correctionMail}" aria-label="${escapeHtml(correctionAria)}" title="${escapeHtml(correctionAria)}">${escapeHtml(t("correctionRequestButton"))}</a>` : ""}
        ${deletionMail ? `<a class="ghost-button small" href="${deletionMail}" aria-label="${escapeHtml(deletionAria)}" title="${escapeHtml(deletionAria)}">${escapeHtml(t("deletionRequestButton"))}</a>` : ""}
      </div>
      <p class="muted" id="contactEditReminder">${escapeHtml(t("contactEditReminder"))}</p>
      ${dpoSourceLink}
      <a class="text-link" id="contactSourceHint" href="https://www.bfdi.bund.de/DE/Buerger/Mustertexte/Zwischenordner-f%C3%BCr-Mustertexte/Mustertexte_Allgemein.html?nn=340980" target="_blank" rel="noreferrer" aria-label="${escapeHtml(`${t("bfdiSourceLink")} – BfDI`) }" title="${escapeHtml(t("bfdiSourceLink"))}">${escapeHtml(t("bfdiSourceLink"))}</a>
    </div>
    <div class="contact-item" aria-labelledby="contactAuthorityLabel" aria-describedby="contactAuthorityNote">
      <span class="label">${escapeHtml(t("authorityLabel"))}</span>
      <strong id="contactAuthorityLabel">${escapeHtml(authorityName)}</strong>
      <p class="muted" id="contactAuthorityNote">${escapeHtml(authorityNote)}</p>
      <a class="ghost-button small" href="${escapeHtml(authorityMail)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(`${t("openAuthorityDetails")} – ${authorityName}`)}" title="${escapeHtml(t("openAuthorityDetails"))}">${escapeHtml(t("openAuthorityDetails"))}</a>
    </div>
  `;
}

function buildMailBody(kind) {
  const intro = t("mailGreeting");
  const company = state.analysis.host || state.tab?.url || "";
  const closing = t("mailClosing");

  const templates = {
    access: [
      intro,
      "",
      t("accessMailBody", company),
      "",
      t("mailPersonalizeHint"),
      "",
      closing
    ],
    correction: [
      intro,
      "",
      t("correctionMailBody", company),
      "",
      t("mailPersonalizeHint"),
      "",
      closing
    ],
    deletion: [
      intro,
      "",
      t("deletionMailBody", company),
      "",
      t("mailPersonalizeHint"),
      "",
      closing
    ]
  };

  return templates[kind].filter(Boolean).join("\n");
}

function renderDelta(delta) {
  const cookieItems = [...delta.remainingCookies, ...delta.newCookies].slice(0, 8);
  elements.deltaResult.innerHTML = `
    <div class="risk ${delta.riskLevel} delta-summary-card">
      <div>
        <strong>${delta.riskLevel === "high" ? escapeHtml(t("deltaFoundTitle")) : escapeHtml(t("noObviousDeltaTitle"))}</strong>
        <p>${escapeHtml(delta.summary)}</p>
      </div>
      <span class="status-chevron" aria-hidden="true">›</span>
    </div>
    <div class="delta-mini-grid">
      <span><strong>${escapeHtml(delta.afterDenyCounts.cookies)}</strong>${escapeHtml(t("cookiesStillVisibleMetric"))}</span>
      <span><strong>${escapeHtml(delta.afterDenyCounts.thirdPartyHosts)}</strong>${escapeHtml(t("thirdPartyStillContactedMetric"))}</span>
      <span><strong>${escapeHtml(delta.remainingStorageEntries?.length || 0)}</strong>${escapeHtml(t("storageStillVisibleMetric"))}</span>
    </div>
    ${delta.denyAction.clicked ? `<p class="muted">${escapeHtml(t("clickedDenyControl", delta.denyAction.label || t("detectedButton")))}</p>` : `<p class="muted">${escapeHtml(t("manualDenyAssumed"))}</p>`}
    ${cookieItems.length ? `<h3>${escapeHtml(t("nonEssentialCookiesStillPresent"))}</h3>${cookieItems.map((cookie) => `<p class="chip">${escapeHtml(cookie.name)} · ${escapeHtml(cookie.domain)} · ${escapeHtml(cookie.service)}</p>`).join("")}` : ""}
    ${delta.thirdPartyHosts.length ? `<h3>${escapeHtml(t("nonEssentialThirdPartyTrafficAfterOptOut"))}</h3>${delta.thirdPartyHosts.slice(0, 10).map((host) => `<p class="chip">${escapeHtml(host)}</p>`).join("")}` : ""}
    ${delta.essentialThirdPartyHosts?.length ? `<h3>${escapeHtml(t("essentialThirdPartyTrafficAllowed"))}</h3>${delta.essentialThirdPartyHosts.slice(0, 10).map((host) => `<p class="chip">${escapeHtml(host)}</p>`).join("")}` : ""}
    ${delta.serviceAudit?.length ? `<section class="service-audit"><h3>${escapeHtml(t("serviceAuditHeading"))}</h3><p class="muted">${escapeHtml(t("serviceAuditIntro"))}</p>${delta.serviceAudit.map(renderServiceAudit).join("")}</section>` : ""}
  `;
}

function renderCurrentPage() {
  if (!elements.currentPageLabel) return;
  const pageUrl = state.tab?.url || state.analysis?.url || "";
  elements.currentPageLabel.textContent = pageUrl ? new URL(pageUrl).hostname : "";
  elements.currentPageLabel.title = pageUrl;
}

function renderServiceAudit(service) {
  const statusLabel = {
    "allowed-essential": t("serviceStatusEssential"),
    disabled: t("serviceStatusDisabled"),
    active: t("serviceStatusActive"),
    unclear: t("serviceStatusUnclear")
  }[service.status] || t("serviceStatusUnclear");
  const listedLabel = service.listedInBanner ? t("serviceListedInBanner") : t("serviceNotListedInBanner");
  return `<div class="service-audit-row"><div><strong>${escapeHtml(service.name)}</strong><span>${escapeHtml(service.source || service.category)}</span></div><div><span class="audit-badge ${escapeHtml(service.status)}">${escapeHtml(statusLabel)}</span><small>${escapeHtml(listedLabel)}</small></div></div>`;
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

async function openDeltaTab(delta) {
  await chrome.storage.local.set({ cookiebuddyLastDelta: delta });
  await chrome.tabs.create({
    url: chrome.runtime.getURL("details.html?view=delta")
  });
}

async function openBannerOverview() {
  if (!state.tab) return;

  setStatus("statusChecking", "busy");
  elements.bannerOverviewButton.disabled = true;
  elements.bannerOverviewStatus.textContent = t("bannerOverviewSearching");
  elements.bannerOverviewStatus.dataset.state = "busy";

  try {
    await ensureContentScript(state.tab.id);
    const response = await sendToTab(state.tab.id, { target: "cookiebuddy-content", type: "OPEN_BANNER_OVERVIEW" });
    if (!response?.found) {
      elements.bannerOverviewStatus.textContent = t("bannerOverviewNotFound");
      elements.bannerOverviewStatus.dataset.state = "warn";
      throw new Error(t("bannerOverviewFailed"));
    }
    if (response.clicked) {
      elements.bannerOverviewStatus.textContent = t("bannerOverviewOpened", response.label || t("detectedButton"));
      elements.bannerOverviewStatus.dataset.state = "ok";
      setStatus("statusChecked", "ok");
    } else {
      elements.bannerOverviewStatus.textContent = t("bannerOverviewFoundButNotOpened", response.label || t("detectedButton"));
      elements.bannerOverviewStatus.dataset.state = "warn";
      throw new Error(t("bannerOverviewFailed"));
    }
  } catch (error) {
    setStatus("statusCheckFailed", "warn");
    if (!elements.bannerOverviewStatus.textContent) {
      elements.bannerOverviewStatus.textContent = t("bannerOverviewFailed");
      elements.bannerOverviewStatus.dataset.state = "warn";
    }
  } finally {
    elements.bannerOverviewButton.disabled = false;
  }
}

async function updateIconStatus(delta = null) {
  const status = determineIconStatus(delta);
  await chrome.runtime.sendMessage({
    target: "cookiebuddy-background",
    type: "SET_ICON_STATUS",
    tabId: state.tab?.id,
    status
  });
}

function determineIconStatus(delta = null) {
  if (delta) {
    if (delta.riskLevel === "high") return "red";
    if (delta.denyAction?.clicked && delta.thirdPartyHosts.length === 0 && delta.newCookies.length === 0 && delta.remainingCookies.length === 0) {
      return "green";
    }
    return "yellow";
  }

  const banner = state.analysis?.banner;
  const traffic = normalizeTraffic(state.traffic || [], state.analysis?.host || "");
  const visibleCookies = state.cookies || [];
  const suspiciousCookies = visibleCookies.filter((cookie) => !isEssentialCookie(cookie));
  const hasNonEssentialThirdPartyTraffic = traffic.some((item) => !isEssentialHost(item.host));

  if (!banner || banner.confidence === "none") return "yellow";
  if (hasNonEssentialThirdPartyTraffic || suspiciousCookies.length > 0) return "yellow";
  return "green";
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
  const scanMessage = key === "statusReady"
    ? t("scanStatusReady")
    : key === "statusScanning"
      ? t("scanStatusScanning")
      : key === "statusNeedsAccess"
        ? t("scanStatusNeedsAccess")
        : key === "statusChecking"
          ? t("scanStatusChecking")
          : key === "statusDeltaFound"
            ? t("scanStatusDeltaFound")
            : key === "statusCheckFailed"
              ? t("scanStatusFailed")
              : t("scanStatusChecked");
  if (elements.scanStatusText) {
    elements.scanStatusText.textContent = scanMessage;
    elements.scanStatusText.dataset.mode = mode;
  }
  if (elements.statusCardText && key !== "statusReady") {
    elements.statusCardText.textContent = scanMessage;
    elements.statusCardText.dataset.mode = mode;
  }
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
  document.querySelector("#languageSelect").setAttribute("aria-label", t("languageAriaLabel"));
}
