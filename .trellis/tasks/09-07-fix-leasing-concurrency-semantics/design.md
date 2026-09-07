# Design

## Renewal serialization

`createRenewalDraft` keeps its existing read-only validation, then enters the existing transaction. Before inserting anything it loads the source contract by `(tenant_id, park_id, id, is_deleted=false)` with `pessimistic_write`. Under that row lock it revalidates effective status and queries for a non-deleted renewal whose `renewal_from_contract_id` is the source and whose status is draft/submitted/approving. An existing row raises `ConflictException` with retry guidance. Every creator of a renewal from the same source therefore queues on one stable row; after the winner commits, the loser sees its draft.

This is tenant/park scoped, requires no migration, and does not depend on generated contract codes or unit-lock ordering for uniqueness. The source contract lock is acquired before renewal unit locks, establishing a deterministic parent-before-units order.

## Idempotency boundary

Add `IdempotencyInterceptor` to `POST :id/renew-draft`. The interceptor decides replay before service execution: a completed same-key/same-fingerprint request returns the stored 2xx response and never reaches the new existence check. A different key executes the service and receives the business 409 after a winner exists. A simultaneous same-key request may receive the interceptor's existing “still processing” 409 and can retry the same key to obtain the cached result after completion.

## Financial conflict translation

Keep request validation as HTTP 400. Once an operation has entered a transaction and acquired the authoritative write lock, stale state/balance discovered there is a write conflict:

- waiver approval: pending status changed or remaining amount was consumed by a competing approval;
- payment application: payment became void/insufficient or receivable remaining amount was consumed after the request began.

These branches raise `ConflictException` with an explicit instruction to refresh current state and retry with a new valid request/idempotency key as appropriate. Equivalent leasing lock-time paths found by the bounded scan are changed only when they represent the same stale-writer condition.

## Tests and rollback

- Upgrade the real PostgreSQL barrier test rather than replacing it with mocked concurrency.
- Add narrow controller/interceptor or API regression coverage for renew-draft replay; reuse existing first-release idempotency conventions.
- Add focused service tests for translated financial branches if the PG fixture does not cover payment application.
- Rollback is source-only: revert the service/controller/test commit. No schema or data rollback is needed.
