import { applyI18n, getLanguage, initI18n, setLanguage, t } from "./i18n.js";
import { buildDelta, capitalize, createCoverageSummary, deriveAuditVerdict, getBaseDomain, isEssentialCookie, isEssentialHost, normalizeTraffic, serviceForCookie, serviceRuleForCookie } from "./core.js";
import { AUDIT_LIFECYCLE_STATUS } from "./audit-lifecycle.mjs";
import { canCaptureVisibleTab, createAuditTimelineEvent, createVisualEvidenceItem, createVisualEvidenceState, sanitizeEvidenceUrl } from "./visual-evidence.mjs";
import { createCookieCoverage, getObservedCookieHosts } from "./cookie-evidence.mjs";
import { LOCAL_AUDIT_STORAGE_KEYS } from "./audit-storage.mjs";
import { createAuditReport } from "./audit-report.mjs";
import { collectMainWorldConsentState, mergeConsentStates } from "./consent-state.mjs";

const state = {
  tab: null,
  analysis: null,
  cookies: [],
  traffic: [],
  statusMode: "ok",
  statusKey: "statusReady",
  verdict: null,
  delta: null,
  auditLifecycle: null
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
  visualEvidenceToggle: document.querySelector("#visualEvidenceToggle"),
  auditSteps: document.querySelector("#auditSteps"),
  auditProgressBar: document.querySelector("#auditProgressBar"),
  languageSelect: document.querySelector("#languageSelect"),
  helpButton: document.querySelector("#helpButton"),
  helpPanel: document.querySelector("#helpPanel"),
  deleteLocalAuditDataButton: document.querySelector("#deleteLocalAuditDataButton"),
  deleteLocalAuditDataStatus: document.querySelector("#deleteLocalAuditDataStatus")
};

