import { applyI18n, getLanguage, initI18n, setLanguage, t } from "./i18n.js";
import { createCoverageSummary } from "./core.js";
import { removeVisualEvidenceItem } from "./visual-evidence.mjs";
const output = document.querySelector("#detailsOutput");
const languageSelect = document.querySelector("#languageSelect");
const sendDeltaMailHint = document.querySelector("#sendDeltaMailHint");
const sendDeltaMailActions = document.querySelector("#sendDeltaMailActions");
const downloadDeltaHtmlButton = document.querySelector("#downloadDeltaHtmlButton");
const downloadDeltaPdfButton = document.querySelector("#downloadDeltaPdfButton");
let detailsPayload = null;
const isDeltaView = new URLSearchParams(window.location.search).get("view") === "delta";
const focusComplaint = new URLSearchParams(window.location.search).get("focus") === "complaint";
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
    output.querySelectorAll("[data-visual-evidence-remove]").forEach((button) => {
      button.addEventListener("click", () => void removeScreenshot(button.dataset.visualEvidenceRemove));
    });
    renderDeltaMailActions();
    if (focusComplaint) sendDeltaMailActions?.scrollIntoView?.({ block: "start" });
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

async function removeScreenshot(itemId) {
  const delta = detailsPayload?.cookiebuddyLastDelta;
  if (!delta?.visualEvidence) return;
  detailsPayload.cookiebuddyLastDelta = {
    ...delta,
    visualEvidence: removeVisualEvidenceItem(delta.visualEvidence, itemId)
  };
  await chrome.storage.local.set({ cookiebuddyLastDelta: detailsPayload.cookiebuddyLastDelta });
  renderDetails();
}

