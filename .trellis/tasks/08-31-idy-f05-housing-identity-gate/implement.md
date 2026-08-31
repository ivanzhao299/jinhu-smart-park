# Implement: IDY-F05 Housing Identity Gate

## Status

- Branch: `codex/fix-idy-05-housing-identity-gate` from `origin/main@42ab2d7d`.
- Issue: #518; parent queue: #509.
- Implementation complete locally; quality gates in progress.

## Checklist

- [x] Refactor canonical identity verifier to accept an internal exact consent purpose while preserving the existing homestay method.
- [x] Add shared/adapter `verifyForHousingMoveIn` fixed to `housing_move_in`.
- [x] Inject verifier into housing handover command wiring without changing create/sign/activate APIs.
- [x] In move-in transaction, load scoped main tenant plus all non-deleted occupants, dedupe/sort, verify before handover persistence.
- [x] Add verifier purpose/consent/version/file fail-closed tests.
- [x] Add housing zero/one/multiple occupant set coverage and rejected-gate no-persistence assertion.
- [x] Add explicit create/sign/activate non-blocking and move-out non-regression contract coverage.
- [x] Extend housing API E2E with valid identity/consent fixture and negative/positive move-in cases.
- [x] Update identity consent/release documentation for F05 semantics.
- [x] Run focused build/lint/typecheck/unit and E2E contract, then Trellis full check.
- [ ] Commit, push, PR `Closes #518`, hosted review ≤3, CI/Release Smoke, squash merge, main CI+Deploy.
- [ ] Record final evidence, archive task, fast-forward RBAC main, delete branches, prune.

## Validation Commands

- `pnpm --filter @jinhu/shared build`
- `pnpm --filter @jinhu/api lint`
- `pnpm --filter @jinhu/api typecheck`
- focused Jest tests for property identity and housing handover
- PostgreSQL-backed housing identity move-in test with exact temporary database cleanup
- `node scripts/e2e/housing-rental-api-e2e.mjs` when its disposable API environment is available
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before PR when practical

## Risk / Rollback Points

- Do not broaden consent purpose matching; exact `housing_move_in` is mandatory.
- Do not query only occupant rows and omit the main tenant.
- Do not persist draft/completed handover before verification succeeds.
- Do not place the gate in create, sign or activate.
- Preserve F02/F03 unrelated dirty `implement.md`; do not include it in commits.

## Local Evidence (2026-09-01)

- `pnpm --filter @jinhu/shared build`: PASS.
- `pnpm --filter @jinhu/api lint`: PASS.
- `pnpm --filter @jinhu/api typecheck`: PASS.
- Focused property-identity/housing Node tests: PASS, 40/40.
- `node --test scripts/e2e/property-api-e2e-gate.contract.mjs`: PASS.
- Workspace `pnpm lint && pnpm typecheck && pnpm build`: PASS.
- Workspace `pnpm test`: unit/contract phase passed; legacy S1 integration smoke could not self-start its API in the current local environment, both without and with the non-secret test encryption key. The disposable PostgreSQL/API property E2E remains delegated to PR Release Smoke; no production/shared environment was touched.
- Independent read-only quality audit confirmed move-in-only placement, exact consent purpose, full scoped party set, transaction ordering, and Nest wiring. It identified missing no-persistence and aggregate E2E contract assertions; both were added before this evidence was recorded.