const deltaGuide = "1) Reloads the page without cache.\n2) Tries to find the banner and a reject option.\n3) If no reject option is found, reject cookies manually and run the check again.\n4) Opens the result in a new tab.";
const DEFAULT_AUDIT_MAX_DURATION_MS = 30_000;
const DEFAULT_AUDIT_OBSERVATION_WINDOW_MS = 1_800;
const MAX_COOKIE_HOST_QUERIES = 40;
const POPUP_INSTANCE_ID = `popup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

class AuditLifecycleError extends Error {
  constructor(message, status = AUDIT_LIFECYCLE_STATUS.incomplete, reason = "audit-lifecycle-interruption") {
    super(message);
    this.name = "AuditLifecycleError";
    this.status = status;
    this.reason = reason;
  }
}

elements.refreshButton.addEventListener("click", () => scanCurrentTab());
document.querySelector("#heroScanButton")?.addEventListener("click", () => scanCurrentTab());
elements.deltaButton.addEventListener("click", () => runDeltaCheck());
elements.bannerOverviewButton?.addEventListener("click", () => openBannerOverview());
elements.deleteLocalAuditDataButton?.addEventListener("click", () => void deleteLocalAuditData());
elements.helpButton.addEventListener("click", () => {
  const isOpen = !elements.helpPanel.hidden;
  elements.helpPanel.hidden = isOpen;
  elements.helpButton.setAttribute("aria-expanded", String(!isOpen));
});
elements.languageSelect.addEventListener("change", async (event) => {
  await setLanguage(event.target.value);
  applyLocalizedText();
  if (state.analysis) render();
  if (state.delta && state.verdict) renderDelta(state.delta, state.verdict);
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
    const lifecyclePromise = getAuditLifecycleState(tab.id);
    await ensureContentScript(tab.id);

    const [analysis, trafficResponse, mainWorldConsent] = await Promise.all([
      sendToTab(tab.id, { target: "cookiebuddy-content", type: "ANALYZE_PAGE" }),
      chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "GET_TRAFFIC", tabId: tab.id }),
      readMainWorldConsentState(tab.id)
    ]);
    if (mainWorldConsent) analysis.consentState = mergeConsentStates(analysis.consentState, mainWorldConsent);
    const cookieSnapshot = await getCookiesForTab(tab, trafficResponse?.traffic || [], analysis.resources || []);

    state.analysis = analysis;
    state.cookies = cookieSnapshot.cookies;
    state.cookieCoverage = cookieSnapshot.coverage;
    state.traffic = [...(trafficResponse?.traffic || []), ...(analysis.resources || [])];
    state.auditLifecycle = await lifecyclePromise;
    await persistLastScan();
    await updateIconStatus();
    render();
    setStatus(state.auditLifecycle?.status === AUDIT_LIFECYCLE_STATUS.incomplete || state.auditLifecycle?.status === AUDIT_LIFECYCLE_STATUS.failed ? "statusAuditIncomplete" : "statusReady", state.auditLifecycle?.status === AUDIT_LIFECYCLE_STATUS.completed ? "ok" : state.auditLifecycle ? "warn" : "ok");
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
  resetAuditProgress();
  setAuditStep("prepare", "active");
  elements.deltaButton.disabled = true;
  elements.deltaButton.title = deltaGuide;
  elements.deltaResult.innerHTML = `<p class="muted">${escapeHtml(t("deltaCheckingDescription"))}</p>`;
  const auditStartedAt = Date.now();
  let auditMaxDurationMs = DEFAULT_AUDIT_MAX_DURATION_MS;
  let auditOutcome = { status: AUDIT_LIFECYCLE_STATUS.failed, reason: "audit-error" };
  let lifecycleState = null;
  const visualEvidenceEnabled = elements.visualEvidenceToggle?.checked === true;
  const auditTimeline = [];
  const controlledReloads = [];
  const visualEvidenceItems = [];
  const recordAuditEvent = (step, evidenceIds = []) => {
    auditTimeline.push(createAuditTimelineEvent(step, new Date().toISOString(), evidenceIds));
    void sendAuditLifecycleEvent("step", { phase: step });
  };

  try {
    const auditStartResponse = await chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "START_AUDIT", tabId: state.tab.id, tabUrl: sanitizeEvidenceUrl(state.tab.url), controllerId: POPUP_INSTANCE_ID, auditId: `audit-${Date.now()}` });
    auditMaxDurationMs = auditStartResponse?.maxDurationMs || DEFAULT_AUDIT_MAX_DURATION_MS;
    lifecycleState = auditStartResponse?.state || null;
    state.auditLifecycle = lifecycleState;
    try {
      await installNavigationMonitor(state.tab.id);
    } catch {
      throw new AuditLifecycleError(t("auditNavigationMonitorUnavailable"), AUDIT_LIFECYCLE_STATUS.incomplete, "navigation-monitor-unavailable");
    }
    recordAuditEvent("prepare");
    assertAuditBudget(auditStartedAt, auditMaxDurationMs);
    setAuditStep("prepare", "complete");
    setAuditStep("baseline", "active", t("auditReloadBaselineProgress"));
    controlledReloads.push(await controlledReloadForAudit("baseline-reload", auditStartedAt, auditMaxDurationMs));
    const before = await snapshot(t("snapshotBaselineAfterReload"));
    assertAuditBudget(auditStartedAt, auditMaxDurationMs);
    const beforeVisualEvidence = await captureVisualEvidence("before", "baseline", visualEvidenceEnabled, auditStartedAt, auditMaxDurationMs);
    visualEvidenceItems.push(beforeVisualEvidence);
    recordAuditEvent("baseline-reload", [beforeVisualEvidence.id]);
    setAuditStep("baseline", "complete");
    setAuditStep("consent", "complete");
    setAuditStep("reject", "active");
    const denyResult = await sendToTab(state.tab.id, { target: "cookiebuddy-content", type: "TRY_DENY_ALL" });
    if (visualEvidenceItems[0]) visualEvidenceItems[0].rejectControlLabel = String(denyResult?.label || "").slice(0, 160);
    recordAuditEvent("reject");
    setAuditStep("reject", denyResult?.found ? "complete" : "manual", denyResult?.found ? "" : t("auditManualAction"));
    setAuditStep("verify", denyResult?.verified ? "complete" : "manual", denyResult?.verified ? "" : t("auditManualAction"));
    recordAuditEvent("verify");
    setAuditStep("observe", "active");
    await chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "CLEAR_TRAFFIC", tabId: state.tab.id });
    setAuditStep("observe", "active", t("auditReloadAfterRejectProgress"));
    controlledReloads.push(await controlledReloadForAudit("post-rejection-reload", auditStartedAt, auditMaxDurationMs));
    const observationWindowMs = Math.min(DEFAULT_AUDIT_OBSERVATION_WINDOW_MS, Math.max(0, auditMaxDurationMs - (Date.now() - auditStartedAt)));
    const observationStartedAt = new Date().toISOString();
    setAuditStep("observe", "active", t("auditObservationProgress", Math.ceil(observationWindowMs / 1000)));
    await wait(observationWindowMs);
    const observationEndedAt = new Date().toISOString();
    assertAuditBudget(auditStartedAt, auditMaxDurationMs);
    recordAuditEvent("observe");
    setAuditStep("observe", "complete");
    setAuditStep("capture", "active");
    const afterDeny = await snapshot(t("snapshotAfterDenyAll"));
    assertAuditBudget(auditStartedAt, auditMaxDurationMs);
    const afterVisualEvidence = await captureVisualEvidence("after", "capture", visualEvidenceEnabled, auditStartedAt, auditMaxDurationMs, denyResult?.label);
    visualEvidenceItems.push(afterVisualEvidence);
    recordAuditEvent("capture", [afterVisualEvidence.id]);
    setAuditStep("capture", "complete");
    setAuditStep("analyze", "active");
    lifecycleState = await getAuditLifecycleState(state.tab.id);
    if (lifecycleState?.status && lifecycleState.status !== AUDIT_LIFECYCLE_STATUS.running) {
      throw new AuditLifecycleError(t("auditLifecycleInterrupted"), lifecycleState.status, lifecycleState.reason || "audit-lifecycle-interruption");
    }
    const delta = buildDelta({
      beforeCookies: before.cookies,
      afterCookies: afterDeny.cookies,
      beforeCookieCoverage: before.cookieCoverage,
      afterCookieCoverage: afterDeny.cookieCoverage,
      afterStorage: afterDeny.analysis?.storage || null,
      beforeTraffic: before.thirdPartyTraffic,
      afterTraffic: afterDeny.thirdPartyTraffic,
      afterStorageEntries: afterDeny.analysis?.storage?.items || [],
      banner: afterDeny.analysis?.banner || before.analysis?.banner || null,
      bannerCategories: afterDeny.analysis?.categories || before.analysis?.categories || {},
      denyClicked: denyResult?.clicked,
      denyVerified: denyResult?.verified,
      denyLabel: denyResult?.label,
      denyVerification: denyResult?.verification,
      inaccessibleConsentSurfaces: afterDeny.analysis?.inaccessibleConsentSurfaces || before.analysis?.inaccessibleConsentSurfaces || [],
      beforeAnalysis: before.analysis,
      afterAnalysis: afterDeny.analysis,
      blockedRequests: [...(before.blockedRequests || []), ...(afterDeny.blockedRequests || [])],
      controlledReloads,
      observationWindow: {
        phase: "post-rejection",
        requestedMs: observationWindowMs,
        observedMs: Math.max(0, Date.parse(observationEndedAt) - Date.parse(observationStartedAt)),
        startedAt: observationStartedAt,
        endedAt: observationEndedAt,
        status: "completed"
      },
      manualConsentConfirmed: !denyResult?.found,
      labels: {
        deltaFoundSummary: t("deltaFoundSummary"),
        noDeltaSummary: t("noDeltaSummary")
      },
      tabUrl: sanitizeEvidenceUrl(state.tab.url)
    });
    delta.auditLifecycle = {
      ...(lifecycleState || {}),
      status: AUDIT_LIFECYCLE_STATUS.completed,
      events: [...(lifecycleState?.events || []), ...auditTimeline].slice(-60)
    };
    delta.visualEvidence = createVisualEvidenceState({
      enabled: visualEvidenceEnabled,
      items: visualEvidenceItems,
      rejectControlLabel: denyResult?.label
    });
    delta.coverage = createCoverageSummary({ delta, analysisComplete: Boolean(afterDeny.analysis) });
    recordAuditEvent("analyze");
    delta.auditTimeline = auditTimeline;
    const verdict = deriveAuditVerdict(delta, { analysisComplete: Boolean(afterDeny.analysis) });
    delta.verdict = verdict;
    await attachAuditReport(delta);
    auditOutcome = { status: verdict.status === "incomplete" ? AUDIT_LIFECYCLE_STATUS.incomplete : AUDIT_LIFECYCLE_STATUS.completed, reason: verdict.status === "incomplete" ? "verdict-incomplete" : "" };
    const persistedDelta = await persistAuditDelta(delta);
    state.delta = persistedDelta;
    state.verdict = verdict;
    setAuditStep("analyze", "complete");

    renderDelta(persistedDelta, verdict);
    await openDeltaTab(persistedDelta);
    await updateIconStatus(persistedDelta);
    setStatus(verdict.status === "negative" ? "statusDeltaFound" : verdict.status === "incomplete" ? "statusAuditIncomplete" : verdict.status === "review" ? "statusReviewRecommended" : "statusChecked", verdict.status === "positive" ? "ok" : "warn");
    renderAuditVerdict(persistedDelta, verdict);
  } catch (error) {
    const activeStep = [...document.querySelectorAll?.("#auditSteps [data-state=active]") || []][0];
    if (activeStep) setAuditStep(activeStep.dataset.step, "failed");
    auditOutcome = error instanceof AuditLifecycleError
      ? { status: error.status, reason: error.reason }
      : { status: AUDIT_LIFECYCLE_STATUS.failed, reason: "audit-error" };
    state.auditLifecycle = await getAuditLifecycleState(state.tab?.id);
    const fallback = createIncompleteAuditDelta(auditOutcome, state.auditLifecycle, error.message || t("deltaCheckFailed"));
    const fallbackVerdict = deriveAuditVerdict(fallback, { analysisComplete: false });
    fallback.verdict = fallbackVerdict;
    await attachAuditReport(fallback);
    state.delta = fallback;
    state.verdict = fallbackVerdict;
    await persistAuditDelta(fallback);
    renderDelta(fallback, fallbackVerdict);
    setStatus(auditOutcome.status === AUDIT_LIFECYCLE_STATUS.failed ? "statusCheckFailed" : "statusAuditIncomplete", "warn");
  } finally {
    try {
      await chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "STOP_AUDIT", tabId: state.tab?.id, status: auditOutcome.status, reason: auditOutcome.reason });
    } catch {
      // The service worker may have restarted; the next audit starts cleanly.
    }
    elements.deltaButton.disabled = false;
  }
}

async function getAuditLifecycleState(tabId) {
  if (tabId == null) return null;
  try {
    const response = await chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "GET_AUDIT_STATE", tabId, controllerId: POPUP_INSTANCE_ID });
    return response?.state || null;
  } catch {
    return null;
  }
}

async function deleteLocalAuditData() {
  if (!window.confirm(t("deleteLocalAuditDataConfirm"))) return;
  const button = elements.deleteLocalAuditDataButton;
  if (button) button.disabled = true;
  if (elements.deleteLocalAuditDataStatus) elements.deleteLocalAuditDataStatus.textContent = t("deleteLocalAuditDataWorking");

  try {
    await chrome.storage.local.remove(LOCAL_AUDIT_STORAGE_KEYS);
    await chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "CLEAR_LOCAL_AUDIT_DATA" });
    state.tab = null;
    state.analysis = null;
    state.cookies = [];
    state.cookieCoverage = null;
    state.traffic = [];
    state.verdict = null;
    state.delta = null;
    state.auditLifecycle = null;
    if (elements.currentPageLabel) elements.currentPageLabel.textContent = "";
    elements.deltaResult.innerHTML = `<div class="audit-empty-result"><strong>${escapeHtml(t("deleteLocalAuditDataDone"))}</strong><p>${escapeHtml(t("deleteLocalAuditDataDoneDetail"))}</p></div>`;
    elements.overviewGrid.innerHTML = "";
    elements.bannerResult.textContent = "";
    elements.categoryResult.innerHTML = "";
    elements.cookieResult.innerHTML = "";
    elements.contactResult.innerHTML = "";
    elements.cookieCount.textContent = "";
    if (elements.deleteLocalAuditDataStatus) elements.deleteLocalAuditDataStatus.textContent = t("deleteLocalAuditDataDone");
    setStatus("statusReady", "ok");
  } catch {
    if (elements.deleteLocalAuditDataStatus) elements.deleteLocalAuditDataStatus.textContent = t("deleteLocalAuditDataFailed");
    setStatus("statusCheckFailed", "warn");
  } finally {
    if (button) button.disabled = false;
  }
}

async function sendAuditLifecycleEvent(eventType, payload = {}) {
  if (state.tab?.id == null) return null;
  try {
    const response = await chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "AUDIT_EVENT", tabId: state.tab.id, eventType, ...payload });
    return response?.state || null;
  } catch {
    return null;
  }
}

async function controlledReloadForAudit(phase, auditStartedAt, auditMaxDurationMs) {
  if (typeof chrome.tabs?.reload !== "function" || typeof chrome.tabs?.onUpdated?.addListener !== "function" || typeof chrome.tabs?.onUpdated?.removeListener !== "function") {
    throw new AuditLifecycleError(t("auditReloadUnavailable"), AUDIT_LIFECYCLE_STATUS.incomplete, "controlled-reload-unavailable");
  }
  assertAuditBudget(auditStartedAt, auditMaxDurationMs);
  const startedAt = new Date().toISOString();
  const response = await chrome.runtime.sendMessage({
    target: "cookiebuddy-background",
    type: "CONTROLLED_RELOAD",
    tabId: state.tab.id,
    phase,
    url: sanitizeEvidenceUrl(state.tab.url)
  });
  if (response?.ok === false) {
    throw new AuditLifecycleError(t("auditReloadUnavailable"), AUDIT_LIFECYCLE_STATUS.incomplete, "controlled-reload-rejected");
  }

  const remainingMs = auditMaxDurationMs - (Date.now() - auditStartedAt);
  if (remainingMs <= 0) throw new AuditLifecycleError(t("auditReloadTimeout"), AUDIT_LIFECYCLE_STATUS.incomplete, "controlled-reload-timeout");
  const loadPromise = waitForTabLoad(state.tab.id, Math.min(remainingMs, 12_000));
  try {
    await chrome.tabs.reload(state.tab.id, { bypassCache: true });
    await loadPromise;
  } catch (error) {
    if (error instanceof AuditLifecycleError) throw error;
    throw new AuditLifecycleError(t("auditReloadTimeout"), AUDIT_LIFECYCLE_STATUS.incomplete, "controlled-reload-failed");
  }
  assertAuditBudget(auditStartedAt, auditMaxDurationMs);
  await ensureContentScript(state.tab.id);
  await installNavigationMonitor(state.tab.id);
  const lifecycleState = await getAuditLifecycleState(state.tab.id);
  if (lifecycleState?.status && lifecycleState.status !== AUDIT_LIFECYCLE_STATUS.running) {
    throw new AuditLifecycleError(t("auditLifecycleInterrupted"), lifecycleState.status, lifecycleState.reason || "audit-lifecycle-interruption");
  }
  return {
    phase,
    status: "completed",
    startedAt,
    completedAt: new Date().toISOString()
  };
}

function waitForTabLoad(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timeoutId);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish(resolve);
    };
    const timeoutId = setTimeout(() => finish(reject, new AuditLifecycleError(t("auditReloadTimeout"), AUDIT_LIFECYCLE_STATUS.incomplete, "controlled-reload-timeout")), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function installNavigationMonitor(tabId) {
  if (!chrome.scripting?.executeScript) throw new Error("navigation monitor unavailable");
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      if (globalThis.__cookiebuddyNavigationMonitorInstalled) return;
      globalThis.__cookiebuddyNavigationMonitorInstalled = true;
      const report = (kind) => {
        let url = "";
        try {
          const parsed = new URL(globalThis.location.href);
          parsed.username = "";
          parsed.password = "";
          parsed.search = "";
          parsed.hash = "";
          url = parsed.href;
        } catch {}
        globalThis.postMessage({ source: "cookiebuddy-navigation-monitor", kind, url }, "*");
      };
      ["popstate", "hashchange"].forEach((eventName) => globalThis.addEventListener(eventName, () => report("spa")));
      ["pushState", "replaceState"].forEach((method) => {
        const original = globalThis.history?.[method];
        if (typeof original !== "function") return;
        globalThis.history[method] = function (...args) {
          const result = original.apply(this, args);
          report("spa");
          return result;
        };
      });
    }
  });
}

function createIncompleteAuditDelta(outcome, lifecycleState, summary) {
  return {
    checkedAt: new Date().toISOString(),
    url: sanitizeEvidenceUrl(state.tab?.url || state.analysis?.url || ""),
    riskLevel: "low",
    summary,
    denyAction: { clicked: false, label: "", manual: false },
    remainingCookies: [],
    newCookies: [],
    thirdPartyHosts: [],
    essentialThirdPartyHosts: [],
    remainingStorageEntries: [],
    nonEssentialStorageEntries: [],
    controlledReloads: [],
    observationWindow: null,
    serviceAudit: [],
    banner: state.analysis?.banner || null,
    integrity: { status: "unknown", uncertain: true, knownStartingState: "unknown", limitations: ["integrity-not-recorded"], evidence: [], recommendation: "rerun-clean-environment" },
    cookieCoverage: { complete: false, requestedHosts: [], thirdPartyHosts: [], unavailableHosts: [] },
    beforeCounts: null,
    afterDenyCounts: null,
    auditLifecycle: { ...(lifecycleState || {}), status: outcome.status, reason: outcome.reason, events: lifecycleState?.events || [] }
  };
}

async function attachAuditReport(delta) {
  const manifest = (() => {
    try {
      return chrome.runtime.getManifest?.() || null;
    } catch {
      return null;
    }
  })();
  delta.report = await createAuditReport({ delta, manifest });
  return delta.report;
}

async function snapshot(label) {
  const [analysis, trafficResponse, mainWorldConsent] = await Promise.all([
    sendToTab(state.tab.id, { target: "cookiebuddy-content", type: "ANALYZE_PAGE" }),
    chrome.runtime.sendMessage({ target: "cookiebuddy-background", type: "GET_TRAFFIC", tabId: state.tab.id }),
    readMainWorldConsentState(state.tab.id)
  ]);
  if (mainWorldConsent) analysis.consentState = mergeConsentStates(analysis.consentState, mainWorldConsent);
  const cookieSnapshot = await getCookiesForTab(state.tab, trafficResponse?.traffic || [], analysis.resources || []);
  const normalizedTraffic = normalizeTraffic([...(trafficResponse?.traffic || []), ...(analysis.resources || [])], analysis.host);

  return {
    label,
    analysis,
    cookies: cookieSnapshot.cookies,
    cookieCoverage: cookieSnapshot.coverage,
    thirdPartyTraffic: normalizedTraffic,
    blockedRequests: normalizedTraffic.filter((item) => item.blocked)
  };
}

async function readMainWorldConsentState(tabId) {
  if (!chrome.scripting?.executeScript) {
    return {
      status: "unavailable",
      apiSupport: { tcf: "unavailable", googleConsentMode: "unavailable" },
      limitations: ["main-world-api-unavailable"]
    };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: "MAIN",
      func: collectMainWorldConsentState
    });
    return results?.[0]?.result || null;
  } catch {
    return {
      status: "unavailable",
      apiSupport: { tcf: "unavailable", googleConsentMode: "unavailable" },
      limitations: ["main-world-api-unavailable"]
    };
  }
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
  if (elements.statusCardText && !state.verdict) elements.statusCardText.textContent = t("auditReadyCopy");
}

// Renders the compact metric tiles at the top of the popup from the latest scan data.
function renderOverview() {
  if (!elements.overviewGrid || !state.analysis) return;

  const categories = state.analysis.categories || {};
  const serviceCount = Object.values(categories).reduce((total, category) => total + (category.services?.length || 0), 0);
  const storage = state.analysis.storage || {};
  const thirdPartyCount = normalizeTraffic(state.traffic || [], state.analysis.host || "").filter((item) => item.relationship === "third-party").length;
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
      <p class="muted">${escapeHtml(t("storageExtendedOverview", [state.analysis.storage?.indexedDb?.databases?.length || state.analysis.storage?.indexedDbNames?.length || 0, state.analysis.storage?.cacheStorage?.caches?.length || 0, state.analysis.storage?.serviceWorkers?.registrations?.length || 0]))}</p>
      <p class="muted">${escapeHtml(t("storageInspectionStatus", [storageStatusLabel(state.analysis.storage?.coverage?.indexedDB), storageStatusLabel(state.analysis.storage?.coverage?.cacheStorage), storageStatusLabel(state.analysis.storage?.coverage?.serviceWorkers)]))}</p>
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
    ${renderExtendedStorageMetadata(storage)}
  `;
}

