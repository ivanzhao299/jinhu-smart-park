# Implementation Progress

## Scope

- [x] Locate the exact S3C cross-park fixture drift.
- [x] Audit related `s3*` and `first-release*` fixtures for the same pattern.
- [x] Implement the smallest fixture correction.
- [x] Run focused checks and the full S3C regression.
- [ ] Review, CI, squash merge, main CI/deploy, close issue, and archive.

## Evidence

- Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/689
- Branch: `codex/fix-s3c-cross-park-fixture-689`
- Root cause: `createCrossParkUnit(buildingId, floorId)` wrote `biz_unit.park_id='29999999'` while reusing the source park's building/floor IDs. Migration `000211_asset_location_scope_integrity.sql` now correctly rejects that invalid hierarchy before the intended cross-park contract assertion.
- Fix: create a unique target `biz_park`, target `biz_building`, target `biz_floor`, and target `biz_unit` in one transaction; append a non-default `rel_user_park` row for the bootstrap admin; assert `sys_user.park_id` remains unchanged.
- Sibling audit: read-only scan of `scripts/e2e/{s3*,first-release*}.mjs` found no other confirmed source/target hierarchy reuse. `first-release-context-switch.mjs`, `s3e-contract-lifecycle-smoke.mjs`, and `first-release-leasing.mjs` already chain target-scoped building/floor/unit IDs correctly. S3B/S3C user setup writes only newly created smoke users' default access and does not alter bootstrap admin ownership.
- Static checks: `node --check scripts/e2e/s3c-contract-smoke.mjs` passed; `git diff --check` passed; repository `pnpm lint` passed.
- Full S3C: isolated PostgreSQL 16 database, all 306 migrations plus 8 prerequisites passed, production and explicit local dev seeds passed, then `pnpm test:e2e:s3c-contract` passed through `S3-C-A contract smoke passed`.
- Final-version database assertion after S3C: unit/building/floor park IDs were identical (`s3c-cross-1788781607287`), appended admin access was `is_default=false`, and admin primary park remained `20000001`.
- Review cycle 1: added an in-script join assertion proving the target unit, floor, and building share tenant/park scope; the final version then passed a fresh full S3C run.
- Invalid check recorded: direct `pnpm exec eslint scripts/e2e/s3c-contract-smoke.mjs` reports 23 baseline `no-undef` errors because the standalone command lacks Node/Web globals for E2E `.mjs`; the configured repository lint is green.
- Environment note: the pre-existing default Docker volume has a polluted `000204` migration-history mismatch, so that fail-fast chain was abandoned without seed/test. Validation used a new task-scoped volume. The ephemeral task database/container/volume were removed after evidence capture; their synthetic test data is intentionally unrecoverable. The previously stopped default postgres container was returned to stopped state.

## Cost Summary

- Mode: cost-controlled, single implementation agent.
- Context: targeted script inspection; one read-only scout only for the required broad sibling-fixture audit.
- Retries: one S3C startup attempt failed before tests because required API secrets were absent. After repeated missing-variable diagnostics entered `COST_GUARD`, one complete `getOrThrow` audit supplied the full local-only API environment; the next S3C run passed. No product-code retry occurred.
