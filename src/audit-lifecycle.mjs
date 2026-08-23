import { sanitizeEvidenceUrl } from "./url-evidence.mjs";

export const AUDIT_LIFECYCLE_VERSION = 1;

export const AUDIT_LIFECYCLE_STATUS = Object.freeze({
  running: "running",
  completed: "completed",
  incomplete: "incomplete",
  failed: "failed"
});

const TERMINAL_STATUSES = new Set([AUDIT_LIFECYCLE_STATUS.completed, AUDIT_LIFECYCLE_STATUS.incomplete, AUDIT_LIFECYCLE_STATUS.failed]);

function safeAuditUrl(value = "") {
  return sanitizeEvidenceUrl(value);
}

function safeText(value, maxLength = 160) {
  return String(value || "").slice(0, maxLength);
}

function createEvent(type, payload = {}, at = new Date().toISOString()) {
  const event = { type: safeText(type, 48), at };
  if (payload.phase) event.phase = safeText(payload.phase, 48);
  if (payload.kind) event.kind = safeText(payload.kind, 48);
  if (payload.reason) event.reason = safeText(payload.reason, 160);
  if (payload.url) event.url = safeAuditUrl(payload.url);
  if (payload.fromUrl) event.fromUrl = safeAuditUrl(payload.fromUrl);
  if (payload.toUrl) event.toUrl = safeAuditUrl(payload.toUrl);
  if (Number.isInteger(payload.tabId)) event.tabId = payload.tabId;
  return event;
}

export function createAuditLifecycleState({
  auditId,
  tabId,
  tabUrl = "",
  controllerId = "",
  workerSessionId = "",
  startedAt = new Date().toISOString(),
  maxDurationMs = 30_000
} = {}) {
  return {
    version: AUDIT_LIFECYCLE_VERSION,
    auditId: safeText(auditId || `audit-${Date.now()}`, 80),
    tabId: Number(tabId),
    tabUrl: safeAuditUrl(tabUrl),
    controllerId: safeText(controllerId, 100),
    workerSessionId: safeText(workerSessionId, 100),
    status: AUDIT_LIFECYCLE_STATUS.running,
    phase: "prepare",
    reason: "",
    startedAt,
    updatedAt: startedAt,
    maxDurationMs,
    revision: 0,
    events: [createEvent("started", { phase: "prepare", url: tabUrl }, startedAt)]
  };
}

export function isAuditLifecycleTerminal(status) {
  return TERMINAL_STATUSES.has(status);
}

export function transitionAuditLifecycle(state, type, payload = {}, at = new Date().toISOString()) {
  if (!state) return null;
  if (isAuditLifecycleTerminal(state.status) && type !== "start") return state;

  const next = {
    ...state,
    events: [...(state.events || [])],
    revision: (state.revision || 0) + 1,
    updatedAt: at
  };
  const event = createEvent(type, payload, at);
  next.events.push(event);

  switch (type) {
    case "step":
    case "observation-progress":
      if (payload.phase) next.phase = safeText(payload.phase, 48);
      break;
    case "tab-switched":
      break;
    case "navigation":
      next.status = AUDIT_LIFECYCLE_STATUS.incomplete;
      next.reason = payload.reason || `${payload.kind || "navigation"}-during-audit`;
      break;
    case "popup-reopened":
      next.status = AUDIT_LIFECYCLE_STATUS.incomplete;
      next.reason = "popup-reopened-during-audit";
      break;
    case "service-worker-restarted":
      next.status = AUDIT_LIFECYCLE_STATUS.incomplete;
      next.reason = "service-worker-restarted-during-audit";
      break;
    case "timeout":
      next.status = AUDIT_LIFECYCLE_STATUS.incomplete;
      next.reason = payload.reason || "observation-timeout";
      break;
    case "tab-closed":
      next.status = AUDIT_LIFECYCLE_STATUS.failed;
      next.reason = "tested-tab-closed-during-audit";
      break;
    case "complete":
      next.status = AUDIT_LIFECYCLE_STATUS.completed;
      next.reason = "";
      break;
    case "incomplete":
      next.status = AUDIT_LIFECYCLE_STATUS.incomplete;
      next.reason = payload.reason || "audit-incomplete";
      break;
    case "failed":
      next.status = AUDIT_LIFECYCLE_STATUS.failed;
      next.reason = payload.reason || "audit-failed";
      break;
    default:
      break;
  }

  return next;
}

export function getAuditLifecycleEvidence(state) {
  if (!state) return null;
  return {
    version: state.version,
    auditId: state.auditId,
    tabId: state.tabId,
    tabUrl: state.tabUrl,
    status: state.status,
    phase: state.phase,
    reason: state.reason,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    revision: state.revision,
    events: (state.events || []).slice(-40)
  };
}
