import { PERFORMANCE_BUDGETS } from "./performance-budgets.mjs";
import { createAuditLifecycleState, getAuditLifecycleEvidence, transitionAuditLifecycle } from "./audit-lifecycle.mjs";
import { minimizeUrlEvidence } from "./url-evidence.mjs";
import { isBlockedRequestError } from "./audit-integrity.mjs";

const TRAFFIC_STORAGE_KEY = "cookiebuddyTraffic";
const ICON_STATUS_STORAGE_KEY = "cookiebuddyIconStatus";
const AUDIT_STATE_STORAGE_KEY = "cookiebuddyAuditLifecycle";
const activeAuditTabs = new Map();
const auditExpiryTimers = new Map();
const WORKER_SESSION_ID = `worker-${Date.now()}`;

/**
 * Helper to get traffic data from session storage
 */
async function getTraffic(tabId) {
  const data = await chrome.storage.session.get(TRAFFIC_STORAGE_KEY);
  const trafficByTab = data[TRAFFIC_STORAGE_KEY] || {};
  return trafficByTab[tabId] || [];
}

/**
 * Helper to set traffic data in session storage
 */
async function setTraffic(tabId, traffic) {
  const data = await chrome.storage.session.get(TRAFFIC_STORAGE_KEY);
  const trafficByTab = data[TRAFFIC_STORAGE_KEY] || {};
  trafficByTab[tabId] = traffic;
  await chrome.storage.session.set({ [TRAFFIC_STORAGE_KEY]: trafficByTab });
}

/**
 * Helper to get icon status from session storage
 */
async function getIconStatus(tabId) {
  const data = await chrome.storage.session.get(ICON_STATUS_STORAGE_KEY);
  const iconStatusByTab = data[ICON_STATUS_STORAGE_KEY] || {};
  return iconStatusByTab[tabId] || "neutral";
}

/**
 * Helper to set icon status in session storage
 */
async function setIconStatus(tabId, status) {
  const data = await chrome.storage.session.get(ICON_STATUS_STORAGE_KEY);
  const iconStatusByTab = data[ICON_STATUS_STORAGE_KEY] || {};
  iconStatusByTab[tabId] = status;
  await chrome.storage.session.set({ [ICON_STATUS_STORAGE_KEY]: iconStatusByTab });
}

async function getStoredAuditState({ tabId, controllerId, recover = true } = {}) {
  const data = await chrome.storage.session.get(AUDIT_STATE_STORAGE_KEY);
  let state = data[AUDIT_STATE_STORAGE_KEY] || null;
  if (!state || (tabId != null && Number(state.tabId) !== Number(tabId))) return null;

  let changed = false;
  if (recover && state.status === "running" && state.workerSessionId && state.workerSessionId !== WORKER_SESSION_ID) {
    state = transitionAuditLifecycle(state, "service-worker-restarted", { reason: "service-worker-restarted-during-audit" });
    state.workerSessionId = WORKER_SESSION_ID;
    changed = true;
  }
  if (controllerId && state.status === "running" && state.controllerId && state.controllerId !== controllerId) {
    state = transitionAuditLifecycle(state, "popup-reopened", { reason: "popup-reopened-during-audit" });
    state.controllerId = controllerId;
    changed = true;
  }
  if (changed) await chrome.storage.session.set({ [AUDIT_STATE_STORAGE_KEY]: state });
  return state;
}

async function setStoredAuditState(state) {
  if (state) await chrome.storage.session.set({ [AUDIT_STATE_STORAGE_KEY]: state });
  return state;
}

async function transitionStoredAuditState(tabId, type, payload = {}) {
  const state = await getStoredAuditState({ tabId });
  if (!state || state.status !== "running") return state;
  return setStoredAuditState(transitionAuditLifecycle(state, type, payload));
}

/**
 * Helper to clear traffic data for a tab
 */
async function clearTabTraffic(tabId) {
  const data = await chrome.storage.session.get(TRAFFIC_STORAGE_KEY);
  const trafficByTab = data[TRAFFIC_STORAGE_KEY] || {};
  delete trafficByTab[tabId];
  await chrome.storage.session.set({ [TRAFFIC_STORAGE_KEY]: trafficByTab });
}

/**
 * Helper to clear icon status for a tab
 */