function storageStatusLabel(status) {
  return status === "observed" ? t("storageStatusObserved") : status === "not-inspected" ? t("storageStatusNotInspected") : t("storageStatusNotRecorded");
}

function renderExtendedStorageMetadata(storage = {}) {
  const indexedDb = storage.indexedDb?.databases || (storage.indexedDbNames || []).map((name) => ({ name }));
  const cacheStorage = storage.cacheStorage || { status: storage.coverage?.cacheStorage, caches: [] };
  const serviceWorkers = storage.serviceWorkers || { status: storage.coverage?.serviceWorkers, registrations: [] };
  const indexedContent = indexedDb.length
    ? indexedDb.map((database) => `<div class="list-row"><strong>${escapeHtml(database.name)}</strong><span>${database.version ? `v${escapeHtml(database.version)}` : escapeHtml(t("indexedDbHeading"))}</span></div>`).join("")
    : `<p class="muted">${escapeHtml(storageStatusLabel(storage.coverage?.indexedDB) === t("storageStatusNotInspected") ? t("storageStatusNotInspected") : t("noIndexedDbDatabases"))}</p>`;
  const cacheContent = cacheStorage.caches?.length
    ? cacheStorage.caches.map((cache) => `<div class="list-row"><div><strong>${escapeHtml(cache.name)}</strong>${cache.keys?.length ? `<ul class="storage-key-list">${cache.keys.slice(0, 8).map((key) => `<li>${escapeHtml(key.method || "GET")} ${escapeHtml(key.url)}</li>`).join("")}</ul>` : ""}</div><span>${escapeHtml(t("cacheKeyCount", cache.keys?.length || 0))}</span></div>`).join("")
    : `<p class="muted">${escapeHtml(cacheStorage.status === "not-inspected" ? t("storageStatusNotInspected") : t("noCacheStorageCaches"))}</p>`;
  const workerContent = serviceWorkers.registrations?.length
    ? serviceWorkers.registrations.map((registration) => `<div class="list-row"><div><strong>${escapeHtml(registration.scope || t("serviceWorkersHeading"))}</strong><span>${escapeHtml(registration.scriptUrl || registration.state || "unknown")}</span></div><span>${escapeHtml(t("serviceWorkerScopeLabel"))}</span></div>`).join("")
    : `<p class="muted">${escapeHtml(serviceWorkers.status === "not-inspected" ? t("storageStatusNotInspected") : t("noServiceWorkerRegistrations"))}</p>`;
  return `<section class="storage-metadata"><h3>${escapeHtml(t("browserStorageMetadataHeading"))}</h3><div class="storage-metadata-grid"><div><h4>${escapeHtml(t("indexedDbHeading"))}</h4>${indexedContent}</div><div><h4>${escapeHtml(t("cacheStorageHeading"))}</h4>${cacheContent}</div><div><h4>${escapeHtml(t("serviceWorkersHeading"))}</h4>${workerContent}</div></div></section>`;
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

function buildMailBody(kind, auditDelta = null) {
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

  const visualNote = auditDelta?.visualEvidence
    ? t("visualEvidenceMailNote", (auditDelta.visualEvidence.items || []).filter((item) => item.status === "captured").length
      ? t("visualEvidenceCaptured")
      : auditDelta.visualEvidence.enabled ? t("visualEvidenceUnavailable") : t("visualEvidenceDisabled"))
    : "";
  return [...templates[kind], visualNote].filter(Boolean).join("\n");
}

function renderDelta(delta, verdict = delta.verdict || deriveAuditVerdict(delta)) {
  elements.deltaResult.innerHTML = renderAuditVerdict(delta, verdict);
}

function renderAuditVerdict(delta, verdict) {
  if (!elements.deltaResult) return "";

  const meta = {
    positive: { title: t("auditVerdictPositive"), copy: t("auditVerdictPositiveCopy") },
    negative: { title: t("auditVerdictNegative"), copy: t("auditVerdictNegativeCopy") },
    review: { title: t("auditVerdictReview"), copy: t("auditVerdictReviewCopy") },
    incomplete: { title: t("auditVerdictIncomplete"), copy: t("auditVerdictIncompleteCopy") }
  }[verdict.status] || { title: t("auditVerdictIncomplete"), copy: t("auditVerdictIncompleteCopy") };
  const reasonLabels = {
    "third-party-traffic": t("auditReasonThirdParty"),
    "non-essential-cookies": t("auditReasonCookies"),
    "non-essential-storage": t("auditReasonStorage"),
    "active-service": t("auditReasonActiveService"),
    "unclear-service": t("auditReasonUnclearService"),
    "consent-signal-contradiction": t("auditReasonConsentContradiction"),
    "heuristic-signal": t("auditReasonHeuristic"),
    "rejection-verification": t("auditCoverageReject"),
    "consent-surface": t("auditCoverageConsent"),
    "consent-surface-inaccessible": t("auditCoverageConsentInaccessible"),
    "consent-api-support": t("auditCoverageConsentApi"),
    "iab-tcf-state": t("auditCoverageTcf"),
    "google-consent-mode-state": t("auditCoverageGoogleConsentMode"),
    "audit-integrity": t("auditCoverageIntegrity"),
    "cookie-coverage": t("auditCoverageCookies"),
    "storage-coverage": t("auditCoverageStorage"),
    "cname-routing": t("auditCoverageCname"),
    "before-after-observation": t("auditCoverageObservation"),
    "page-analysis": t("auditCoverageAnalysis"),
    "audit-lifecycle": t("auditCoverageLifecycle"),
    "no-contradictory-evidence": t("auditReasonNoContradiction")
  };
  const reasons = (verdict.reasons || []).slice(0, 3).map((reason) => `<li>${escapeHtml(reasonLabels[reason] || reason)}</li>`).join("");
  const unresolvedSignals = renderUnresolvedSignals(verdict.unresolvedSignals, reasonLabels);
  const complete = verdict.coverage?.complete === true;
  const cookieCount = (delta.remainingCookies?.length || 0) + (delta.newCookies?.length || 0);
  const evidenceHref = verdict.evidenceLinks?.[0]?.href || "details.html?view=delta";
  const detailsHref = chrome.runtime.getURL(verdict.status === "negative" ? `${evidenceHref}&focus=complaint` : evidenceHref);
  const complaintAction = verdict.status === "negative"
    ? `<a class="primary-button small" href="${escapeHtml(detailsHref)}" target="_blank" rel="noreferrer" data-complaint-action="true">${escapeHtml(t("auditContactWebsite"))}</a><a class="ghost-button small" href="${escapeHtml(detailsHref)}" target="_blank" rel="noreferrer" data-authority-complaint-action="true">${escapeHtml(t("auditPrepareAuthority"))}</a>`
    : "";
  const cookieItems = [...(delta.remainingCookies || []), ...(delta.newCookies || [])].slice(0, 8);

  const html = `
    <article class="audit-verdict" data-verdict="${escapeHtml(verdict.status)}">
      <div class="audit-verdict-heading">
        <div>
          <h2>${escapeHtml(meta.title)}</h2>
          <p>${escapeHtml(meta.copy)}</p>
        </div>
        <div class="audit-verdict-meta">
          <span class="audit-confidence">${escapeHtml(t("auditConfidence", verdict.confidence))}</span>
          <span class="audit-completeness" data-complete="${complete}">${escapeHtml(t(complete ? "auditCompletenessComplete" : "auditCompletenessIncomplete"))}</span>
        </div>
      </div>
      <ul class="audit-reason-list">${reasons}</ul>
      ${unresolvedSignals}
      <details class="audit-evidence">
        <summary>${escapeHtml(t("auditShowEvidence"))}</summary>
        <div class="audit-evidence-grid">
          <span><strong>${escapeHtml(delta.afterDenyCounts?.cookies || 0)}</strong>${escapeHtml(t("cookiesStillVisibleMetric"))}</span>
          <span><strong>${escapeHtml(delta.afterDenyCounts?.thirdPartyHosts || 0)}</strong>${escapeHtml(t("thirdPartyStillContactedMetric"))}</span>
          <span><strong>${escapeHtml(delta.remainingStorageEntries?.length || 0)}</strong>${escapeHtml(t("storageStillVisibleMetric"))}</span>
        </div>
        <p class="muted">${escapeHtml(delta.denyAction?.clicked ? t("clickedDenyControl", delta.denyAction.label || t("detectedButton")) : t("manualDenyAssumed"))}</p>
        ${renderRejectVerification(delta.denyAction)}
        ${renderConsentSurfaceLimitations(delta)}
        ${renderAuditIntegrity(delta)}
        ${cookieItems.length ? `<h3>${escapeHtml(t("nonEssentialCookiesStillPresent"))}</h3>${cookieItems.map((cookie) => `<p class="chip">${escapeHtml(cookie.name)} · ${escapeHtml(cookie.domain)} · ${escapeHtml(cookie.service)}</p>`).join("")}` : ""}
        ${delta.thirdPartyHosts?.length ? `<h3>${escapeHtml(t("nonEssentialThirdPartyTrafficAfterOptOut"))}</h3>${delta.thirdPartyHosts.slice(0, 10).map((host) => `<p class="chip">${escapeHtml(host)}</p>`).join("")}` : ""}
        ${renderPossibleCnameTrackers(delta)}
        ${delta.essentialThirdPartyHosts?.length ? `<h3>${escapeHtml(t("essentialThirdPartyTrafficAllowed"))}</h3>${delta.essentialThirdPartyHosts.slice(0, 10).map((host) => `<p class="chip">${escapeHtml(host)}</p>`).join("")}` : ""}
        ${delta.serviceAudit?.length ? `<section class="service-audit"><h3>${escapeHtml(t("serviceAuditHeading"))}</h3><p class="muted">${escapeHtml(t("serviceAuditIntro"))}</p>${delta.serviceAudit.map(renderServiceAudit).join("")}</section>` : ""}
        ${renderCoverageSummary(delta.coverage || verdict.coverage)}
        ${renderVisualEvidenceSummary(delta)}
      </details>
      <div class="audit-result-actions">
        <a class="ghost-button small" href="${escapeHtml(detailsHref)}" target="_blank" rel="noreferrer">${escapeHtml(t("auditOpenEvidence"))}</a>
        ${complaintAction}
      </div>
      ${verdict.status === "negative" ? `<p class="audit-review-note">${escapeHtml(t("auditComplaintReviewNote"))}</p>` : ""}
    </article>
  `;
  elements.deltaResult.innerHTML = html;
  if (elements.statusCardText) elements.statusCardText.textContent = `${meta.title}. ${meta.copy}`;
  return html;
}

function renderUnresolvedSignals(signals = [], reasonLabels = {}) {
  if (!signals.length) return "";
  const items = signals.slice(0, 5).map((signal) => {
    const label = reasonLabels[signal.key] || signal.key;
    const evidence = Array.isArray(signal.evidence) && signal.evidence.length ? `: ${signal.evidence.join(", ")}` : "";
    return `<li>${escapeHtml(label)}${escapeHtml(evidence)}</li>`;
  }).join("");
  return `<section class="audit-unresolved"><h3>${escapeHtml(t("auditUnresolvedHeading"))}</h3><ul class="audit-reason-list">${items}</ul></section>`;
}

function renderRejectVerification(denyAction = {}) {
  const verification = denyAction.verification || {};
  const statusCopy = denyAction.verified
    ? t("rejectVerificationVerified")
    : denyAction.clicked ? t("rejectVerificationUnclear") : t("rejectVerificationNotAttempted");
  const firstAction = verification.actions?.[0];
  const evidenceLabels = {
    "reject-control-removed": t("rejectEvidenceControlRemoved"),
    "consent-signals-changed": t("rejectEvidenceConsentSignals"),
    "banner-state-changed": t("rejectEvidenceBannerChanged"),
    "consent-control-state-changed": t("rejectEvidenceControlState")
  };
  const evidence = (verification.evidence || []).map((item) => `<li>${escapeHtml(evidenceLabels[item] || item)}</li>`).join("");
  const selection = firstAction?.label
    ? `<p class="muted">${escapeHtml(t("rejectControlSelected", [firstAction.label, firstAction.source || "unknown", firstAction.confidence || "unknown"]))}</p>`
    : "";
  return `<section class="reject-verification"><h3>${escapeHtml(t("rejectVerificationHeading"))}</h3><p class="muted">${escapeHtml(statusCopy)}</p>${selection}${evidence ? `<ul class="coverage-list">${evidence}</ul>` : ""}</section>`;
}

function renderCoverageSummary(coverage) {
  if (!coverage) return "";
  const stateLabels = {
    observed: t("coverageStateObserved"),
    "not-observed": t("coverageStateNotObserved"),
    "not-detected": t("coverageStateNotDetected"),
    "not-inspected": t("coverageStateNotInspected"),
    unknown: t("coverageStateUnknown"),
    "not-technically-inspectable": t("coverageStateNotInspectable")
  };
  const techniqueLabels = {
    cookies: t("coverageTechniqueCookies"),
    "browser-storage": t("coverageTechniqueStorage"),
    indexeddb: t("coverageTechniqueIndexedDb"),
    "cache-storage": t("coverageTechniqueCacheStorage"),
    "service-workers": t("coverageTechniqueServiceWorkers"),
    "network-requests": t("coverageTechniqueTraffic"),
    "consent-surface": t("coverageTechniqueConsent"),
    "audit-integrity": t("coverageTechniqueIntegrity"),
    "cookie-coverage": t("coverageTechniqueCookieCoverage"),
    fingerprinting: t("coverageTechniqueFingerprinting"),
    "server-side-tagging": t("coverageTechniqueServerSide"),
    "backend-enrichment": t("coverageTechniqueBackend"),
    "first-party-proxy": t("coverageTechniqueProxy"),
    "cname-routing": t("coverageTechniqueCname"),
    "opaque-client-signal": t("coverageTechniqueOpaque")
  };
  const renderItem = (item) => `<li><strong>${escapeHtml(techniqueLabels[item.key] || item.key)}</strong><span>${escapeHtml(stateLabels[item.state] || item.state)} · ${escapeHtml(t("coverageConfidence", item.confidence))}${item.evidenceCount !== undefined ? ` · ${escapeHtml(t("coverageEvidenceCount", item.evidenceCount))}` : ""}</span></li>`;
  const heuristics = (coverage.heuristicSignals || []).map((signal) => `<li><strong>${escapeHtml(techniqueLabels[signal.key] || signal.key)}</strong><span>${escapeHtml(t("coverageConfidence", signal.confidence))} · ${escapeHtml(t("coverageHeuristicNotConfirmed"))}${signal.evidence?.length ? ` · ${escapeHtml(signal.evidence.join(", "))}` : ""}</span></li>`).join("");
  return `<section class="coverage-summary"><h3>${escapeHtml(t("coverageHeading"))}</h3><p class="muted">${escapeHtml(t("coverageIntro"))}</p><p class="coverage-status"><strong>${escapeHtml(t("coverageStatusLabel"))}:</strong> ${escapeHtml(coverage.auditComplete ? t("coverageStatusComplete") : t("coverageStatusIncomplete"))}</p><h4>${escapeHtml(t("coverageObserved"))}</h4><ul class="coverage-list">${(coverage.observed || []).map(renderItem).join("")}</ul><h4>${escapeHtml(t("coverageLimitations"))}</h4><ul class="coverage-list">${(coverage.limitations || []).map(renderItem).join("")}</ul><h4>${escapeHtml(t("coverageHeuristicHeading"))}</h4><ul class="coverage-list">${heuristics || `<li>${escapeHtml(t("coverageHeuristicNone"))}</li>`}</ul></section>`;
}

function renderPossibleCnameTrackers(delta) {
  const trackers = delta.possibleCloakedTrackers || [];
  if (!trackers.length) return "";
  return `<section class="possible-cname-evidence"><h3>${escapeHtml(t("possibleCnameHeading"))}</h3><p class="muted">${escapeHtml(t("possibleCnameIntro"))}</p>${trackers.slice(0, 8).map((item) => `<p class="chip">${escapeHtml(item.host || t("unknownWebsite"))}${item.path ? ` · ${escapeHtml(item.path)}` : ""}${item.cnameRule?.id ? ` · ${escapeHtml(item.cnameRule.id)}` : ""}</p>`).join("")}</section>`;
}

function renderConsentSurfaceLimitations(delta) {
  const surfaces = delta.inaccessibleConsentSurfaces || [];
  if (!surfaces.length) return "";
  const items = surfaces.slice(0, 8).map((surface) => `<li>${escapeHtml(t("inaccessibleConsentSurface", [surface.frameUrl || t("unknownWebsite"), surface.frameOrigin || "unknown", surface.domContext || t("unknownDomContext")] ))}</li>`).join("");
  return `<section class="consent-surface-limitations"><h3>${escapeHtml(t("inaccessibleConsentHeading"))}</h3><p class="muted">${escapeHtml(t("inaccessibleConsentIntro"))}</p><ul class="coverage-list">${items}</ul></section>`;
}

function renderAuditIntegrity(delta) {
  const integrity = delta.integrity || { status: "unknown", knownStartingState: "unknown", uncertain: true, limitations: ["integrity-not-recorded"], evidence: [], recommendation: "rerun-clean-environment" };
  const statusKey = integrity.status === "clean" ? "auditIntegrityStatusClean" : integrity.status === "contaminated" ? "auditIntegrityStatusContaminated" : "auditIntegrityStatusUnknown";
  const stateKey = integrity.knownStartingState === "prior-consent" ? "auditIntegrityStatePriorConsent" : integrity.knownStartingState === "prior-opt-out" ? "auditIntegrityStatePriorOptOut" : integrity.knownStartingState === "clean" ? "auditIntegrityStateClean" : "auditIntegrityStateUnknown";
  const limitationLabels = {
    "prior-consent": t("auditIntegrityLimitationPriorConsent"),
    "prior-opt-out": t("auditIntegrityLimitationPriorOptOut"),
    "blocked-tracker-request": t("auditIntegrityLimitationBlockedRequest"),
    "starting-consent-state-unknown": t("auditIntegrityLimitationUnknownState"),
    "integrity-not-recorded": t("auditIntegrityLimitationNotRecorded")
  };
  const limitations = (integrity.limitations || []).map((item) => `<li>${escapeHtml(limitationLabels[item] || item)}</li>`).join("");
  const evidence = (integrity.evidence || []).slice(0, 8).map((item) => `<li>${escapeHtml([item.type || "integrity-signal", item.scope || "", item.name || item.key || item.host || item.url || "", item.error || ""].filter(Boolean).join(" · "))}</li>`).join("");
  return `<section class="audit-integrity"><h3>${escapeHtml(t("auditIntegrityHeading"))}</h3><p class="muted">${escapeHtml(t("auditIntegrityIntro"))}</p><p class="muted"><strong>${escapeHtml(t("auditIntegrityStatusLabel"))}:</strong> ${escapeHtml(t(statusKey))} · <strong>${escapeHtml(t("auditIntegrityStartingStateLabel"))}:</strong> ${escapeHtml(t(stateKey))}</p>${limitations ? `<h4>${escapeHtml(t("auditIntegrityLimitationsHeading"))}</h4><ul class="coverage-list">${limitations}</ul>` : ""}${evidence ? `<h4>${escapeHtml(t("auditIntegrityEvidenceHeading"))}</h4><ul class="coverage-list">${evidence}</ul>` : ""}${integrity.recommendation !== "none" ? `<p class="muted">${escapeHtml(t("auditIntegrityRecommendation"))}</p>` : ""}</section>`;
}

function renderVisualEvidenceSummary(delta) {
  const evidence = delta.visualEvidence;
  if (!evidence) return "";
  const captured = (evidence.items || []).filter((item) => item.status === "captured").length;
  const status = captured
    ? t("visualEvidenceCaptured")
    : evidence.enabled ? t("visualEvidenceUnavailable") : t("visualEvidenceDisabled");
  return `<p class="muted visual-evidence-summary">${escapeHtml(status)} · ${escapeHtml(t("visualEvidenceReviewHint"))}</p>`;
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
    "allowed-likely-necessary": t("serviceStatusLikelyNecessary"),
    disabled: t("serviceStatusDisabled"),
    active: t("serviceStatusActive"),
    unclear: t("serviceStatusUnclear")
  }[service.status] || t("serviceStatusUnclear");
  const listedLabel = service.listedInBanner ? t("serviceListedInBanner") : t("serviceNotListedInBanner");
  const ruleLabel = service.ruleVersion ? t("serviceRuleEvidence", [service.ruleId || "local", service.ruleVersion, service.confidence || "none"]) : t("serviceRuleUnknown");
  const classification = service.classification || { classification: service.essential ? "known-necessary" : "unknown", confidence: service.confidence || "none", rationale: service.source || service.category || "" };
  const classificationLabel = t("serviceClassification", [classification.classification, classification.confidence, classification.rationale]);
  return `<div class="service-audit-row"><div><strong>${escapeHtml(service.name)}</strong><span>${escapeHtml(service.source || service.category)}</span><small>${escapeHtml(ruleLabel)}</small><small>${escapeHtml(classificationLabel)}</small></div><div><span class="audit-badge ${escapeHtml(service.status)}">${escapeHtml(statusLabel)}</span><small>${escapeHtml(listedLabel)}</small></div></div>`;
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
      target: { tabId, allFrames: true },
      files: ["src/service-rules.js", "src/domain-rules.js", "src/contact-discovery-content.js", "src/consent-controls.js", "src/consent-surfaces.js", "src/content.js"]
    });
  }
}

