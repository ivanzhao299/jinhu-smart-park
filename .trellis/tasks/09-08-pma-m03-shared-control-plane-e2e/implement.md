# Implement — M-03 shared control-plane E2E

## Checklist

- [x] Create Issue #698, branch, and Trellis task.
- [x] Load relevant scripts/API/testing specs and map current endpoint contracts.
- [x] Implement the standalone shared-control-plane suite with API-created run-scoped assets, unit, occupancies, approvals, and Parties.
- [x] Add aggregate gate selection/reporting, contract coverage, package/CI scope, and release docs.
- [x] Run syntax/contract/unit checks and the disposable real API gate.
- [x] Run `trellis-check` review, maximum three rounds and maximum two fixes per root cause.
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
- Round 2 (`trellis-check`): no P0/P1/P2 findings. Verified the aggregate mode-transition audit route, identity maker exclusion, terminal replay rejection, run-scoped fixture keys, gate/CI wiring, and disposable teardown.

## Validation evidence

- `node --check scripts/e2e/shared-control-plane-api-e2e.mjs`: pass.
- `pnpm test:e2e:property-api-gate-contract`: pass.
- `pnpm --filter @jinhu/api lint`: pass.
- `pnpm --filter @jinhu/api typecheck`: pass.
- 60 focused operations/identity/approval tests: pass.
- Fresh disposable PostgreSQL/API run `pma-m03-real-f-control-plane`: pass after 307/307 migrations, production seed replay, bootstrap/baseline, fixtures, API login verification, and full focused suite. Compose containers and both named volumes were removed by the EXIT trap.
- Contract calibration preserved the production contracts: maker identity claim rejects with `409 identity-actor-separation-required`; terminal decisions are hidden from replay with `404 property-resource-not-found`; rejected and executed mode transitions are queried through the aggregate `/property/mode-transitions` audit endpoint.

## Cost Summary

Task: M-03 implementation
Status: implementation, focused checks, disposable real API gate, and review round 2 passed; PR closure pending
Files changed: shared-control-plane suite, aggregate gate/contract, package command, CI scope, release docs, Trellis artifacts
Tests run: JS syntax; property API gate contract; API lint/typecheck; 60 focused operations/identity/approval tests; fresh disposable control-plane API E2E
Retries: 1 environment recipe correction; 2 mode-audit assertion fixes followed by a focused root-cause audit; 1 maker-separation status correction; 1 terminal-replay status/error correction
Approx model rounds: 10+
Repeated scans avoided: reused task artifacts and existing gate/isolation contracts; redirected repeated migration/seed logs after the first full run
Blocked issues: none
Next step: commit/push/PR, CI, squash merge, exact-SHA main verification, Issue close, archive
