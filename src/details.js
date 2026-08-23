import { applyI18n, getLanguage, initI18n, setLanguage, t } from "./i18n.js";
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
  const delta = detailsPayload?.cookiebuddyLastDelta;
  const website = delta?.url || t("unknownWebsite");
  const mailCards = [];

  if (dpoEmail) {
    mailCards.push(renderMailCard({
      tone: "blue",
      title: t("sendDeltaMailToDpoButton"),
      description: t("sendDeltaMailToDpoHint"),
      recipient: dpoEmail,
      subject: t("deltaReportSubject", website),
      buttonLabel: t("openMailDraftButton"),
      target: "dpo"
    }));
  }
  if (authorityEmail) {
    mailCards.push(renderMailCard({
      tone: "purple",
      title: t("sendDeltaMailToAuthorityButton"),
      description: t("sendDeltaMailToAuthorityHint"),
      recipient: authorityEmail,
      subject: t("deltaAuthorityReportSubject", website),
      buttonLabel: t("openMailDraftButton"),
      target: "authority"
    }));
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
      ${mailCards.length ? "" : `<p class="muted">${escapeHtml(t("noDeltaMailRecipient"))}</p>`}
    </div>
    <div class="delta-template-grid">
      ${mailCards.join("")}
    </div>
    <div class="contact-actions">
      <button id="downloadDeltaHtmlButton" class="ghost-button small" type="button" data-i18n="downloadDeltaHtmlButton">${escapeHtml(t("downloadDeltaHtmlButton"))}</button>
      <button id="downloadDeltaPdfButton" class="ghost-button small" type="button" data-i18n="downloadDeltaPdfButton">${escapeHtml(t("downloadDeltaPdfButton"))}</button>
      <button id="copyDeltaReportButton" class="primary-button small" type="button" data-i18n="copyDeltaReportButton">${escapeHtml(t("copyDeltaReportButton"))}</button>
    </div>
  `;

  sendDeltaMailActions.querySelectorAll("button[data-mail-target]").forEach((button) => {
    button.addEventListener("click", () => openDeltaMailDraft(button.dataset.mailTarget));
  });

  sendDeltaMailActions.querySelector("#downloadDeltaHtmlButton")?.addEventListener("click", downloadDeltaHtmlReport);
  sendDeltaMailActions.querySelector("#downloadDeltaPdfButton")?.addEventListener("click", openDeltaPdfView);
  sendDeltaMailActions.querySelector("#copyDeltaReportButton")?.addEventListener("click", () => void copyDeltaReport());

  applyI18n(sendDeltaMailActions);
}

async function copyDeltaReport() {
  const delta = detailsPayload?.cookiebuddyLastDelta;
  const button = sendDeltaMailActions?.querySelector("#copyDeltaReportButton");
  if (!delta || !button) return;

  const report = buildDeltaMailBody(delta, "dpo");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(report);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = report;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    button.textContent = t("deltaReportCopied");
    window.setTimeout(() => { button.textContent = t("copyDeltaReportButton"); }, 1800);
  } catch {
    button.textContent = t("deltaReportCopyFailed");
  }
}

function renderMailCard({ tone, title, description, recipient, subject, buttonLabel, target }) {
  return `
    <article class="delta-template-card ${tone}">
      <div>
        <h4>${escapeHtml(title)}</h4>
        <p class="muted">${escapeHtml(description)}</p>
      </div>
      <dl>
        <div>
          <dt>${escapeHtml(t("mailToLabel"))}</dt>
          <dd>${escapeHtml(recipient)}</dd>
        </div>
        <div>
          <dt>${escapeHtml(t("mailSubjectLabel"))}</dt>
          <dd>${escapeHtml(subject)}</dd>
        </div>
      </dl>
      <button class="ghost-button small" type="button" data-mail-target="${escapeHtml(target)}">${escapeHtml(buttonLabel)}</button>
    </article>
  `;
}

function renderDelta(delta) {
  const cookies = [...(delta.remainingCookies || []), ...(delta.newCookies || [])];
  const storageEntries = delta.remainingStorageEntries || [];
  const banner = delta.banner || detailsPayload?.cookiebuddyLastScan?.analysis?.banner || null;
  const bannerEvidence = formatBannerEvidence(banner);
  return `
    <div class="delta-report">
      <div class="delta-report-header">
        <div>
          <p class="eyebrow">CookieBuddy</p>
          <h2>${escapeHtml(t("deltaReportDocumentTitle"))}</h2>
        </div>
        <span class="status-pill ${delta.riskLevel}">${escapeHtml(delta.riskLevel === "high" ? t("reviewRecommended") : t("noObviousDeltaTitle"))}</span>
      </div>
      <div class="delta-fact-grid">
        <div><span>${escapeHtml(t("checkedPageLabel"))}</span><strong>${escapeHtml(delta.url || t("unknownWebsite"))}</strong></div>
        <div><span>${escapeHtml(t("checkedOnLabel"))}</span><strong>${escapeHtml(formatDate(delta.checkedAt))}</strong></div>
        <div><span>${escapeHtml(t("languageLabel"))}</span><strong>${escapeHtml(getLanguage() === "de" ? "Deutsch" : "English")}</strong></div>
        <div><span>${escapeHtml(t("cookieBannerLabel"))}</span><strong>${escapeHtml(getBannerProvider(banner))}</strong></div>
        <div><span>${escapeHtml(t("optOutAttemptLabel"))}</span><strong>${escapeHtml(delta.denyAction?.clicked ? (delta.denyAction.label || t("detectedButton")) : t("noDenyButtonClicked"))}</strong></div>
      </div>
      <section class="delta-detected-box">
        <h3>${escapeHtml(t("observedFactsHeading"))}</h3>
        <p class="muted">${escapeHtml(t("stillDetectedHeading"))}</p>
        <div class="metric-row">
          <span><strong>${cookies.length}</strong>${escapeHtml(t("cookiesStillVisibleMetric"))}</span>
          <span><strong>${delta.thirdPartyHosts?.length || 0}</strong>${escapeHtml(t("thirdPartyStillContactedMetric"))}</span>
          <span><strong>${storageEntries.length}</strong>${escapeHtml(t("storageStillVisibleMetric"))}</span>
        </div>
      </section>
      <div class="delta-content-grid">
        <div class="delta-findings">
          <section>
            <h3>${escapeHtml(t("cookiesRemainingAfterOptOutHeading"))}</h3>
            ${cookies.length ? renderCookieTable(cookies) : `<p class="empty-state">${escapeHtml(t("noRemainingCookies"))}</p>`}
          </section>
          <section>
            <h3>${escapeHtml(t("thirdPartyHostsAfterOptOutHeading"))}</h3>
            ${delta.thirdPartyHosts?.length ? renderSimpleList(delta.thirdPartyHosts) : `<p class="empty-state">${escapeHtml(t("noThirdPartyHosts"))}</p>`}
          </section>
          <section>
            <h3>${escapeHtml(t("browserStorageAfterOptOutHeading"))}</h3>
            ${storageEntries.length ? renderStorageTable(storageEntries) : `<p class="empty-state">${escapeHtml(t("noStorageEntries"))}</p>`}
          </section>
          <section>
            <h3>${escapeHtml(t("serviceAuditHeading"))}</h3>
            <p class="muted">${escapeHtml(t("serviceAuditIntro"))}</p>
            ${delta.serviceAudit?.length ? delta.serviceAudit.map(renderServiceAudit).join("") : `<p class="empty-state">${escapeHtml(t("noServiceAudit"))}</p>`}
          </section>
        </div>
        <aside class="delta-side-panel">
          <section>
            <h3>${escapeHtml(t("bannerEvidenceHeading"))}</h3>
            <p class="muted">${escapeHtml(t("bannerEvidenceIntro"))}</p>
            ${renderSimpleList(bannerEvidence)}
          </section>
          <section class="warning-panel">
            <h3>${escapeHtml(t("interpretationHeading"))}</h3>
            <p class="muted">${escapeHtml(t("importantLimitationsHeading"))}</p>
            ${renderSimpleList([t("deltaLimitationBestEffort"), t("deltaLimitationServerSide"), t("deltaLimitationNecessary"), t("deltaLimitationHeuristic")])}
          </section>
        </aside>
      </div>
    </div>
  `;
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

function openDeltaMailDraft(target = "dpo") {
  const delta = detailsPayload?.cookiebuddyLastDelta;
  if (!delta) return;

  const website = delta.url || "";
  const subject = t(target === "authority" ? "deltaAuthorityReportSubject" : "deltaReportSubject", website || "unknown website");
  const body = buildDeltaMailBody(delta, target);
  const contacts = currentDeltaTarget || {};
  const recipient = target === "authority" ? contacts.authorityEmail : contacts.dpoEmail;
  const mailto = `mailto:${recipient ? encodeURIComponent(recipient) : ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.assign(mailto);
}

function buildDeltaMailBody(delta, target = "dpo") {
  const banner = delta.banner || detailsPayload?.cookiebuddyLastScan?.analysis?.banner || null;
  const values = {
    pageUrl: delta.url || t("unknownWebsite"),
    remainingCookies: formatMailList([...(delta.remainingCookies || []), ...(delta.newCookies || [])].map(formatCookieForMail), t("noneObserved")),
    thirdPartyHosts: formatMailList(delta.thirdPartyHosts || [], t("noneObserved")),
    storageEntries: formatMailList((delta.remainingStorageEntries || []).map(formatStorageForMail), t("noneObserved")),
    serviceAudit: formatMailList((delta.serviceAudit || []).map(formatServiceAuditForMail), t("noneObserved")),
    bannerProvider: getBannerProvider(banner),
    bannerEvidence: formatMailList(formatBannerEvidence(banner), t("noBannerEvidence")),
    senderName: t("senderNamePlaceholder")
  };

  const intro = target === "authority" ? t("deltaAuthorityMailIntro") : t("deltaDpoMailIntro");
  return [
    t("mailHello"),
    "",
    intro,
    "",
    values.pageUrl,
    "",
    t("deltaMailObservation"),
    "",
    t("deltaMailItemsIntro"),
    "",
    `**${t("cookiesRemainingAfterOptOutHeading")}**`,
    values.remainingCookies,
    "",
    `**${t("thirdPartyHostsAfterOptOutHeading")}**`,
    values.thirdPartyHosts,
    "",
    `**${t("browserStorageEntriesHeading")}**`,
    values.storageEntries,
    "",
    `**${t("deltaMailServiceAudit")}**`,
    values.serviceAudit,
    "",
    t("deltaMailBestEffort"),
    "",
    t("deltaMailQuestionsIntro"),
    "",
    `1. ${t("deltaMailQuestionNecessary")}`,
    `2. ${t("deltaMailQuestionLegalBasis")}`,
    `3. ${t("deltaMailQuestionOptionalActive")}`,
    `4. ${t("deltaMailQuestionWithdraw")}`,
    `5. ${t("deltaMailQuestionNotice")}`,
    "",
    t("deltaMailBannerReference"),
    "",
    values.bannerProvider,
    "",
    `${t("deltaMailDetectionEvidence")}:`,
    "",
    values.bannerEvidence,
    "",
    t("deltaMailNoLegalClaim"),
    "",
    t("mailClosing"),
    values.senderName
  ].join("\n");
}

function formatServiceAuditForMail(service) {
  const statusKey = {
    "allowed-essential": "serviceStatusEssential",
    disabled: "serviceStatusDisabled",
    active: "serviceStatusActive",
    unclear: "serviceStatusUnclear"
  }[service.status] || "serviceStatusUnclear";
  const listed = service.listedInBanner ? t("serviceListedInBanner") : t("serviceNotListedInBanner");
  return `${service.name}: ${t(statusKey)}; ${listed}; ${service.source || service.category}`;
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
    .delta-report{display:grid;gap:18px;max-width:980px}
    .delta-report-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
    .eyebrow{margin:0 0 4px;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase}
    .status-pill{display:inline-flex;padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-weight:700}
    .status-pill.high{background:#fef3c7;color:#92400e}
    .status-pill.low{background:#dcfce7;color:#166534}
    .delta-fact-grid,.delta-detected-box,.delta-findings section,.delta-side-panel section{padding:14px;border:1px solid #d1d5db;border-radius:8px}
    .delta-fact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;background:#f8fafc}
    .delta-fact-grid span{display:block;color:#64748b;font-size:12px;font-weight:700}
    .delta-fact-grid strong{overflow-wrap:anywhere}
    .delta-detected-box{background:#fffbeb;border-color:#fcd34d}
    .metric-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .metric-row span{display:grid;gap:2px;padding:10px;border:1px solid #d1d5db;border-radius:8px;background:#fff}
    .metric-row strong{font-size:22px}
    .delta-content-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(240px,.8fr);gap:14px}
    .delta-findings,.delta-side-panel{display:grid;gap:14px}
    .delta-table{width:100%;border-collapse:collapse;font-size:13px}
    .delta-table th,.delta-table td{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top;overflow-wrap:anywhere}
    .delta-table th{color:#64748b;font-size:12px}
    .delta-list{margin:0;padding-left:18px;color:#475569}
    .empty-state{padding:10px;border:1px dashed #cbd5e1;border-radius:8px;color:#475569}
    h1,h2,h3{margin-top:0}
    .muted{color:#4b5563}
    .error{color:#b91c1c}
    @media(max-width:760px){.delta-content-grid,.delta-fact-grid,.metric-row{grid-template-columns:1fr}.delta-report-header{display:block}}
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

function renderCookieTable(cookies) {
  return `
    <table class="delta-table">
      <thead><tr><th>${escapeHtml(t("cookieColumn"))}</th><th>${escapeHtml(t("domainColumn"))}</th><th>${escapeHtml(t("categoryColumn"))}</th><th>${escapeHtml(t("reasonColumn"))}</th></tr></thead>
      <tbody>
        ${cookies.slice(0, 12).map((cookie) => `
          <tr>
            <td>${escapeHtml(cookie.name)}</td>
            <td>${escapeHtml(cookie.domain)}</td>
            <td>${escapeHtml(cookie.service || t("unknownService"))}</td>
            <td>${escapeHtml(t("stillPresentAfterOptOut"))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderStorageTable(entries) {
  return `
    <table class="delta-table">
      <thead><tr><th>${escapeHtml(t("storageKeyColumn"))}</th><th>${escapeHtml(t("typeColumn"))}</th><th>${escapeHtml(t("bannerRelatedColumn"))}</th><th>${escapeHtml(t("reasonColumn"))}</th></tr></thead>
      <tbody>
        ${entries.slice(0, 12).map((entry) => `
          <tr>
            <td>${escapeHtml(entry.key)}</td>
            <td>${escapeHtml(entry.scope)}</td>
            <td>${escapeHtml(entry.inBanner ? t("yes") : t("unclear"))}</td>
            <td>${escapeHtml(t("stillPresentAfterOptOut"))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderSimpleList(items) {
  return `<ul class="delta-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function formatMailList(items, emptyLabel) {
  if (!items.length) return emptyLabel;
  return items.map((item) => `- ${item}`).join("\n");
}

function formatCookieForMail(cookie) {
  const service = cookie.service ? `, ${cookie.service}` : "";
  return `${cookie.name} (${cookie.domain}${service})`;
}

function formatStorageForMail(entry) {
  return `${entry.key} (${entry.scope})`;
}

function getBannerProvider(banner) {
  return banner?.name || t("unknownBannerProvider");
}

function formatBannerEvidence(banner) {
  if (!banner) return [t("noBannerEvidence")];
  const evidence = [];
  if (banner.name) evidence.push(t("bannerProviderEvidence", banner.name));
  if (banner.source?.host) evidence.push(t("bannerSourceHostEvidence", banner.source.host));
  if (banner.source?.value) evidence.push(t("bannerSourceValueEvidence", banner.source.value));
  for (const item of banner.evidence || []) {
    if (item.value) evidence.push(item.source ? `${item.source}: ${item.value}` : item.value);
  }
  return Array.from(new Set(evidence)).slice(0, 8);
}

function formatDate(value) {
  if (!value) return t("unknownDate");
  return new Date(value).toLocaleString(getLanguage() === "de" ? "de-DE" : "en-US");
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
