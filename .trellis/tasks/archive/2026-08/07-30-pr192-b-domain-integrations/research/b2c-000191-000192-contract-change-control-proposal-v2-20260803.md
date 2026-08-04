# 000191/000192 Contract Change-Control Proposal v2

Status: **DECISION-READY DRAFT / NOT APPROVED / NO RESERVATION / NO IMPLEMENTATION AUTHORITY**

Date: 2026-08-03

This v2 supersedes the proposal draft with SHA-256
`8709056ad1d24efe79969220f89df646ef3c2a7f8dbdaf7bb9c09c0b6e2bda04`
for review purposes only. It resolves the independent technical-review findings by
separating mandatory technical invariants from six business/data decisions. It does
not modify an immutable authority, authorize a migration or backfill, or claim that a
human decision has been made.

## 1. Verified baseline

| Input | SHA-256 / verified fact |
| --- | --- |
| Parent `research/b0-runtime-contract-freeze.md` | `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf` |
| Parent `research/b0-product-access-freeze.md` | `d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040` |
| Parent `research/b0-contract-freeze-current.md` | `671ebcc86c9c49a6f6f9dbf2818ee1646c3a814a4b3d3329cfa09bbb6f705f10` |
| Homestay service / entities | `4b24b429529c25825475a135ee6dd34dca906929639426bda7f7a99b530eca87` / `2c71c6927b55a2ad3964124fe5283dc5d196c0fbf18f219c81410dd48a8528e8` |
| Housing service / entities | `4b820f773167100dbfa909fb0ac1071f6bbc9c2673e253fe8a413668f53ded85` / `73089424d8dffd8d9af51f57ae5b6af58739f301ac3cfac91cd93210976d2a97` |
| Property operation-config entity | `0aebe2061d7e08414a4a1d418f91057ec13014daef9b8faa62bcc507bf3c3e70` |
| Migrations 000176 / 000177 / 000178 | `a32491d5f70839d7fddf7811292f5935a6f119d47c3dffa81b87d2c0ad6e92c6` / `71f4f1ebd4d2238b92f11a1c876f819814668c61b5c25e524a281ec956f953e5` / `245312a92244394ae72324e409c199b3e68aa3343927fb41b9fc799c8853c066` |
| Independent technical review | `b2c-000191-000192-independent-technical-review-20260803.md` |

Current implementation facts that the superseding authority must represent:

- confirmed-booking cancellation atomically voids issued credentials, releases its
  occupancy, waives the remaining confirmed room charge, may add a cancellation-fee
  charge, updates the booking, and writes an action log;
- cancellation fee currently depends on wall-clock evaluation time;
- homestay ledger rows have no receivable identity, source link, or currency;
- `biz_property_operation_config` owns `operating_mode`, `operating_status`, and
  optimistic `version`;
- a financial move-out call may create a draft handover only while completing it and
  creates a checkout receivable at execution time;
- purchase transfer locks purchase items, creates or accumulates one target receivable,
  and writes `transferred_receivable_id` on every selected item;
- every housing purchase item already inherits an optimistic `version` from
  `AuditableEntity`.

## 2. Mandatory technical invariants

These requirements do not depend on a product choice and apply to every accepted
decision branch:

1. Existing frozen files and evidence remain byte-identical. A new authority revision,
   promotion handoff, and current-only locator must supersede them.
2. Canonical migration filenames are
   `000191_property_b_homestay_effect_schema.sql` and
   `000192_property_b_housing_effect_schema.sql`. Filename approval is not reservation.
3. Submission and execution use the same ordered row-lock set. Every mutable input is
   frozen by row ID plus expected version or by an immutable-field hash.
4. Execution never uses current wall-clock time to change a submitted amount, effect
   membership, line key, target owner, or currency.
5. Each CAS or insert has an exact affected-row/cardinality assertion. A domain owning
   unique is required in addition to the runtime receipt unique.