function renderDeltaMailActions() {
  const contacts = detailsPayload?.cookiebuddyLastScan?.analysis?.contacts || detailsPayload?.cookiebuddyLastScan?.contacts || {};
  const dpoEmail = contacts?.dpo?.email || "";
  const authorityEmail = contacts?.authority?.email || "";
  const authority = contacts?.authority || {};
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

  const authorityCandidate = !authorityEmail && authority.url
    ? `<div class="delta-authority-candidate"><div class="delta-authority-candidate-heading"><strong>${escapeHtml(authority.name || t("authorityLabel"))}</strong><span class="audit-badge unclear">${escapeHtml(t("authorityCandidateLabel"))}</span></div><p class="muted">${escapeHtml(authority.note || t("authorityCandidateHint"))}</p><a class="text-link" href="${escapeHtml(authority.url)}" target="_blank" rel="noreferrer">${escapeHtml(t("openAuthorityDetails"))}</a></div>`
    : "";

  if (!sendDeltaMailActions) return;

  currentDeltaTarget = {
    dpoEmail,
    authorityEmail,
    dpoName: contacts?.dpo?.name || t("dpoLabel"),
    authorityName: contacts?.authority?.name || t("authorityLabel"),
    authorityUrl: authority.url || ""
  };

  sendDeltaMailActions.hidden = false;
  sendDeltaMailActions.innerHTML = `
    <div class="delta-mail-copy">
      <h3 id="sendDeltaMailHeading" data-i18n="sendDeltaMailHeading">${escapeHtml(t("sendDeltaMailHeading"))}</h3>
      <p id="sendDeltaMailHint" class="muted" data-i18n="sendDeltaMailHint">${escapeHtml(t("sendDeltaMailHint"))}</p>
      ${mailCards.length ? "" : `<p class="muted">${escapeHtml(t("noDeltaMailRecipient"))}</p>`}
      ${authorityCandidate}
    </div>
    <div class="delta-template-grid">
      ${mailCards.join("")}
    </div>
    <label class="complaint-draft-field" for="complaintDraft"><span>${escapeHtml(t("complaintDraftLabel"))}</span><textarea id="complaintDraft" rows="18">${escapeHtml(buildDeltaMailBody(delta, dpoEmail ? "dpo" : "authority"))}</textarea></label>
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

  const report = sendDeltaMailActions?.querySelector("#complaintDraft")?.value || buildDeltaMailBody(delta, "dpo");
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

function renderDelta(delta, options = {}) {
  const cookies = [...(delta.remainingCookies || []), ...(delta.newCookies || [])];
  const storageEntries = delta.remainingStorageEntries || [];
  const banner = delta.banner || detailsPayload?.cookiebuddyLastScan?.analysis?.banner || null;
  const bannerEvidence = formatBannerEvidence(banner);
  const coverage = delta.coverage || createCoverageSummary({ delta });
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
      <section class="privacy-note">
        <h3>${escapeHtml(t("urlMinimizationHeading"))}</h3>
        <p class="muted">${escapeHtml(t("urlMinimizationCopy"))}</p>
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
          ${renderBrowserStorageEvidence(delta.browserStorage?.after)}
          ${renderPossibleCnameTrackers(delta)}
          ${renderConsentSurfaceLimitations(delta)}
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
          ${renderRejectVerification(delta.denyAction)}
          ${renderAuditIntegrity(delta)}
          ${renderLifecycleEvidence(delta)}
          ${renderCoverage(coverage)}
        </aside>
      </div>
      ${renderVisualEvidence(delta, options)}
    </div>
  `;
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

function renderLifecycleEvidence(delta) {
  const lifecycle = delta.auditLifecycle;
  if (!lifecycle) return "";
  const statusLabel = {
    completed: t("auditLifecycleCompleted"),
    incomplete: t("auditLifecycleIncomplete"),
    failed: t("auditLifecycleFailed"),
    running: t("auditLifecycleRunning")
  }[lifecycle.status] || lifecycle.status;
  const eventLabels = {
    started: t("auditLifecycleStarted"),
    step: t("auditLifecycleStep"),
    navigation: t("auditLifecycleNavigation"),
    "tab-switched": t("auditLifecycleTabSwitch"),
    "popup-reopened": t("auditLifecyclePopupReopened"),
    "service-worker-restarted": t("auditLifecycleWorkerRestarted"),
    timeout: t("auditLifecycleTimeout"),
    "tab-closed": t("auditLifecycleTabClosed")
  };
  const events = (lifecycle.events || []).filter((event) => event.type !== "step").slice(-12);
  return `<section class="lifecycle-report"><h3>${escapeHtml(t("auditLifecycleHeading"))}</h3><p class="muted">${escapeHtml(t("auditLifecycleStatus", statusLabel))}</p>${lifecycle.reason ? `<p class="muted">${escapeHtml(t("auditLifecycleReason", lifecycle.reason))}</p>` : ""}${events.length ? `<ul class="delta-list">${events.map((event) => `<li>${escapeHtml(eventLabels[event.type] || event.type)}${event.kind ? ` · ${escapeHtml(event.kind)}` : ""}${event.url ? ` · ${escapeHtml(event.url)}` : ""}</li>`).join("")}</ul>` : `<p class="empty-state">${escapeHtml(t("auditLifecycleNoInterruptions"))}</p>`}</section>`;
}

function renderCoverage(coverage) {
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
  return `<section class="coverage-report"><h3>${escapeHtml(t("coverageHeading"))}</h3><p class="muted">${escapeHtml(t("coverageIntro"))}</p><p class="coverage-status"><strong>${escapeHtml(t("coverageStatusLabel"))}:</strong> ${escapeHtml(coverage.auditComplete ? t("coverageStatusComplete") : t("coverageStatusIncomplete"))}</p><h4>${escapeHtml(t("coverageObserved"))}</h4><ul class="coverage-list">${(coverage.observed || []).map(renderItem).join("")}</ul><h4>${escapeHtml(t("coverageLimitations"))}</h4><ul class="coverage-list">${(coverage.limitations || []).map(renderItem).join("")}</ul><h4>${escapeHtml(t("coverageHeuristicHeading"))}</h4><ul class="coverage-list">${heuristics || `<li>${escapeHtml(t("coverageHeuristicNone"))}</li>`}</ul></section>`;
}

function renderVisualEvidence(delta, { forExport = false } = {}) {
  const evidence = delta.visualEvidence;
  if (!evidence) return "";
  const items = evidence.items || [];
  const captured = items.filter((item) => item.status === "captured");
  const timeline = delta.auditTimeline || [];
  const cards = items
    .filter((item) => ["captured", "unavailable", "removed"].includes(item.status))
    .map((item) => {
      const phaseLabel = item.phase === "after" ? t("visualEvidenceAfterLabel") : t("visualEvidenceBeforeLabel");
      const timelineEvent = timeline.find((event) => event.evidenceIds?.includes(item.id));
      const stepLabel = timelineEvent ? formatTimelineStep(timelineEvent.step) : formatTimelineStep(item.auditStep);
      if (item.status === "captured") {
        return `<figure class="visual-evidence-card" data-evidence-id="${escapeHtml(item.id)}">
          <img src="${escapeHtml(item.dataUrl)}" alt="${escapeHtml(phaseLabel)}">
          <figcaption><strong>${escapeHtml(phaseLabel)}</strong><span>${escapeHtml(t("visualEvidenceStepLabel", stepLabel))}</span><time datetime="${escapeHtml(item.capturedAt)}">${escapeHtml(formatDate(item.capturedAt))}</time></figcaption>
          ${forExport ? "" : `<button class="ghost-button small" type="button" data-visual-evidence-remove="${escapeHtml(item.id)}">${escapeHtml(t("visualEvidenceRemoveButton"))}</button>`}
        </figure>`;
      }
      const statusLabel = item.status === "removed" ? t("visualEvidenceRemoved") : item.status === "disabled" ? t("visualEvidenceDisabled") : t("visualEvidenceUnavailable");
      return `<div class="visual-evidence-card visual-evidence-unavailable" data-evidence-id="${escapeHtml(item.id)}">
        <strong>${escapeHtml(phaseLabel)}</strong><span>${escapeHtml(statusLabel)}</span><span>${escapeHtml(t("visualEvidenceStepLabel", stepLabel))}</span>
      </div>`;
    }).join("");
  const summary = captured.length ? t("visualEvidenceCaptured") : evidence.enabled ? t("visualEvidenceUnavailable") : t("visualEvidenceDisabled");
  return `<section class="visual-evidence-report" aria-labelledby="visualEvidenceReportHeading">
    <div class="visual-evidence-report-header"><div><h3 id="visualEvidenceReportHeading">${escapeHtml(t("visualEvidenceHeading"))}</h3><p class="muted">${escapeHtml(t("visualEvidenceReviewHint"))}</p></div><span class="audit-badge">${escapeHtml(summary)}</span></div>
    ${cards || `<p class="empty-state">${escapeHtml(t("visualEvidenceNoCapture"))}</p>`}
    <p class="muted">${escapeHtml(t("visualEvidenceWarning"))}</p>
  </section>`;
}

function formatTimelineStep(step) {
  const key = {
    prepare: "auditStepPrepare",
    consent: "auditStepConsent",
    baseline: "auditStepBaseline",
    reject: "auditStepReject",
    verify: "auditStepVerify",
    observe: "auditStepObserve",
    capture: "auditStepCapture",
    analyze: "auditStepAnalyze"
  }[step] || "auditStepCapture";
  return t(key);
}

function renderServiceAudit(service) {
  const statusLabel = {
    "allowed-essential": t("serviceStatusEssential"),
    disabled: t("serviceStatusDisabled"),
    active: t("serviceStatusActive"),
    unclear: t("serviceStatusUnclear")
  }[service.status] || t("serviceStatusUnclear");
  const listedLabel = service.listedInBanner ? t("serviceListedInBanner") : t("serviceNotListedInBanner");
  const ruleLabel = service.ruleVersion ? t("serviceRuleEvidence", [service.ruleId || "local", service.ruleVersion, service.confidence || "none"]) : t("serviceRuleUnknown");
  return `<div class="service-audit-row"><div><strong>${escapeHtml(service.name)}</strong><span>${escapeHtml(service.source || service.category)}</span><small>${escapeHtml(ruleLabel)}</small></div><div><span class="audit-badge ${escapeHtml(service.status)}">${escapeHtml(statusLabel)}</span><small>${escapeHtml(listedLabel)}</small></div></div>`;
}

function openDeltaMailDraft(target = "dpo") {
  const delta = detailsPayload?.cookiebuddyLastDelta;
  if (!delta) return;

  const website = delta.url || "";
  const subject = t(target === "authority" ? "deltaAuthorityReportSubject" : "deltaReportSubject", website || "unknown website");
  const body = sendDeltaMailActions?.querySelector("#complaintDraft")?.value || buildDeltaMailBody(delta, target);
  const contacts = currentDeltaTarget || {};
  const recipient = target === "authority" ? contacts.authorityEmail : contacts.dpoEmail;
  const mailto = `mailto:${recipient ? encodeURIComponent(recipient) : ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.assign(mailto);
}

function buildDeltaMailBody(delta, target = "dpo") {
  const banner = delta.banner || detailsPayload?.cookiebuddyLastScan?.analysis?.banner || null;
  const values = {
    pageUrl: delta.url || t("unknownWebsite"),
    checkedAt: formatDate(delta.checkedAt),
    optOutAction: delta.denyAction?.clicked ? (delta.denyAction.label || t("detectedButton")) : t("noDenyButtonClicked"),
    verification: delta.denyAction?.verified ? t("deltaMailVerificationVerified") : t("deltaMailVerificationUnclear"),
    remainingCookies: formatMailList([...(delta.remainingCookies || []), ...(delta.newCookies || [])].map(formatCookieForMail), t("noneObserved")),
    thirdPartyHosts: formatMailList(delta.thirdPartyHosts || [], t("noneObserved")),
    storageEntries: formatMailList((delta.remainingStorageEntries || []).map(formatStorageForMail), t("noneObserved")),
    serviceAudit: formatMailList((delta.serviceAudit || []).map(formatServiceAuditForMail), t("noneObserved")),
    visualEvidence: formatVisualEvidenceForMail(delta),
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
    `${t("deltaMailWebsiteLabel")}: ${values.pageUrl}`,
    `${t("deltaMailCheckedAtLabel")}: ${values.checkedAt}`,
    `${t("deltaMailOptOutLabel")}: ${values.optOutAction}`,
    `${t("deltaMailVerificationLabel")}: ${values.verification}`,
    "",
    t("deltaMailObservation"),
    "",
    t("urlMinimizationCopy"),
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
    t("visualEvidenceMailNote", values.visualEvidence),
    "",
    t("deltaMailNoLegalClaim"),
    t("deltaMailReportExportNote"),
    "",
    t("mailClosing"),
    values.senderName
  ].join("\n");
}

function formatVisualEvidenceForMail(delta) {
  const evidence = delta.visualEvidence;
  if (!evidence) return t("visualEvidenceDisabled");
  const captured = (evidence.items || []).filter((item) => item.status === "captured").length;
  const unavailable = (evidence.items || []).filter((item) => item.status === "unavailable").length;
  return `${captured} ${t("visualEvidenceCaptured")}${unavailable ? `; ${unavailable} ${t("visualEvidenceUnavailable")}` : ""}`;
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
  const content = renderDelta(delta, { forExport: true }).replace(/\n\s*/g, "");
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

function renderBrowserStorageEvidence(storage) {
  if (!storage) return "";
  const statusLabel = (status) => status === "observed" ? t("storageStatusObserved") : status === "not-inspected" ? t("storageStatusNotInspected") : t("storageStatusNotRecorded");
  const databases = storage.indexedDB?.names || [];
  const caches = storage.cacheStorage?.caches || [];
  const registrations = storage.serviceWorkers?.registrations || [];
  const databaseContent = databases.length ? renderSimpleList(databases) : `<p class="empty-state">${escapeHtml(storage.indexedDB?.status === "not-inspected" ? t("storageStatusNotInspected") : t("noIndexedDbDatabases"))}</p>`;
  const cacheContent = caches.length
    ? `<ul class="delta-list">${caches.map((cache) => `<li><strong>${escapeHtml(cache.name)}</strong> · ${escapeHtml(t("cacheKeyCount", cache.keys?.length || 0))}${cache.keys?.length ? `<ul>${cache.keys.slice(0, 8).map((key) => `<li>${escapeHtml(key.method || "GET")} ${escapeHtml(key.url)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>`
    : `<p class="empty-state">${escapeHtml(storage.cacheStorage?.status === "not-inspected" ? t("storageStatusNotInspected") : t("noCacheStorageCaches"))}</p>`;
  const workerContent = registrations.length
    ? `<ul class="delta-list">${registrations.map((registration) => `<li><strong>${escapeHtml(registration.scope || t("serviceWorkersHeading"))}</strong> · ${escapeHtml(registration.state || "unknown")}${registration.scriptUrl ? ` · ${escapeHtml(registration.scriptUrl)}` : ""}</li>`).join("")}</ul>`
    : `<p class="empty-state">${escapeHtml(storage.serviceWorkers?.status === "not-inspected" ? t("storageStatusNotInspected") : t("noServiceWorkerRegistrations"))}</p>`;
  return `<section class="browser-storage-evidence"><h3>${escapeHtml(t("browserStorageMetadataHeading"))}</h3><p class="muted">${escapeHtml(t("storageInspectionStatus", [statusLabel(storage.indexedDB?.status), statusLabel(storage.cacheStorage?.status), statusLabel(storage.serviceWorkers?.status)]))}</p><div class="storage-evidence-grid"><div><h4>${escapeHtml(t("indexedDbHeading"))}</h4>${databaseContent}</div><div><h4>${escapeHtml(t("cacheStorageHeading"))}</h4>${cacheContent}</div><div><h4>${escapeHtml(t("serviceWorkersHeading"))}</h4>${workerContent}</div></div></section>`;
}

function renderPossibleCnameTrackers(delta) {
  const trackers = delta.possibleCloakedTrackers || [];
  if (!trackers.length) return "";
  return `<section class="possible-cname-evidence"><h3>${escapeHtml(t("possibleCnameHeading"))}</h3><p class="muted">${escapeHtml(t("possibleCnameIntro"))}</p><ul class="delta-list">${trackers.slice(0, 8).map((item) => `<li>${escapeHtml(item.host || t("unknownWebsite"))}${item.path ? ` · ${escapeHtml(item.path)}` : ""}${item.cnameRule?.id ? ` · ${escapeHtml(item.cnameRule.id)}` : ""}</li>`).join("")}</ul></section>`;
}

function renderConsentSurfaceLimitations(delta) {
  const surfaces = delta.inaccessibleConsentSurfaces || [];
  if (!surfaces.length) return "";
  const items = surfaces.slice(0, 8).map((surface) => `<li>${escapeHtml(t("inaccessibleConsentSurface", [surface.frameUrl || t("unknownWebsite"), surface.frameOrigin || "unknown", surface.domContext || t("unknownDomContext")] ))}</li>`).join("");
  return `<section><h3>${escapeHtml(t("inaccessibleConsentHeading"))}</h3><p class="muted">${escapeHtml(t("inaccessibleConsentIntro"))}</p><ul class="delta-list">${items}</ul></section>`;
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
  return `<section class="integrity-report"><h3>${escapeHtml(t("auditIntegrityHeading"))}</h3><p class="muted">${escapeHtml(t("auditIntegrityIntro"))}</p><p class="muted"><strong>${escapeHtml(t("auditIntegrityStatusLabel"))}:</strong> ${escapeHtml(t(statusKey))} · <strong>${escapeHtml(t("auditIntegrityStartingStateLabel"))}:</strong> ${escapeHtml(t(stateKey))}</p>${limitations ? `<h4>${escapeHtml(t("auditIntegrityLimitationsHeading"))}</h4><ul class="coverage-list">${limitations}</ul>` : ""}${evidence ? `<h4>${escapeHtml(t("auditIntegrityEvidenceHeading"))}</h4><ul class="coverage-list">${evidence}</ul>` : ""}${integrity.recommendation !== "none" ? `<p class="muted">${escapeHtml(t("auditIntegrityRecommendation"))}</p>` : ""}</section>`;
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
