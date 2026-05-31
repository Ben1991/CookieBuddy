import { applyI18n, getLanguage, initI18n, setLanguage, t } from "./i18n.js";
import { formatDeltaReport } from "./core.js";

const output = document.querySelector("#detailsOutput");
const languageSelect = document.querySelector("#languageSelect");
const sendDeltaMailHint = document.querySelector("#sendDeltaMailHint");
const sendDeltaMailActions = document.querySelector("#sendDeltaMailActions");
const downloadDeltaHtmlButton = document.querySelector("#downloadDeltaHtmlButton");
const downloadDeltaPdfButton = document.querySelector("#downloadDeltaPdfButton");
let detailsPayload = null;
const isDeltaView = new URLSearchParams(window.location.search).get("view") === "delta";
let currentDeltaTarget = null;

await initI18n();
applyLocalizedText();
output.textContent = t("loading");

languageSelect.addEventListener("change", async (event) => {
  await setLanguage(event.target.value);
  applyLocalizedText();
  renderDetails();
});

downloadDeltaHtmlButton?.addEventListener("click", () => void downloadDeltaHtmlReport());
downloadDeltaPdfButton?.addEventListener("click", openDeltaPdfView);

detailsPayload = await chrome.storage.local.get([
  "cookiebuddyLastScan",
  "cookiebuddyLastDelta"
]);
renderDetails();

function applyLocalizedText() {
  languageSelect.value = getLanguage();
  applyI18n();
  if (sendDeltaMailHint) sendDeltaMailHint.textContent = t("sendDeltaMailHint");
  if (downloadDeltaHtmlButton) downloadDeltaHtmlButton.textContent = t("downloadDeltaHtmlButton");
  if (downloadDeltaPdfButton) downloadDeltaPdfButton.textContent = t("downloadDeltaPdfButton");
}

function renderDetails() {
  if (!detailsPayload) return;

  if (isDeltaView && detailsPayload.cookiebuddyLastDelta) {
    output.innerHTML = renderDelta(detailsPayload.cookiebuddyLastDelta);
    renderDeltaMailActions();
    return;
  }

  if (sendDeltaMailActions) sendDeltaMailActions.hidden = true;

  output.textContent = JSON.stringify(
    {
      lastScan: detailsPayload.cookiebuddyLastScan || null,
      lastDelta: detailsPayload.cookiebuddyLastDelta || null
    },
    null,
    2
  );
}

function renderDeltaMailActions() {
  const contacts = detailsPayload?.cookiebuddyLastScan?.analysis?.contacts || detailsPayload?.cookiebuddyLastScan?.contacts || {};
  const dpoEmail = contacts?.dpo?.email || "";
  const authorityEmail = contacts?.authority?.email || "";
  const mailButtons = [];

  if (dpoEmail) {
    mailButtons.push(`<button class="primary-action small" type="button" data-mail-target="dpo">${escapeHtml(t("sendDeltaMailToDpoButton"))}</button>`);
  }
  if (authorityEmail) {
    mailButtons.push(`<button class="ghost-button small" type="button" data-mail-target="authority">${escapeHtml(t("sendDeltaMailToAuthorityButton"))}</button>`);
  }

  if (!sendDeltaMailActions) return;

  currentDeltaTarget = {
    dpoEmail,
    authorityEmail,
    dpoName: contacts?.dpo?.name || t("dpoLabel"),
    authorityName: contacts?.authority?.name || t("authorityLabel")
  };

  sendDeltaMailActions.hidden = false;
  sendDeltaMailActions.innerHTML = `
    <div class="delta-mail-copy">
      <h3 id="sendDeltaMailHeading" data-i18n="sendDeltaMailHeading">${escapeHtml(t("sendDeltaMailHeading"))}</h3>
      <p id="sendDeltaMailHint" class="muted" data-i18n="sendDeltaMailHint">${escapeHtml(t("sendDeltaMailHint"))}</p>
      ${mailButtons.length ? "" : `<p class="muted">${escapeHtml(t("noDeltaMailRecipient"))}</p>`}
    </div>
    <div class="contact-actions">
      ${mailButtons.join("")}
      <button id="downloadDeltaHtmlButton" class="ghost-button small" type="button" data-i18n="downloadDeltaHtmlButton">${escapeHtml(t("downloadDeltaHtmlButton"))}</button>
      <button id="downloadDeltaPdfButton" class="ghost-button small" type="button" data-i18n="downloadDeltaPdfButton">${escapeHtml(t("downloadDeltaPdfButton"))}</button>
    </div>
  `;

  sendDeltaMailActions.querySelectorAll("button[data-mail-target]").forEach((button) => {
    button.addEventListener("click", () => openDeltaMailDraft(button.dataset.mailTarget));
  });

  sendDeltaMailActions.querySelector("#downloadDeltaHtmlButton")?.addEventListener("click", downloadDeltaHtmlReport);
  sendDeltaMailActions.querySelector("#downloadDeltaPdfButton")?.addEventListener("click", openDeltaPdfView);

  applyI18n(sendDeltaMailActions);
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

function openDeltaMailDraft(target = "dpo") {
  const delta = detailsPayload?.cookiebuddyLastDelta;
  if (!delta) return;

  const website = delta.url || "";
  const subject = t(target === "authority" ? "deltaAuthorityReportSubject" : "deltaReportSubject", website || "unknown website");
  const body = formatDeltaReport(delta, website);
  const contacts = currentDeltaTarget || {};
  const recipient = target === "authority" ? contacts.authorityEmail : contacts.dpoEmail;
  const mailto = `mailto:${recipient ? encodeURIComponent(recipient) : ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.assign(mailto);
}

async function downloadDeltaHtmlReport() {
  const delta = detailsPayload?.cookiebuddyLastDelta;
  if (!delta) return;
  const report = buildDeltaHtmlDocument(delta);
  const BlobCtor = globalThis.Blob || (await import("node:buffer")).Blob;
  const blob = new BlobCtor([report], { type: "text/html;charset=utf-8" });
  triggerDownload(blob, "cookiebuddy-delta-report.html");
}

function openDeltaPdfView() {
  const delta = detailsPayload?.cookiebuddyLastDelta;
  if (!delta) return;

  const report = buildDeltaHtmlDocument(delta, { printable: true });
  const pdfWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!pdfWindow) return;

  pdfWindow.document.open();
  pdfWindow.document.write(report);
  pdfWindow.document.close();
  pdfWindow.focus();
  pdfWindow.print();
}

function buildDeltaHtmlDocument(delta, options = {}) {
  const title = t("deltaReportDocumentTitle");
  const content = renderDelta(delta).replace(/\n\s*/g, "");
  const printableNote = options.printable
    ? `<p class="muted">${escapeHtml(t("deltaPdfHint"))}</p>`
    : "";

  return `<!doctype html>
<html lang="${escapeHtml(getLanguage())}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:Arial,sans-serif;line-height:1.5;margin:32px;color:#1f2937;background:#fff}
    .delta-report{max-width:900px}
    .risk{padding:16px;border-radius:12px;margin-bottom:16px;border:1px solid #d1d5db}
    .risk.high{background:#fef2f2}
    .risk.low{background:#f0fdf4}
    .metric-row{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}
    .chip{display:block;padding:8px 12px;border:1px solid #d1d5db;border-radius:999px;margin:8px 0}
    h1,h2,h3{margin-top:0}
    .muted{color:#4b5563}
    .error{color:#b91c1c}
    @media print{body{margin:0} .muted.print-note{display:block}}
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${printableNote}
  ${content}
</body>
</html>`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
