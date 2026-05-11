const trafficByTab = new Map();

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

  return false;
});
