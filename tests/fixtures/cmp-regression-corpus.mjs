const tracker = Object.freeze({ host: "analytics.vendor.test", type: "script", url: "https://analytics.vendor.test/pixel.js" });

const cmpPage = ({ scripts, globals = [], html, text = "We use cookies to remember your choices." }) => ({
  scripts,
  globals,
  html,
  text
});

export const CMP_IMPLEMENTATIONS = Object.freeze([
  {
    id: "onetrust",
    name: "OneTrust",
    page: cmpPage({
      scripts: ["https://cdn.cookielaw.org/consent/otSDKStub.js"],
      globals: ["Optanon"],
      html: "<div id=\"onetrust-banner-sdk\">Reject all cookies</div>"
    }),
    expectedDetection: { name: "OneTrust", confidence: "high", evidence: ["onetrust", "Optanon"] }
  },
  {
    id: "usercentrics",
    name: "Usercentrics",
    page: cmpPage({
      scripts: ["https://app.usercentrics.eu/browser-ui/loader.js"],
      globals: ["UC_UI"],
      html: "<div id=\"uc-center-container\">Reject all</div>"
    }),
    expectedDetection: { name: "Usercentrics", confidence: "high", evidence: ["usercentrics", "UC_UI"] }
  },
  {
    id: "cookiebot",
    name: "Cookiebot",
    page: cmpPage({
      scripts: ["https://consent.cookiebot.com/uc.js"],
      globals: ["Cookiebot"],
      html: "<div id=\"CybotCookiebotDialog\">Reject all</div>"
    }),
    expectedDetection: { name: "Cookiebot", confidence: "high", evidence: ["cookiebot", "Cookiebot"] }
  },
  {
    id: "didomi",
    name: "Didomi",
    page: cmpPage({
      scripts: ["https://sdk.privacy-center.org/didomi.js"],
      globals: ["Didomi"],
      html: "<div id=\"didomi-popup\">Reject all</div>"
    }),
    expectedDetection: { name: "Didomi", confidence: "high", evidence: ["didomi", "Didomi"] }
  },
  {
    id: "sourcepoint",
    name: "Sourcepoint",
    page: cmpPage({
      scripts: ["https://cdn.privacy-mgmt.com/sourcepoint.js"],
      html: "<div class=\"sp_message\">Reject all</div>"
    }),
    expectedDetection: { name: "Sourcepoint", confidence: "high", evidence: ["sourcepoint", "sp_message"] }
  },
  {
    id: "consentmanager",
    name: "Consentmanager",
    page: cmpPage({
      scripts: ["https://cdn.consentmanager.net/delivery/cmp.php"],
      html: "<div id=\"cmpconsent\">Reject all</div>"
    }),
    expectedDetection: { name: "Consentmanager", confidence: "high", evidence: ["consentmanager", "cmpconsent"] }
  },
  {
    id: "google-funding-choices",
    name: "Google Funding Choices",
    page: cmpPage({
      scripts: ["https://fundingchoicesmessages.google.com/i/pub-123.js"],
      globals: ["googlefc"],
      html: "<div id=\"fc-consent-root\">Reject all</div>"
    }),
    expectedDetection: { name: "Google Funding Choices", confidence: "high", evidence: ["fundingchoicesmessages.google.com", "googlefc"] }
  },
  {
    id: "custom-banner",
    name: "Custom/self-made banner",
    page: cmpPage({
      scripts: [],
      html: "<div id=\"site-cookie-consent\">We use cookies. Reject all</div>"
    }),
    expectedDetection: { name: "Unknown or self-made consent banner", confidence: "low", evidence: [] }
  },
  {
    id: "no-banner",
    name: "No banner",
    page: {
      scripts: [],
      globals: [],
      html: "<main>Welcome to the example site.</main>",
      text: "Welcome to the example site."
    },
    expectedDetection: { name: "No visible banner detected", confidence: "none", evidence: [] }
  }
]);

