## What changed?

<!-- Describe the implementation and why it is needed. -->

## Acceptance contract

Affected Gherkin scenarios / use-case IDs:

- `UC-__`

Related issue(s):

- #__

## Definition of Done

- [ ] The affected `features/cookiebuddy.feature` scenario(s) are current.
- [ ] Real automated tests cover the changed acceptance behavior (not only scenario-text presence).
- [ ] Negative, ambiguous, and failure paths are covered where applicable.
- [ ] Incomplete/unsupported evidence cannot accidentally produce a green verdict.
- [ ] `README.md` use-case contract and affected product/privacy/limitations text are updated.
- [ ] Visual tests are updated if visible behavior changed.
- [ ] README screenshots are regenerated and reviewed if visible behavior changed.
- [ ] Privacy/data-minimization impact was reviewed.
- [ ] Remaining detection/coverage limitations are documented.
- [ ] `npm test` passes.
- [ ] `npm run check` passes.
- [ ] `npm run test:visual` passes when applicable.

## Evidence / verification

<!-- Describe fixtures, test cases, screenshots, or manual smoke tests used to verify the change. -->

## Privacy and security impact

<!-- State whether permissions, stored data, request capture, exports, or external communication changed. -->

## Remaining limitations

<!-- Be explicit. Unknown or unsupported behavior must not be hidden by a positive verdict. -->

## Accessibility review

- [ ] Keyboard-only flow was checked for affected UI.
- [ ] Focus is visible and the tab order is logical.
- [ ] Labels, roles, names, language, and dynamic status announcements were checked.
- [ ] Color is not the only way meaning is conveyed.
- [ ] Reduced motion, zoom/reflow, and contrast behavior were checked where applicable.
- [ ] A screen-reader or accessibility scanner check was run, or the remaining limitation is documented above.
