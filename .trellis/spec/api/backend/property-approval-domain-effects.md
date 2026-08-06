# Property Approval Domain Effects

## 1. Scope / Trigger

Apply this contract to submission and execution of homestay cancellation/refund/waiver
and housing checkout, financial handover, purchase lifecycle, or purchase transfer
approvals. These actions cross approval runtime, owning aggregates, occupancies,
credentials, ledgers, and receivables; partial effects are P0.

## 2. Signatures

Frozen action IDs come from `@jinhu/shared` Track B contracts and end in `.request`.
Owning commands receive the approved request ID, execution idempotency key, canonical
payload, expected aggregate versions, and actual approving decision actor.

Relevant database contributors include:

- homestay booking, optional occupancy, sorted issued credentials, sorted confirmed
  homestay ledger entries, immutable legacy finance mappings;
- housing lease, pre-created draft handover, sorted confirmed housing ledger entries,
  target receivable, purchase, and sorted purchase items.

## 3. Contracts

- Submission freezes PostgreSQL `transaction_timestamp()`; business dates derived from
  it use `Asia/Shanghai`.
- Homestay cancellation lock order is booking → occupancy → sorted credentials → sorted
  confirmed ledger. The payload freezes every row ID/version/before/after value and the
  recomputed cancellation fee/waiver. Execution locks in the same order, rejects drift,
  and commits booking cancellation, credential void, occupancy release, ledger effects,
  action receipt, audit, and outbox as one transaction.
- Refund/waiver availability is `source amount - (direct allocations ∪ immutable
  legacy-mapped allocations)`. The locked union is unique and disjoint. Any unresolved
  historical refund/waiver blocks new approval; code must not infer its source.
- Historical housing money is CNY. Migration backfill covers lease, purchase, charge
  plan, receivable, ledger, and handover before making currency non-null.
- Housing checkout pre-creates one draft handover before submission. The frozen payload
  includes handover ID/version, lease ID/version/status, amount fields, evidence/meter/
  credential/item hashes, DB Shanghai business date, sorted ledger contributors and
  deposit balance.
- Checkout freezes receivable mode `existing`, `new`, or `none`. `existing` freezes the
  current row/version/amount/settlement; `new` freezes only a reserved ID and complete
  insert fields after advisory-lock absence verification. Execution cannot switch mode.
- Purchase transfer freezes one aggregate target receivable. It locks purchase → lease
  → sorted items → target receivable, performs one CAS/audit per item, and applies one
  aggregate insert or versioned increment after item CAS succeeds.
- A paid purchase cannot be voided. A refunded purchase remains
  `approval_status=approved`, `payment_status=refunded` and also cannot be voided.
- Approval execution audit uses the actual approving decision actor, not requester,
  submitter, worker, or a fixed system identity.

## 4. Validation & Error Matrix

| Condition | Required result |
|---|---|
| Cancellation contributor version/status/amount drifts | HTTP 409; no domain effect |
| Cancellation fails after one attempted effect | Full transaction rollback |
| Issued credential appears after submission | Execution conflict; no released occupancy |
| Legacy finance row has no trusted source mapping | Block new approval for that order |
| Direct and mapped allocation overlap or exceed source | HTTP 409 |
| Draft handover/version/hash or ledger balance drifts | HTTP 409 |
| Checkout receivable mode changes between submit and execute | HTTP 409 |
| New checkout/transfer target appears before execution | HTTP 409; do not reuse it |
| Purchase item expected version is stale | Roll back every item/receivable effect |
| Void targets paid or refunded purchase | HTTP 409 |

## 5. Good / Base / Bad Cases

- Good: approval submits at T1, policy time changes at T2, execution still applies the
  fee frozen from the T1 database timestamp and contributor snapshot.
- Good: a new transfer target is absent at submission, is represented by a reserved ID,
  and is inserted only after every purchase-item CAS succeeds at execution.
- Base: checkout with no financial settlement freezes `receivableMode=none` and still
  revalidates the draft handover and lease.
- Bad: reading current ledger totals at execution without comparing the submitted
  contributor IDs/versions.
- Bad: pre-creating a new receivable during approval submission or guessing which
  historical refund a legacy row belongs to.

## 6. Tests Required

- Unit: each submission payload contains the exact DB timestamp, contributor IDs,
  versions, amounts, currency, hashes, and receivable mode.
- Unit: execution accepts the frozen nearest-valid state and rejects one-field drift
  for each contributor class.
- Unit: direct plus mapped legacy allocation union prevents over-allocation and an
  unresolved row blocks approval creation.
- Unit: paid/refunded void rejects and refund preserves approved/refunded.
- PostgreSQL integration: assert actual TypeORM `UPDATE ... RETURNING` shape, successful
  multi-effect commit, injected mid-effect rollback, and direct+mapped over-allocation.
- PostgreSQL concurrency: race credential issuance/cancellation, new target creation,
  and per-item CAS; exactly one valid outcome commits.

## 7. Wrong vs Correct

### Wrong

```ts
const currentFee = calculateCancellationFee(new Date(), await loadCurrentLedger(id));
await bookingRepository.update(id, { status: "cancelled" });
await occupancyService.release(occupancyId);
```

### Correct

```ts
await manager.transaction(async (tx) => {
  const frozen = await lockAndValidateCancellationSnapshot(tx, approvedPayload);
  await applyCancellationEffects(tx, frozen, executionIdempotencyKey);
  await recordApprovalEffectReceipt(tx, frozen);
});
```
