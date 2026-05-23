# CookieBuddy

CookieBuddy is a local Chrome extension prototype that helps users review cookie banners, cookies, and third-party traffic after opt-out.

It is designed as a friendly review tool, not as a legal compliance verdict.

## Disclaimer

This is not legal advice. Please still review the content. The creator takes no liability for the results.

## What CookieBuddy Does

* Detects consent banners dynamically from loaded scripts, resource hosts, browser-visible CMP APIs, DOM markers, and visible consent wording.
* Shows known provider names when recognized, and otherwise reports an unknown or self-made banner with the source script or host evidence where possible.
* Shows detected services by category, for example essential, marketing, analytics, functional, and social.
* Lists visible cookies and maps common cookie names to likely services.
* Tracks third-party browser requests while the current tab is open.
* Runs a best-effort delta check by trying to click a detected “deny all” option, then comparing cookies and third-party traffic afterward.
* Flags cookies or third-party hosts that remain visible after opt-out.
* Searches the current page and linked imprint/privacy/contact pages for data protection contact details.
* Provides a draft email link when a DPO email address can be detected.
* Links to likely data protection authority information.
* Supports English and German with a manual language toggle.
* Offers a donation link through Buy Me a Coffee.

## How The Delta Check Works

The delta check compares two states:

1. The current page state before changing consent.
2. The page state after CookieBuddy tries to click a “deny all” or similar opt-out button.

CookieBuddy then checks whether cookies or third-party requests are still present.

In simple terms: if the user says “no” to optional cookies, CookieBuddy looks for signs that data still flows anyway.

## Important Limitations

* Cookie banner controls vary heavily. Automatic “deny all” clicking is best-effort and may not work on every site.
* Chrome extension APIs can see browser cookies and network requests, but not every server-side data transfer.
* Some cookies are technically necessary. CookieBuddy flags likely non-essential cookies based on naming and domain patterns, which should be reviewed by a human.
* Service detection is heuristic. A heuristic is an informed rule of thumb, not a guaranteed fact.
* Consent banner detection is dynamic and evidence-based. If the provider is unknown, CookieBuddy reports the detected script, host, or page marker instead of forcing it into a fixed provider list.
* Responsible data protection authority detection is approximate. For German `.de` domains, CookieBuddy links to the official German authority overview because the exact authority depends on the company seat in the imprint.

## Local Installation

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder: `/path/to/cookiebuddy`.
6. Open a website and click the CookieBuddy extension icon.

## Setup For Development

CookieBuddy currently has no build step and no dependency installation.

Useful local checks:

```sh
node --check src/background.js
node --check src/content.js
node --check src/popup.js
node --check src/details.js
node --check src/i18n.js
node -e "for (const file of \['manifest.json','\_locales/en/messages.json','\_locales/de/messages.json']) JSON.parse(require('fs').readFileSync(file,'utf8'))"
```

After changing extension files, reload the extension in `chrome://extensions`.

## Project Structure

* `manifest.json`: Chrome extension configuration.
* `popup.html`: Main extension popup.
* `details.html`: Last scan and delta details page.
* `assets/logo.svg`: CookieBuddy logo.
* `src/background.js`: Third-party request tracking.
* `src/content.js`: Page, banner, category, service, and contact analysis.
* `src/popup.js`: Popup behavior, delta check, help toggle, and rendering.
* `src/details.js`: Details page rendering.
* `src/i18n.js`: English/German language handling.
* `src/styles.css`: Accessible light/dark UI styling.
* `\_locales/en/messages.json`: English UI text.
* `\_locales/de/messages.json`: German UI text.

## Open Source Repository

The public repository link is:

https://github.com/Ben1991/CookieBuddy

If the repository URL changes later, update the link in:

* `popup.html`
* this `README.md`

## Contribution Guidelines

Contributions are welcome, especially for:

* More cookie banner provider detections.
* Better service and cookie mappings.
* Better authority lookup logic.
* Accessibility improvements.
* UI copy improvements in English or German.
* Additional localizations.
* Test cases for common consent banners.

Before opening a contribution:

1. Keep the tool clear that it provides review signals, not legal advice.
2. Avoid collecting or sending user browsing data to external servers.
3. Prefer local-only analysis whenever possible.
4. Keep explanations understandable for non-technical users.
5. Run the local checks listed above.
6. Describe what changed, why it changed, and any remaining limitations.

## Privacy Principles

CookieBuddy is designed to be anonymous for users and to avoid tracking.

* No analytics.
* No tracking pixels.
* No remote logging.
* No account system.
* No user identifier.
* No scan-result upload to the creator.
* No external server is contacted by CookieBuddy for telemetry.
* Scan analysis runs locally in the browser.
* The last scan and delta result are stored only in Chrome local extension storage on the user's device.
* CookieBuddy reads pages, cookies, and browser requests only to show the user the local analysis.
* Contact, GitHub, authority, and donation links open only when the user clicks them.
* Once a user opens an external website or email client, that external service is outside CookieBuddy's control and may apply its own privacy rules.

For contributors: do not add analytics, telemetry, remote logging, fingerprinting, account creation, or automatic upload of browsing data.

## Donate

If CookieBuddy helps you, you can support the project here:

https://buymeacoffee.com/thenext1991
