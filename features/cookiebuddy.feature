Feature: Review cookie consent and tracking behavior

  Scenario: Scan the visited page
    Given the user is viewing a website in Chrome
    And CookieBuddy has access to the current page
    When the user opens CookieBuddy
    Then CookieBuddy detects the cookie banner when possible
    And displays visible cookies, browser storage, and third-party traffic
    And stores the scan result only in local extension storage

  Scenario: Use the DPO contact from the visited page privacy policy
    Given the visited page has a privacy-policy link in its footer
    And the privacy policy contains a data protection officer email address
    And the page also contains another generic contact email address
    When CookieBuddy scans the page
    Then CookieBuddy uses the DPO email from the privacy policy
    And CookieBuddy does not use the generic contact email instead
    And CookieBuddy shows the privacy-policy URL as the contact source

  Scenario: Prefer a labeled DPO contact from the site's imprint
    Given the footer privacy link contains only a generic contact email
    And the same site has an imprint containing a data protection officer email address
    When CookieBuddy scans the page
    Then CookieBuddy uses the labeled DPO email from the imprint
    And CookieBuddy does not use the generic privacy contact instead
    And CookieBuddy shows the imprint URL as the contact source

  Scenario: Run a delta check with an automatic opt-out
    Given a cookie banner with a reject-all option is detected
    When the user confirms the delta check
    Then CookieBuddy records the state before opt-out
    And tries to click the reject-all option
    And compares cookies, storage, and third-party traffic after opt-out

  Scenario: Run a delta check after manual opt-out
    Given no automatic reject-all option can be found
    And the user manually rejects optional cookies
    When the user confirms the delta check
    Then CookieBuddy checks the current post-opt-out state
    And identifies the result as a manual opt-out

  Scenario: Flag non-essential activity after opt-out
    Given a delta check has completed
    And non-essential cookies, storage entries, or third-party traffic remain
    When CookieBuddy displays the result
    Then CookieBuddy marks the result for review
    And displays the remaining items
    And explains that the result is a review signal, not legal advice

  Scenario: Compare the all-opted-out state with banner services
    Given the cookie banner lists essential and non-essential services
    And the user completes an all-opted-out state
    When CookieBuddy compares post-opt-out cookies, local storage, and traffic with the banner services
    Then essential services are marked "Essential / allowed"
    And non-essential services with no post-opt-out evidence are marked "Successfully disabled"
    And non-essential services still observed after opt-out are marked "Still active"
    And services or signals not listed in the banner, including possible extension traffic, are marked "Unclear"
    And the report identifies whether each service was listed in the banner

  Scenario: Export the detailed delta report
    Given a delta check has completed
    When the user opens the details view
    Then CookieBuddy displays the findings and limitations
    And the user can download an HTML report
    And the user can open a printable report

  Scenario: Prepare delta findings for email
    Given a delta check has completed
    And a privacy contact has been detected from the visited page privacy policy
    When the user opens the details view
    Then CookieBuddy offers a mail draft addressed to that contact
    And the mail draft contains the structured delta findings
    And the user can copy the same report text for use in another email client
    And CookieBuddy reminds the user to review the message before sending
