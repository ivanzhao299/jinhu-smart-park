# Issue 721 HCD seven-case browser closure

## Goal

Close the seven honestly unresolved HCD browser cases by exercising each original interaction or data state in the disposable L-04/HCD environment and adjudicating only from fresh browser evidence.

## Confirmed scope

- HCD-006: select a refund/waiver source ledger entry, save, reload or navigate back, and assert the localized echoed entry type.
- HCD-008: use a named turnover associated with a real work order and exercise/assert the work-order picker and localized status.
- HCD-009: trigger a high-risk operation in the browser and assert the localized approval/execution success feedback without an unlabelled internal request ID.
- HCD-013: trigger an actual validation, conflict, permission, or network error and assert the shared Chinese error projection.
- HCD-017: expose a real disposable unknown eligibility-reason fixture and assert “未知阻断原因” without raw-code primary display.
- HCD-025: open the billing charge-plan picker, select a plan, save, reload or return, and assert the localized billing-source echo.
- HCD-026: select charge type, payment method, and approval target in the finance/billing UI, save, reload or return, and assert localized echo.

## Requirements

- Reuse the L-04 isolated compose stack, disposable PostgreSQL, product-safe fixtures, dedicated Chromium/profile, `typeWithKeyboard` UI login, logout plus fresh BrowserContext isolation, and anti-crosswire evidence.
- Execute each case at desktop 1440 and mobile 390 through real browser interaction. API/SQL may prepare disposable preconditions but may not substitute for the tested UI action.
- PASS requires screenshot, DOM assertion, Network evidence, and a recomputable SHA-256 manifest. Preserve ignored artifacts and scan them for sensitive information.
- If a genuine HCD-scope product defect appears, fix it and rerun the affected case with no more than two repair attempts for one root cause. Out-of-scope defects become a new Issue.
- Preserve the earlier 23 PASS / 7 FAIL history in the final UAT report and append the fresh adjudication.
- Do not touch production, HR, other users' containers, the main Chrome profile, or secrets.

## Acceptance criteria

- [ ] All seven original definitions have an executable fixture and browser action sequence at both viewports.
- [ ] Each case is freshly adjudicated PASS or FAIL with honest per-case rationale.
- [ ] Every PASS has reviewable screenshot, DOM, Network, and SHA-256 evidence; privacy scan passes.
- [ ] Relevant contract/unit/lint/type/build checks pass, excluding HR-only suites.
- [ ] Review (maximum three rounds), PR CI, squash merge, and the standing main-gate rule complete.
- [ ] Issue #721 is closed only if no residual remains; otherwise its residual is updated and it remains open.
- [ ] Trellis task is archived and the final report includes the seven-case matrix, evidence index, skipped checks, and risks.

## Out of scope

- Issue #722 and procurement cost-category localization, which starts only after #721 closes or reaches an honest residual terminal state.
- Production data or production operations.
- HR code, fixtures, smoke repair, or workflow intervention.