async function clearTabIconStatus(tabId) {
  const data = await chrome.storage.session.get(ICON_STATUS_STORAGE_KEY);
  const iconStatusByTab = data[ICON_STATUS_STORAGE_KEY] || {};
  delete iconStatusByTab[tabId];
  await chrome.storage.session.set({ [ICON_STATUS_STORAGE_KEY]: iconStatusByTab });
}

chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const auditStartedAt = activeAuditTabs.get(details.tabId);
    if (details.tabId < 0 || !details.url || !auditStartedAt) return;
    if (Date.now() - auditStartedAt > PERFORMANCE_BUDGETS.activeAudit.maxDurationMs) {
      activeAuditTabs.delete(details.tabId);
      await clearTabTraffic(details.tabId);
      return;
    }

    const minimized = minimizeUrlEvidence(details.url);
    if (!minimized?.url) return;
    const tabTraffic = await getTraffic(details.tabId);
    tabTraffic.push({
      url: minimized.url,
      host: minimized.host,
      path: minimized.path,
      protocol: minimized.protocol,
      queryKeys: minimized.queryKeys,
      type: details.type,
      timeStamp: details.timeStamp
    });

    if (tabTraffic.length > PERFORMANCE_BUDGETS.activeAudit.maxRequestsPerTab) {
      tabTraffic.splice(0, tabTraffic.length - PERFORMANCE_BUDGETS.activeAudit.maxRequestsPerTab);
    }

    await setTraffic(details.tabId, tabTraffic);
  },
  { urls: ["<all_urls>"] }
);

