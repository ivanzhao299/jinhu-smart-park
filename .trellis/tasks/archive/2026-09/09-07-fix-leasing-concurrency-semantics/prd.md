# Fix leasing concurrency semantics

## Goal

Close GitHub Issue #678, following the PostgreSQL facts recorded by #670/#672: enforce one unfinished renewal per source contract and report leasing financial race losers as HTTP 409 without weakening auditability or idempotent replay.

## Confirmed facts

- The synchronized PostgreSQL S-05 fixture currently observes renewal as `2 fulfilled / 0 rejected / 2 persisted`.
- The waiver/write-off race preserves money but the loser is HTTP 400.
- `POST /leasing/contracts/:id/renew-draft` currently lacks `IdempotencyInterceptor` and performs no source-contract serialization or unfinished-renewal check.
- Payment application already uses `IdempotencyInterceptor`; locked balance failures are still expressed as HTTP 400.

## Requirements

- For one source contract, a renewal request may create a draft only when no non-deleted renewal in draft/submitted/approving status exists. Concurrent different-key requests are first-writer-wins; the loser receives HTTP 409.
- Serialize renewal creation by locking the scoped source contract inside the creation transaction, then run the unfinished-renewal existence check through that transaction manager. Prefer this no-migration implementation.
- Attach true idempotency replay semantics to renew-draft. A completed same-key/same-payload replay returns the cached original 2xx body; a different key after the first draft commits receives the business 409. The existing in-flight same-key behavior may remain 409 processing.
- Waiver approval and payment application failures discovered after their write locks because another writer consumed the pending status or available amount return HTTP 409 with a conflict explanation and retry guidance. Invalid request shape, ownership, non-positive amount, and ordinary non-race preconditions remain HTTP 400.
- Scan leasing services for equivalent lock-then-stale-state/balance paths and keep conflict translation consistent where the failure can be caused by a competing committed writer; do not broadly relabel all domain validation.
- Preserve transactionality, status/action logs, field policies, soft-delete rules, and financial audit records.
- Update the S-05 PostgreSQL fixture to assert renewal 1 success + 1 HTTP 409 + exactly one persisted renewal, and waiver 1 success + 1 HTTP 409.
- Add a positive HTTP-level renew-draft same-key replay assertion returning the original 2xx result.
- Keep progress and exact evidence current in `implement.md`.

## Acceptance Criteria

- [ ] Synchronized renewal race: one fulfilled, one rejected with 409, one non-deleted unfinished renewal persisted.
- [ ] Synchronized waiver race: one fulfilled, one rejected with 409, receivable totals/status and exactly-one approval remain correct.
- [ ] Payment apply lock-time balance/status races use 409 with retry guidance, with focused coverage.
- [ ] Same renew-draft idempotency key and payload replay the original 2xx response and entity identity.
- [ ] Different keys cannot create two unfinished renewals for the same source contract.
- [ ] Relevant focused tests plus s3c, s3d payment/waiver/invoice as applicable, s3e, and first-release-leasing pass in isolated/local test infrastructure, or any environmental skip is reported honestly.
- [ ] Review has at most three rounds; CI and main CI+Deploy are green before Issue #678 is closed and the Trellis task is archived.

## Out of scope

- Database migrations or indexes unless the no-migration lock design is disproven.
- Changes to HR, production data, production services, shared containers, or browser sessions.
- Broad status-code rewrites unrelated to concurrency.
