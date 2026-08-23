import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildDelta, deriveAuditVerdict } from "../src/core.js";
import { CMP_REGRESSION_CORPUS, CMP_IMPLEMENTATIONS, TRACKER_BEHAVIOR_CASES } from "./fixtures/cmp-regression-corpus.mjs";

const contentSource = await readFile(new URL("../src/content.js", import.meta.url), "utf8");
const REQUIRED_IMPLEMENTATIONS = [
  "OneTrust",
  "Usercentrics",
  "Cookiebot",
  "Didomi",
  "Sourcepoint",
  "Consentmanager",
  "Google Funding Choices",
  "Custom/self-made banner",
  "No banner"
];

test("CMP corpus covers the required deterministic implementation families", () => {
  assert.deepEqual(CMP_IMPLEMENTATIONS.map(({ name }) => name), REQUIRED_IMPLEMENTATIONS);
  assert.equal(CMP_REGRESSION_CORPUS.length, REQUIRED_IMPLEMENTATIONS.length);
  for (const fixture of CMP_REGRESSION_CORPUS) {
    assert.ok(fixture.page.html, `${fixture.id} needs representative local markup`);
    assert.ok(fixture.expectedDetection.name, `${fixture.id} needs an expected detection`);
    assert.ok(fixture.cases.length >= 1, `${fixture.id} needs behavior cases`);
  }
});

test("CMP detection fixtures exercise production signatures and globals", () => {
  for (const fixture of CMP_IMPLEMENTATIONS) {
    const result = loadDetector(fixture);
    assert.equal(result.name, fixture.expectedDetection.name, fixture.id);
    assert.equal(result.confidence, fixture.expectedDetection.confidence, fixture.id);
    const serializedEvidence = JSON.stringify(result.evidence);
    for (const evidence of fixture.expectedDetection.evidence) {
      assert.match(serializedEvidence, new RegExp(escapeRegExp(evidence), "i"), `${fixture.id} should expose ${evidence}`);
    }
  }
});

test("P1 detection paths have reviewed positive and negative fixtures", () => {
  const paths = new Map();
  for (const behaviorCase of TRACKER_BEHAVIOR_CASES) {
    if (!behaviorCase.path) continue;
    const polarities = paths.get(behaviorCase.path) || new Set();
    polarities.add(behaviorCase.polarity);
    paths.set(behaviorCase.path, polarities);
  }
  for (const [path, polarities] of paths) {
    assert.ok(polarities.has("positive"), `${path} needs a positive fixture`);
    assert.ok(polarities.has("negative"), `${path} needs a negative fixture`);
  }
});

for (const behaviorCase of TRACKER_BEHAVIOR_CASES) {
  test(`tracker regression matrix keeps ${behaviorCase.id} verdicts stable`, () => {
    for (const fixture of CMP_REGRESSION_CORPUS) {
      const delta = buildFixtureDelta(fixture, behaviorCase);
      const verdict = deriveAuditVerdict(delta);
      assert.equal(verdict.status, fixture.name === "No banner" ? "incomplete" : behaviorCase.expectedVerdict, `${fixture.id}/${behaviorCase.id}`);
      assert.deepEqual(delta.beforeCounts.thirdPartyHosts ? [trackerHost(delta.beforeCounts, behaviorCase)] : [], behaviorCase.expectedEvidence.beforeThirdPartyHosts.length ? behaviorCase.expectedEvidence.beforeThirdPartyHosts : [], `${fixture.id}/${behaviorCase.id} before evidence`);
      assert.deepEqual(delta.thirdPartyHosts, behaviorCase.expectedEvidence.afterThirdPartyHosts, `${fixture.id}/${behaviorCase.id} after evidence`);
      if (behaviorCase.expectedEvidence.storageKeys) {
        assert.deepEqual(delta.nonEssentialStorageEntries.map((entry) => entry.key), behaviorCase.expectedEvidence.storageKeys, `${fixture.id}/${behaviorCase.id} storage evidence`);
      }
      if (behaviorCase.expectedEvidence.lifecycleKind) {
        assert.equal(delta.auditLifecycle.events[0].kind, behaviorCase.expectedEvidence.lifecycleKind, `${fixture.id}/${behaviorCase.id} lifecycle evidence`);
      }
      if (behaviorCase.expectedEvidence.verdictReason && fixture.name !== "No banner") {
        assert.ok(verdict.reasons.includes(behaviorCase.expectedEvidence.verdictReason), `${fixture.id}/${behaviorCase.id} verdict reason`);
      }
    }
  });
}

function buildFixtureDelta(fixture, behaviorCase) {
  const banner = behaviorCase.unknownConsentState
    ? { name: "Unknown or self-made consent banner", confidence: "none", evidence: [] }
    : fixture.expectedDetection.confidence === "none"
      ? { name: "No visible banner detected", confidence: "none", evidence: [] }
      : { name: fixture.name, confidence: fixture.expectedDetection.confidence, evidence: [{ type: "fixture", value: fixture.id }] };
  const delta = buildDelta({
    beforeCookies: [],
    afterCookies: [],
    beforeTraffic: behaviorCase.beforeTraffic,
    afterTraffic: behaviorCase.afterTraffic,
    afterStorageEntries: behaviorCase.afterStorageEntries || [],
    beforeCookieCoverage: { complete: true, requestedHosts: [`${fixture.id}.example.test`], unavailableHosts: [], thirdPartyHosts: [] },
    afterCookieCoverage: { complete: true, requestedHosts: [`${fixture.id}.example.test`], unavailableHosts: [], thirdPartyHosts: [] },
    banner,
    denyClicked: true,
    denyVerified: true,
    denyLabel: "Reject all",
    inaccessibleConsentSurfaces: behaviorCase.inaccessibleConsentSurfaces || [],
    beforeAnalysis: { banner, storage: { items: [] } },
    labels: { deltaFoundSummary: "Delta found", noDeltaSummary: "No delta" },
    tabUrl: `https://${fixture.id}.example.test`
  });
  if (behaviorCase.lifecycle) delta.auditLifecycle = behaviorCase.lifecycle;
  return delta;
}

function loadDetector(fixture) {
  const scripts = fixture.page.scripts.map((src) => ({ src, id: "", getAttribute: () => "" }));
  const context = {
    URL,
    URLSearchParams,
    clearTimeout,
    document: { scripts },
    location: { href: `https://${fixture.id}.example.test/`, origin: `https://${fixture.id}.example.test` },
    chrome: { runtime: { onMessage: { addListener() {} } } },
    addEventListener() {},
    CookieBuddyConsentControls: null,
    CookieBuddyConsentSurfaces: null,
    CookieBuddyServiceRules: null,
    window: {}
  };
  context.globalThis = context;
  for (const key of fixture.page.globals) context.window[key] = {};
  vm.createContext(context);
  vm.runInContext(`${contentSource}\n globalThis.__detectedBanner = detectBanner(${JSON.stringify({ htmlSample: fixture.page.html, pageText: fixture.page.text, resources: [] })}, []);`, context, { filename: "content.js" });
  return context.__detectedBanner;
}

function trackerHost(beforeCounts, behaviorCase) {
  return beforeCounts.thirdPartyHosts > 0 ? behaviorCase.expectedEvidence.beforeThirdPartyHosts[0] : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\[\]\\]/g, "\\$&");
}
