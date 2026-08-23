const VISUAL_PHASES = new Set(["before", "after"]);
const VISUAL_STATUSES = new Set(["captured", "unavailable", "disabled", "removed"]);

export function sanitizeEvidenceUrl(rawUrl = "") {
  try {
    const url = new URL(rawUrl);
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

export function canCaptureVisibleTab({ testedTab, activeTab, captureAvailable } = {}) {
  return Boolean(
    captureAvailable
    && testedTab?.id != null
    && activeTab?.id === testedTab.id
    && testedTab.windowId != null
    && activeTab.windowId === testedTab.windowId
  );
}

export function createVisualEvidenceItem({
  phase,
  status,
  dataUrl = "",
  tabUrl = "",
  auditStep,
  rejectControlLabel = "",
  capturedAt = new Date().toISOString(),
  reason = ""
} = {}) {
  const safePhase = VISUAL_PHASES.has(phase) ? phase : "before";
  const safeStatus = VISUAL_STATUSES.has(status) ? status : "unavailable";
  const safeDataUrl = safeStatus === "captured" && /^data:image\/(?:png|jpeg);base64,/i.test(dataUrl) ? dataUrl : "";
  return {
    id: `visual-${safePhase}-${Date.parse(capturedAt) || Date.now()}`,
    phase: safePhase,
    status: safeStatus,
    dataUrl: safeDataUrl,
    url: sanitizeEvidenceUrl(tabUrl),
    auditStep: auditStep || (safePhase === "before" ? "baseline" : "verify"),
    rejectControlLabel: String(rejectControlLabel || "").slice(0, 160),
    capturedAt,
    reason: String(reason || "").slice(0, 120)
  };
}

export function createVisualEvidenceState({ enabled = false, items = [], rejectControlLabel = "" } = {}) {
  return {
    enabled: Boolean(enabled),
    items: Array.isArray(items) ? items : [],
    rejectControlLabel: String(rejectControlLabel || "").slice(0, 160)
  };
}

export function removeVisualEvidenceItem(evidence, itemId) {
  const current = createVisualEvidenceState(evidence);
  return {
    ...current,
    items: current.items.map((item) => item.id === itemId
      ? { ...item, status: "removed", dataUrl: "", reason: "removed-by-user" }
      : item)
  };
}

export function createAuditTimelineEvent(step, at = new Date().toISOString(), evidenceIds = []) {
  return {
    step: String(step || "unknown"),
    at,
    evidenceIds: Array.isArray(evidenceIds) ? evidenceIds.filter(Boolean).slice(0, 4) : []
  };
}
