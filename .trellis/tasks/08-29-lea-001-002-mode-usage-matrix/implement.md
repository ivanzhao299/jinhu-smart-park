# LEA-001+002 Implementation Plan

## Links and baseline

- Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/482
- Base: `main` at `a196736a1ce572b323a239e400402d75dd216242`
- Branch: `codex/fix-lea-mode-usage-matrix`
- Source report: `docs/reviews/asset-unit-field-semantics-and-intake-plan-2026-08-29.md`

## Checklist

- [x] Create Issue #482 and Trellis parent/child tasks.
- [x] Confirm base commit and collect code evidence for shared/housing, homestay/property transition, units/audit/tests.
- [x] Read relevant Trellis shared/API/Web indexes and referenced guidelines before editing.
- [x] Create branch from exact base and bind Trellis branch/base/scope.
- [x] Implement shared named usage constants, matrix policy, neutral reasons, segment derivation and picker contracts with unit tests.
- [x] Replace property control-plane and occupancy housing-only checks with mode-aware policy.
- [x] Align housing candidate projection and every final-write/approval path to the long-rent policy.
- [x] Add homestay usage policy to candidate, dashboard availability, rates, transaction preflight and final occupancy boundary.
- [x] Add request-time and executor-replay target-mode usage validation under the existing unit lock.
- [x] Strengthen unit usage changes for current mode, pending transition and active cross-domain state without changing approval ownership.
- [x] Add residential/office long-rent labels and picker facet/reason display required by this PR.
- [x] Add D9 read-only audit SQL and static/contract tests.
- [x] Run focused matrix, candidate/write consistency, version/concurrency, occupancy/contract and usage-change tests.
- [x] Run shared/API/Web lint, typecheck and build proportional to touched layers.
- [x] Use `trellis-check`; resolve review findings (maximum three review rounds).
- [ ] Commit, push only `codex/fix-lea-mode-usage-matrix`, open PR, wait for CI, merge through `gh pr merge`, verify main double-green.
- [ ] Record final commit/PR/CI and archive this child before starting LEA-003.

## Validation commands

- `pnpm --filter @jinhu/shared build`
- `pnpm --filter @jinhu/api test -- <focused specs>` (adjust to package runner syntax after reading package scripts)
- `pnpm --filter @jinhu/api build`
- `pnpm --filter @jinhu/web typecheck` or repository `pnpm typecheck` when no package script exists
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- PostgreSQL-backed focused specs only when their documented prerequisites are available; otherwise record the exact skip reason.

## Risky areas and rollback points

- Shared response-contract changes affect API and Web consumers; compile both after each contract slice.
- Property advisory-lock order and config CAS must remain unchanged; add policy checks inside the established transaction rather than acquiring new locks.
- Homestay historical dashboard summaries must not silently disappear; scope usage filtering to current availability unless tests establish intended historical semantics.
- No migration is expected. Stop and re-plan before introducing one.
- D9 SQL must remain SELECT/CTE-only and must never be executed against production by this task.

## Continuation point

Implementation and local checks are complete. Focused suite: 58/58. Full API unit suite: 1597 passed, 40 environment-gated PostgreSQL tests skipped, 0 failed. API/Web lint and typecheck plus shared/API/Web production builds passed. Independent review found four actionable gaps (office occupancy read/release, invalid inventory transition to none, dashboard policy drift, matrix-test exhaustiveness); all were fixed and rechecked. Next: inspect final diff, commit/push, open PR, run review/CI, merge and verify main double-green. PostgreSQL-backed mutation/concurrency gates remain for CI/disposable infrastructure; no production database was touched.
