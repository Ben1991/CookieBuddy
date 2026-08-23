/**
 * Local-only performance and evidence-retention contract.
 */
export const PERFORMANCE_BUDGETS = Object.freeze({
  idle: Object.freeze({ capturedRequests: 0, sessionWritesPerRequest: 0 }),
  activeAudit: Object.freeze({ maxDurationMs: 30_000, maxRequestsPerTab: 500 }),
  pageAnalysis: Object.freeze({
    maxPageTextChars: 120_000,
    maxHtmlSampleChars: 250_000,
    maxResources: 250,
    maxConsentNodes: 96,
    maxBannerTextChars: 20_000,
    maxStorageEntries: 50,
    maxContactPages: 8,
    maxContactResponseChars: 200_000,
    contactTimeoutMs: 1_500
  })
});

export function isWithinBudget(value, limit) {
  return Number.isFinite(value) && value >= 0 && value <= limit;
}

export function summarizeAuditBudget({ durationMs = 0, requestCount = 0 } = {}) {
  return {
    durationMs,
    requestCount,
    durationWithinBudget: isWithinBudget(durationMs, PERFORMANCE_BUDGETS.activeAudit.maxDurationMs),
    requestsWithinBudget: isWithinBudget(requestCount, PERFORMANCE_BUDGETS.activeAudit.maxRequestsPerTab)
  };
}