6. Approval-driven domain mutations, domain audit, effect receipts, approval terminal
   state, approval audit, and outbox commit in one PostgreSQL transaction.
7. Legacy rows may remain under an explicit legacy-null exception, but every new
   approval-driven row must have complete non-null approval execution and line keys.
8. All references use tenant+park composite candidate keys and composite FKs; a global
   UUID-only FK is insufficient.
9. Monetary values remain `numeric(18,2)`/decimal strings. No value passes through a
   JavaScript `number`; every line and aggregate names one ISO-style currency.
10. Preflight fails loudly on incompatible or unclassified legacy data. It must not
    silently infer source links, currency, approval keys, or target owners.

### 2.1 Exact lock order and absent-row serialization

Every submission and execution transaction acquires locks in this global class order;
it may skip unused classes but may never acquire an earlier class after a later one:

```text
01 unit
02 booking
03 occupancy
04 homestay credential (UUID byte order)
05 homestay ledger source/result (UUID byte order)
06 purchase
07 lease
08 handover
09 purchase item (UUID byte order)
10 housing receivable
11 housing ledger source/result (UUID byte order)
```

Rows within one class are locked by ascending UUID byte order. Before looking up a row
that may not yet exist under a business unique, the transaction first takes
`pg_advisory_xact_lock(hashtextextended(canonical_key, 0))`; collisions may serialize
unrelated work but cannot weaken correctness. Canonical keys are UTF-8 strings:

```text
property-config|tenant|park|unitId
homestay-finance-source|tenant|park|bookingId|sourceLedgerEntryId
housing-handover|tenant|park|leaseId|move_out
housing-receivable|tenant|park|leaseId|sourceType|sourceId|chargeType|periodStart|periodEnd
```

The transaction then re-queries under row lock. Unique-conflict recovery may reload
only the exact canonical-key winner and must reject a different ID, scope, currency,
payload hash, or expected version. Submission freezes the resulting ID/version or the
verified absence plus reserved ID; execution repeats the same advisory and row locks.

Action-specific lock sets are fixed as follows:

- cancellation: booking -> optional occupancy -> issued credentials -> confirmed
  ledger contributors;
- homestay finance: booking -> source/result ledger rows;
- property-mode submission: unit -> operation config, using the property-config
  advisory lock before the lookup/insert;
- financial handover: lease -> handover -> checkout receivable -> housing ledger;
- lease checkout: non-authoritative lease pointer read -> optional occupancy -> lease ->
  completed move-out handover -> housing receivables -> housing ledger; after the lease
  lock, its occupancy pointer must equal the pre-read pointer or execution rejects drift;
- purchase transfer: purchase -> target lease -> purchase items -> target receivable.

## 3. Closed human decisions

Each decision has a recommended branch. An accountable decision must accept one branch
per ID or provide a replacement with equivalent identity, concurrency, cardinality,
currency, and legacy-data rules.

### DEC-01 — Cancellation evaluation and subordinate effects

**Branch A — preserve current atomic cancellation (recommended).**

- Freeze PostgreSQL `transaction_timestamp()` as `cancellationEvaluationAt` at request
  submission.
- One `homestay.booking.cancel` compound effect owns booking CAS + action log and
  freezes the optional occupancy row and the exact sorted set of issued credential
  rows. Each subordinate row carries its ID, expected version, before status, and
  required after status.
- Freeze the sorted confirmed-ledger source snapshot used to calculate the room waiver
  and cancellation fee. Recompute from that snapshot and `cancellationEvaluationAt`;
  any set/version/amount drift rejects execution.
- Keep optional positive waiver and cancellation-fee lines as separate financial
  effects. Add `homestay.ledger.charge` to the allowed effect kinds.
- Hash the occupancy/credential/ledger row identities and before/after versions into
  the booking action log and compound effect receipt.

