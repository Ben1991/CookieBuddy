import test from "node:test";
import assert from "node:assert/strict";
import { evaluateConsentStateChange } from "../src/consent-verification.mjs";

test("does not verify a click when consent state is unchanged", () => {
  const state = {
    bannerVisible: true,
    bannerSignature: "reject all",
    consentSignalSignature: "#cookie-banner",
    controlStateSignature: "reject all~button",
    rejectCandidateCount: 1
  };

  assert.deepEqual(evaluateConsentStateChange(state, state), { status: "unverified", evidence: [] });
});

test("verifies a completed rejection when the consent surface changes", () => {
  const result = evaluateConsentStateChange(
    { bannerVisible: true, bannerSignature: "reject all", consentSignalSignature: "#cookie-banner", controlStateSignature: "reject all", rejectCandidateCount: 1 },
    { bannerVisible: false, bannerSignature: "", consentSignalSignature: "", controlStateSignature: "", rejectCandidateCount: 0 }
  );

  assert.equal(result.status, "verified");
  assert.ok(result.evidence.includes("reject-control-removed"));
  assert.ok(result.evidence.includes("banner-state-changed"));
});

test("keeps a changed but multi-step consent flow unresolved until its final state", () => {
  const result = evaluateConsentStateChange(
    { bannerVisible: true, bannerSignature: "reject all", consentSignalSignature: "#cookie-banner", controlStateSignature: "reject all", rejectCandidateCount: 1 },
    { bannerVisible: true, bannerSignature: "preferences", consentSignalSignature: "#cookie-banner|#preferences", controlStateSignature: "only necessary", rejectCandidateCount: 1 }
  );

  assert.equal(result.status, "changed-not-final");
  assert.ok(result.evidence.includes("consent-signals-changed"));
});
