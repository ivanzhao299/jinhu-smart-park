# Implement: IDY-F01

## Resume Point

- Phase: PR review round 2 findings repaired and locally verified; next action is commit/push, final review round 3, CI, merge.
- Branch: `codex/fix-idy-01-encryption-key` from `origin/main@37647cc9`.
- Issue: #509 (parent queue); PR: #510.
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
- PR CI round 1: main build gate passed; Release Smoke exposed that the pre-existing identity CAS functions did not write/clear the new Party key-id atomically. No merge occurred.
- Review repair: migration now fail-closed patches both reviewed CAS definitions before enabling the Party metadata guard; definition drift aborts migration.
- Focused identity/schema tests after repair: 33/33 pass.
- Disposable PostgreSQL 16 failed-migration retry rehearsal: first syntax defect stopped at 000286 with 000285 last-successful; corrected checksum retried safely, both history stores recorded one succeeded row, patched write/clear definitions and validated guard all confirmed; task-owned container and volume removed.
- PR CI after CAS repair: build, migration, property API E2E and Release Smoke all passed; smoke duration 21m53s.
- Review round 2 exposed ten threads. CAS was already fixed; remaining findings were repaired without changing HR files: unversioned same-domain keyring reads, strict envelope parsing, production keyring forwarding, 64-char receipt scope, active/soft-deleted/current-draft inventory, real scoped CLI actor, and minimal CLI module without MQTT/schedulers.
- Focused review-fix tests: 31/31 pass. API lint/typecheck/build: pass.
- Fresh disposable PostgreSQL 16: 277/277 migrations and replay pass; CAS definitions patched, receipt scope columns are 64, Party guard validated and snapshot/draft NOT VALID guards installed; task-owned container/network/volume removed.
- Full API unit on CI-aligned Node 22.23.2: 1668 total; 1627 pass, 41 explicit PostgreSQL skips, 0 fail. Two prior Node 24 runs were not accepted as evidence: one unrelated isolated test-process failure and one V8 native fatal; the originally named files passed in isolation.
- Scope/secret check: no HR file changed, `git diff --check` pass, diff secret-pattern scan pass.
