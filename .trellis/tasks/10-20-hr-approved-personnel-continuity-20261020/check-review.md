# Trellis check review — 2026-10-20

## Findings (fixed)

- File: `scripts/e2e/hr-enterprise/approved-personnel-setup.mjs`
  - Issue: the integrated narrow-role fixtures had the required HR page and operation permissions but not the integrated production seed's `hr` menu-root permission. Normal users therefore reached the generic dashboard with an empty main HR menu, which prevented actual page acceptance despite no missing data authority.
  - Fix: add `hr` only while constructing integrated fixture roles. The enterprise fixture stays on its original explicit page codes; the root menu code adds no HR data or write permission.

## Findings (not fixed)

- None. The task checkpoint is maintained by the root agent and still describes the earlier pre-fix `400` investigation; it is not a source-of-truth for this completed review and was intentionally left untouched to avoid concurrent metadata writes.

## Contract and scope review

- `HrJobChangeService` converts PostgreSQL `date` fields to `YYYY-MM-DD` in list, detail, and locked apply reads. Its future-date rejection compares two SQL calendar strings, with `business_today` evaluated in PostgreSQL as `Asia/Shanghai`, before any employee/event/application mutation.
- The actual owned HTTP flow verifies two normal runtime modes, source-key replay and new-key rejection, patch preservation and explicit clear, exact target lookup, independent reviewer apply, self readback, unique event/history, plus future-apply rollback behavior.
- The web lifecycle summary uses the existing `businessDate()` utility and now presents the unified current employment-record surface. The retained aggregate KPIs and backend/audit fields continue to be sourced from the same authorized statistics response.
- No migration, permission catalog, production resource, or source-system data change was made. The only fixture-role expansion is the integrated presentation root described above.
- Frozen-contract scan found no reference to the superseded source hash `585a63d87be9813ca129cc2d55326a9fca49e08a855c307e288e67a3a38f54aa` under `scripts`, `hr-cutover`, or `contracts`; its remaining mention is the preceding task's historical review receipt.

## Verification

- `pnpm --filter @jinhu/api lint` — pass.
- `pnpm --filter @jinhu/api typecheck` — pass.
- `pnpm --filter @jinhu/web lint` — pass.
- `pnpm --filter @jinhu/web typecheck` — pass.
- `HR_ENTERPRISE_E2E_CONFIG=/Users/mac/.codex/artifacts/hr-approved-personnel-continuity-20261020/owned-026ddb4641/config.json node scripts/e2e/hr-enterprise-runtime.mjs --phase=approved-personnel` — pass; 8 assertions, 0 skipped (four stages in each of enterprise and integrated runtimes).
- `pnpm --filter @jinhu/web exec vitest run test/interaction/hr-job-change-operation-continuity.test.tsx test/interaction/hr-lifecycle-employee-selection.test.tsx` — pass; 34 tests.
- `TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","jsx":"react-jsx"}' node --test --require ts-node/register app/hr/hr-lifecycle.contract.spec.ts lib/business-date.spec.ts` from `apps/web` — pass; 6 tests.
- Existing owned PostgreSQL receipt `job-change-focused-regression.log` — pass; 9 tests, including maker/checker and assignment/status-drift transaction rollback.
- `node --check` on all three changed enterprise-runner modules and `git diff --check` — pass.

## Reviewed source hashes

- `apps/api/src/modules/hr/hr-job-change.service.ts`: `77c02f9b2b791322327cecceec45dd66e8fdf58106bb7c8017b7b3665efb4ce7`
- `scripts/e2e/hr-enterprise-runtime.mjs`: `4be79816c9a22268338442ca0657cf90fd8f546e21afd9c313d819a9128d9467`
- `scripts/e2e/hr-enterprise/approved-personnel-setup.mjs`: `7c90f360bba19c91cbf3579d6f86d580ae5edc2041c62eef3b8d5949a80521fd`
- `scripts/e2e/hr-enterprise/approved-personnel-continuity.mjs`: `6d87bea4b206f592372a811d346671052e7e8889ef4d0da7308e933ae031c28d`
- `apps/web/app/hr/lifecycle/HrLifecycleClient.tsx`: `ed52142584b7ff42b074932b086705653080b264d339d7c1da40f0ea96994903`
