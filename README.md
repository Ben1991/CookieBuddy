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

CookieBuddy has no build step and no package installation.

Run these checks:

```sh
node --test tests/core.test.mjs tests/popup.integration.test.mjs tests/details.integration.test.mjs
node --check src/popup.js && node --check src/content.js && node --check src/details.js
node --check src/background.js && node --check src/i18n.js
node -e "for (const file of ['manifest.json','_locales/en/messages.json','_locales/de/messages.json']) JSON.parse(require('fs').readFileSync(file,'utf8'))"
```

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
