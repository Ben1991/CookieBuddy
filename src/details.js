import { applyI18n, getLanguage, initI18n, setLanguage, t } from "./i18n.js";

const output = document.querySelector("#detailsOutput");
const languageSelect = document.querySelector("#languageSelect");
let detailsPayload = null;
const isDeltaView = new URLSearchParams(window.location.search).get("view") === "delta";

await initI18n();
applyLocalizedText();
output.textContent = t("loading");

languageSelect.addEventListener("change", async (event) => {
  await setLanguage(event.target.value);
  applyLocalizedText();
  renderDetails();
});

detailsPayload = await chrome.storage.local.get([
  "cookiebuddyLastScan",
  "cookiebuddyLastDelta"
]);
renderDetails();

function applyLocalizedText() {
  languageSelect.value = getLanguage();
  applyI18n();
}

function renderDetails() {
  if (!detailsPayload) return;

  if (isDeltaView && detailsPayload.cookiebuddyLastDelta) {
    output.innerHTML = renderDelta(detailsPayload.cookiebuddyLastDelta);
    return;
  }

  output.textContent = JSON.stringify(
    {
      lastScan: detailsPayload.cookiebuddyLastScan || null,
      lastDelta: detailsPayload.cookiebuddyLastDelta || null
    },
    null,
    2
  );
}

function renderDelta(delta) {
  const cookies = [...(delta.remainingCookies || []), ...(delta.newCookies || [])];
  return `
    <div class="delta-report">
      <div class="risk ${delta.riskLevel}">
        <strong>${delta.riskLevel === "high" ? t("deltaFoundTitle") : t("noObviousDeltaTitle")}</strong>
        <p>${escapeHtml(delta.summary)}</p>
      </div>
      <div class="metric-row">
        <span>${escapeHtml(t("cookiesMetric", [delta.beforeCounts.cookies, delta.afterDenyCounts.cookies]))}</span>
        <span>${escapeHtml(t("thirdPartyHostsMetric", [delta.beforeCounts.thirdPartyHosts, delta.afterDenyCounts.thirdPartyHosts]))}</span>
      </div>
      ${delta.denyAction?.clicked ? `<p class="muted">${escapeHtml(t("clickedDenyControl", delta.denyAction.label || t("detectedButton")))}</p>` : `<p class="error">${escapeHtml(t("noDenyButtonClicked"))}</p>`}
      ${cookies.length ? `<h3>${escapeHtml(t("cookiesStillPresent"))}</h3>${cookies.map((cookie) => `<p class="chip">${escapeHtml(cookie.name)} · ${escapeHtml(cookie.domain)} · ${escapeHtml(cookie.service || "")}</p>`).join("")}` : ""}
      ${delta.thirdPartyHosts?.length ? `<h3>${escapeHtml(t("thirdPartyTrafficAfterOptOut"))}</h3>${delta.thirdPartyHosts.slice(0, 12).map((host) => `<p class="chip">${escapeHtml(host)}</p>`).join("")}` : ""}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