async function captureVisualEvidence(phase, auditStep, enabled, auditStartedAt, auditMaxDurationMs, rejectControlLabel = "") {
  const base = {
    phase,
    auditStep,
    tabUrl: sanitizeEvidenceUrl(state.tab?.url),
    rejectControlLabel
  };
  if (!enabled) {
    return createVisualEvidenceItem({ ...base, status: "disabled", reason: "not-enabled" });
  }
  assertAuditBudget(auditStartedAt, auditMaxDurationMs);

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, windowId: state.tab?.windowId });
    if (!canCaptureVisibleTab({
      testedTab: state.tab,
      activeTab,
      captureAvailable: typeof chrome.tabs.captureVisibleTab === "function"
    })) {
      return createVisualEvidenceItem({ ...base, status: "unavailable", reason: "tested-tab-not-active-or-capture-unavailable" });
    }
    const dataUrl = await chrome.tabs.captureVisibleTab(state.tab.windowId, { format: "png" });
    return createVisualEvidenceItem({ ...base, status: "captured", dataUrl });
  } catch {
    return createVisualEvidenceItem({ ...base, status: "unavailable", reason: "permission-or-browser-restriction" });
  }
}

async function openDeltaTab(delta) {
  await chrome.tabs.create({
    url: chrome.runtime.getURL("details.html?view=delta")
  });
}

