# Chrome Web Store reviewer test instructions

No account, credentials, or special setup are required.

1. Install the submitted item from the Chrome Web Store, or load the uploaded ZIP as an unpacked extension for local review.
2. Open a normal HTTP(S) page such as <https://www.google.com/> or <https://www.mydealz.de/>. Sites may show a regional consent dialog, an ad-block wall, or no banner; that is expected and should remain visible in the audit result.
3. Open the CookieBuddy toolbar action. The popup should show the current page, the local-processing notice, the audit question, and the **Check tracking** action.
4. Run the audit. CookieBuddy should show progress, a conservative verdict, evidence/coverage details, and limitations. A missing or inaccessible consent surface must not become a positive result.
5. Open the evidence view and verify that cookie values, storage values, query values, and response bodies are not displayed. The report can be exported locally as HTML/printable output or JSON.
6. Use **Delete local audit data** and verify that the local scan and delta result disappear.
7. Switch the language selector between English and German and verify that the popup and evidence view update their language and document `lang` attribute.

For a second smoke pass, reviewers may use <https://www.linkedin.com/>, <https://www.bild.de/>, <https://www.golem.de/>, and <https://makerworld.com/de>. These websites change frequently and may require login, regional consent, longer loading, or block automated browsing; do not use personal accounts or cookies for review.

## Permission rationale

The submitted permissions are used only for the user-started local audit. `activeTab` and `scripting` enable on-demand page inspection, `cookies` reads metadata for the comparison, `storage` keeps bounded local results, `webRequest` observes minimized request metadata during an active audit, and HTTP(S) host access covers first-party and third-party evidence needed by the audit.
