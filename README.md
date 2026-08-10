# CookieBuddy

CookieBuddy is a Chrome extension that helps you review cookie banners and tracking behavior on a website.

It gives you a local, browser-side summary of:

- the cookie banner it detects
- visible cookies and browser storage
- third-party requests made while the tab is open
- contact details for privacy follow-up
- a best-effort before/after delta check after trying to reject cookies

It is a review tool, not legal advice.

## What It Does

- Detects consent banners from page text, DOM hints, loaded scripts, and known CMP signatures.
- Shows the banner name, confidence level, and source evidence.
- Groups detected services by category, such as analytics, marketing, functional, and social.
- Lists visible cookies and storage keys, and marks items that appear related to the banner.
- Tracks third-party requests while the tab is open.
- Tries a best-effort "deny all" click when you run the delta check.
- Opens a separate details view for the delta result.
- Tries to open the banner's preferences or second-level view when supported.
- Searches the page and linked legal pages for privacy contact details.
- Drafts email links for access, correction, and deletion requests.
- Exports the delta report as HTML or a printable view.
- Supports English and German, with a manual language switch.
- Shows a simple status color in the extension icon: green, yellow, or red.

## How To Use

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder.
6. Open a website and click the CookieBuddy extension icon.
7. Use `Refresh` to rescan the page.
8. Use `Delta Check` to test what remains after a reject attempt.

If the banner does not expose a reject button, reject cookies manually and run the delta check again.

## Use Cases

The acceptance contract for CookieBuddy is written in Gherkin in [`features/cookiebuddy.feature`](features/cookiebuddy.feature). It covers these user journeys:

| ID | Given | When | Then |
| --- | --- | --- | --- |
| UC-01 Scan | The user is viewing a website in Chrome | CookieBuddy is opened | The banner, visible cookies, browser storage, third-party traffic, and local-only storage status are shown. |
| UC-02 DPO contact | The footer links to a privacy policy containing a DPO email and another generic email exists | The page is scanned | The privacy-policy DPO email is used and its source URL is shown. |
| UC-02b Imprint fallback | The privacy page contains only a generic contact and the imprint contains a labeled DPO email | The page is scanned | The labeled imprint DPO email is used and its source URL is shown. |
| UC-03 Automatic delta | A reject-all action is detected | The user confirms the delta check | Before/after cookies, storage, and traffic are compared. |
| UC-04 Manual delta | No automatic reject-all action is found and the user opts out manually | The user confirms the delta check | The current post-opt-out state is compared and marked as manual opt-out. |
| UC-05 Review signal | Non-essential activity remains after opt-out | The result is displayed | Remaining items are marked for review and explicitly not presented as legal advice. |
| UC-06 All opted out | The banner lists essential and non-essential services | Cookies, local storage, and traffic are compared with the all-opted-out state | Essential services are allowed; disabled, active, unclear, and banner-listed states are shown per service. |
| UC-07 External signal | A service or browser-extension traffic is not listed in the banner | The audit is rendered | The signal is marked `Unclear` and surfaced for manual review. |
| UC-08 Export | A delta check has completed | The details view is opened | Findings can be downloaded as HTML or opened as a printable/PDF report. |
| UC-09 Email | A privacy contact was found in the visited page's privacy policy | The details view is opened | A reviewed mail draft and copy-for-email report are offered. |

The Gherkin file is the source of truth for acceptance behavior. A feature change must update the matching scenario, automated tests, visual tests, README use-case table, and screenshots in the same change.

## Product Screenshots

The screenshots below are generated from the same Playwright fixture used by the visual test suite. They document the primary product states without uploading real browsing data.

The popup overview intentionally stacks its metrics vertically so banner names, service counts, traffic findings, and local-storage details remain readable in the narrow extension window.

| Scan overview | Delta audit and export |
| --- | --- |
| ![CookieBuddy scan overview](docs/screenshots/popup-overview.png) | ![CookieBuddy delta audit](docs/screenshots/delta-audit.png) |

To regenerate them locally after a UI change:

```sh
$env:COOKIEBUDDY_SCREENSHOT_DIR = "docs/screenshots"
npm run test:visual
```

Changes to these product flows must update the Gherkin scenarios, the matching automated tests, and this section in the same change.

## What The Delta Check Means

CookieBuddy compares two states:

1. Before the reject attempt.
2. After CookieBuddy tries to click a deny or reject control.

If cookies or third-party traffic still appear after the reject attempt, CookieBuddy flags the result as suspicious. This is a signal to review, not proof of non-compliance.

## Main Limits

- Cookie banners vary a lot, so automatic reject clicking is best effort.
- Chrome can only see what the browser exposes locally.
- Cookie and tracker detection is heuristic, which means it is a rule of thumb rather than a guaranteed fact.
- Privacy contact detection is approximate and may need manual review.

## Development

CookieBuddy has no production build step. Development checks use the packages in `package.json`.

Run these checks:

```sh
node --test tests/core.test.mjs tests/popup.integration.test.mjs tests/details.integration.test.mjs tests/use-cases.test.mjs
node --check src/popup.js && node --check src/content.js && node --check src/details.js
node --check src/background.js && node --check src/i18n.js
node -e "for (const file of ['manifest.json','_locales/en/messages.json','_locales/de/messages.json']) JSON.parse(require('fs').readFileSync(file,'utf8'))"
npx playwright install chromium
npm run test:visual
```

GitHub Actions runs these checks on every push to every branch and on every pull request. The visual suite launches Chromium against the real popup and details pages, checks responsive layout, verifies the delta report's mail-copy, HTML, and printable export actions, and can regenerate the README screenshots. A feature change is not considered complete until the Gherkin contract, functional tests, visual tests, README use cases, and matching screenshots are updated together.

After changing extension files, reload the extension in `chrome://extensions`.

## Project Structure

- `manifest.json`: Chrome extension configuration
- `popup.html`: Main popup
- `details.html`: Delta and scan details
- `src/background.js`: Third-party request tracking and badge status
- `src/content.js`: Page analysis, banner detection, contacts, and banner actions
- `src/popup.js`: Popup flow, scan actions, and delta check
- `src/core.js`: Shared cookie and delta helpers
- `src/details.js`: Details view and report export
- `src/i18n.js`: English and German text handling
- `tests/`: Unit and integration tests

## Privacy

CookieBuddy is designed to stay local.

- No analytics
- No remote logging
- No account system
- No scan upload
- No telemetry

Scan results are stored only in Chrome local extension storage on the device.

## Links

- Repository: https://github.com/Ben1991/CookieBuddy
- Donate: https://buymeacoffee.com/thenext1991