async function persistAuditDelta(delta) {
  try {
    await chrome.storage.local.set({ cookiebuddyLastDelta: delta });
    return delta;
  } catch {
    const fallback = {
      ...delta,
      visualEvidence: delta.visualEvidence
        ? {
            ...delta.visualEvidence,
            items: (delta.visualEvidence.items || []).map((item) => item.status === "captured"
              ? { ...item, status: "unavailable", dataUrl: "", reason: "local-storage-limit" }
              : item)
          }
        : delta.visualEvidence
    };
    await chrome.storage.local.set({ cookiebuddyLastDelta: fallback });
    return fallback;
  }
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
    if (delta.denyAction?.clicked && delta.denyAction?.verified && delta.thirdPartyHosts.length === 0 && delta.newCookies.length === 0 && delta.remainingCookies.length === 0) {
      return "green";
    }
    return "yellow";
  }

  const banner = state.analysis?.banner;
  const traffic = normalizeTraffic(state.traffic || [], state.analysis?.host || "");
  const visibleCookies = state.cookies || [];
  const suspiciousCookies = visibleCookies.filter((cookie) => !isEssentialCookie(cookie));
  const hasNonEssentialThirdPartyTraffic = traffic.some((item) => item.relationship === "third-party" && !isEssentialHost(item.host));
  const hasPossibleCloakedTracker = traffic.some((item) => item.relationship === "possible-cloaked-tracker");

  if (!banner || banner.confidence === "none") return "yellow";
  if (hasNonEssentialThirdPartyTraffic || hasPossibleCloakedTracker || suspiciousCookies.length > 0) return "yellow";
  return "green";
}