export const TRACKER_BEHAVIOR_CASES = Object.freeze([
  {
    id: "reject-all-stops-trackers",
    path: "reject-all",
    description: "A verified reject-all action is followed by no optional tracker evidence.",
    polarity: "positive",
    expectedVerdict: "positive",
    beforeTraffic: [tracker],
    afterTraffic: [],
    expectedEvidence: { beforeThirdPartyHosts: [tracker.host], afterThirdPartyHosts: [] }
  },
  {
    id: "reject-all-tracker-remains",
    path: "reject-all",
    description: "A tracker remains active after a verified reject-all action.",
    polarity: "negative",
    expectedVerdict: "negative",
    beforeTraffic: [],
    afterTraffic: [tracker],
    expectedEvidence: { beforeThirdPartyHosts: [], afterThirdPartyHosts: [tracker.host], verdictReason: "third-party-traffic" }
  },
  {
    id: "tracker-fires-before-consent",
    path: "pre-consent-tracker",
    description: "A tracker observed before consent is retained as before-state evidence.",
    polarity: "positive",
    expectedVerdict: "positive",
    beforeTraffic: [tracker],
    afterTraffic: [],
    expectedEvidence: { beforeThirdPartyHosts: [tracker.host], afterThirdPartyHosts: [] }
  },
  {
    id: "tracker-fires-before-and-after-reject",
    path: "pre-consent-tracker",
    description: "A tracker observed before consent and still active after rejection is negative.",
    polarity: "negative",
    expectedVerdict: "negative",
    beforeTraffic: [tracker],
    afterTraffic: [tracker],
    expectedEvidence: { beforeThirdPartyHosts: [tracker.host], afterThirdPartyHosts: [tracker.host], verdictReason: "third-party-traffic" }
  },
  {
    id: "delayed-tracker-not-observed",
    path: "delayed-tracker",
    description: "The bounded observation window expires without a delayed tracker.",
    polarity: "positive",
    expectedVerdict: "positive",
    observationWindowMs: 1800,
    beforeTraffic: [],
    afterTraffic: [],
    expectedEvidence: { beforeThirdPartyHosts: [], afterThirdPartyHosts: [] }
  },
  {
    id: "delayed-tracker-observed",
    path: "delayed-tracker",
    description: "A delayed tracker arrives inside the bounded observation window.",
    polarity: "negative",
    expectedVerdict: "negative",
    observationWindowMs: 1800,
    beforeTraffic: [],
    afterTraffic: [tracker],
    expectedEvidence: { beforeThirdPartyHosts: [], afterThirdPartyHosts: [tracker.host], verdictReason: "third-party-traffic" }
  },
  {
    id: "reload-navigation-stops-tracker",
    path: "reload-navigation",
    description: "After a controlled reload, optional tracking remains stopped.",
    polarity: "positive",
    expectedVerdict: "positive",
    lifecycle: { status: "completed", events: [{ type: "navigation", kind: "reload" }] },
    beforeTraffic: [tracker],
    afterTraffic: [],
    expectedEvidence: { beforeThirdPartyHosts: [tracker.host], afterThirdPartyHosts: [], lifecycleKind: "reload" }
  },
  {
    id: "reload-navigation-tracker-remains",
    path: "reload-navigation",
    description: "After a controlled reload, optional tracking remains active.",
    polarity: "negative",
    expectedVerdict: "negative",
    lifecycle: { status: "completed", events: [{ type: "navigation", kind: "reload" }] },
    beforeTraffic: [],
    afterTraffic: [tracker],
    expectedEvidence: { beforeThirdPartyHosts: [], afterThirdPartyHosts: [tracker.host], lifecycleKind: "reload", verdictReason: "third-party-traffic" }
  },
  {
    id: "consent-signal-matches-rejection",
    path: "consent-signal",
    description: "The observable consent state agrees with the rejected UI state.",
    polarity: "positive",
    expectedVerdict: "positive",
    beforeTraffic: [],
    afterTraffic: [],
    expectedEvidence: { beforeThirdPartyHosts: [], afterThirdPartyHosts: [] }
  },
  {
    id: "consent-signal-contradicts-ui",
    path: "consent-signal",
    description: "A non-essential consent signal remains after the UI reports rejection.",
    polarity: "negative",
    expectedVerdict: "negative",
    beforeTraffic: [],
    afterTraffic: [],
    afterStorageEntries: [{ key: "marketing_state", scope: "localStorage" }],
    expectedEvidence: { beforeThirdPartyHosts: [], afterThirdPartyHosts: [], storageKeys: ["marketing_state"], verdictReason: "non-essential-storage" }
  },
  {
    id: "inaccessible-consent-surface",
    description: "An inaccessible consent surface keeps the audit explicitly incomplete.",
    polarity: "incomplete",
    expectedVerdict: "incomplete",
    beforeTraffic: [],
    afterTraffic: [],
    inaccessibleConsentSurfaces: [{ domContext: "inaccessible-cross-origin-frame", reason: "cross-origin-frame-inaccessible" }],
    expectedEvidence: { beforeThirdPartyHosts: [], afterThirdPartyHosts: [], verdictReason: "consent-surface-inaccessible" }
  },
  {
    id: "unknown-consent-state",
    description: "An unknown consent state never becomes a positive verdict.",
    polarity: "incomplete",
    expectedVerdict: "incomplete",
    beforeTraffic: [],
    afterTraffic: [],
    unknownConsentState: true,
    expectedEvidence: { beforeThirdPartyHosts: [], afterThirdPartyHosts: [], verdictReason: "consent-surface" }
  }
]);

export const CMP_REGRESSION_CORPUS = Object.freeze(
  CMP_IMPLEMENTATIONS.map((implementation) => Object.freeze({
    ...implementation,
    cases: TRACKER_BEHAVIOR_CASES
  }))
);
