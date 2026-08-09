# Agent Guidance

Use this guidance for AI-supported changes in this repository.

## Product Positioning

CookieBuddy is a local Chrome extension prototype that helps users review cookie banners, cookies, and third-party traffic after opt-out.

It is a friendly review tool, not a legal compliance verdict. Keep the product clear that it provides review signals, not legal advice.

## Contribution Rules

Before opening a change:

1. Keep explanations understandable for non-technical users.
2. Avoid collecting or sending user browsing data to external servers.
3. Prefer local-only analysis whenever possible.
4. Preserve the legal-advice disclaimer.
5. Describe what changed, why it changed, and any remaining limitations.
6. Run the relevant local checks listed below.

## Use Case and Documentation Sync

The Gherkin scenarios in `features/cookiebuddy.feature`, their automated tests, the visual tests in `tests/visual.mjs`, the use-case table and screenshots in `README.md`, and this rule file are one product contract. Whenever a feature, user flow, or visible design changes, update every affected artifact in the same change. Regenerate the README screenshots with `COOKIEBUDDY_SCREENSHOT_DIR=docs/screenshots npm run test:visual` and review the images before committing. Do not merge a feature change with stale use cases, screenshots, or documentation.

Good contribution areas include:

* More cookie banner provider detections.
* Better service and cookie mappings.
* Better authority lookup logic.
* Accessibility improvements.
* UI copy improvements in English or German.
* Additional localizations.
* Test cases for common consent banners.

## Privacy Principles

CookieBuddy is designed to be anonymous for users and to avoid tracking.

Do not add:

* Analytics.
* Tracking pixels.
* Remote logging.
* Fingerprinting.
* Account creation.
* User identifiers.
* Automatic upload of browsing data or scan results.

Keep scan analysis local in the browser. The last scan and delta result should remain stored only in Chrome local extension storage on the user's device.

CookieBuddy may read pages, cookies, and browser requests only to show the user local analysis. Contact, GitHub, authority, and donation links should open only when the user clicks them.

## Verification

CookieBuddy currently has no build step and no dependency installation.

Run relevant checks before finishing code changes:

```sh
node --test tests/core.test.mjs tests/popup.integration.test.mjs
node --check src/background.js
node --check src/content.js
node --check src/popup.js
node --check src/details.js
node --check src/i18n.js
node -e "for (const file of ['manifest.json','_locales/en/messages.json','_locales/de/messages.json']) JSON.parse(require('fs').readFileSync(file,'utf8'))"
```

For documentation-only changes, inspect the diff and confirm the repository status is limited to the intended documentation files.