// A browser or another privacy control can prevent a request before it reaches
// the network. Keep only minimized request metadata so the audit can distinguish
// "not observed" from an observable blocked attempt without inspecting extensions.
if (chrome.webRequest.onErrorOccurred) {
  chrome.webRequest.onErrorOccurred.addListener(
    async (details) => {
      const auditStartedAt = activeAuditTabs.get(details.tabId);
      if (details.tabId < 0 || !details.url || !auditStartedAt || !isBlockedRequestError(details.error)) return;
      if (Date.now() - auditStartedAt > PERFORMANCE_BUDGETS.activeAudit.maxDurationMs) return;

      const minimized = minimizeUrlEvidence(details.url);
      if (!minimized?.url) return;
      const tabTraffic = await getTraffic(details.tabId);
      tabTraffic.push({
        url: minimized.url,
        host: minimized.host,
        path: minimized.path,
        protocol: minimized.protocol,
        queryKeys: minimized.queryKeys,
        type: details.type,
        timeStamp: details.timeStamp,
        blocked: true,
        error: String(details.error).slice(0, 100)
      });
      if (tabTraffic.length > PERFORMANCE_BUDGETS.activeAudit.maxRequestsPerTab) {
        tabTraffic.splice(0, tabTraffic.length - PERFORMANCE_BUDGETS.activeAudit.maxRequestsPerTab);
      }
      await setTraffic(details.tabId, tabTraffic);
    },
    { urls: ["<all_urls>"] }
  );
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await transitionStoredAuditState(tabId, "tab-closed");
  activeAuditTabs.delete(tabId);
  clearTimeout(auditExpiryTimers.get(tabId));
  auditExpiryTimers.delete(tabId);
  await clearTabTraffic(tabId);
  await clearTabIconStatus(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const auditState = await getStoredAuditState();
  if (auditState?.status === "running" && auditState.tabId !== tabId) {
    await setStoredAuditState(transitionAuditLifecycle(auditState, "tab-switched", { tabId }));
  }
  const status = await getIconStatus(tabId);
  await applyIconStatus(status || "neutral");
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    await transitionStoredAuditState(tabId, "navigation", {
      kind: changeInfo.url ? "redirect" : "reload",
      url: changeInfo.url,
      reason: changeInfo.url ? "redirect-during-audit" : "reload-during-audit"
    });
    await clearTabTraffic(tabId);
    await clearTabIconStatus(tabId);
    await applyIconStatus("neutral");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "cookiebuddy-background") return false;

  if (message.type === "GET_TRAFFIC") {
    (async () => {
      const traffic = await getTraffic(message.tabId);
      sendResponse({ traffic });
    })();
    return true;
  }

  if (message.type === "GET_AUDIT_STATE") {
    (async () => {
      const state = await getStoredAuditState({ tabId: message.tabId, controllerId: message.controllerId });
      sendResponse({ state: getAuditLifecycleEvidence(state) });
    })();
    return true;
  }

  if (message.type === "START_AUDIT") {
    (async () => {
      const tabId = Number(message.tabId);
      if (!Number.isInteger(tabId) || tabId < 0) {
        sendResponse({ ok: false, error: "invalid tab" });
        return;
      }
      const state = createAuditLifecycleState({
        auditId: message.auditId,
        tabId,
        tabUrl: message.tabUrl,
        controllerId: message.controllerId,
        workerSessionId: WORKER_SESSION_ID,
        maxDurationMs: PERFORMANCE_BUDGETS.activeAudit.maxDurationMs
      });
      await setStoredAuditState(state);
      activeAuditTabs.set(tabId, Date.parse(state.startedAt));
      clearTimeout(auditExpiryTimers.get(tabId));
      auditExpiryTimers.set(tabId, setTimeout(async () => {
        await transitionStoredAuditState(tabId, "timeout", { reason: "audit-time-budget-exceeded" });
        activeAuditTabs.delete(tabId);
        auditExpiryTimers.delete(tabId);
        await clearTabTraffic(tabId);
      }, PERFORMANCE_BUDGETS.activeAudit.maxDurationMs));
      await clearTabTraffic(tabId);
      sendResponse({ ok: true, maxDurationMs: PERFORMANCE_BUDGETS.activeAudit.maxDurationMs, state: getAuditLifecycleEvidence(state) });
    })();
    return true;
  }

  if (message.type === "AUDIT_EVENT" || message.type === "AUDIT_NAVIGATION") {
    (async () => {
      const eventType = message.type === "AUDIT_NAVIGATION" ? "navigation" : message.eventType || "step";
      const state = await getStoredAuditState({ tabId: message.tabId });
      const next = state?.status === "running" ? transitionAuditLifecycle(state, eventType, message) : state;
      await setStoredAuditState(next);
      sendResponse({ ok: Boolean(next), state: getAuditLifecycleEvidence(next) });
    })();
    return true;
  }

  if (message.type === "STOP_AUDIT") {
    (async () => {
      const tabId = Number(message.tabId);
      const state = await getStoredAuditState({ tabId });
      const terminalEvent = message.status === "failed" ? "failed" : message.status === "incomplete" ? "incomplete" : "complete";
      const next = state?.status === "running" ? transitionAuditLifecycle(state, terminalEvent, { reason: message.reason }) : state;
      await setStoredAuditState(next);
      activeAuditTabs.delete(tabId);
      clearTimeout(auditExpiryTimers.get(tabId));
      auditExpiryTimers.delete(tabId);
      sendResponse({ ok: true, state: getAuditLifecycleEvidence(next) });
    })();
    return true;
  }

  if (message.type === "CLEAR_TRAFFIC") {
    (async () => {
      await clearTabTraffic(message.tabId);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === "SET_ICON_STATUS") {
    (async () => {
      const status = normalizeStatus(message.status);
      if (message.tabId != null) {
        await setIconStatus(message.tabId, status);
      }
      await applyIconStatus(status);
      sendResponse({ ok: true, status });
    })();
    return true;
  }

  return false;
});

async function applyIconStatus(status) {
  const badgeConfig = getBadgeConfig(status);
  await chrome.action.setBadgeBackgroundColor({ color: badgeConfig.color });
  await chrome.action.setBadgeText({ text: badgeConfig.text });
  await chrome.action.setTitle({ title: badgeConfig.title });
}

function getBadgeConfig(status) {
  switch (normalizeStatus(status)) {
    case "green":
      return { color: "#2D8A58", text: "", title: "CookieBuddy: all cookies appear covered by consent" };
    case "yellow":
      return { color: "#D89B2E", text: "!", title: "CookieBuddy: consent status is unclear" };
    case "red":
      return { color: "#B33A2B", text: "!", title: "CookieBuddy: a non-essential tracker appears to be running without consent" };
    default:
      return { color: "#23685A", text: "", title: "CookieBuddy" };
  }
}

function normalizeStatus(status) {
  return ["green", "yellow", "red"].includes(status) ? status : "neutral";
}