The exact compound cardinality is booking CAS = 1, booking action log = 1, occupancy
CAS = the frozen 0-or-1 value, and credential CAS count = the frozen issued-credential
array length. Every subordinate update predicates on scope, ID, expected version,
before status, and `is_deleted=false`, and each expected row must affect exactly one
row. Execution also asserts that no additional issued credential exists for the
booking. Occupancy and credential rows do not create separate runtime effect receipts:
their ordered before/after identities are contributors to the one
`homestay.booking.cancel` compound receipt and the uniquely owned booking action-log
snapshot. The authority must explicitly allow this compound-effect ownership; a
generic mutation receipt is not its audit owner.

**Branch B — split subordinate effects from cancellation.** This requires a new product
workflow for occupancy/credential/finance follow-up, new partial-state recovery rules,
and a separate authority proposal. It is not implementation-ready in this v2.

Required signers: product owner, homestay domain owner, finance owner.

### DEC-02 — Legacy homestay refund/waiver source allocation

**Branch A — quarantine unresolved legacy finance (recommended).**

- Replace `sourceReceivableId` with `sourceLedgerEntryId`; no compatibility alias.
- New refunds reference a confirmed payment source; new waivers reference a confirmed
  charge source. Freeze source ID, source version, booking, amount, currency, and
  remaining available balance.
- Add ledger currency and nullable `source_ledger_entry_id`, with tenant+park composite
  self-FK prerequisites and a cycle/self-reference prohibition.
- Every refund/waiver path locks its source row before summing confirmed linked rows.
  The new total may not exceed the source amount.
- Every legacy ledger row receives currency by joining its same-scope booking and
  copying `booking.currency`. Preflight rejects orphan/cross-scope bookings, null or
  invalid booking currency, and any row whose lifecycle cannot have one booking
  currency. After validation, ledger currency is non-null for legacy and new rows.
- Existing unlinked refund/waiver rows remain byte-for-byte immutable legacy history.
  Reconciliation never updates their `source_ledger_entry_id`; it inserts an immutable
  row into the mapping table defined below. If any legacy result for a booking lacks a
  valid mapping, new approval finance for that booking fails with
  `legacy-finance-source-unresolved`.

**Branch B — supply an audited legacy mapping.** The data owner provides a complete
row-to-source mapping for every legacy refund/waiver before promotion. The mapping is
loaded into the same immutable mapping owner. Validation checks scope, booking,
currency, source/result type, amount, acyclicity, and aggregate source balance; any
unmapped or overallocated row aborts the batch.

Both branches use this exact owner:

```text
biz_homestay_legacy_finance_source_map
  id uuid primary key
  tenant_id varchar(64) not null
  park_id varchar(64) not null
  result_ledger_entry_id uuid not null
  source_ledger_entry_id uuid not null
  source_expected_version integer not null check (> 0)
  currency varchar(8) not null
  mapped_by uuid not null
  mapped_at timestamptz not null
  reason varchar(500) not null check (btrim(reason) <> '')
  evidence_hash char(64) not null
```

It has composite candidate keys/FKs to both ledger rows, unique
`(tenant_id,park_id,result_ledger_entry_id)`, `result <> source`, same-booking and
eligible source/result-type enforcement, currency equality, and append-only
UPDATE/DELETE rejection. A wrong mapping is not silently corrected; it requires a new
explicit forward change-control procedure. New approval-driven ledger rows use the
direct source column and may never use this legacy mapping table as a write shortcut.

Available balance is computed under the locked source row as one exact union. Let
`direct_results` be active, confirmed, non-deleted refund/waiver rows whose direct
`source_ledger_entry_id` equals the source. Let `mapped_legacy_results` be active,
confirmed, non-deleted legacy refund/waiver rows joined through the immutable mapping
where the mapping source equals the same source. The sets must be disjoint and every
result ID unique. Then:

```text
allocated = sum(direct_results.amount) + sum(mapped_legacy_results.amount)
remaining = source.amount - allocated
requested amount <= remaining
```

