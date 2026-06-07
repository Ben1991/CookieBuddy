# Contributing to CookieBuddy

Thank you for your interest in contributing to CookieBuddy! 🎉

CookieBuddy exists to help users understand and control their online privacy. Every contribution — whether code, documentation, testing, design, translations, or feedback — helps make the project more transparent, secure, and user-friendly.

This guide explains how to contribute effectively and what principles guide development.

---

## Our Principles

CookieBuddy is built around privacy, transparency, and user control.

When contributing, keep these principles in mind:

* **Privacy first:** Never introduce features that weaken user privacy or collect unnecessary data.
* **Minimal data handling:** Avoid adding telemetry, tracking, analytics, or external dependencies unless there is a strong privacy-preserving reason.
* **Transparency:** Users should understand what CookieBuddy does and why.
* **Security matters:** Treat user data, browser permissions, and stored information with care.
* **User control:** Features should empower users, not make decisions on their behalf without clear consent.

If you are unsure whether a change aligns with these principles, open a discussion before implementing it.

---

## Ways to Contribute

There are many ways to help:

### 🐛 Report Bugs

Found something broken?

Before opening an issue:

1. Check existing issues to avoid duplicates.
2. Verify the problem still exists on the latest version.
3. Collect useful details:

   * Browser and version
   * Operating system
   * CookieBuddy version
   * Steps to reproduce
   * Expected behavior
   * Actual behavior
   * Relevant logs or screenshots (avoid sharing private data)

Create a bug report with a clear title and description.

---

### 💡 Suggest Features

Feature requests are welcome.

Good feature requests include:

* The problem you want to solve
* Why the feature improves privacy or usability
* Possible alternatives considered
* Potential privacy/security implications

Please avoid suggestions that require:

* User tracking
* Mandatory accounts
* Unnecessary cloud services
* Collection of browsing data

---

## Development Workflow

### 1. Fork the Repository

Create your own fork and clone it locally:

```bash
git clone https://github.com/YOUR_USERNAME/CookieBuddy.git
cd CookieBuddy
```

---

### 2. Create a Branch

Use a descriptive branch name:

```bash
git checkout -b feature/meaningful-name
```

Examples:

* `feature/improve-cookie-detection`
* `fix/firefox-storage-bug`
* `docs/privacy-explanation`

---

### 3. Make Your Changes

Keep changes focused.

Good pull requests:

* Solve one problem at a time
* Include tests where applicable
* Avoid unrelated formatting changes
* Keep dependencies minimal

---

## Privacy and Security Requirements

Before submitting changes, consider:

### Data Collection

Do not add:

* Tracking scripts
* Analytics SDKs
* Remote logging
* User profiling
* Hidden network requests

If a network request is required, document:

* What data is sent
* Where it goes
* Why it is necessary
* How users can disable it

---

### Permissions

CookieBuddy may interact with browser permissions.

When changing permissions:

* Request the minimum required access
* Explain why it is needed
* Avoid broad permissions unless unavoidable

---

### Dependencies

New dependencies should be evaluated carefully.

Ask:

* Is it actively maintained?
* Does it introduce unnecessary code?
* Does it communicate externally?
* Does it affect user privacy?
* Is the functionality already available?

A smaller dependency footprint improves security and trust.

---

## Code Style

Please follow the existing project style.

General guidelines:

* Write readable code
* Prefer clarity over cleverness
* Use meaningful names
* Add comments where behavior is not obvious
* Remove unused code
* Keep functions focused

---

## Testing

Before submitting a pull request:

* Run the existing test suite
* Test your changes manually
* Verify privacy-related behavior
* Check browser compatibility if applicable

If adding a feature, include tests where possible.

---

## Pull Requests

Before opening a PR:

* Rebase or update against the latest main branch
* Ensure builds/tests pass
* Write a clear description

A good PR explains:

### What changed?

Example:

> Added improved cookie categorization handling.

### Why?

Example:

> Helps users better understand which cookies require attention.

### Privacy impact

Example:

> No new data collection or permissions added.

---

## Review Process

All contributions are reviewed with focus on:

* Correctness
* Security
* Privacy impact
* Maintainability
* User experience

Changes may require discussion before merging.

Reviews are collaborative — feedback is meant to improve the project.

---

## Security Issues

Please do not publicly disclose security vulnerabilities.

If you discover a security issue:

* Open a private security report if available
* Provide reproduction steps
* Include affected versions
* Explain potential impact

Responsible disclosure helps protect CookieBuddy users.

---

## Community Guidelines

Please:

* Be respectful
* Assume good intentions
* Discuss ideas, not people
* Welcome newcomers
* Keep discussions focused on improving the project

Privacy communities depend on trust and constructive collaboration.

---

## Thank You

Every contribution helps make the web a little more private.

Thank you for helping build CookieBuddy. ❤️
