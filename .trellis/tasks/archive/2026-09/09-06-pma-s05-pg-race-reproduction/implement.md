# Implementation Progress

## Plan

- [x] Create Issue #670, branch, and Trellis task.
- [x] Locate current renewal/write-off service paths and PostgreSQL integration harness.
- [x] Add synchronized reproduction tests only.
- [x] Run task-owned PostgreSQL tests and record observed outcomes in Issue #670.
- [ ] Review (maximum 3), CI, merge, containing-main dual green.
- [ ] Archive via Trellis-only closure PR.

## Evidence Log

- 2026-09-06: created from latest `origin/main`; explicit zero-migration/zero-product-fix boundary.
- 2026-09-06: disposable PostgreSQL 16 schema initialized through all 306 current migrations plus 8 prerequisites; no seed or production access.
- 2026-09-06: two consecutive synchronized runs reproduced the same result: renewal completed twice and persisted two drafts; no request was rejected.
- 2026-09-06: two consecutive synchronized runs reproduced one approved waiver and one rejected waiver; persisted receivable was `amount_waived=60.00`, `amount_remain=40.00`, `status=40`, but the rejection was HTTP 400 rather than the desired concurrency 409.
- 2026-09-06: the reproduction spec constructs each service from its own QueryRunner manager, so each request's transaction and PostgreSQL `application_name` share the same physical session; the barrier waits until both sessions report a lock wait before release.
- 2026-09-06: review 1 found abnormal-path QueryRunner/DataSource cleanup gaps; review 2 found rollback/release failure could still truncate cleanup; both were fixed with request settlement and nested cleanup guarantees. Review 3 found no remaining P0/P1 issue.
- 2026-09-06: final checks passed: focused spec load (2 expected skips without `DATABASE_URL`), task-owned PostgreSQL reproduction (2/2), workspace lint, workspace typecheck, and workspace build. The build retained the repository's existing non-fatal Next.js ESLint-plugin warning.
- 2026-09-06: no `.trellis/spec/` update: observed renewal double-success and waiver 400 are unresolved defects/decision inputs, not approved current contracts; executable evidence remains in the test, Issue #670, and this task.

## Risks

- A reproduction test that merely sends two promises without a barrier is timing-sensitive and insufficient.
- Expected conflict/success counts must be derived from observed current behavior, not the desired future design.
- Never use another session's PostgreSQL container or credentials.
- Current renewal behavior violates the proposed single-winner invariant; current waiver persistence serializes correctly but does not translate the losing request to 409. Both remain follow-up product decisions outside this reproduction-only task.