The transaction locks all rows from both sets in UUID order after the source lock.
Every refund/waiver writer, including non-approval maintenance paths, must take the
same source lock and use this union; no direct-FK-only balance query is permitted.
Void/deleted/unconfirmed results contribute zero. A negative pre-existing remaining
balance is a migration/preflight failure, not a value that execution may clamp.

Required signers: product owner, homestay finance owner, data owner.

### DEC-03 — Legacy housing currency

**Branch A — ratify CNY (recommended only if factually true).** The product, finance,
and data owners explicitly attest that every legacy housing monetary row is CNY. The
new authority permits the otherwise non-expand-only backfill, and 000192 must:

- preflight every relevant owner and child table;
- add owner currency to lease and purchase, copied currency to charge plans,
  receivables, ledger, handovers, and purchase-transfer audit;
- backfill `CNY`, validate, then enforce non-null/check/composite consistency;
- reject any child/source currency mismatch before constraints are validated.

For either branch, preflight also rejects every orphan or cross-scope owner/child/source
reference before backfill, including lease-to-charge-plan/receivable/ledger/handover,
purchase-to-item, transfer-to-lease/receivable, and ledger-to-receivable links. The
validated result must prove one currency per complete lease or purchase lifecycle, not
merely non-null currency columns.

**Branch B — do not infer currency.** The data owner supplies an exhaustive tenant/park/
owner currency mapping. The migration backfills only from that mapping and aborts if
any monetary lifecycle is missing, ambiguous, or internally mixed.

No default branch may be inferred from current rows.

Required signers: product owner, finance owner, data owner.

### DEC-04 — Financial move-out handover identity

**Branch A — pre-create the draft handover (recommended).** The approval-request
transaction locks the lease and atomically find-or-creates the unique
`(scope, lease, move_out)` draft handover. Submission freezes handover ID/version,
lease ID/version, amounts, attachments, meter/credential/item snapshot hashes, and a
server-generated `checkoutReceivableId` when checkout charges are positive.
The only accepted submitted lease statuses are `active`, `expiring`, and
`checkout_pending`; every branch results in `checkout_pending` plus one version.
Submission also freezes the Asia/Shanghai business date derived from the database
submission timestamp and therefore the exact checkout-receivable period/due fields. It
locks and freezes the sorted confirmed housing-ledger contributors and computed deposit
balance used by the deduction check. Execution rejects any contributor set, status,
version, amount, or balance drift and never recomputes the date from wall-clock time.

Find-or-create accepts only one active `draft` row. An active `completed` row rejects a
new submission as `handover-already-completed`; only runtime replay of the same existing
approval execution key, effect hash, and canonical payload may return its previously
recorded result before re-entering the domain command. A legacy completed row without
those approval keys is never treated as proof of the new request. Any soft-deleted row
for the same scope/lease/type, duplicate row, or unknown status fails
`handover-history-conflict` and is never resurrected or replaced.

Submission derives the exact checkout-receivable source unique after the draft
handover ID exists and acquires its advisory lock. If an active matching receivable
exists, it locks and freezes `receivableMode=existing`, ID, version, all unique-key
fields, current amount and settlement fields. If none exists, it freezes
`receivableMode=new`, the verified absence, a server-generated ID, and all insert
fields. Execution cannot switch modes. A different winner, soft-deleted/void collision,
payload mismatch, or settlement drift is a 409.

Execution CAS-updates that exact draft handover to completed and CAS-updates the frozen
lease from its submitted status/version to `checkout_pending` with resulting version
equal to expected version + 1. It never substitutes or creates another handover. The
compound effect cardinality is handover update = 1, lease update = 1, lease-effect
audit = 1, and checkout receivable insert/update = the frozen 0-or-1 value. The
handover row owns non-null approval execution/line keys; the lease-effect audit owns
the lease before/after state and version under the same compound line. The optional
aggregate deduction remains one line with
`itemId = handoverId`, and points to the frozen checkout receivable.

**Branch B — deterministic absent-row identity.** This changes the frozen handover
effect from update CAS to deterministic insert and requires a separate lifecycle and
collision authority. It is not implementation-ready in this v2.

