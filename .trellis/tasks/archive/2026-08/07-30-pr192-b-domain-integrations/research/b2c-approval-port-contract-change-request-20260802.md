# B-2c Approval Port Contract Change Request

Date: 2026-08-02  
Status: BLOCKED / CONTRACT OWNER ACTION REQUIRED  
Requester lane: B-2c approval runtime correction lane A  
Requested owner: B-contract/shared-contract owner, followed by approval-runtime owner

## 1. Blocking finding

The current-only authorities do not define an executable contract for either
`PropertyApprovalCommandPort` or `PropertyApprovalProjectionPort`.

- `b2c-current-authority-locator-v1.md` freezes B-contract-v2 at
  `e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944` and the
  runtime effect authority at
  `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf`.
- `packages/shared/src/property-business/track-b-contracts.ts` contains
  `EntityManagerPort`, approval mutation DTOs, approval statuses and effect manifests,
  but contains neither requested approval port nor a command/projection payload for
  creating an approval request from a domain transaction.
- The B-domain design lists the two port names only. It explicitly requires a change
  request when port semantics are insufficient.
- Runtime freeze sections 4.4 and 4.5 freeze effect uniqueness and mutation-receipt
  invariants. They do not freeze the public port method names, input/output field sets,
  replay result, or projection lookup contract.
- The existing runtime exposes legacy `createDraft(...)` and `submit(...)` methods that
  each open their own transaction. Selecting a new combined method signature or return
  type would therefore create a new cross-domain contract without authority.

Production code and tests are intentionally unchanged until the items below are frozen.

## 2. Exact decisions required

### 2.1 Command port

Freeze all of the following as shared source, not prose-only guidance:

1. DI token name/value and exported interface name.
2. Exact method name and whether the single atomic operation creates a draft then
   activates it, or creates a persisted `pending_approval` request directly.
3. Exact caller-supplied transaction type. The current shared `EntityManagerPort`
   exposes only `transactionContext: unknown`; freeze whether the API runtime receives
   that wrapper, a generic callback interface, or a TypeORM-specific adapter owned only
   by the API package.
4. Complete command field set, including requester/submitter actor identity,
   `actionId`, source identity/version, client idempotency key, business intent key,
   canonical payload/schema version, and nullable amount/currency.
5. Whether submit owns a second mutation client key/receipt. If so, freeze how one
   domain request supplies both create and submit keys without inventing one.
6. Exact success/replay return projection, including whether it returns the original
   request when a completed duplicate is observed.
7. Exact fail-closed outcomes for:
   - same client key + different payload hash;
   - same client key + same payload hash;
   - same business intent + a different client key;
   - active duplicate source/version;
   - terminal business intent reuse;
   - concurrent unique violations;
   - missing policy or eligible approver;
   - caller manager absent or not transaction-bound.
8. Exact audit/receipt transition evidence required for the atomic operation, including
   whether `draft`, `submitted`, and `pending_approval` are all durably represented.

### 2.2 Projection port

Freeze all of the following:

1. DI token name/value and exported interface name.
2. Exact method set: request-by-id, request-by-source, current active request, or another
   closed set.
3. Whether each read accepts the caller's transaction context, and which reads must see
   the just-created pending request in the same transaction.
4. Complete projection field set and nullability. Do not expose the TypeORM entity as
   an implicit contract.
5. Duplicate ordering/cardinality if more than one terminal request exists for a source.
6. Authorization/scope behavior and exact not-found versus conflict behavior.

### 2.3 Legacy compatibility

Freeze whether public `PropertyApprovalService.createDraft(...)` and `submit(...)`:

- remain unchanged and delegate to new manager-aware internal primitives; or
- remain independent legacy entry points while the new command port uses those
  primitives directly.

The chosen rule must state that a caller-supplied manager is used as-is and that the
port implementation must not call `DataSource.transaction(...)` or otherwise open a
nested transaction.

## 3. Required handoff before implementation resumes

1. Updated shared B-contract source containing the exact interfaces, commands,
   projections and DI-token ownership decision.
2. New current B-contract/shared SHA and updated current-authority locator; the
   superseded SHAs must remain explicitly rejected.
3. Targeted contract goldens for exact field names, nullability, duplicate/replay/error
   semantics and transaction-context behavior.
4. Approval-runtime implementation authorization limited to
   `apps/api/src/modules/property-approvals/**`.
5. `open_P0_P1=[]` from an independent contract review.

Until that handoff exists, B-2c approval adapters remain fail closed and must not infer
the missing API from the current TypeORM service implementation.