function resetAuditProgress() {
  if (!elements.auditSteps) return;
  elements.auditSteps.querySelectorAll("[data-step]").forEach((step) => {
    step.dataset.state = "waiting";
    const note = step.querySelector("small");
    if (note) note.textContent = "";
  });
  if (elements.auditProgressBar) elements.auditProgressBar.style.width = "0%";
}

function setAuditStep(stepName, mode, note = "") {
  if (!elements.auditSteps) return;
  const step = elements.auditSteps.querySelector(`[data-step="${stepName}"]`);
  if (!step) return;
  step.dataset.state = mode;
  const icon = step.querySelector(".audit-step-icon");
  if (icon && mode === "complete") icon.textContent = "✓";
  if (icon && mode === "failed") icon.textContent = "!";
  if (icon && mode === "manual") icon.textContent = "?";
  const noteElement = step.querySelector("small");
  if (noteElement) noteElement.textContent = note;
  const steps = [...elements.auditSteps.querySelectorAll("[data-step]")];
  const completeCount = steps.filter((item) => ["complete", "manual"].includes(item.dataset.state)).length;
  if (elements.auditProgressBar) elements.auditProgressBar.style.width = `${Math.round((completeCount / steps.length) * 100)}%`;
}

async function getCookiesForTab(tab, traffic = [], resources = []) {
  const pageUrl = sanitizeEvidenceUrl(tab.url);
  const pageHost = new URL(pageUrl).hostname;
  const observedHosts = getObservedCookieHosts(pageUrl, traffic, resources);
  const requestedHosts = observedHosts.slice(0, MAX_COOKIE_HOST_QUERIES);
  const unavailableHosts = observedHosts.slice(MAX_COOKIE_HOST_QUERIES);
  const cookies = [];
  const seen = new Set();
  const results = await Promise.all(requestedHosts.map(async (host) => {
    try {
      return { host, cookies: await chrome.cookies.getAll({ domain: host }) };
    } catch {
      return { host, unavailable: true };
    }
  }));
  for (const { host, cookies: hostCookies, unavailable } of results) {
    if (unavailable) {
      unavailableHosts.push(host);
      continue;
    }
    try {
      const result = hostCookies || [];
      for (const cookie of result || []) {
        const key = `${cookie.domain}|${cookie.path}|${cookie.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cookies.push(cookie);
      }
    } catch {
      unavailableHosts.push(host);
    }
  }
  return {
    cookies,
    coverage: createCookieCoverage({ pageHost, requestedHosts, unavailableHosts })
  };
}

async function persistLastScan() {
  await chrome.storage.local.set({
    cookiebuddyLastScan: {
      analysis: state.analysis,
      cookies: state.cookies.map(formatCookie),
      cookieCoverage: state.cookieCoverage,
      traffic: normalizeTraffic(state.traffic, state.analysis.host)
    }
  });
}

function sendToTab(tabId, message) {
  // The top-frame content script recursively inspects accessible child surfaces.
  // Targeting frame 0 keeps responses deterministic now that all frames are injected.
  return chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
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
              : key === "statusReviewRecommended"
                ? t("scanStatusReviewRecommended")
              : key === "statusAuditIncomplete"
                ? t("scanStatusIncomplete")
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
  const rule = serviceRuleForCookie(cookie);
  return {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    service: serviceForCookie(cookie),
    serviceRuleId: rule?.id || "",
    serviceRuleVersion: rule?.ruleVersion || "",
    serviceEvidence: rule?.evidence || null,
    serviceConfidence: rule?.confidence || "none"
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

function assertAuditBudget(startedAt, maxDurationMs) {
  if (Date.now() - startedAt > maxDurationMs) {
    throw new Error(t("auditDurationExceeded"));
  }
}

function applyLocalizedText() {
  elements.languageSelect.value = getLanguage();
  applyI18n();
  document.querySelector("#languageSelect").setAttribute("aria-label", t("languageAriaLabel"));
}
