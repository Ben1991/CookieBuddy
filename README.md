# CookieBuddy

CookieBuddy is a local Chrome extension for reviewing cookie-consent and tracking behavior on websites.

The product direction is a one-click technical audit that answers a simple question first: **does optional tracking appear to stop correctly after rejection?** CookieBuddy should then show the evidence behind that answer and, when a supported problem is found, make a factual complaint or escalation easy to prepare.

CookieBuddy provides technical review signals, not legal advice or a legal compliance verdict.

## Product Principle

The intended product flow is:

1. Start one audit.
2. Observe the current consent/tracking state.
3. Reject optional consent using a verified action where possible.
4. Reload and observe the post-rejection state.
5. Compare consent signals, cookies, browser storage, and network traffic.
6. Produce a conservative verdict with confidence and coverage.
7. Show reproducible evidence.
8. Offer a factual complaint/escalation draft when supported by the evidence.

A positive/green result is only valid when all mandatory checks completed successfully and no contradictory evidence was observed. Unknown, unsupported, contaminated, or incomplete coverage must remain unclear/incomplete rather than becoming green.

## Current Capabilities

The current implementation already provides a local browser-side summary of:

- detected consent-banner/CMP evidence
- visible cookies and browser storage
- observed third-party requests while the tab is open
- service/category hints
- privacy/DPO contact discovery
- a best-effort before/after rejection check
- local HTML/printable and structured JSON report export with a SHA-256 payload fingerprint
- German and English UI

The acceptance contract below also defines the target behavior for the next implementation tasks. A scenario may therefore describe required behavior that is not fully implemented yet; the corresponding GitHub issue is the implementation task.

## Acceptance Contract

The source of truth for product acceptance behavior is [`features/cookiebuddy.feature`](features/cookiebuddy.feature). Every scenario has a stable `@UC-xx` ID. Product changes must update the affected Gherkin scenario, real automated tests, this README, and—when visible behavior changes—visual tests and screenshots in the same change.

| ID | Contract |
| --- | --- |
| UC-01 | Scan the visited page locally and show observed consent, cookie, storage, and network evidence. |
| UC-02 | Prefer a DPO contact found in the visited site's privacy policy over a generic contact. |
| UC-03 | Fall back to a clearly labeled DPO contact in the site's imprint when appropriate. |
| UC-04 | Run a controlled before/after rejection audit with explicit observation windows and reload. |
| UC-05 | Verify that reject-all actually changed consent; a successful DOM click alone is insufficient, and the report records the selected control plus verification evidence. |
| UC-06 | Detect supported CMP APIs in the page main world and inspect IAB TCF / Google Consent Mode where available, recording timestamped interpreted values and TC-string metadata without the raw string. |
| UC-07 | Flag consent signals that contradict the rejected UI state as high-confidence technical findings; unavailable or unreadable consent APIs keep the audit incomplete. |
| UC-08 | Preserve concurrent network evidence without request-loss race conditions. |
| UC-09 | Capture relevant first-party, subdomain, and observed third-party cookie metadata without dumping unrelated cookies or values; unavailable hosts remain an explicit coverage limitation. |
| UC-10 | Include localStorage/sessionStorage plus supported IndexedDB, Cache Storage, and service-worker metadata; show unsupported inspection explicitly and never export stored values or response bodies. |
| UC-11 | Classify endpoint relationships with offline Public Suffix List compatible registrable-domain logic; possible first-party-cloaked trackers remain unknown rather than safe. |
| UC-12 | Classify necessity conservatively with rationale and confidence; names/CDNs alone cannot prove necessity. |
| UC-13 | Recognize services from versioned maintainable offline rule data, expose the matching evidence/version/confidence, and keep unknown signals visible. |
| UC-14 | Detect and operate supported consent controls in the top document, same-origin frames, and open shadow roots; inaccessible cross-origin surfaces remain explicit and incomplete. |
| UC-15 | Detect and report prior consent, prior opt-out, observable blocker interference, and unknown audit integrity; uncertain runs cannot be green and recommend a clean rerun. |
| UC-16 | Handle SPA navigation, redirects, popup closure, service-worker restart, reload, tab closure, and delayed trackers deterministically; persist lifecycle evidence and never render interrupted work as green. |
| UC-17 | Produce a conservative verdict: looks correct, review recommended, likely incorrect, or audit incomplete, with confidence, coverage, unresolved signals, and evidence links. |
| UC-18 | Build an evidence-grade report with reproducible timeline, minimized before/after metadata, observed facts, interpretation, evidence links, limitations, and hashed structured JSON export. |
| UC-19 | Minimize sensitive URL data at capture time; exclude query values and fragments by default. |
| UC-20 | Optionally capture user-controlled visual evidence with preview/removal before export. Screenshots are off by default, limited to the tested active tab, linked to audit steps, and recorded as unavailable when browser permissions prevent capture. |
| UC-21 | Prepare an editable factual complaint/escalation draft from a negative audit, with evidence export and uncertain recipients/authorities shown as candidates. |
| UC-22 | Present the one-click verdict and audit completeness before technical metrics, with one to three plain-language reasons and progressive evidence. |
| UC-23 | Support multilingual/accessibility-aware consent controls safely without broad-text false clicks. Consent vocabulary is local, explicit, and extended through locale data; accessible names and roles are used for icon-only controls, while unsupported language stays unresolved. |
| UC-24 | Explain limits for fingerprinting, server-side tagging, backend enrichment, first-party proxies, and other opaque techniques. |
| UC-25 | Keep CookieBuddy itself private and performant: justified permissions, on-demand page access, local processing, deletion, bounded retention and overhead. |
| UC-26 | Keep Gherkin, implementation tests, README, visual tests, and screenshots synchronized for every affected product task. |
| UC-27 | Maintain a deterministic real-world CMP and tracker regression corpus with reviewed verdict expectations; live-site smoke checks remain optional. |

