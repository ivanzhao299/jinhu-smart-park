# Implement — M-03 shared control-plane E2E

## Checklist

- [x] Create Issue #698, branch, and Trellis task.
- [x] Load relevant scripts/API/testing specs and map current endpoint contracts.
- [x] Implement the standalone shared-control-plane suite with API-created run-scoped assets, unit, occupancies, approvals, and Parties.
- [x] Add aggregate gate selection/reporting, contract coverage, package/CI scope, and release docs.
- [ ] Run syntax/contract/unit checks and the disposable real API gate.
- [ ] Run `trellis-check` review, maximum three rounds and maximum two fixes per root cause.
- [ ] Commit/push/PR, wait for CI, squash merge.
- [ ] Verify exact-SHA main CI and Deploy, close Issue, archive task.

## Validation plan

- `node --check scripts/e2e/<suite>.mjs`
- `pnpm test:e2e:property-api-gate-contract`
- focused API/runtime tests selected after endpoint mapping
- `pnpm --filter @jinhu/api lint`
- `pnpm --filter @jinhu/api typecheck`
- disposable `pnpm test:e2e:property-api -- --suite control-plane` or calibrated package command
- `git diff --check`

## Review log

- Round 1 (`trellis-check`): no code/spec violation found. Confirmed direct HTTP coverage, run-scoped fixture keys, maker/checker rejection, approval reject/execute paths, bounded requests, aggregate reporting, Release Smoke scope trigger, and workflow-owned volume cleanup. Disposable real API execution remains the PR CI evidence gate.
- Round 1 (PR Codex): 1 valid P1. The maker approval negative path used a fabricated stage and would return an earlier 409 instead of exercising maker-checker 403. Fixed by loading the real pending stage and current request/stage versions; contract now rejects fabricated stage IDs.

## Cost Summary

Task: M-03 implementation
Status: suite and gate wiring implemented; local quality checks in progress
Files changed: shared-control-plane suite, aggregate gate/contract, package command, CI scope, release docs, Trellis artifacts
Tests run: JS syntax; property API gate contract; 41 focused operations/identity/approval tests
Retries: 1 contract-loop calibration (removed an unrelated housing/homestay-only assertion from the new suite)
Approx model rounds: 4
Repeated scans avoided: reused prior gate/isolation decisions from `trellis mem`
Blocked issues: none
Next step: API lint/typecheck, review, then PR CI disposable E2E