Required signers: product owner, housing domain owner, housing finance owner.

### DEC-05 — Purchase transfer target receivable

**Branch A — preserve one aggregate target receivable (recommended).** Submission locks
the purchase, target lease, and sorted purchase items. It freezes:

- purchase expected version and one batch source CAS;
- every item ID, expected version, amount, currency, and null transfer owner;
- the exact aggregate delta amount;
- either an existing target receivable ID/version/current amount or a new
  server-generated target receivable ID plus its complete deterministic insert fields.

Execution increments the purchase source version exactly once, CAS-updates every item
from null to the frozen target ID, and inserts one transfer audit per item. It creates
or CAS-increments the one frozen aggregate receivable. Add a separate
`housing.receivable.purchase-transfer` aggregate financial effect; the old
`financial effects=0` assertion is superseded. The item effect hash includes
`fromOwner=purchase`, `toOwner=target receivable`, item version, item amount, and
currency.

**Branch B — one receivable per item.** This changes current aggregation, list and
settlement behavior and requires separate product/UI/accounting acceptance. It is not
implementation-ready in this v2.

Required signers: product owner, housing domain owner, finance owner, data/audit owner.

### DEC-06 — Purchase lifecycle transition matrix

The existing service can represent questionable combinations such as voiding a
refunded purchase because its void guard rejects only `paymentStatus=paid`. The new
audit CHECK cannot preserve that ambiguity.

**Branch A — terminal-safe matrix (recommended).** Permit exactly:

| Transition | Before approval/payment | After approval/payment |
| --- | --- | --- |
| `approve` | `draft / unpaid` | `approved / unpaid` |
| `reject` | `draft / unpaid` | `rejected / unpaid` |
| `pay` | `approved / unpaid` | `approved / paid` |
| `refund` | `approved / paid` | `approved / refunded` |
| `void-draft` | `draft / unpaid` | `void / unpaid` |
| `void-approved` | `approved / unpaid` | `void / unpaid` |
| `void-rejected` | `rejected / unpaid` | `void / unpaid` |

`rejected`, `void`, and `refunded` are terminal for new lifecycle requests. Same-key
execution replay returns the original effect before entering the domain command; it is
not a second terminal transition. Refund and void continue to reject any transferred
purchase item.

**Branch B — permit another matrix.** The replacement must enumerate every before/after
approval/payment pair and state how transferred items, target receivables, and audit
history are reversed or preserved. It is not implementation-ready in this v2.

Required signers: product owner, housing domain owner, finance owner, audit owner.

## 4. Authority and schema revision after decisions

Only after DEC-01..06 are completely decided may the authority owner publish a new,
immutable revision that:

1. records the canonical 000191/000192 filenames without editing old authorities;
2. replaces the homestay cancellation and finance rows with the selected v2 contracts;
3. corrects property mode source ownership to:
   `sourceType=property-operation-config`, config ID, config expected version,
   `operating_mode`, and `operating_status`; initialization uses
   `operating_mode=none`, `operating_status=enabled`, `version=1` before submission;
   it takes the property-config advisory lock, locks the active unit, rejects any
   soft-deleted/duplicate config, atomically inserts only when no active row exists,
   then freezes the exact config ID/version; execution may neither create nor replace
   that row;
4. records the selected housing currency and handover contracts;
5. replaces purchase-transfer `financial effects=0` with the exact selected
   receivable effect and item CAS/audit cardinality;
6. defines the three housing audit tables, exact transition combinations, nullability,
   composite keys/FKs, and approval-line uniques;
7. publishes a new promotion handoff and a new current-only locator that contains only
   the new authority hashes and records the successful 000197 v31 handoff;
8. receives a fresh independent database, QA/security, and finance review with
   `open_P0_P1=[]`.

### 4.1 Exact housing audit owners

