const STATE_CHANGE_EVIDENCE = Object.freeze([
  ["reject-control-removed", (before, after) => before.rejectCandidateCount > after.rejectCandidateCount],
  ["consent-signals-changed", (before, after) => before.consentSignalSignature !== after.consentSignalSignature],
  ["banner-state-changed", (before, after) => before.bannerSignature !== after.bannerSignature],
  ["consent-control-state-changed", (before, after) => before.controlStateSignature !== after.controlStateSignature]
]);

export function evaluateConsentStateChange(before = {}, after = {}) {
  const evidence = STATE_CHANGE_EVIDENCE
    .filter(([, matches]) => matches(before, after))
    .map(([key]) => key);
  const changed = evidence.length > 0;
  const completed = changed && (after.rejectCandidateCount === 0 || after.bannerVisible === false);

  return {
    status: completed ? "verified" : changed ? "changed-not-final" : "unverified",
    evidence
  };
}
