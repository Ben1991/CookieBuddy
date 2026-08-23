# Agent Guidance

Use this guidance for AI-supported changes in this repository.

## Product Positioning

CookieBuddy is a local Chrome extension that aims to answer one primary question with one audit action: does optional tracking appear to stop correctly after the user rejects consent?

CookieBuddy must separate observed technical evidence from interpretation. It provides a technical review signal, confidence, coverage, and evidence; it must not present a legal compliance verdict or legal advice.

## Non-negotiable Product Invariants

1. Unknown, incomplete, unsupported, contaminated, or failed audit coverage must never become a positive green result.
2. A successful DOM click is not proof that consent was rejected; rejection must be verified where possible.
3. Evidence and interpretation must remain distinguishable in UI and exports.
4. Audit processing remains local by default. Do not add analytics, telemetry, remote logging, accounts, identifiers, or automatic scan upload.
5. Store the minimum evidence needed. Do not store or export cookie values by default. Minimize URL query/fragment data at capture time.
6. CookieBuddy must not imply that it can detect browser-invisible server-side processing or every form of tracking.
7. The primary product flow is audit -> verdict -> evidence -> optional complaint/escalation.

## Gherkin Is the Acceptance Contract

`features/cookiebuddy.feature` is the source of truth for product acceptance behavior.

Every product task that changes behavior, detection, classification, verdict logic, evidence, privacy behavior, user flow, or visible UI MUST:

1. Identify the affected `@UC-xx` scenario(s) before implementation.
2. Add or update the Gherkin scenario in the same change if the behavior changes.
3. Add or update automated tests that exercise the changed acceptance behavior. A test that only checks for the presence of scenario text is not sufficient implementation coverage.
4. Update visual tests and screenshots when visible behavior changes.
5. Update the README use-case table and any affected product description, limitations, privacy notes, or usage instructions in the same change.
6. Keep scenario IDs stable. Add a new `@UC-xx` ID for a genuinely new user-visible contract; do not silently repurpose an existing ID.
7. Keep issue references (`@issue-N`) on scenarios where a GitHub issue defines the implementation work.

A task is not complete if implementation, Gherkin, tests, README, or relevant screenshots disagree.

`tests/use-cases.test.mjs` enforces basic contract hygiene and README coverage in CI. Feature-specific automated tests remain mandatory for the actual behavior.

## Definition of Done for Product Tasks

Before considering a task complete, verify all applicable items:

- Gherkin acceptance criteria are current.
- Functional/unit/integration tests cover the changed behavior, including negative and failure paths.
- A positive verdict cannot be produced from incomplete evidence.
- Privacy/data-minimization behavior is covered by tests where applicable.
- Realistic edge cases are covered for detection changes.
- README use-case table and product/limitation text are current.
- Visual tests and README screenshots are current for visible changes.
- New technical limitations are documented explicitly.
- Relevant local checks pass.

## Contribution Rules

Before opening a change:

1. Keep explanations understandable for non-technical users.
2. Prefer deterministic local analysis and deterministic local fixtures.
3. Preserve the legal-advice disclaimer.
4. Describe what changed, why it changed, what evidence supports it, and any remaining limitations.
5. Do not weaken detection merely to make tests pass. If a sensor cannot determine a state reliably, return `unclear`/`incomplete`.
6. Prefer CMP-specific APIs and semantics over broad text/button heuristics.
7. Treat live-site checks as optional smoke tests; CI must rely on deterministic fixtures because live websites change.

## Privacy Principles

CookieBuddy is designed to avoid tracking its users.

Do not add:

- Analytics.
- Tracking pixels.
- Remote logging.
- Fingerprinting of CookieBuddy users.
- Account creation.
- User identifiers.
- Automatic upload of browsing data or scan results.

CookieBuddy may read pages, cookies, storage metadata, consent APIs, and browser requests only to produce the local audit requested by the user. Contact, GitHub, authority, and donation links should open only after explicit user action.

Audit data stored in Chrome extension storage must have documented retention/deletion behavior. Sensitive URL values and stored-data values should be minimized before persistence, not merely hidden during export.

## Use Case and Documentation Sync

The Gherkin scenarios in `features/cookiebuddy.feature`, their real automated tests, `tests/use-cases.test.mjs`, visual tests in `tests/visual.mjs`, the README use-case table, README product/limitations text, and matching screenshots form one product contract.

Whenever a feature, user flow, visible design, detection rule, verdict rule, privacy behavior, or evidence format changes, update every affected artifact in the same change. Regenerate README screenshots with `COOKIEBUDDY_SCREENSHOT_DIR=docs/screenshots npm run test:visual` and review the images before committing when the visible product changed.

Do not merge a product change with stale use cases, tests, screenshots, or documentation.

## Verification

Run the complete automated suite for product changes:

```sh
npm test
npm run check
npm run test:visual
```

At minimum, `npm test` must include the Gherkin/README contract test in `tests/use-cases.test.mjs` plus the functional tests for the affected scenarios.

For documentation-only changes, inspect the diff and run `node --test tests/use-cases.test.mjs` to ensure the README and Gherkin contract remain synchronized.
