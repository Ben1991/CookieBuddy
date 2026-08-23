# CookieBuddy Privacy Policy

_Last updated: 23 August 2026_

CookieBuddy is a local Chrome extension for reviewing observable cookie-consent and tracking behavior on the page that the user actively chooses to inspect. It is a technical review tool, not legal advice and not a legal compliance verdict.

## What CookieBuddy handles

When the user starts a scan or audit, CookieBuddy may read the following data from the active page and the Chrome extension APIs:

- the page URL and hostname, minimized before local persistence by removing query values and fragments;
- page text and consent-banner metadata needed to recognize supported consent surfaces;
- cookie metadata such as names, domains, paths, security flags, and category signals, but not cookie values;
- browser-storage metadata such as localStorage/sessionStorage keys, IndexedDB names and versions, Cache Storage names and minimized request keys, and service-worker metadata, but not stored records or response bodies;
- minimized browser-request metadata such as host, path, type, and timestamp while an audit is active, but not request bodies or response bodies;
- optional before/after screenshots of the active tab only when the user enables visual evidence; and
- the selected UI language and the latest local audit results.

CookieBuddy does not intentionally collect passwords, authentication data, payment data, form contents, cookie values, storage values, response bodies, browsing history, or a user identifier. Users should still review optional screenshots before exporting them because page content may contain personal information.

## Why this data is handled

This data is handled only to provide CookieBuddy's single purpose: a user-facing, local technical review of cookie consent, browser storage, and observable third-party traffic before and after an optional-consent rejection attempt. CookieBuddy uses conservative classifications and keeps unknown or incomplete observations explicitly unresolved.

The extension does not use this data for advertising, profiling, personalization, monetization, or unrelated analytics. It does not sell the data or use it to build a user profile.

## Where the data goes

CookieBuddy processes audit data locally in the user's browser. It does not upload scans, screenshots, cookies, storage metadata, request metadata, reports, or report fingerprints to the developer or another service. There is no analytics, telemetry, tracking pixel, remote logging, account system, or automatic scan upload.

External websites, GitHub, authority pages, donation services, and mail applications are opened only after the user clicks a corresponding link or action. Those services have their own privacy policies; CookieBuddy does not send audit data to them automatically.

CookieBuddy's use of information received from Chrome APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide the disclosed user-facing audit, is not transferred except where necessary to provide that purpose, and is never used for personalized advertising or human review by the developer.

## Local storage and deletion

The latest scan and delta report remain in Chrome extension local storage until replaced by a later result or deleted by the user. Active audit traffic, icon state, and lifecycle state use session storage and are bounded by the audit lifecycle. The popup's **Delete local audit data** action removes the stored scan, delta report, and active audit state. Uninstalling CookieBuddy also removes its extension storage according to Chrome's extension-storage behavior.

CookieBuddy does not delete a website's own cookies, localStorage, sessionStorage, IndexedDB, Cache Storage, or service-worker data.

## Permissions

- `activeTab`: access the page only after the user invokes CookieBuddy on the current tab.
- `cookies`: read cookie metadata needed for the local comparison.
- `scripting`: run the local page analysis and supported consent-control checks on demand.
- `storage`: retain the latest local result and bounded session state.
- `webRequest`: observe minimized request metadata only during an active user-started audit.
- HTTP(S) host access: inspect relevant first-party, subdomain, and third-party cookie/request metadata for the page being audited.

The host access is a deliberate trade-off for the audit evidence promised by the product. CookieBuddy does not use it for idle collection.

## Contact

For privacy questions or correction requests, open a public issue at <https://github.com/Ben1991/CookieBuddy/issues>. Do not include cookies, credentials, private URLs, screenshots containing personal information, or other sensitive data in a public issue. Security vulnerabilities should be reported according to [`SECURITY.md`](SECURITY.md).

This policy may be updated when CookieBuddy's data practices change. Material changes will be disclosed in the product and release documentation before the changed behavior is introduced.
