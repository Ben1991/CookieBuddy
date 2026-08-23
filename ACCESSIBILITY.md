# Accessibility

CookieBuddy aims to be usable by people with different disabilities, assistive technologies, browsers, and devices. This document describes the current scope, goals, known limitations, and reporting path. It is an accessibility commitment and implementation guide, not a claim of full WCAG conformance.

## Scope and goals

The accessibility scope includes the extension popup, the technical details page, generated HTML/PDF evidence reports, and the contribution workflow.

Our target is WCAG 2.2 AA where feasible, with these practical priorities:

- every core action works with keyboard-only navigation;
- native controls are preferred and have clear accessible names;
- focus remains visible and follows the visual order;
- status and error meaning is not conveyed by color alone;
- the document language and localized labels match the selected language;
- dynamic results are announced without overwhelming assistive technology users;
- content remains usable at 200% zoom, narrow widths, high contrast, and forced-colors modes;
- reduced-motion preferences are respected;
- screenshots and other informative images have meaningful alternative text.

## Current implementation

The extension currently provides native buttons, links, selects, checkboxes, labels, localized document language, localized accessible labels for the language controls, visible focus styles for primary interactive elements, reduced-motion CSS, progressive disclosure through native `<details>`, and alternative text for captured screenshots.

The consent-control detector also uses accessible names and associated labels when it evaluates consent controls on visited pages. That detection behavior is separate from the accessibility of CookieBuddy's own interface.

## Known limitations

The following items are tracked improvements rather than hidden assumptions:

- the popup audit-step label and the details-page heading need a final localization/accessibility pass;
- generated evidence tables need captions or equivalent summaries;
- narrow-width and 200% zoom behavior needs a dedicated regression check;
- the repository does not yet run an automated Axe/WCAG scan in CI;
- automated tests do not replace manual keyboard-only and screen-reader checks;
- support for browser-specific forced-colors behavior and assistive technology combinations may vary.

An incomplete accessibility check must not be described as successful conformance. When a user cannot complete the audit, the issue should be reported with the affected flow and environment so it can be prioritized.

## Verification checklist

For UI changes, contributors should verify the affected flow with:

1. Keyboard only: Tab, Shift+Tab, Enter, Space, Escape, and native control behavior.
2. Focus: every focused control is visible and focus order is logical.
3. Screen reader: at least one supported screen reader spot check, such as NVDA on Windows.
4. Zoom and reflow: 200% zoom and a narrow viewport without hidden or clipped core actions.
5. Contrast: light, dark, high-contrast, and forced-colors modes where applicable.
6. Motion: reduced-motion preference when transitions or animations are present.
7. Automated checks: the repository test suite, syntax checks, visual checks, and an accessibility scanner when one is configured.

The standard repository checks are:

```text
npm.cmd test
npm.cmd run check
npm.cmd run test:visual
```

These checks currently cover product behavior, localization, semantic contracts, and visual rendering. They do not constitute a full WCAG audit.

## Reporting an accessibility issue

Use the [Accessibility issue template](.github/ISSUE_TEMPLATE/accessibility.yml). Include the expected and actual behavior, reproducible steps, browser and operating system, assistive technology and version where relevant, severity, and any safe workaround. Do not include cookies, browsing history, personal data, or unredacted screenshots.

Accessibility reports are treated as product expertise. Core-flow blockers should be prioritized before cosmetic issues, and maintainers should close the loop with reporters when they are willing to verify a fix.
