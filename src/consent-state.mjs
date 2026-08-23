const STATUS_RANK = Object.freeze({ unavailable: 0, unclear: 1, observed: 2 });
const GOOGLE_CONSENT_KEYS = new Set(["analytics_storage", "ad_storage", "ad_user_data", "ad_personalization"]);
const OPTIONAL_TCF_PURPOSES = new Set([2, 3, 4, 7, 9, 10]);

function bounded(value, limit = 160) {
  return String(value ?? "").slice(0, limit);
}

function normalizeValue(value) {
  if (value === true || value === 1 || String(value).toLowerCase() === "granted") return "granted";
  if (value === false || value === 0 || String(value).toLowerCase() === "denied") return "denied";
  return "unknown";
}

function normalizeStatus(value) {
  return ["observed", "unclear", "unavailable"].includes(value) ? value : "unavailable";
}

function mergeStatus(left, right) {
  return STATUS_RANK[normalizeStatus(right)] > STATUS_RANK[normalizeStatus(left)] ? normalizeStatus(right) : normalizeStatus(left);
}

function normalizeSignal(signal = {}) {
  const key = bounded(signal.key, 100);
  if (!key) return null;
  return {
    framework: bounded(signal.framework || "unknown", 80),
    key,
    value: normalizeValue(signal.value),
    optional: Boolean(signal.optional),
    source: bounded(signal.source || "unknown", 120),
    observedAt: bounded(signal.observedAt || "", 40),
    rationale: bounded(signal.rationale || "", 240)
  };
}

function uniqueSignals(signals = []) {
  const byKey = new Map();
  for (const signal of signals.map(normalizeSignal).filter(Boolean)) {
    byKey.set(`${signal.framework}:${signal.key}`, signal);
  }
  return [...byKey.values()].slice(0, 160);
}

function normalizeTcString(metadata = null) {
  if (!metadata || typeof metadata !== "object") return null;
  return {
    present: Boolean(metadata.present),
    length: Number.isFinite(metadata.length) ? Math.max(0, Math.min(4096, metadata.length)) : 0,
    eventStatus: bounded(metadata.eventStatus || "unknown", 60),
    cmpStatus: bounded(metadata.cmpStatus || "unknown", 60),
    gdprApplies: typeof metadata.gdprApplies === "boolean" ? metadata.gdprApplies : null
  };
}

export function normalizeConsentState(state = {}) {
  state = state && typeof state === "object" ? state : {};
  const apiSupport = {
    tcf: normalizeStatus(state.apiSupport?.tcf || state.tcf?.status),
    googleConsentMode: normalizeStatus(state.apiSupport?.googleConsentMode || state.googleConsentMode?.status || state.google?.status)
  };
  const signals = uniqueSignals([
    ...(state.signals || []),
    ...(state.tcf?.signals || []),
    ...(state.googleConsentMode?.signals || []),
    ...(state.google?.signals || [])
  ]);
  const frameworks = [...new Set([
    ...(state.frameworks || []).map((framework) => typeof framework === "string" ? framework : framework?.key).filter(Boolean),
    ...(apiSupport.tcf !== "unavailable" ? ["iab-tcf"] : []),
    ...(apiSupport.googleConsentMode !== "unavailable" ? ["google-consent-mode"] : [])
  ])].slice(0, 8);
  const status = [apiSupport.tcf, apiSupport.googleConsentMode].reduce(mergeStatus, normalizeStatus(state.status));
  return {
    status,
    observedAt: bounded(state.observedAt || "", 40),
    bannerVisible: Boolean(state.bannerVisible),
    bannerSignature: bounded(state.bannerSignature || "", 1200),
    consentSignalSignature: bounded(state.consentSignalSignature || "", 2400),
    controlStateSignature: bounded(state.controlStateSignature || "", 2400),
    rejectCandidateCount: Number.isFinite(state.rejectCandidateCount) ? state.rejectCandidateCount : 0,
    frameworks,
    apiSupport,
    tcString: normalizeTcString(state.tcString || state.tcf?.tcString),
    signals,
    limitations: [...new Set((state.limitations || []).map((limitation) => bounded(limitation, 160)).filter(Boolean))].slice(0, 20)
  };
}

