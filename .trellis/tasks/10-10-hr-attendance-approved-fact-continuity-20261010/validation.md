# Validation

## Focused checks

- `pnpm --filter @jinhu/api typecheck` — pass.
- `pnpm --filter @jinhu/web typecheck` — pass.
- `PARTY_DATA_ENCRYPTION_KEY=... pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-attendance-request.spec.ts src/modules/hr/hr-attendance-calculation.spec.ts src/modules/hr/hr-attendance-month-close.spec.ts` — 17 passing.
- `pnpm --filter @jinhu/web exec vitest run test/interaction/hr-attendance-request-workflow.test.tsx` — 13 passing.
- Disposable loopback PostgreSQL fixture at `127.0.0.1:55498`, database `jinhu_hr_migration_lab_attendance_fact`: request, calculation, and month-close PG suites — 13 passing before the review corrections; the final request-continuity rerun — 4 passing. Final PG cases include cross-month review→open, closed-period approval retaining `closed`, and notification-failure rollback preserving request `submitted` plus period `review`.

Raw fixture receipts are private mode `0600` under `/Users/mac/.codex/artifacts/hr-attendance-approved-fact-continuity-20261010/`.

## Pending acceptance

Desktop and 390px browser inspection remains for the parent session because this implementation worker did not take the shared browser/runtime slot. The UI interaction test proves committed approval feedback remains committed if period/list refresh fails.

## Scope boundary

No production writes, migration/schema changes, permissions, historical imports, payroll amount formulas, commits, pushes, or PR changes were made.

## Parent review corrections and verification in progress

- Normalized raw SQL business-date keys to text; negative source tests now require the precise stale-source error, and a positive actual-recalculation source match must pass.
- Added dedicated real-PG acceptance file covering both advisory lock orders, no-schedule approved-day recovery, version/date drift, closed late approval and immutable correction quantities, return semantics and stale same-employee summaries.
- Added all four actual-PG suites to mandatory Release Smoke; workflow YAML and the fresh migrated disposable fixture are under verification.
- Actual Web components checked on desktop and390px using synthetic transport; approved success guidance and review→open confirmed, clientWidth=scrollWidth=385. Shared button height42px. Browser hashes/screenshots recorded externally; this is not production real-role UAT.
- Parent Web typecheck, affected lint and14 approval interactions passed. Full Web suite/build and expanded PG run are in progress; do not treat them as passed yet.

## Final parent acceptance

- Fresh fully migrated and production-seeded **disposable local** PostgreSQL run:21 tests passed (20 actual database scenarios and1 source contract),0 failures,0 skips. Four suites ran sequentially with required flags. Both advisory-lock waiter orders, positive correct-source recovery, missing/empty-source rejection, closed late approval→day recalculation→new correction batch, request version/date drift, notification rollback, omitted/new employee and stale same-employee summary cases passed. Owned container and network removed.
- Web full suite:99 files,745 tests passed. API focused unit suites:17 passed; final Shanghai request boundary suite passed with32 affected days across3 months and cross-year boundary assertions.
- API/Web typecheck, affected ESLint, API/Web production builds passed. Web build reported existing unrelated unused-eslint-disable warnings; no unrelated warning cleanup performed.
- Actual component desktop/390px synthetic transport verification completed against final Web file hashes; review displays employee/name/code/dates, approval guidance remains successful and month switches to待计算. No horizontal overflow (385=385); current shared buttons42px.
- Workflow YAML parsed with bundled Ruby YAML. Related four PG suites added to mandatory Release Smoke; candidate CI and production runtime still pending.
- No production business writes, permission/account changes, schema migration, payroll formula changes or import replay.
- Dependency PR918 merged591d200d5; its production deployment must reach runtime verification before this slice is rebased/released. The full modernization goal remains incomplete: real-role production operations, actual wage rules/amounts, original-client equivalence and cutover/recovery/independent-product acceptance remain separate requirements.

- Integration gate: fetched latestmain591d200d5; PR918 authored/merged parent trees both26073a85666a1f99d1552d1218d9be97f774077e. Rebased the owned working changes onto main with autostash; pre/post binary patches byte-identical, untracked task/test/spec files retained. No conflict or code/input/dependency change; relevant existing results remain applicable.

## Cumulative release after predecessor predeploy failure

PR918 merged591d200d5 passed its CI, but production run37996455886 failed during full predeploy verification in an existing daily-export interaction. GitHub job evidence confirms Deploy to production host was skipped. Its watcher75400 is terminal1. PR919 watcher67736 was stopped (terminal130) before updating this candidate.

The failed test waited for an enabled export button without proving the replacement filter dataset had rendered. The fixture now distinguishes filtered employee identities and waits for the visible filtered ledger before exporting; it still checks101 records, exact filter/token/page traversal and exclusion of internal facts. Focused14 tests, Web types and affected lint passed; full suite result recorded externally.

Release plan: use the latest cumulative PR919 candidate to ship both918 schedules and919 approval continuity in one deployment after all required CI/Release Smoke checks. Immediately before merge re-query predecessor job state and require terminal predeploy failure plus skipped host update, and verify current main remains591d200d5. Do not retry the obsolete918 deployment. API/Web runtime equality, health and Docker cleanup remain mandatory for the combined latest release. No production business write or historical import replay.

CI37997613681 passed all745 Web interaction tests but exposed an obsolete HR source-contract assertion for the intentionally clarified approved-leave label. Updated that assertion to 已批准计入, preserving planned/cancelled distinctions. Full HR source/logic contracts:233 passed,0 failed,0 skipped. Application code and prior PostgreSQL/browser evidence unchanged.