`tests/use-cases.test.mjs` checks that every Gherkin use-case ID is represented in this README and that key safety invariants remain present. This is only contract hygiene: each implemented scenario also requires functional/unit/integration coverage of the real behavior.

## How To Use the Current Prototype

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select this repository folder.
6. Open a website and click the CookieBuddy extension icon.
7. Use `Seite neu erfassen / Refresh` to capture the current page locally.
8. Select `Tracking prüfen / Check tracking` to run the guided audit and review the top-level verdict.

The one-click audit uses two controlled page reloads: one to capture initial-load evidence for the baseline and one after rejection to validate the post-opt-out state. A bounded observation window records delayed requests; if either reload or the observation window cannot be completed, the result remains incomplete or unclear.

The target UX replaces the technical `Delta-Check` framing with a plain-language one-click tracking audit and top-level verdict (UC-22).

## Product Screenshots

The screenshots below are generated from the same Playwright fixture used by the visual test suite. They document the current primary product states without uploading real browsing data.

| Scan overview | Delta audit and export |
| --- | --- |
| ![CookieBuddy scan overview](docs/screenshots/popup-overview.png) | ![CookieBuddy delta audit](docs/screenshots/delta-audit.png) |

To regenerate them after a visible UI change:

```sh
$env:COOKIEBUDDY_SCREENSHOT_DIR = "docs/screenshots"
npm run test:visual
```

A visible flow change is not complete until the matching Gherkin scenario, functional tests, visual tests, README description/use-case contract, and screenshots are updated together.

## Verdict Model

The target verdict model is deliberately conservative:

- **Looks correctly implemented** — all mandatory checks completed and no contradictory evidence was observed.
- **Review recommended** — relevant signals remain ambiguous or unknown.
- **Likely incorrect implementation** — strong contradictory technical evidence remains after rejection.
- **Audit incomplete / unable to determine** — a mandatory check failed, was unsupported, or audit integrity was insufficient.

These are technical review outcomes, not legal conclusions.

## Evidence Model

CookieBuddy should separate raw observation from interpretation.

Observed evidence may include:

- audit step and timestamp
- tested URL/host (minimized before persistence)
- CMP/banner evidence
- reject action and verification evidence
- consent framework state before/after
- cookie metadata without cookie values
- supported browser-storage metadata
- request host/path/type/timestamp with sensitive URL values removed by default
- optional before/after screenshots of the tested tab, with minimized URL metadata and explicit local review/removal
- service/rule mapping with local rule version, matching evidence, and confidence
- necessity classification with one of four conservative states: known necessary, likely necessary, non-essential, or unknown, plus rationale and confidence
- explicit unsupported or incomplete checks

Interpretations must link back to the evidence that produced them.

