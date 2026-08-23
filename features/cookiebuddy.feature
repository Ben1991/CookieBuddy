Feature: One-click consent and tracking audit
  CookieBuddy gives users a local technical review of whether optional tracking appears to stop after rejection.
  It provides technical observations and confidence, not a legal compliance verdict.

  Background:
    Given CookieBuddy keeps audit processing local by default
    And CookieBuddy distinguishes observed evidence from interpretation
    And incomplete or unsupported checks can never produce a positive green verdict

  @UC-01 @core
  Scenario: Scan the visited page locally
    Given the user is viewing a website in Chrome
    And CookieBuddy has access to the current page
    When the user starts a scan
    Then CookieBuddy detects available consent signals and banner evidence
    And displays observed cookies, supported browser storage, and network evidence
    And stores the scan result only in local extension storage

  @UC-02 @contact
  Scenario: Use the DPO contact from the visited page privacy policy
    Given the visited page has a privacy-policy link in its footer
    And the privacy policy contains a data protection officer email address
    And the page also contains another generic contact email address
    When CookieBuddy scans the page
    Then CookieBuddy uses the DPO email from the privacy policy
    And CookieBuddy does not use the generic contact email instead
    And CookieBuddy shows the privacy-policy URL as the contact source

  @UC-03 @contact
  Scenario: Prefer a labeled DPO contact from the site's imprint
    Given the privacy page contains only a generic contact email
    And the same site has an imprint containing a labeled data protection officer email address
    When CookieBuddy scans the page
    Then CookieBuddy uses the labeled DPO email from the imprint
    And CookieBuddy shows the imprint URL as the contact source

  @UC-04 @issue-42 @p1
  Scenario: Run a controlled before and after rejection audit
    Given the user starts the one-click tracking audit
    When CookieBuddy establishes a baseline observation window
    And rejects optional consent using a verified action when possible
    And reloads the tested page in a controlled way
    And observes a defined post-rejection window
    Then CookieBuddy compares consent state, cookies, storage, and network evidence before and after rejection
    And records every completed and incomplete audit step

  @UC-05 @issue-56 @p1
  Scenario: Verify that reject-all actually changed consent
    Given CookieBuddy identifies one or more possible reject controls
    When CookieBuddy selects and activates a reject control
    Then a successful DOM click alone is not treated as successful rejection
    And CookieBuddy verifies the resulting consent state using available CMP state, consent signals, or UI state changes
    And an ambiguous or unverifiable rejection makes the audit incomplete or unclear
    And the report records the selected control and the verification evidence

  @UC-06 @issue-40 @issue-44 @p1
  Scenario: Detect CMP APIs and validate consent signals in the page main world
    Given the page exposes a supported CMP or consent API in its page JavaScript world
    When CookieBuddy inspects the consent implementation
    Then CookieBuddy can detect supported CMP globals despite content-script isolation
    And reads relevant IAB TCF or Google Consent Mode state where available
    And records the source, timestamp, interpreted values, and inspection limitations

  @UC-07 @issue-44 @p1
  Scenario: Flag consent signals that contradict the rejected UI state
    Given the user has rejected optional tracking
    And CookieBuddy observes a supported consent framework
    When advertising or analytics consent remains granted after rejection
    Then CookieBuddy records the contradictory signal as concrete evidence
    And classifies the result as a high-confidence technical finding

  @UC-08 @issue-41 @p1
  Scenario: Preserve concurrent network evidence without lost updates
    Given many requests occur concurrently during an audit
    When CookieBuddy records network activity
    Then requests are retained deterministically up to the configured evidence limit
    And concurrent capture cannot overwrite previously captured requests
    And incomplete network capture prevents a green verdict

  @UC-09 @issue-53 @p1
  Scenario: Capture relevant first-party and third-party cookie evidence
    Given observed services use cookies during the tested flow
    When CookieBuddy captures cookie state before and after rejection
    Then relevant first-party, subdomain, and observable third-party cookie metadata is included
    And unrelated cookies from other browsing contexts are excluded
    And cookie values are not stored or exported by default

  @UC-10 @issue-47 @p1
  Scenario: Capture supported browser persistence mechanisms
    Given the tested site uses browser persistence
    When CookieBuddy captures storage evidence
    Then localStorage and sessionStorage metadata is included
    And IndexedDB, Cache Storage, and service worker registration metadata is included where supported
    And unsupported storage inspection is explicitly marked as not inspected

  @UC-11 @issue-46 @p1
  Scenario: Classify first-party and third-party endpoints using registrable domains
    Given the tested site or request host uses a multi-level public suffix, subdomain, IP address, localhost, or IDN
    When CookieBuddy classifies the request relationship
    Then it uses Public Suffix List compatible registrable-domain logic
    And does not rely on the last two hostname labels
    And possible first-party-looking tracking endpoints are not automatically treated as safe

  @UC-12 @issue-43 @p1
  Scenario: Classify necessity conservatively and with rationale
    Given CookieBuddy observes a cookie, storage entry, request, or service
    When it determines whether the item appears necessary or optional
    Then a cookie name or CDN hostname alone cannot prove necessity
    And the classification includes rationale and confidence
    And unknown items remain unknown or unclear rather than being silently treated as necessary

  @UC-13 @issue-52 @p2
  Scenario: Recognize services from maintainable offline rule data
    Given CookieBuddy observes a known analytics, advertising, personalization, social, embed, or tag-management signal
    When it maps the signal to a service
    Then service identification uses versioned local rule data
    And the result exposes the rule evidence and confidence
    And unknown signals remain visible as first-class evidence

  @UC-14 @issue-55 @p1
  Scenario: Detect consent surfaces in frames and open shadow roots
    Given a consent UI is rendered in the top document, a same-origin frame, or an open shadow root
    When CookieBuddy searches for the consent surface
    Then it detects and can operate supported consent controls in the relevant DOM context
    And records which frame or root produced the evidence
    And an inaccessible cross-origin consent surface is reported as inaccessible rather than absent

  @UC-15 @issue-54 @p1
  Scenario: Detect an audit with contaminated browser state
    Given the browser may have prior consent, prior rejection, blocking, tracking protection, login state, or other conditions that influence observed traffic
    When CookieBuddy evaluates audit integrity
    Then it reports the known starting consent state and integrity limitations
    And distinguishes prior consent, prior opt-out, clean, and unknown starting states
    And records observable blocked tracker requests separately from successful network traffic
    And materially uncertain integrity prevents a green verdict
    And CookieBuddy can recommend rerunning in a cleaner environment without silently deleting unrelated user data

  @UC-16 @issue-59 @p2
  Scenario Outline: Handle audit lifecycle interruptions deterministically
    Given a one-click audit is in progress
    When <interruption> occurs
    Then the audit ends or resumes in a deterministic completed, incomplete, or failed state
    And partial evidence cannot be rendered as a green result
    And the local evidence report records the interruption type and a minimized navigation URL where relevant
    And long observation windows report progress and a clear timeout reason

    Examples:
      | interruption |
      | the popup is closed and reopened |
      | the tab changes route through SPA navigation |
      | the page redirects |
      | the service worker restarts |
      | the user reloads the page |
      | the tested tab is closed |
      | a tracker loads after a long delay |

  @UC-17 @issue-48 @p1
  Scenario Outline: Produce a conservative top-level verdict
    Given the audit has finished with <condition>
    When CookieBuddy determines the result
    Then the top-level verdict is <verdict>
    And the verdict includes confidence, reasons, coverage, unresolved signals, and links to evidence
    And the wording remains a technical review rather than a legal compliance conclusion

    Examples:
      | condition | verdict |
      | all mandatory checks completed and no contradictory evidence was observed | "Looks correctly implemented" |
      | relevant signals remain ambiguous | "Review recommended" |
      | strong contradictory tracking evidence remains after rejection | "Likely incorrect implementation" |
      | one or more mandatory checks failed or were unsupported | "Audit incomplete / unable to determine" |

  @UC-18 @issue-45 @p1
  Scenario: Build an evidence-grade reproducible audit report
    Given an audit has completed or stopped with partial evidence
    When the user opens or exports the report
    Then the report includes the tested URL, timestamp, extension version, audit timeline, detected CMP, rejection action, consent state, cookie metadata, storage metadata, network evidence, service mappings, limitations, and classification rationale
    And every interpreted finding links to the concrete observed evidence that caused it
    And the report offers human-readable and structured machine-readable export

  @UC-19 @issue-58 @p1
  Scenario: Minimize sensitive URL data when evidence is captured
    Given a network or page URL contains query values or fragments
    When CookieBuddy stores audit evidence
    Then query parameter values and fragments are excluded by default
    And only the minimum URL metadata needed for local classification is retained
    And raw sensitive URLs are not persisted elsewhere by default

  @UC-20 @issue-61 @p2
  Scenario: Add optional user-controlled visual evidence
    Given the user enables visual evidence for an audit
    When CookieBuddy captures the consent UI before and after rejection
    Then screenshots are limited to the tested tab and audit flow
    And each screenshot records a minimized tested URL, timestamp, audit step, and selected reject label
    And the user can preview and remove screenshots before export
    And CookieBuddy warns that screenshots may contain page content or personal information
    And permission or browser capture failures are recorded as unavailable without invalidating technical evidence

  @UC-21 @issue-49 @p1
  Scenario: Prepare a complaint from a supported negative finding
    Given an audit contains a supported negative technical finding
    When the user chooses to prepare a complaint or contact the website
    Then CookieBuddy creates a reviewable factual draft using only evidence present in the audit
    And includes the tested website, date, opt-out action, observed post-rejection findings, and evidence report
    And avoids inventing a legal violation or unsupported accusation
    And uncertain recipients or authorities are presented as candidates rather than guessed

  @UC-22 @issue-57 @p2
  Scenario: Present the one-click verdict before technical detail
    Given an audit result is available
    When the user views the main popup
    Then the primary screen answers whether tracking appears correctly implemented before showing technical metrics
    And explains the result in plain language with one to three reasons
    And shows whether the observable audit is complete or incomplete next to the verdict
    And cookies, services, storage, traffic, CMP data, and advanced terminology remain available through progressive disclosure

  @UC-23 @issue-62 @p2
  Scenario: Support multilingual and accessible consent controls safely
    Given a consent control uses supported non-English or non-German text, an accessible name, or an icon-only semantic control
    When CookieBuddy searches for consent actions
    Then it recognizes maintained locale vocabulary such as French, Spanish, Polish, and Japanese rejection labels
    And it checks CMP-specific selectors, roles, accessible names, and associated labels before visible button text
    And broad or unsupported language text is never treated as a safe consent action
    And language uncertainty cannot be interpreted as successful rejection
    And CookieBuddy's own result flow has localized screen-reader labels, natural focus order, and visible focus

  @UC-24 @issue-60 @p2
  Scenario: Explain tracking techniques outside reliable browser-side coverage
    Given tracking may use fingerprinting, server-side tagging, backend enrichment, first-party proxies, or other opaque techniques
    When CookieBuddy reports audit coverage
    Then it distinguishes not observed, not detected, and not technically inspectable
    And it explains that these states describe this audit's evidence scope rather than complete tracking coverage
    And does not claim complete tracking detection
    And heuristic indicators are labeled separately from confirmed browser evidence with confidence

  @UC-25 @issue-51 @issue-63 @p2
  Scenario: Preserve privacy and bounded performance of CookieBuddy itself
    Given CookieBuddy can observe page, cookie, storage, and request metadata
    When the extension is installed and audits are run
    Then every permission has a documented product need
    And no audit data, browsing data, analytics, telemetry, or identifiers are sent to a remote service
    And retained local audit data can be deleted by the user
    And idle and active audit work stays within documented performance and evidence-retention budgets
    And idle request monitoring records no requests and performs no session-storage writes
    And an active audit is bounded to 30 seconds and 500 requests per tab
    And page analysis caps text, HTML, resources, stored entries, and contact-page work

  @UC-26 @documentation @contract
  Scenario: Keep product specification, tests, README, and visible documentation in sync
    Given a task changes product behavior, detection, verdict logic, evidence, privacy behavior, user flow, or visible UI
    When the change is prepared for completion
    Then the matching Gherkin scenario is added or updated in the same change
    And automated tests map to the changed acceptance behavior
    And visual tests and screenshots are updated when visible behavior changes
    And the README use-case contract and relevant limitations are updated in the same change
    And the task is not complete while any affected contract artifact is stale
