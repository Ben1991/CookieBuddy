# Security Policy

CookieBuddy is a browser extension that inspects page content, cookies, local storage, and network requests in the active tab. Security and privacy issues matter because the app works close to user data.

## Supported Versions

CookieBuddy does not have published releases yet. Security fixes are handled on the default branch.

| Version / Branch | Supported |
| --- | --- |
| `main` | Yes |
| Older commits, forks, or unpublished builds | No |

If releases are published later, this table should be updated.

## Reporting a Vulnerability

Please do not report security issues through public GitHub issues.

Use private reporting instead:

1. GitHub private vulnerability reporting, if enabled.
2. A private message to the maintainer, if private reporting is not available.

Please include:

- A short description of the issue.
- Steps to reproduce it.
- The affected file or feature.
- The browser and operating system used.
- Whether cookies, local storage, scan results, or request data could be exposed.
- Any proof-of-concept code, screenshots, or logs that help explain the problem.

Please do not include real cookies, tokens, personal data, or browsing history.

## What Counts As A Security Issue

Examples include:

- Exposure of cookies, local storage, scan results, or request data.
- Unexpected network calls, telemetry, analytics, logging, or uploads.
- XSS or script injection in the popup, details page, or rendered scan output.
- Unsafe handling of page content, cookie names, hostnames, URLs, consent text, or translations.
- Extension permission misuse or unnecessary privilege escalation.
- Vulnerabilities that let another website, extension, or script read CookieBuddy data.
- Insecure handling of external links, email links, donation links, or authority links.
- Supply-chain risks in dependencies, tests, workflows, or build tooling.
- Delta-check problems that could cause unintended data exposure or unsafe page interaction.

## What Usually Is Not A Security Issue

These are usually not security vulnerabilities unless they also create a concrete security or privacy risk:

- Incorrect cookie or service classification.
- Missed banner detection.
- False positives or false negatives in heuristic analysis.
- A site where automatic reject clicking does not work.
- Legal or compliance disagreements about a site’s cookie behavior.
- General feature requests or UI improvements.

CookieBuddy provides review signals, not legal compliance verdicts.

## Response Expectations

The maintainer will try to:

1. Acknowledge the report when possible.
2. Reproduce the issue.
3. Assess severity and impact.
4. Prepare a fix or mitigation.
5. Credit the reporter if requested.

Please allow reasonable time before public disclosure.

## Responsible Disclosure

Please act in good faith:

- Do not publicly disclose the issue before a fix or mitigation is available.
- Do not exploit the issue beyond what is needed to demonstrate impact.
- Do not access, modify, delete, or share data that does not belong to you.
- Do not use real third-party accounts, real session cookies, or sensitive personal data for testing.
- Prefer minimal proof-of-concept examples.

## Privacy And Data Handling

CookieBuddy is intended to run locally in the browser. Changes should preserve that model:

- No analytics.
- No tracking pixels.
- No remote logging.
- No account system.
- No user identifier.
- No automatic scan upload.
- No telemetry server.
- Local-only scan analysis where possible.

Any change that adds external communication, data collection, telemetry, analytics, account features, remote logging, or automatic upload of browsing data should be treated as security- and privacy-sensitive.

## Security Review Guidance

When contributing code, please pay special attention to:

- Escaping or safely rendering page-derived content.
- Treating cookie names, hostnames, URLs, storage keys, banner text, and provider names as untrusted input.
- Avoiding `innerHTML` for untrusted data unless it is sanitized safely.
- Keeping extension permissions as narrow as possible.
- Avoiding unnecessary remote requests.
- Avoiding new dependencies unless they are clearly needed.
- Keeping tests updated for security-relevant parsing, rendering, and storage behavior.
- Running the project’s local checks before opening a pull request.

## Scope

This policy applies to the repository and its source code, tests, extension files, workflows, and documentation.

It does not apply to:

- Websites analyzed by CookieBuddy.
- External services opened by clicked links.
- Email clients opened through draft email links.
- Browser behavior outside CookieBuddy’s control.
- Third-party forks or modified builds not maintained here.

Thank you for helping keep CookieBuddy safe.
