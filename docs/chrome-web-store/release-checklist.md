# Chrome Web Store release checklist

## Prepared in the repository

- [x] Manifest V3 package with version `0.1.0`.
- [x] Localized manifest name and description for English and German.
- [x] 128×128 store icon available at `assets/logo-v2-128.png`.
- [x] Public privacy policy at [`PRIVACY.md`](../../PRIVACY.md).
- [x] Store listing copy in [`store-listing.md`](store-listing.md).
- [x] Privacy-tab declarations in [`privacy-disclosure.md`](privacy-disclosure.md).
- [x] Reviewer flow in [`test-instructions.md`](test-instructions.md).
- [x] Reproducible ZIP packaging via `npm run package:store`.
- [ ] Create at least one current 1280×800 store screenshot from the actual UI.
- [ ] Optionally create the 440×280 small promo tile and 1400×560 marquee image.

## Before upload

1. Merge the release branch so the privacy URL points to `main`, then verify that the URL is publicly reachable without authentication.
2. Run `npm ci`, `npm test`, `npm run check`, `npm run test:visual`, and `npm run package:store` from the release commit.
3. Load the packaged extension in Chrome from `artifacts/cookiebuddy-0.1.0.zip` or an extracted copy and repeat the reviewer flow.
4. Review the generated ZIP contents. The manifest must be at the ZIP root, and the package must not contain tests, documentation, `.git`, `node_modules`, screenshots, or credentials.
5. Add the final screenshot(s) and confirm that all visuals match the uploaded version and contain no real personal data.

## Dashboard sequence

1. Open the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
2. Choose **Add new item** and upload `artifacts/cookiebuddy-0.1.0.zip`.
3. Complete **Store listing** with [`store-listing.md`](store-listing.md), including the icon, screenshot(s), website, and support URL.
4. Complete **Privacy** with [`privacy-disclosure.md`](privacy-disclosure.md) and the public URL to [`PRIVACY.md`](../../PRIVACY.md).
5. Complete **Distribution** as a free extension and select the intended regions.
6. Complete **Test instructions** with [`test-instructions.md`](test-instructions.md); do not provide credentials.
7. Save as draft and inspect the rendered listing. Submit for review only after the screenshot blocker is resolved and the listing, privacy tab, policy, manifest, and behavior agree.

Do not claim that CookieBuddy is a legal compliance checker, detects every tracker, has no limitations, or has received a Chrome Web Store award.

## Official references

- [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare)
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/)
- [Create a great listing page](https://developer.chrome.com/docs/webstore/best-listing)
- [Chrome Web Store user-data policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [2026 policy updates](https://developer.chrome.com/blog/cws-policy-updates-2026)