All three tables share these non-null columns and exact types: `id uuid`,
`tenant_id varchar(64)`, `park_id varchar(64)`, `approval_request_id uuid`,
`action_id varchar(160)`, `effect_kind varchar(128)`,
`approval_execution_key varchar(128)`, `effect_line_key varchar(160)`,
`actor_id uuid`, `occurred_at timestamptz`, and `effect_hash char(64)`. Hashes satisfy
`^[a-f0-9]{64}$`; action/effect/key/reason strings reject blank padded values; versions
are positive. The exact hash CHECK names are `ck_housing_lease_effect_audit_hash`,
`ck_housing_purchase_effect_audit_hash`, and
`ck_housing_purchase_transfer_effect_audit_hash`. Each table rejects UPDATE/DELETE.
The exact scope candidate keys are
`uq_housing_lease_effect_audit_scope_id`,
`uq_housing_purchase_effect_audit_scope_id`, and
`uq_housing_purchase_transfer_effect_audit_scope_id` on `(tenant_id,park_id,id)`. The
exact approval-line owners are `uq_housing_lease_effect_audit_approval_line`,
`uq_housing_purchase_effect_audit_approval_line`, and
`uq_housing_purchase_transfer_effect_audit_approval_line` on
`(tenant_id,park_id,approval_execution_key,effect_line_key)`.

The exact approval FKs are `fk_housing_lease_effect_audit_approval_execution`,
`fk_housing_purchase_effect_audit_approval_execution`, and
`fk_housing_purchase_transfer_effect_audit_approval_execution`, each from
`(tenant_id,park_id,approval_request_id,approval_execution_key)` to the existing
`biz_property_approval_request(tenant_id,park_id,id,execution_idempotency_key)`
candidate key. Every other FK is also a named tenant+park composite FK to a same-scope
candidate key. Approval keys are never null; these are new audit tables and have no
legacy-null exception.

000191/000192 add these exact candidate keys before the audit FKs:

```text
uq_property_occupancy_scope_id                   (tenant_id,park_id,id)
uq_housing_lease_scope_id                        (tenant_id,park_id,id)
uq_housing_handover_scope_id                     (tenant_id,park_id,id)
uq_housing_purchase_scope_id                     (tenant_id,park_id,id)
uq_housing_purchase_scope_id_currency            (tenant_id,park_id,id,currency)
uq_housing_purchase_item_scope_id_purchase       (tenant_id,park_id,id,purchase_id)
uq_housing_lease_scope_id_currency               (tenant_id,park_id,id,currency)
uq_housing_receivable_scope_id_currency          (tenant_id,park_id,id,currency)
```

All audit FKs use `ON UPDATE RESTRICT ON DELETE RESTRICT`. Their exact domain FK names
are:

```text
fk_housing_lease_effect_audit_lease
fk_housing_lease_effect_audit_handover
fk_housing_lease_effect_audit_occupancy
fk_housing_purchase_effect_audit_purchase
fk_housing_purchase_transfer_effect_audit_purchase_currency
fk_housing_purchase_transfer_effect_audit_item_purchase
fk_housing_purchase_transfer_effect_audit_lease_currency
fk_housing_purchase_transfer_effect_audit_receivable_currency
```

`biz_housing_lease_effect_audit` has non-null `lease_id uuid`,
`from_status varchar(32)`, `to_status varchar(32)`, `reason varchar(500)`,
`source_expected_version integer`, and `resulting_version integer`; nullable
`handover_id uuid`, `checkout_at timestamptz`, `occupancy_id uuid`,
`occupancy_source_expected_version integer`, and `occupancy_resulting_version integer`.
Its named `ck_housing_lease_effect_audit_contract` CHECK
permits only:

- `housing.leases.void.request` / `housing.lease.void`:
  `draft|pending_approval|pending_signature -> void`, no handover,
  no checkout timestamp;
