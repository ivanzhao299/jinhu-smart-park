# Implement: IDY-F01

## Resume Point

- Phase: implementation complete; next action is full quality check and PR review.
- Branch: `codex/fix-idy-01-encryption-key` from `origin/main@37647cc9`.
- Issue: #509 (parent queue); F01 PR not yet created.
- Keyring/fail-closed, Party metadata, tenant-scoped rotation, required audit, CLI, tests and docs are implemented.

## Checklist

- [x] Activate F01 task and load before-dev specs.
- [x] Implement canonical keyring parser/validator and remove all fallback reads.
- [x] Add metadata-aware encrypt/decrypt for Party, draft and snapshot.
- [x] Add forward-only Party key-id/rotation receipt migration with tenant/park guards.
- [x] Add tenant-scoped idempotent rotation command/service and required audit.
- [x] Add fail-closed, dual-read, rotation, no-leak and migration tests.
- [x] Sync env examples, deployment/architecture docs and production config contract.
- [x] Run focused tests, API lint/typecheck/build, migration contract/property regression.
- [x] Run `trellis-check`; fix findings; record validation below.
- [ ] Commit, push only F01 branch, open PR, review <=3, CI, merge, verify main dual green.
- [ ] Archive F01 and update parent task before starting F02/F03.

## Validation Plan

- `pnpm --filter @jinhu/api test:unit`
- `pnpm --filter @jinhu/api lint`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/api build`
- `node scripts/e2e/migration-prerequisite-contract.mjs`
- relevant property identity/PG migration tests discovered during implementation
- `sh -n scripts/ensure-production-secrets.sh scripts/prod-healthcheck.sh scripts/check-init-baseline.sh`

## Risk / Rollback Gates

- Never remove v1 key until DB inventory proves zero references and a delayed operational gate approves removal.
- Any unknown key id/unreadable ciphertext blocks that tenant scope; do not overwrite it.
- Migration failure stops deploy before seed/bootstrap/smoke.
- Rotation audit failure rolls back the scope transaction.

## Validation Evidence

- API typecheck/lint/build: pass after final review fixes.
- Full API unit: 1664 total; 1623 pass, 41 explicit PostgreSQL/mutation-gate skips, 0 fail.
- Focused rotation/schema/keyring final gate: 27/27 pass.
- Migration prerequisite contract and shell syntax: pass.
- Disposable PostgreSQL 16 twice: migration apply + replay pass; v1 metadata backfill, three key-id guards, receipt table pass; task-owned containers removed.
- Independent read-only review: five confirmed findings fixed (draft inventory, test startup fail-closed, DB key-id guards, duplicate JSON keys, from-key audit/docs).
