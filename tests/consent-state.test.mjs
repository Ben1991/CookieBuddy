import test from "node:test";
import assert from "node:assert/strict";
import { collectMainWorldConsentState, evaluateConsentSignalContradictions, getConsentCoverageMissing, mergeConsentStates } from "../src/consent-state.mjs";

test("reads TCF metadata and the latest Google Consent Mode update without values", async () => {
  const previousTcf = globalThis.__tcfapi;
  const previousGoogle = globalThis.google_tag_data;
  const previousDataLayer = globalThis.dataLayer;
  globalThis.__tcfapi = (_command, _version, callback) => callback({
    tcString: "COwK6gaOwK6gaFmAAAENAPCAAAAAAAAAAAAAAAAAAAAA.IF",
    eventStatus: "tcloaded",
    cmpStatus: "loaded",
    gdprApplies: true,
    purpose: { consents: { 2: false, 3: true } },
    vendor: { consents: { 755: true } }
  }, true);
  globalThis.google_tag_data = { ics: { entries: { analytics_storage: { default: "denied" } } } };
  globalThis.dataLayer = [
    ["consent", "default", { ad_storage: "denied" }],
    ["consent", "update", { ad_storage: "granted", ad_user_data: "denied" }]
  ];

  try {
    const state = await collectMainWorldConsentState();
    assert.equal(state.apiSupport.tcf, "observed");
    assert.equal(state.apiSupport.googleConsentMode, "observed");
    assert.equal(state.tcString.present, true);
    assert.equal(state.tcString.length < 100, true);
    assert.equal(state.signals.find((signal) => signal.key === "purpose:3").value, "granted");
    assert.equal(state.signals.find((signal) => signal.key === "ad_storage").value, "granted");
    assert.equal("tcString" in JSON.parse(JSON.stringify(state)), true);
    assert.doesNotMatch(JSON.stringify(state), /COwK6ga|personal|email/);
  } finally {
    if (previousTcf === undefined) delete globalThis.__tcfapi; else globalThis.__tcfapi = previousTcf;
    if (previousGoogle === undefined) delete globalThis.google_tag_data; else globalThis.google_tag_data = previousGoogle;
    if (previousDataLayer === undefined) delete globalThis.dataLayer; else globalThis.dataLayer = previousDataLayer;
  }
});

test("flags granted optional signals after verified rejection and blocks incomplete API coverage", () => {
  const before = mergeConsentStates({
    apiSupport: { tcf: "observed", googleConsentMode: "observed" },
    signals: [
      { framework: "iab-tcf", key: "purpose:3", value: "granted", optional: true },
      { framework: "google-consent-mode", key: "analytics_storage", value: "granted", optional: true }
    ]
  });
  const after = mergeConsentStates({
    apiSupport: { tcf: "observed", googleConsentMode: "observed" },
    signals: [
      { framework: "iab-tcf", key: "purpose:3", value: "granted", optional: true, source: "__tcfapi:getTCData" },
      { framework: "google-consent-mode", key: "analytics_storage", value: "denied", optional: true }
    ]
  });
  const contradictions = evaluateConsentSignalContradictions(before, after, { rejectionVerified: true });
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].key, "purpose:3");
  assert.equal(contradictions[0].severity, "high");
  assert.deepEqual(getConsentCoverageMissing(before, after), []);
  assert.deepEqual(getConsentCoverageMissing({ apiSupport: { tcf: "unavailable", googleConsentMode: "unavailable" } }, { apiSupport: { tcf: "unavailable", googleConsentMode: "unavailable" } }), ["consent-api-support"]);
});
