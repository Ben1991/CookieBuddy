import { PERFORMANCE_BUDGETS } from "./performance-budgets.mjs";

const TRAFFIC_STORAGE_KEY = "cookiebuddyTraffic";
const ICON_STATUS_STORAGE_KEY = "cookiebuddyIconStatus";
const activeAuditTabs = new Map();
const auditExpiryTimers = new Map();

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

    const tabTraffic = await getTraffic(details.tabId);
    tabTraffic.push({
      url: details.url,
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

chrome.tabs.onRemoved.addListener(async (tabId) => {
  activeAuditTabs.delete(tabId);
  clearTimeout(auditExpiryTimers.get(tabId));
  auditExpiryTimers.delete(tabId);
  await clearTabTraffic(tabId);
  await clearTabIconStatus(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const status = await getIconStatus(tabId);
  await applyIconStatus(status || "neutral");
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
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

  if (message.type === "START_AUDIT") {
    (async () => {
      const tabId = Number(message.tabId);
      if (!Number.isInteger(tabId) || tabId < 0) {
        sendResponse({ ok: false, error: "invalid tab" });
        return;
      }
      activeAuditTabs.set(tabId, Date.now());
      clearTimeout(auditExpiryTimers.get(tabId));
      auditExpiryTimers.set(tabId, setTimeout(async () => {
        activeAuditTabs.delete(tabId);
        auditExpiryTimers.delete(tabId);
        await clearTabTraffic(tabId);
      }, PERFORMANCE_BUDGETS.activeAudit.maxDurationMs));
      await clearTabTraffic(tabId);
      sendResponse({ ok: true, maxDurationMs: PERFORMANCE_BUDGETS.activeAudit.maxDurationMs });
    })();
    return true;
  }

  if (message.type === "STOP_AUDIT") {
    const tabId = Number(message.tabId);
    activeAuditTabs.delete(tabId);
    clearTimeout(auditExpiryTimers.get(tabId));
    auditExpiryTimers.delete(tabId);
    sendResponse({ ok: true });
    return false;
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
