# Implementation

## Checklist

- [x] Record #670/#672 facts and open follow-up Issue #678.
- [x] Create `codex/fix-lea-concurrency-678` from current `origin/main` and create this Trellis task.
- [x] Inspect renewal flow, idempotency interceptor, S-05 PG fixture, waiver approval, payment application, leasing conflict patterns, and API/operations specs.
- [x] Implement source-contract row serialization plus unfinished-renewal conflict check.
- [x] Add renew-draft idempotency interceptor and same-key replay regression.
- [x] Translate waiver/payment lock-time concurrency losers to descriptive HTTP 409; finish bounded leasing-domain consistency scan.
- [x] Upgrade S-05 PostgreSQL assertions and add focused unit/API coverage.
- [x] Run targeted formatting/lint/type/tests; then s3c/s3d/s3e and first-release-leasing gates where isolated prerequisites are available.
- [x] Run `trellis-check`; resolve verified P0/P1 findings, maximum three review rounds and maximum two automatic fixes per root cause.
- [ ] Commit, push only this branch, open PR, wait for CI/review, squash merge through `gh pr merge`.
- [ ] Wait for main CI and Deploy to be green, close #678, archive the Trellis task, and report evidence.

## Planned validation

- `pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/leasing-contracts/leasing-race-reproduction.pg.spec.ts`
- Focused API unit/controller/idempotency specs discovered during implementation.
- `node scripts/e2e/s3c-contract-smoke.mjs`
- `node scripts/e2e/s3d-payment-smoke.mjs`
- `node scripts/e2e/s3d-waiver-smoke.mjs`
- `node scripts/e2e/s3d-invoice-smoke.mjs` if the bounded scan changes invoice behavior.
- `node scripts/e2e/s3e-contract-lifecycle-smoke.mjs`
- `node scripts/e2e/first-release-leasing.mjs`
- `pnpm --filter @jinhu/api lint` / repository-supported targeted lint, `pnpm typecheck`, and `pnpm build` proportionate to changed surface.

## Risk and rollback points

- Row-lock order must remain source contract before unit locks to avoid introducing a lock inversion.
- Unfinished status set is intentionally draft/submitted/approving; pending-sign/signed/effective renewals are outside the approved “草稿/审批中” invariant and existing effective-renewal protection remains intact.
- 409 translation is restricted to authoritative lock-time stale-state/balance detection; malformed or intrinsically invalid requests remain 400.
- No migration is planned. If row serialization cannot cover every renewal creator, stop and reassess instead of adding an index automatically.

## Progress / evidence

- 2026-09-07: Issue #678 opened; branch and task created from `origin/main` at `dd919d28`.
- 2026-09-07: Planning selected no-migration parent-row serialization. Existing interceptor guarantees cached replay occurs before service conflict checks.
- 2026-09-07: Task-owned PostgreSQL 16 initialized through 306 migrations and 8 prerequisites. Final synchronized race run passed 2/2: renewal one success/one 409/one persisted; waiver one success/one 409 with unchanged `60.00/40.00/status 40` and exactly one approved waiver. Both conflict messages assert refresh/retry guidance.
- 2026-09-07: S3-E passed with same-key renewal replay returning the original 201/entity and a different-key follow-up returning 409. S3-D payment, waiver, and invoice smokes passed. `first-release-leasing.mjs` passed completely, including payment apply replay/conflict and financial soft-delete protections.
- 2026-09-07: S3-C attempted and was blocked by its existing cross-park fixture inserting a unit with source-park building/floor IDs; current `fk_biz_unit_building_scope` rejected it before the leasing contract assertions. No S3-C code was changed because that fixture drift is unrelated to this task.
- 2026-09-07: Leasing lock-path scan covered contracts, contract changes, checkouts, receivables, payments, waivers, and invoices. This change is limited to renewal uniqueness and payment/waiver authoritative lock-time stale balance/status conflicts; ordinary prevalidation remains 400.
- 2026-09-07: Workspace `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Build emitted only the repository's existing non-fatal Next.js ESLint-plugin warning.
- 2026-09-07: Single-agent review round 1 found payment receivable over-amount needed initial snapshot validation to preserve ordinary HTTP 400; fixed once and revalidated with full static gates plus S3-D payment. No remaining verified P0/P1 findings. API spec now records the executable concurrency/idempotency contract.
