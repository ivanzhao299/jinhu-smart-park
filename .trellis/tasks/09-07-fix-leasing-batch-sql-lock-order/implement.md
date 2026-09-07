# Implementation plan and progress

## Baseline

- Issue: #683
- Branch: `codex/fix-leasing-batch-sql-lock-order-683`
- Base: `origin/main` at `26a1e896`
- Retry count: 0
- Migration: not planned

## Ordered checklist

- [x] Create Issue, Trellis task, and branch in required order.
- [x] Inventory transactions, raw queries, row locks, batch loops, amount formulas, and audit writes.
- [x] Add bounded batch DTO contracts and focused DTO tests.
- [x] Batch/sort receivable locks and aggregates in payment and invoice paths; align waiver/invoice lock order.
- [x] Batch homestay finance allocation snapshot query.
- [x] Add integer-cent money conservation assertions and preserve per-row audit writes.
- [x] Add statement-count, audit completeness, and real PostgreSQL opposite-order lock tests.
- [x] Run targeted API unit/PG tests, typecheck/lint as affected; defer DB-backed S3C/first-release leasing to CI because no safe isolated runtime is configured locally.
- [x] Run `trellis-check`; remediate verified findings only, review rounds ≤3.
- [ ] Commit, push only the feature branch, open PR, await CI, squash merge via `gh pr merge`.
- [ ] Await exact merged main CI and Deploy success; close #683.
- [ ] Run finish-work/archive and record final Cost Summary.

## Lock-order inventory (baseline)

- contracts effective/unit link: contract → sorted property-unit advisory locks → unit rows (retain).
- checkouts effective: checkout+contract → unit links/units → future receivables ordered by period (retain unless exact inversion is proven).
- payments apply: payment → receivables in request order (change to sorted receivables → payment).
- invoices create: receivables in request order → new invoice (sort/batch receivables).
- invoices update/delete: invoice → receivables (change to sorted receivables → invoice with post-lock revalidation).
- waivers approve: waiver → receivable (change to receivable → waiver with post-lock revalidation).
- homestay finance mutation: booking → source advisory/source row → confirmed ledgers by ID → legacy rows by ID (retain).

## Validation plan

- Focused Jest: touched service/DTO specs with query-count and multi-row audit assertions.
- PostgreSQL: dedicated deterministic lock-order spec under `DATABASE_URL`.
- Regression: resolve and run the actual S3C entry, then `node scripts/e2e/first-release-leasing.mjs`.
- Package checks: `pnpm --filter @jinhu/api typecheck`, relevant lint/test commands; CI is final full-suite evidence.

## Rollback points

- Commit 1: bounded DTO/query/lock/money changes plus focused tests.
- Commit 2 only if needed: review-driven corrections or task evidence.
- No production operation, migration, schema, or fixture mutation in task one.

## Progress log

- 2026-09-07: Issue #683 created; task and branch created from latest `origin/main`.
- 2026-09-07: single-agent bounded inventory completed. Confirmed request-order locking and N+1 in payment/invoice, unbounded batch DTOs, invoice/waiver reverse order, and homestay per-source query. Existing contract/unit and homestay mutation lock order is deterministic and will be preserved.
- 2026-09-07: implementation batch 1 completed. Added max 50 DTO caps, shared sorted receivable batch lock, grouped invoice allocation sums, receivable-first payment/invoice/waiver ordering, one-query homestay legacy mappings, payment/generation cent conservation assertions, and executable statement/deadlock/audit tests.
- 2026-09-07: review round 1 found that a contract with an extreme period could still make generation specs unbounded. Added a 240-row per-contract ceiling and preloaded existing generated receivables once; retained per-contract partial-success behavior and guard-only batch semantics.
- 2026-09-07 validation: API typecheck PASS; touched-file ESLint PASS; focused non-DB tests 10 PASS. First root-level test command could not resolve API-local `ts-node/register`; corrected once by running through `pnpm --filter @jinhu/api exec`. PostgreSQL specs compile and are discovered, but 4 are SKIP because `DATABASE_URL` is unset. No project Docker/API process was available for safe reuse; no shared container was started.
- 2026-09-07 full unit gate attempt 1 under inherited `NODE_ENV=production`: three unrelated auth cookie expectations failed because production correctly sets `secure=true`; one changed homestay fixture mock lacked the new batch `sourceId` alias. Added the alias and focused homestay tests passed 7/7.
- 2026-09-07 full unit gate attempt 2 under `NODE_ENV=test`: all changed-domain tests passed; one unrelated `property-task.ownership.spec.ts` file-level runner failure occurred without assertion detail. Immediate focused run of that unchanged file passed 3/3. No property-task code was changed and no third full-suite retry was made under cost control.
- 2026-09-07 review round 2: removed obsolete single-receivable invoice sum helper; confirmed no migration/idempotency semantic change. API typecheck PASS, API build PASS, `git diff --check` PASS. Added the executable batch/lock contract to the API backend spec.
