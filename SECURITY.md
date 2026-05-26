# Security Policy

Thank you for helping keep CookieBuddy safe.

CookieBuddy is a local Chrome extension prototype that helps users review cookie banners, cookies, browser storage, and third-party traffic after opt-out. Because the extension can inspect page content, cookies, local browser storage, and network requests in the active browser tab, security and privacy issues are treated seriously.

## Supported Versions

CookieBuddy currently has no published releases. Security fixes are handled on the default branch:

| Version / Branch | Supported |
| --- | --- |
| `main` | Yes |
| Older commits, forks, or unpublished builds | No |

If releases are published later, this table should be updated to list the supported release versions.

## Reporting a Vulnerability

Please do **not** report security vulnerabilities through public GitHub issues.

Instead, report vulnerabilities privately by one of the following methods:

1. Use GitHub private vulnerability reporting, if it is enabled for this repository.
2. If private vulnerability reporting is not enabled, contact the maintainer directly through a private channel listed on the maintainer’s GitHub profile.

When reporting a vulnerability, please include as much detail as possible:

- A clear description of the issue.
- Steps to reproduce it.
- The affected files, features, or browser extension permissions.
- The browser and operating system used.
- Whether user data, browsing data, cookies, local storage, or network request data could be exposed.
- Any proof-of-concept code, screenshots, or logs that help explain the issue.
- Whether the issue requires user interaction or only affects development builds.

Please avoid including real personal data, real cookies, session tokens, account identifiers, or sensitive browsing history in your report.

## What Counts as a Security Issue

Examples of security issues include, but are not limited to:

- Exposure of cookies, local storage, browsing data, scan results, or request data to third parties.
- Unexpected network calls, telemetry, analytics, logging, or upload of scan results.
- Cross-site scripting or HTML/script injection in the popup, details page, or rendered scan output.
- Unsafe handling of page content, cookie names, hostnames, URLs, consent banner text, or translated strings.
- Extension permission misuse or unnecessary privilege escalation.
- Vulnerabilities that allow another website, extension, or script to read CookieBuddy data.
- Insecure handling of external links, email draft links, donation links, authority links, or GitHub links.
- Supply-chain risks in dependencies, tests, workflows, or future build tooling.
- Problems in the delta check that could lead to unintended data exposure or unsafe page interaction.

## What Usually Does Not Count as a Security Issue

The following are usually not treated as security vulnerabilities unless they also create a concrete security or privacy risk:

- Incorrect cookie or service classification.
- Missed cookie banner detection.
- False positives or false negatives in heuristic analysis.
- A website where automatic “deny all” clicking does not work.
- Legal or compliance disagreements about whether a site’s cookie behavior is lawful.
- General feature requests or UI improvements.

CookieBuddy provides review signals, not legal compliance verdicts.

## Response Expectations

This is a small open-source project, so response times may vary. The maintainer will try to follow this process:

1. Acknowledge the report when possible.
2. Review and reproduce the issue.
3. Assess severity and affected users.
4. Prepare a fix or mitigation.
5. Credit the reporter if they want to be credited.
6. Publish the fix and, where appropriate, explain the impact.

Please allow a reasonable amount of time before publicly disclosing the issue.

## Responsible Disclosure

Please act in good faith:

- Do not publicly disclose the vulnerability before a fix or mitigation is available.
- Do not exploit the issue beyond what is necessary to demonstrate impact.
- Do not access, modify, delete, or share data that does not belong to you.
- Do not use real third-party accounts, real session cookies, or sensitive personal data for testing.
- Prefer minimal proof-of-concept examples.

## Privacy and Data Handling

CookieBuddy is intended to run analysis locally in the user’s browser. Contributions and security fixes should preserve these principles:

- No analytics.
- No tracking pixels.
- No remote logging.
- No account system.
- No user identifier.
- No automatic scan-result upload.
- No telemetry server.
- Local-only scan analysis wherever possible.

Any change that introduces external communication, data collection, telemetry, analytics, account features, remote logging, or automatic upload of browsing-related data should be treated as security- and privacy-sensitive and clearly discussed before merging.

## Security Review Guidance for Contributors

When contributing code, please pay special attention to:

- Escaping or safely rendering all page-derived content.
- Treating cookie names, hostnames, URLs, local storage keys, banner text, and provider names as untrusted input.
- Avoiding `innerHTML` for untrusted data unless it is sanitized safely.
- Keeping Chrome extension permissions as narrow as possible.
- Avoiding unnecessary remote requests.
- Avoiding new dependencies unless they are clearly needed.
- Keeping tests updated for security-relevant parsing, rendering, and storage behavior.
- Running the project’s local checks before opening a pull request.

## Scope

This policy applies to the CookieBuddy repository and its source code, tests, extension files, GitHub Actions workflow, and documentation.

It does not apply to:

- Websites analyzed by CookieBuddy.
- External services opened by user-clicked links.
- Email clients opened through draft email links.
- Browser behavior outside CookieBuddy’s control.
- Third-party forks or modified builds not maintained in this repository.

## Thank You

Security reports and privacy-focused reviews are appreciated. Responsible reports help protect users and improve CookieBuddy for everyone.
