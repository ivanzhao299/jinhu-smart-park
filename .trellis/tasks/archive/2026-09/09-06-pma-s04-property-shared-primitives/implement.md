# Implementation Progress

## Plan

- [x] Create Issue #667, branch, and Trellis task.
- [x] Inventory current shared primitives and bounded duplication targets.
- [x] Implement/export primitives with focused tests.
- [x] Adopt on selected property surfaces and validate source contracts.
- [x] Review (3 rounds), CI, merge, containing-main dual green.
- [x] Archive task and close through Trellis-only PR #669.

## Evidence Log

- 2026-09-06: created from the latest `origin/main`; no migration/seed/HR scope.
- 2026-09-06: four read-only scouts confirmed existing `PageState` and property display dictionaries; avoided duplicate state/enum systems. Selected identity draft, global breadcrumb, and three leasing formatter consumers as bounded adoption points.
- 2026-09-06: first property run exposed an incompatible top-level test glob that pulled in a repo-root-only legacy integration test (5 ENOENT); moved the new contract under the existing DS glob and restored the test script boundary.
- 2026-09-06: property suite then passed 41/41. First menu run had one test-only label mismatch (`工程项目` expected as parent vs authoritative `工程管理`); corrected the expectation without changing product labels.
- 2026-09-06: second menu run exposed only a return-shape expectation mismatch (`{ parent: undefined, current: undefined }` versus `{}`); retained the typed stable shape and corrected the test.
- 2026-09-06: property 41/41 and menu 13/13 passed; typecheck then found remaining invoices/payments references to the removed local `formatMoney`. Switched the shared import to the original local alias so every call uses the shared formatter.
- 2026-09-06: final local gate passed: property 42/42, menu 13/13, Web typecheck, Web lint, and `git diff --check`.
- 2026-09-06: no isolated browser connector was available; per constraint the shared main Chrome was not used. Actual desktop/390px route rendering remains an explicit browser verification gap for L-04, while this PR covers source/state contracts.
- 2026-09-06: review 1 found missing browser history protection, lost PageState heading semantics, uncovered engineering edit-route breadcrumbs, and nullable financial display drift. Added `popstate` cancellation plus an explicit `confirmLeave` API, restored a screen-reader heading, declared edit templates, and preserved `0.00` at existing financial call sites.
- 2026-09-06: review 2 correctly rejected direction-blind `history.forward()` recovery and per-instance suppression. Replaced it with a singleton guard registry: Navigation API cancellation covers Link/router/history where supported; fallback covers anchor navigation, and `beforeunload` remains universal. No history compensation or repeated per-instance listeners remain.
- 2026-09-06: review 3 noted `preventDefault()` does not reliably cancel Navigation API traverse events. Replaced cancellation with `NavigateEvent.intercept()` and an aborting handler, so supported Chromium navigation waits for the operator decision. Non-Navigation-API SPA history traversal remains a documented browser compatibility/L-04 gap; fallback still protects anchors and full unloads. Review cap reached; final patch is validated by focused tests/type/lint/CI rather than a fourth review.
- 2026-09-06: final head `5d9517eb`; PR #668 CI `34020812475` success (Release Smoke skipped by frontend-only scope); squash merge `78e708b6`.
- 2026-09-06: main CI `34021337190` and Deploy `34021336894` both success. No production-direct operation was performed.

## Risks

- Browser-native unload prompts cannot carry custom copy; tests must verify registration semantics rather than wording.
- Empty-state cause must come from known state, not inference from an empty array alone.
- Formatter fallbacks must remain honest for unknown values.
