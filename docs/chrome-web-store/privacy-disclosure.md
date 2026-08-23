# Chrome Web Store privacy-tab preparation

Use these answers in the Developer Dashboard and keep them synchronized with [`PRIVACY.md`](../../PRIVACY.md) and the UI copy.

## Single purpose

CookieBuddy has one purpose: provide a local, user-started technical review of observable cookie-consent behavior, browser storage metadata, and third-party traffic before and after an optional-consent rejection attempt.

## Data handling declaration

CookieBuddy handles the following Chrome/user data only when the user starts a scan or audit:

- **Web browsing activity:** the active page URL/host and minimized request metadata are needed to show the audit evidence for the page the user chose to inspect.
- **Website content:** page text and consent-surface metadata are needed to recognize supported banners and verify a selected rejection action.
- **User activity:** the user's chosen audit, rejection control, language, and optional screenshot setting are needed to run and explain the requested audit.
- **Website data:** cookie metadata and browser-storage metadata are needed to compare observable state before and after rejection. Cookie values, storage values, request bodies, and response bodies are not collected.
- **Optional visual evidence:** screenshots are captured only after the user enables the setting and are kept locally for review/export.

## Use and sharing

- Data is used only to provide the local audit and its evidence report.
- Data is processed and stored locally in Chrome extension storage.
- No audit data is sold, shared, uploaded, sent to analytics, used for advertising, or used for profiling.
- No developer or support person can read the local audit data unless the user deliberately exports and shares it.
- External links and mail drafts open only after an explicit user click.
- The privacy policy URL is `https://github.com/Ben1991/CookieBuddy/blob/main/PRIVACY.md`.

## Dashboard confirmations

Select the dashboard options that correspond to the above facts:

- The extension handles user data: **Yes**.
- Web browsing activity: **Yes, required for a user-facing audit of the active page; local only**.
- Website content/resources: **Yes, required for consent-surface analysis; local only**.
- Personally identifiable information, authentication, financial/payment, health, or personal communications: **No intentional collection**.
- Data sold or transferred to third parties: **No**.
- Data used for advertising or personalized content: **No**.
- Limited Use certification: **Yes**; use is limited to the disclosed single purpose and user-facing audit functionality.

The dashboard's final field names may change. Verify every selected value against the uploaded package and the published policy before submission.