- `housing.leases.checkout.request` / `housing.lease.checkout`:
  `checkout_pending -> terminated`, no handover, non-null
  checkout timestamp; the three occupancy fields are either all null or all non-null,
  and a non-null occupancy result version equals its expected version + 1. A non-null
  occupancy must share scope and unit with the lease, have
  `source_domain=housing_rental`, `source_type=housing_lease`,
  `source_id=lease.id`, before status `active`, and after status `completed`. When
  `lease.occupancy_id` is non-null, a missing or mismatched occupancy is a conflict and
  the zero-occupancy branch is forbidden. When it is null, submission must also prove
  no active same-source occupancy exists before freezing cardinality zero;
- `housing.handovers.complete-move-out-financial.request` /
  `housing.handover.complete.financial`: `active|expiring|checkout_pending ->
  checkout_pending`, non-null move-out handover, no checkout timestamp.

Void and financial-handover rows require all occupancy fields null. Every row requires
`resulting_version = source_expected_version + 1`; `reason` is trimmed and non-empty.
It has composite FKs to lease, optional handover, and optional occupancy. Checkout
submission freezes the optional occupancy ID/version/status and execution requires its
0-or-1 CAS cardinality; the ordered occupancy before/after identity is a contributor to
the lease compound effect and audit hash.

`biz_housing_purchase_effect_audit` has non-null `purchase_id uuid`,
`transition varchar(32)`, `before_approval_status varchar(32)`,
`after_approval_status varchar(32)`, `before_payment_status varchar(32)`,
`after_payment_status varchar(32)`, `reason varchar(500)`,
`source_expected_version integer`, and `resulting_version integer`. Its named
`ck_housing_purchase_effect_audit_transition` CHECK is exactly the selected DEC-06
matrix; its action is always
`housing.purchases.lifecycle.request`, version increments by one, and its composite FK
targets the purchase.

`biz_housing_purchase_transfer_effect_audit` has the common non-null `action_id` fixed
to `housing.purchases.transfer.request` and `effect_kind` fixed to
`housing.purchase.transfer`, plus non-null `purchase_id`, `purchase_item_id`,
`from_purchase_id`, `to_lease_id`, `to_receivable_id`, `currency varchar(8)`,
`purchase_source_expected_version`, `purchase_resulting_version`,
`item_source_expected_version`, `item_resulting_version` as positive integers,
`item_amount numeric(18,2)`, and `reason varchar(500)`. It CHECKs
`purchase_id=from_purchase_id`, both resulting versions equal their expected version +
1, `item_amount>0`, and `currency ~ '^[A-Z]{3}$'` under the named
`ck_housing_purchase_transfer_effect_audit_contract`.

000192 adds named candidate keys `(tenant_id,park_id,id,currency)` to purchase, lease,
and receivable, and `(tenant_id,park_id,id,purchase_id)` to purchase item. The transfer
audit uses composite FKs `(scope,purchase_id,currency)`,
`(scope,purchase_item_id,purchase_id)`, `(scope,to_lease_id,currency)`, and
`(scope,to_receivable_id,currency)`. Thus item ownership comes from the item-to-purchase
key while the purchase, lease, receivable, and audit currency are physically equal;
the item does not invent an independent currency column. One frozen item owns exactly
one item CAS and one transfer-audit row; every row in a batch names the same frozen
target receivable and purchase resulting version.

No free-text remark, generic mutation receipt, or runtime effect receipt substitutes
for these owners.

## 5. Reservation and implementation gate

After authority technical GO and all required signatures, the unique
schema-migration-owner must re-scan:

- the filesystem for every `000191_*` and `000192_*` file;
- `public.sys_schema_migration_history`;
- the legacy migration history table used by the compatibility path;
- current 000197 preflight expectations.

The owner then atomically reserves both exact filenames. Only that fresh reservation
may authorize creation of the two forward-only SQL files. Migration tests must cover
empty database, representative legacy rows, every incompatible-data preflight,
same-byte rerun, checksum/history conflict, concurrent writer conflict, and rollback on
failure. Adapter work remains blocked until both formal migration handoff SHAs and the
property-foundation adapter SHA exist.

## 6. Required adapter, failure, and UAT matrix