CookieBuddy does not treat a cookie name or a generic CDN hostname as proof that an item is necessary. Explicit browser-runtime metadata may be known necessary; consent-banner declarations and familiar session names remain likely necessary and require review. Unknown infrastructure and storage signals stay visible and cannot produce a green result.

## Privacy

CookieBuddy is designed to stay local.

- No analytics
- No telemetry
- No remote logging
- No account system
- No user identifiers
- No automatic scan upload
- No cookie values stored/exported by default
- Sensitive URL query/fragment values should be removed before evidence is persisted
- Optional screenshots remain local, are off by default, and may contain page content or personal information; review and remove them before export.

CookieBuddy may inspect the page, cookies, supported browser storage, consent APIs, and browser requests only to perform the user's local audit. Local audit data must have documented retention/deletion behavior.

## Permissions and local data lifecycle

CookieBuddy uses the following capabilities only for the local audit flow:

| Capability | Product need and boundary |
| --- | --- |
| `activeTab` | Grants temporary access after the user opens the extension action on the current tab. |
| `cookies` | Reads cookie metadata for the visited page and observed services; cookie values are not stored or exported. |
| `scripting` | Injects the analysis scripts on demand into the active tab and accessible frames. CookieBuddy no longer installs persistent all-page content scripts. |
| `storage` | Keeps only the latest scan and delta in local storage; request traffic, icon status, and lifecycle state use session storage. |
| `webRequest` | Observes minimized request metadata only while an audit is active. |
| HTTP(S) host access | Retained for HTTP(S) third-party cookie metadata and subresource requests; it is not used for idle collection. |

Browser persistence coverage is metadata-only: IndexedDB database names/versions, Cache Storage names and minimized request keys, and service-worker scope/script metadata. CookieBuddy does not read IndexedDB records, cache response bodies, or service-worker payloads. If a browser API cannot be inspected, the report marks it as **not inspected** and the audit cannot produce a positive result from that incomplete coverage.

Consent-state coverage is also local and metadata-only. CookieBuddy reads IAB TCF v2 state through `__tcfapi` and observable Google Consent Mode signals (`analytics_storage`, `ad_storage`, `ad_user_data`, and `ad_personalization`) in the page's main world when available. It records source, timestamp, interpreted granted/denied/unknown values, and TC-string metadata such as presence, length, CMP status, and event status; the raw TC string is not stored. If a supported API is unavailable or unreadable, the audit remains incomplete rather than producing a positive result.

The `tabs` permission and persistent all-page content-script registration are not requested. The details page is opened as an extension page and does not need broad web-accessible resources. HTTP(S) host access remains a deliberate trade-off for reliable third-party cookie and request coverage; removing it would silently reduce the evidence promised by UC-09 and UC-25.

The popup's **Delete local audit data** action removes `cookiebuddyLastScan` and `cookiebuddyLastDelta` from `chrome.storage.local` and clears the session traffic, icon status, and lifecycle state. The latest scan and delta remain on the device until the user deletes them. CookieBuddy never deletes a website's own localStorage, cookies, or other browser data.

Reports and details views escape page-provided text, URLs, cookie names, and service labels before inserting HTML. Human-readable HTML/print reports and structured JSON exports include the checked URL/hostname, timestamp, extension and available browser context, consent state, minimized before/after cookie/storage/network metadata, service mappings, limitations, and links from interpretations to observed evidence. Cookie and storage values, response bodies, URL query values, and fragments are excluded. The JSON payload is fingerprinted locally with SHA-256; no report or hash is uploaded.

## Performance budgets

The budgets are local safeguards, not telemetry:

- Idle browsing captures zero requests and performs zero per-request session-storage writes.
- An active audit runs for at most 30 seconds and retains at most 500 requests per tab.
- Page analysis limits text to 120,000 characters, HTML evidence to 250,000 characters, resources to 250 entries, stored entries to 50, Cache Storage names to 20, Cache Storage keys per cache to 20, service-worker registrations to 20, contact pages to 8, and each contact response to 200,000 characters with a 1.5-second timeout.
- Each page analysis records only local duration and bounded sample counts for regression inspection; it does not upload performance data.

The corresponding contract and regression tests live in `tests/performance-budget.test.mjs`. If a limit is exceeded, the audit remains local and is marked incomplete rather than silently weakening evidence integrity.