export function mergeConsentStates(...states) {
  const normalized = states.filter(Boolean).map(normalizeConsentState);
  if (!normalized.length) return normalizeConsentState();
  const merged = normalized.reduce((result, state) => ({
    ...result,
    ...state,
    observedAt: state.observedAt || result.observedAt,
    frameworks: [...(result.frameworks || []), ...(state.frameworks || [])],
    signals: [...(result.signals || []), ...(state.signals || [])],
    limitations: [...(result.limitations || []), ...(state.limitations || [])],
    apiSupport: {
      tcf: mergeStatus(result.apiSupport?.tcf, state.apiSupport?.tcf),
      googleConsentMode: mergeStatus(result.apiSupport?.googleConsentMode, state.apiSupport?.googleConsentMode)
    },
    tcString: state.tcString || result.tcString
  }));
  return normalizeConsentState(merged);
}

export function getConsentCoverageMissing(beforeState, afterState) {
  if (!beforeState && !afterState) return [];
  const before = normalizeConsentState(beforeState);
  const after = normalizeConsentState(afterState);
  const supportedFrameworks = ["tcf", "googleConsentMode"].filter((key) => before.apiSupport[key] !== "unavailable" || after.apiSupport[key] !== "unavailable");
  if (!supportedFrameworks.length) return ["consent-api-support"];
  return supportedFrameworks
    .filter((key) => before.apiSupport[key] !== "observed" || after.apiSupport[key] !== "observed")
    .map((key) => key === "tcf" ? "iab-tcf-state" : "google-consent-mode-state");
}

export function evaluateConsentSignalContradictions(beforeState, afterState, { rejectionVerified = false } = {}) {
  if (!rejectionVerified) return [];
  const after = normalizeConsentState(afterState);
  return after.signals
    .filter((signal) => signal.optional && signal.value === "granted")
    .map((signal) => ({
      key: signal.key,
      framework: signal.framework,
      value: signal.value,
      source: signal.source,
      observedAt: signal.observedAt,
      rationale: signal.rationale || "Optional consent remained granted after verified rejection",
      severity: "high",
      before: normalizeConsentState(beforeState).signals.find((candidate) => candidate.framework === signal.framework && candidate.key === signal.key)?.value || "unknown"
    }))
    .slice(0, 40);
}

