# Contributing to CookieBuddy

CookieBuddy is built around privacy, transparency, user control, and reproducible technical evidence. Contributions should improve the reliability of the one-click consent/tracking audit without overstating what a browser extension can prove.

## Core Principles

When contributing:

- Keep processing local by default.
- Do not add analytics, telemetry, remote logging, user profiling, mandatory accounts, or automatic scan uploads.
- Minimize stored evidence before persistence; do not store/export cookie values by default.
- Separate observed evidence from interpretation.
- Unknown, incomplete, unsupported, or contaminated audit coverage must never become a positive green verdict.
- A successful DOM click is not proof that consent was rejected.
- Do not imply that CookieBuddy can detect browser-invisible server-side processing or every form of tracking.

## Gherkin Acceptance Contract

`features/cookiebuddy.feature` is the authoritative product acceptance specification.

Every change that affects product behavior, detection, classification, verdicts, evidence, privacy behavior, user flow, or visible UI must identify the affected `@UC-xx` scenario(s).

A product task is not complete until all affected contract artifacts are synchronized in the same change:

1. Update or add the matching Gherkin scenario.
2. Add or update real automated tests for the changed behavior, including negative and failure paths.
3. Update `README.md`, including the use-case contract and any affected product, privacy, usage, or limitations text.
4. Update visual tests and regenerate README screenshots when visible behavior changes.
5. Keep scenario IDs stable; use a new `@UC-xx` only for a genuinely new product contract.
6. Keep `@issue-N` references on scenarios governed by a GitHub implementation issue.

`tests/use-cases.test.mjs` enforces basic Gherkin/README contract hygiene in CI. It does not replace functional tests: implementation work must include automated tests that exercise the actual acceptance behavior.

## Development Workflow

Create focused branches and changes. Avoid unrelated formatting or refactors in feature work.

Before implementation, read:

- `features/cookiebuddy.feature`
- `README.md`
- `agent.md` when using AI-supported development
- the relevant GitHub issue and referenced `@UC-xx` scenario

For detection changes, prefer deterministic local fixtures over live websites. Live-site checks are useful as optional smoke tests but are not suitable as deterministic CI dependencies.

## Privacy and Security Requirements

Do not add hidden or unnecessary network requests. If a network request or new permission is truly required, document what it accesses, why it is necessary, its privacy impact, and whether a narrower alternative exists.

New dependencies should be reviewed for maintenance, code size, external communication, privacy impact, and whether the platform already provides the required functionality.

Treat page text, URLs, contact data, exported HTML, and browser-provided data as untrusted input. Escape or sanitize content appropriately.

## Testing

For product changes run:

```sh
npm test
npm run check
npm run test:visual
```

The affected acceptance criteria must have real unit/integration/browser coverage. Tests should include realistic positive, negative, ambiguous, and failure cases where applicable.

For documentation/contract-only changes, at minimum run:

```sh
node --test tests/use-cases.test.mjs
```

Visible changes require updated visual tests and regenerated screenshots.

## Pull Request Definition of Done

A PR that changes product behavior should explicitly state:

- affected `@UC-xx` scenario(s)
- what changed and why
- tests added/updated
- privacy/security impact
- evidence or verdict implications
- remaining limitations
- README updates
- screenshot/visual-test updates when applicable

Do not merge a product change when implementation, Gherkin, tests, README, or screenshots disagree.

## Bug Reports and Feature Requests

Useful reports include browser/version, OS, CookieBuddy version, steps to reproduce, expected result, actual result, and privacy-safe screenshots/logs where helpful.

Good feature requests describe the user problem, why it improves the core audit/evidence workflow, alternatives considered, and privacy/security implications.

## Security Issues

Do not publicly disclose security vulnerabilities. Use a private security reporting channel when available and include reproduction steps, affected versions, and impact.

## Review Focus

Reviews prioritize:

- correctness and false-negative risk
- audit integrity
- security and privacy
- evidence quality
- conservative verdict behavior
- maintainability
- user comprehension and accessibility

For accessibility-related changes, use the checklist and reporting guidance in [`ACCESSIBILITY.md`](ACCESSIBILITY.md). Reviewers should distinguish verified behavior from open limitations and request keyboard, screen-reader, zoom/reflow, contrast, or reduced-motion evidence when the change affects those areas.

A change that makes the UI look more certain than the underlying evidence is not an improvement.