## Audit lifecycle

During an audit, CookieBuddy keeps a minimal state machine in local session storage. SPA route changes, redirects, reloads, tab switches, popup reopening, service-worker restarts, tab closure, and observation timeouts are recorded as lifecycle evidence. A navigation that changes the page baseline, a popup/service-worker interruption, or a timeout ends the run as incomplete; a closed tested tab ends it as failed. The next popup can inspect that state and start a fresh audit explicitly. Lifecycle URLs are stored without query parameters or fragments.

## Detection Limits

CookieBuddy can only assess evidence observable from the browser extension context. It must not imply complete tracking detection.

Important limitations include:

- server-side tagging or forwarding that produces no distinguishable browser-side destination
- backend enrichment or profiling
- opaque first-party proxy endpoints
- CNAME-cloaked or first-party-looking tracking that cannot be resolved through browser-visible evidence; matching local heuristics remain unknown and block a positive result
- fingerprinting that leaves no reliable identifiable client-side signal
- inaccessible cross-origin consent UI or browser APIs
- interference from blockers, browser tracking protection, prior consent, login state, or other contaminated browser state

Reports and verdicts must distinguish **not observed** (no signal appeared in this audit), **not detected** (CookieBuddy has no reliable detector for the technique), and **not technically inspectable** (the technique can run outside observable browser evidence). Confirmed cookies, browser storage, network requests, and consent-surface evidence are listed separately from low-confidence heuristic indicators. These states describe the audit's evidence scope; they never claim complete tracking detection.

## Regression corpus

The deterministic corpus in [`tests/fixtures/cmp-regression-corpus.mjs`](tests/fixtures/cmp-regression-corpus.mjs) covers representative local implementations for OneTrust, Usercentrics, Cookiebot, Didomi, Sourcepoint, Consentmanager, Google Funding Choices, custom banners, and no-banner pages. It records expected CMP evidence and verdict outcomes for verified rejection, pre-consent traffic, trackers that remain after rejection, delayed trackers, reload/navigation, contradictory consent signals, and incomplete or unknown states. CI treats these expected verdicts as reviewed contracts, so a changed result fails the test until the fixture expectation is intentionally updated.

Live-site checks are optional smoke tests only. They are not part of CI because vendor configurations, consent text, network behavior, and regional rules can change without notice.

## Development Contract

For every task that changes product behavior, detection, classification, verdicts, evidence, privacy behavior, user flow, or visible UI:

1. Identify the affected `@UC-xx` scenario(s).
2. Update/add the Gherkin scenario in the same change.
3. Add/update real automated tests for the acceptance behavior, including negative/failure paths.
4. Update this README use-case contract and relevant product/limitations/privacy text.
5. Update visual tests and regenerate screenshots when visible behavior changes.
6. Do not mark the task complete while any affected artifact is stale.

See [`agent.md`](agent.md) for the full implementation rules.

## Development Checks

CookieBuddy has no production build step. Development checks use the packages in `package.json`.

For product changes run:

```sh
npm test
npm run check
npm run test:visual
```

For documentation/contract-only changes at minimum run:

```sh
node --test tests/use-cases.test.mjs
```

GitHub Actions should run the automated checks on pushes and pull requests. A feature-specific task is complete only when the actual behavioral tests for its acceptance criteria exist and pass; the Gherkin/README sync test alone is not sufficient.

## Project Structure

- `features/cookiebuddy.feature`: authoritative Gherkin acceptance contract
- `manifest.json`: Chrome extension configuration
- `popup.html`: main popup
- `details.html`: audit details and evidence actions
- `src/background.js`: request capture and extension status
- `src/audit-storage.mjs`: explicit local/session audit retention keys
- `src/content.js`: page/CMP analysis and consent actions
- `src/popup.js`: popup and audit orchestration
- `src/core.js`: shared classification/delta helpers
- `src/details.js`: details view and report export
- `src/i18n.js`: English/German text handling
- `tests/use-cases.test.mjs`: contract/README synchronization guard
- `tests/fixtures/cmp-regression-corpus.mjs`: deterministic CMP and tracker regression expectations
- `tests/`: functional, integration, unit, and visual tests

## Links

- Repository: https://github.com/Ben1991/CookieBuddy
- Donate: https://buymeacoffee.com/thenext1991
