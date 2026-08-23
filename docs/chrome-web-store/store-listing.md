# Chrome Web Store listing

Prepared for manifest version `0.1.0`. Enter the English text in the default listing and add the German text as the `de` localized listing.

## Product details

- **Title:** CookieBuddy
- **Summary (English):** Review cookie consent, browser storage, and third-party traffic locally before and after rejecting optional tracking.
- **Summary (German):** Cookie-Einwilligung, Browser-Speicher und Drittanbieter-Anfragen lokal vor und nach der Ablehnung optionalen Trackings prüfen.
- **Primary category:** Privacy & Security, if available in the dashboard
- **Default language:** English
- **Supported listing locale:** German (`de`)
- **Website:** <https://github.com/Ben1991/CookieBuddy>
- **Support URL:** <https://github.com/Ben1991/CookieBuddy/issues>
- **Privacy policy URL:** <https://github.com/Ben1991/CookieBuddy/blob/main/PRIVACY.md>

## Detailed description (English)

CookieBuddy is a local Chrome extension for a technical review of cookie-consent behavior on the page you are viewing. Start an audit from the toolbar, observe the initial browser evidence, reject optional consent where a supported control can be verified, then compare what remains after the rejection.

CookieBuddy can:

- recognize supported consent-banner and CMP signals;
- show cookie metadata without cookie values;
- inspect browser-storage metadata without reading stored records or response bodies;
- observe minimized third-party request metadata during an active audit;
- verify the selected rejection action where the page exposes verifiable evidence;
- show confidence, coverage, limitations, and unresolved signals;
- export a local HTML/printable report and structured JSON evidence with a local SHA-256 fingerprint; and
- keep the latest scan and delta report on the device, with an in-product delete action.

CookieBuddy does not upload scan data, use analytics, create accounts, or provide a legal compliance verdict. A positive result means only that the required browser-visible checks completed without contradictory evidence. Unknown, unsupported, blocked, or incomplete coverage stays unclear and should be reviewed. Server-side tagging, backend processing, first-party proxies, and other browser-invisible techniques may not be detectable.

No account or test credentials are required.

## Detaillierte Beschreibung (Deutsch)

CookieBuddy ist eine lokale Chrome-Erweiterung zur technischen Prüfung des Cookie-Einwilligungsverhaltens der aktuell geöffneten Seite. Starte den Audit über das Symbol in der Symbolleiste, erfasse die anfänglichen Browser-Nachweise, lehne optionale Einwilligung über einen unterstützten und verifizierbaren Schalter ab und vergleiche anschließend die beobachtbaren Daten.

CookieBuddy kann:

- unterstützte Cookie-Banner- und CMP-Signale erkennen;
- Cookie-Metadaten ohne Cookie-Werte anzeigen;
- Metadaten des Browser-Speichers prüfen, ohne gespeicherte Datensätze oder Antwortinhalte zu lesen;
- minimierte Drittanbieter-Anfragen während eines aktiven Audits beobachten;
- die ausgewählte Ablehnungsaktion verifizieren, wenn die Seite dafür überprüfbare Nachweise liefert;
- Konfidenz, Abdeckung, Einschränkungen und ungelöste Signale anzeigen;
- einen lokalen HTML-/Druckbericht und strukturierte JSON-Nachweise mit lokalem SHA-256-Fingerabdruck exportieren; und
- den letzten Scan und Delta-Bericht lokal speichern und über die Erweiterung löschen.

CookieBuddy lädt keine Scan-Daten hoch, verwendet keine Analyse-Dienste und benötigt kein Konto. Ein positives Ergebnis bedeutet nur, dass die erforderlichen im Browser sichtbaren Prüfungen ohne widersprüchliche Nachweise abgeschlossen wurden. Unbekannte, nicht unterstützte, blockierte oder unvollständige Abdeckung bleibt unklar und sollte geprüft werden. Serverseitiges Tagging, Backend-Verarbeitung, First-Party-Proxies und andere im Browser nicht sichtbare Techniken können unentdeckt bleiben.

Es werden weder Konto noch Testzugang benötigt.

## Graphic assets

- **Store icon:** `assets/logo-v2-128.png` (128×128)
- **Current documentation screenshots:** `docs/screenshots/popup-overview.png`, `docs/screenshots/popup-review.png`, `docs/screenshots/delta-audit.png`
- **Required manual store asset:** at least one current 1280×800 screenshot, up to five total. The existing documentation screenshots are intentionally not uploaded as-is because their dimensions are not the store's recommended 1280×800 format.
- **Optional promotional assets:** 440×280 small promo tile and 1400×560 marquee image, both still to be created from approved product visuals.
- **Video:** none prepared; leave empty unless a current, publicly accessible walkthrough is available.

Screenshots must show the current product UI, avoid real personal data and real account sessions, and not claim legal compliance, perfect detection, or store awards.
