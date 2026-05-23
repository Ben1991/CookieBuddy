const trafficByTab = new Map();
const iconStatusByTab = new Map();

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0 || !details.url) return;

    const tabTraffic = trafficByTab.get(details.tabId) || [];
    tabTraffic.push({
      url: details.url,
      type: details.type,
      timeStamp: details.timeStamp
    });

    if (tabTraffic.length > 500) {
      tabTraffic.splice(0, tabTraffic.length - 500);
    }

    trafficByTab.set(details.tabId, tabTraffic);
  },
  { urls: ["<all_urls>"] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  trafficByTab.delete(tabId);
  iconStatusByTab.delete(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await applyIconStatus(iconStatusByTab.get(tabId) || "neutral");
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    iconStatusByTab.delete(tabId);
    await applyIconStatus("neutral");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "cookiebuddy-background") return false;

  if (message.type === "GET_TRAFFIC") {
    sendResponse({ traffic: trafficByTab.get(message.tabId) || [] });
    return true;
  }

  if (message.type === "CLEAR_TRAFFIC") {
    trafficByTab.set(message.tabId, []);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SET_ICON_STATUS") {
    const status = normalizeStatus(message.status);
    if (message.tabId != null) {
      iconStatusByTab.set(message.tabId, status);
    }
    applyIconStatus(status);
    sendResponse({ ok: true, status });
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
