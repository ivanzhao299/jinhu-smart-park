# Implementation Plan

- [x] Add UI logout + fresh BrowserContext session isolation evidence.
- [x] Add full desktop/390 viewport matrix.
- [x] Add declarative route/case assertions for picker, narrow permission, unknown values and details.
- [x] Add SHA-256 artifact manifest and redacted report metadata.
- [x] Extend non-HR contract gate and documentation.
- [x] Run focused tests and two bounded dedicated browser attempts; classify HCD 30 cases honestly. A fresh disposable 307/307 database, product API fixtures, Web and dedicated Chromium were used. Attempt 1 exposed a submit-key sequence gap. Attempt 2 proved real keyboard `/auth/login=200`, authenticated `/users/me=200`, UI logout, and fresh-context storage/cookie isolation, then exposed the runner's missing bearer header on its follow-up `/users/me` probe. The probe is fixed, but the no-third-attempt rule leaves `pages_checked=0` and HCD-001..030 BLOCKED.
- [x] Review budget retained at the completed three-review ceiling from the continuation point; no fourth review was started.
- [x] PR #719 opened; first PR CI run #34298457457 passed verify and Release Smoke in full.
- [ ] Squash merge, main CI+Deploy observation, Issue #716 closure, archive/journal/cleanup.

## Cost Summary

Task: PMA L-04 browser UAT baseline
Status: implementation, bounded browser terminal run, teardown, focused quality checks, PR creation, and first PR CI complete; merge delivery pending
Files changed: browser runner, contract test, CI workflow, package script, UAT docs, task artifacts
Tests run: browser contract 5/5; property 50/50; housing 33/33; homestay 18/18; full lint PASS; typecheck reached a pre-existing root-owned install missing vitest/testing-library and could not repair without filesystem authority; disposable migration 307/307, seed/bootstrap/baseline, homestay/housing product API fixtures PASS
Retries: browser 2/2 by policy; bootstrap parameter 1 correction; API key configuration 1 correction; dependency reinstall 1 blocked attempt
Approx model rounds: continuation/discovery 4, implementation/runtime 8, verification 3 (COST_GUARD: no further agents or browser retries)
Repeated scans avoided: one focused read-only scout, task artifacts, session memory, and retained R4 fixture evidence
Blocked issues: HCD-001..030 remain BLOCKED because the two-run ceiling was reached before the corrected follow-up session probe could execute the 27x2 matrix; no Case was upgraded from static/API evidence
Next step: archive task/journal on the feature branch, wait final PR CI, then squash merge and observe main gates
