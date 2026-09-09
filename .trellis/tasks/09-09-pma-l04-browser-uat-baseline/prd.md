# PMA L-04 browser UAT baseline

## Goal

Rebuild the property browser UAT harness so a real authenticated run can produce reviewable, redacted evidence for the canonical 27-route / 30-case HCD matrix.

## Requirements

- Reuse real keyboard login and observe the authentication request.
- Prove logout followed by a fresh BrowserContext cannot inherit a session.
- Check every selected route at desktop and 390px.
- Support fixture-resolved picker, narrow-permission, unknown-value and detail assertions.
- Persist a redacted report, screenshots and SHA-256 manifest.
- Keep the automated contract gate independent of HR tests and fixtures.

## Acceptance Criteria

- [ ] Login POST, `/users/me`, UI logout and fresh-context isolation are evidenced.
- [ ] A viewport-matrix mode emits separate desktop and phone results for every route.
- [ ] A declarative case file supplies exact route and DOM/text assertions without credentials.
- [ ] Evidence files are mode 0600 and have a verifiable SHA-256 manifest.
- [ ] HCD conclusions retain PASS/SURFACE_ONLY/BLOCKED/UNVERIFIED; only real browser evidence may yield PASS.

## Notes

- Issue: #716.
- No HR smoke/fixture changes and no production direct operations.