The selected branches must pass at least this matrix in PostgreSQL 16 and through the
canonical API/Web surfaces:

- cancellation: draft/confirmed, occupancy 0/1, credentials 0/1/N, financial lines
  0/waiver/charge/both, cutoff boundary, new credential and ledger/version drift,
  transaction rollback, crash after each domain write, reclaim, and same-key replay;
- homestay finance: refund/waiver source type, direct linked and legacy mapped source,
  unresolved legacy quarantine, concurrent allocations at the exact remaining balance,
  over-allocation, cycle/cross-booking/cross-scope/currency mismatch, and replay;
- housing currency: empty and populated databases, orphan/cross-scope owners, incomplete
  mapping, mixed lifecycle currency, invalid code, all child propagation paths, and
  rollback before validation;
- financial handover: no row/draft/completed/soft-deleted collision, existing/new
  checkout receivable mode, 0/positive checkout charge and deduction, lease/handover/
  receivable drift, duplicate direct writer, CAS conflict, crash/reclaim/replay, and
  compound audit/cardinality verification;
- purchase lifecycle: every allowed DEC-06 edge and nearest forbidden edge, terminal
  replay, transferred-item refund/void rejection, CAS conflict, and audit CHECK;
- purchase transfer: existing/new aggregate receivable, one/many items, per-item CAS,
  purchase batch CAS, accumulated amount, target mismatch, concurrent overlapping and
  disjoint item sets, currency/scope mismatch, crash at each write, reclaim, and replay;
- property config: concurrent first submission, existing active config, soft-deleted or
  duplicate conflict, source swap/version drift, and execution-time create rejection;
- authorization/UAT: normal, superuser, wildcard, maker/checker, cross-tenant,
  cross-park, missing/disabled/expired module, old-client stop-ship, approval state,
  execution failure/retry, task projection, canonical Web recovery after refresh, and
  flag rollback/re-enable without restoring direct high-risk execution.

Every failure case asserts domain, approval, receipt, audit, and outbox before/after
state; a status-only assertion is insufficient.

## 7. Decision record shape

A valid decision must state:

```text
DEC-01=<A|replacement>
DEC-02=<A|B|replacement>
DEC-03=<A|B|replacement>
DEC-04=<A|replacement>
DEC-05=<A|replacement>
DEC-06=<A|replacement>
trusted_signer_directory_sha256=<64 lowercase hex>
signatures[
  { decision_id, branch, signer_identity, signer_role, decided_at_with_timezone }
]
```

DEC-03=A additionally requires the exact statement: `All legacy housing monetary data
in scope may be interpreted and backfilled as CNY.` Continued project instructions,
technical GO, or silence are not substitutes for this record.

Required signer roles are exact:

| Decision | Distinct signer roles |
| --- | --- |
| DEC-01 | product, homestay domain, finance |
| DEC-02 | product, finance, data |
| DEC-03 | product, finance, data |
| DEC-04 | product, housing domain, finance |
| DEC-05 | product, housing domain, finance, plus data or audit/security |
| DEC-06 | product, housing domain, finance, audit/security |

Each role normally has a distinct durable signer identity. One signer may represent
multiple roles only when the record contains an explicit non-empty delegation statement
naming those roles; this is recorded as delegated multi-role confirmation and must not
be described as independent multi-party signatures. The JSON Schema validates required
fields, branch shape, timestamps, role presence, and the CNY attestation. The mandatory
intake verifier additionally validates signature/decision branch equality, signer
membership and role/delegation against a separately supplied trusted signer directory
whose bytes match `trusted_signer_directory_sha256`, distinctness or explicit
delegation, and the exact proposal hash. The directory must name its issuing identity,
issuance time, and evidence reference; it is frozen with the accepted decision receipt.
Self-declaring a signer inside the decision record is insufficient. The authority owner
must manually verify the directory issuer/evidence and record that verification in the
immutable receipt. Schema validity alone does not prove authorization.