export async function collectMainWorldConsentState() {
  const observedAt = new Date().toISOString();
  const state = {
    status: "unavailable",
    observedAt,
    frameworks: [],
    apiSupport: { tcf: "unavailable", googleConsentMode: "unavailable" },
    signals: [],
    limitations: [],
    tcf: { status: "unavailable", signals: [] },
    googleConsentMode: { status: "unavailable", signals: [] }
  };
  const normalizeApiValue = (value) => value === true || value === 1 || String(value).toLowerCase() === "granted"
    ? "granted"
    : value === false || value === 0 || String(value).toLowerCase() === "denied" ? "denied" : "unknown";
  const pushSignal = (target, signal) => {
    if (!signal.key) return;
    const normalized = { ...signal, value: normalizeApiValue(signal.value), observedAt };
    const existingIndex = state.signals.findIndex((item) => item.framework === signal.framework && item.key === signal.key);
    if (existingIndex >= 0) state.signals.splice(existingIndex, 1);
    const targetIndex = target.signals.findIndex((item) => item.framework === signal.framework && item.key === signal.key);
    if (targetIndex >= 0) target.signals.splice(targetIndex, 1);
    state.signals.push(normalized);
    target.signals.push(normalized);
  };

  if (typeof globalThis.__tcfapi === "function") {
    state.tcf.status = "unclear";
    try {
      const response = await new Promise((resolve) => {
        let settled = false;
        let timeoutId = null;
        const finish = (data, success) => {
          if (settled) return;
          settled = true;
          if (timeoutId != null) globalThis.clearTimeout?.(timeoutId);
          resolve({ data, success });
        };
        try {
          globalThis.__tcfapi("getTCData", 2, finish);
          timeoutId = globalThis.setTimeout?.(() => finish(null, false), 500);
        } catch {
          finish(null, false);
        }
      });
      const tcData = response.success === false ? null : response.data;
      if (tcData && typeof tcData === "object") {
        state.tcf.status = "observed";
        const tcString = String(tcData.tcString || "");
        state.tcf.tcString = {
          present: Boolean(tcString),
          length: Math.min(tcString.length, 4096),
          eventStatus: String(tcData.eventStatus || "unknown"),
          cmpStatus: String(tcData.cmpStatus || "unknown"),
          gdprApplies: typeof tcData.gdprApplies === "boolean" ? tcData.gdprApplies : null
        };
        for (const [purpose, value] of Object.entries(tcData.purpose?.consents || {}).slice(0, 50)) {
          const purposeId = Number(purpose);
          pushSignal(state.tcf, {
            framework: "iab-tcf",
            key: `purpose:${purpose}`,
            value,
            optional: OPTIONAL_TCF_PURPOSES.has(purposeId),
            source: "__tcfapi:getTCData",
            rationale: OPTIONAL_TCF_PURPOSES.has(purposeId) ? "Optional TCF purpose" : "TCF purpose retained for context"
          });
        }
        for (const [vendor, value] of Object.entries(tcData.vendor?.consents || {}).slice(0, 100)) {
          pushSignal(state.tcf, {
            framework: "iab-tcf",
            key: `vendor:${vendor}`,
            value,
            optional: true,
            source: "__tcfapi:getTCData",
            rationale: "TCF vendor consent"
          });
        }
      } else {
        state.tcf.limitations = ["iab-tcf-api-unreadable"];
      }
    } catch {
      state.tcf.limitations = ["iab-tcf-api-error"];
    }
  } else {
    state.tcf.limitations = ["iab-tcf-api-unavailable"];
  }

  const google = globalThis.google_tag_data;
  const googleSignals = state.googleConsentMode;
  let googleStateObserved = false;
  const addGoogleSignal = (key, value, source) => {
    if (!GOOGLE_CONSENT_KEYS.has(key)) return;
    googleStateObserved = true;
    pushSignal(googleSignals, {
      framework: "google-consent-mode",
      key,
      value,
      optional: true,
      source,
      rationale: "Google Consent Mode signal"
    });
  };
  const readGoogleValue = (entry) => entry && typeof entry === "object"
    ? entry.update ?? entry.default ?? entry.value ?? entry.state
    : entry;
  for (const [key, entry] of Object.entries(google?.ics?.entries || {})) addGoogleSignal(key, readGoogleValue(entry), "google_tag_data.ics.entries");
  for (const item of Array.isArray(globalThis.dataLayer) ? globalThis.dataLayer.slice(-100) : []) {
    if (!Array.isArray(item) || item[0] !== "consent" || !item[2] || typeof item[2] !== "object") continue;
    for (const [key, value] of Object.entries(item[2])) addGoogleSignal(key, value, `dataLayer:${item[1] || "unknown"}`);
  }
  if (state.signals.some((signal) => signal.framework === "google-consent-mode")) {
    googleSignals.status = "observed";
  } else if (googleStateObserved || google?.ics || google) {
    googleSignals.status = "unclear";
    googleSignals.limitations = ["google-consent-mode-state-unreadable"];
  } else {
    googleSignals.status = "unavailable";
    googleSignals.limitations = ["google-consent-mode-unavailable"];
  }

  state.tcf.limitations = [...(state.tcf.limitations || [])];
  state.googleConsentMode.limitations = [...(googleSignals.limitations || [])];
  state.apiSupport = { tcf: state.tcf.status, googleConsentMode: googleSignals.status };
  state.frameworks = [
    ...(state.tcf.status !== "unavailable" ? ["iab-tcf"] : []),
    ...(googleSignals.status !== "unavailable" ? ["google-consent-mode"] : [])
  ];
  state.limitations = [...new Set([...state.tcf.limitations, ...googleSignals.limitations])];
  state.status = [state.tcf.status, googleSignals.status].reduce(mergeStatus, "unavailable");
  state.tcString = state.tcf.tcString || null;
  return normalizeConsentState(state);
}
