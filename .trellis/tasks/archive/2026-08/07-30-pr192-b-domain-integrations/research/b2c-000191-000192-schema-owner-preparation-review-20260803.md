# B2c 000191/000192 schema-owner preparation review

Date: 2026-08-03  
Scope: read-only preparation review; this artifact does not reserve a migration number and does not authorize DDL.  
Disposition: **NO-GO for authoring 000191/000192** until the P0 contract decisions below are frozen and a live dual-history reservation is completed.

## Authorities and observed baseline

- Current authority locator: `b2c-current-authority-locator-v1.md`.
- Frozen effect authority: parent `b0-runtime-contract-freeze.md`, raw SHA-256
  `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf`.
- Current files contain `000176` through `000190`, then `000193`, `000194`, `000195`, and
  `000197`; no `000191_*` or `000192_*` file exists.
- `000197_property_approval_active_source_index_forward_fix.sql` explicitly permits only
  `000191_property_b_homestay_effect_schema.sql` and
  `000192_property_b_housing_effect_schema.sql` under those prefixes. Those filenames are therefore
  fixed unless 000197 is superseded by a new forward migration; 000197 must not be edited after success.
- Current entity/service behavior was checked under `property-operations`, `homestay`, and `housing`.
  No required approval-owned columns or the release/housing audit entities described below exist.

## Exact current schema and deterministic additions

`scope` below is exactly `(tenant_id, park_id)`. Existing domain roots all already have UUID `id`,
scope, and integer `version` through their migration/entity base, unless noted.

### 000191: property-operation + homestay

| Frozen action | Existing owner and useful columns | Required deterministic schema delta |
|---|---|---|
| `homestay.bookings.cancel.request` | `biz_homestay_booking`: `id,status,cancel_reason,cancelled_at,version,currency`; `biz_homestay_booking_action_log`: `booking_id,action,before_status,after_status,reason,snapshot,operator_id,operator_name,action_time` | Add `approval_execution_key varchar(128)` and `effect_line_key varchar(160)` to `biz_homestay_booking_action_log`; add exact `UNIQUE (tenant_id,park_id,approval_execution_key,effect_line_key)`. Legacy rows need an all-null exception; approval rows must require both values. Booking itself needs no new CAS column. |
| `homestay.finance.refund-or-waive.request` | `biz_homestay_ledger_entry`: `booking_id,entry_type,charge_type,amount,payment_method,payment_channel,transaction_reference,status,reason,occurred_at,version`; no receivable/source-receivable column and no currency column | Add `approval_execution_key varchar(128)` and `effect_line_key varchar(160)`; add exact `UNIQUE (tenant_id,park_id,approval_execution_key,effect_line_key)`, with legacy-null/approval-complete enforcement. The remaining source-receivable and currency decisions are blockers below. |
| `property.mode-transition.request` | `biz_property_mode_transition_log`: `unit_id,from_mode,to_mode,reason,check_snapshot,operator_id,operator_name,transition_time,version`; `biz_property_operation_config` is the row currently updated and versioned; `biz_unit` is also versioned but not updated by this flow | Add `approval_execution_key varchar(128)`, `approval_effect_kind varchar(128)`, and `approval_effect_line_key varchar(160)` to the transition log; add exact `UNIQUE (tenant_id,park_id,approval_execution_key,approval_effect_kind,approval_effect_line_key)`, with legacy-null/approval-complete enforcement. Resolve the CAS-owner contradiction below before DDL. |
| `property.occupancy.force-release.request` | `biz_property_occupancy`: `id,source_domain,source_type,source_id,status,release_reason,released_at,version`; no release-audit table | Create the contract-named `biz_property_occupancy_release_audit`. Its non-null key must include `id`, scope, `occupancy_id`, `approval_execution_key`, `approval_effect_kind`, `approval_effect_line_key`, with exact `UNIQUE (tenant_id,park_id,approval_execution_key,approval_effect_kind,approval_effect_line_key)`. It must persist enough immutable before/after source, reason, status, version, actor, timestamp, and hash evidence to recompute the frozen invariant. Exact column names/types are not frozen and are a blocker. Occupancy itself needs no new CAS column. |

All 000191 approval-owned domain rows must be created in the same transaction as the matching
`biz_property_execution_effect_receipt`/manifest, approval audit, and outbox rows. The receipt table
already exists from 000186 and has `owning_unique_name`, `unique_key_hash`, and
`observed_cardinality` from 000193; 000191 must not depend on those 000193 additions because it runs
before 000193 on a fresh database.

### 000192: housing

| Frozen action | Existing owner and useful columns | Required deterministic schema delta |
|---|---|---|
| `housing.leases.approve.request` | `biz_housing_lease`: `status,approval_note,approved_by,approved_at,version` | No new domain uniqueness is frozen; use PK + expected-version CAS. |
| `housing.leases.void.request` | `biz_housing_lease`: `status,termination_reason,version`; no lease audit table | A durable lease audit owner with `approval_execution_key` and `effect_line_key`, exact `UNIQUE (tenant_id,park_id,approval_execution_key,effect_line_key)`, and immutable reason/from/to/version/actor/time/hash evidence is required. Physical table name and exact row shape are not frozen. |
| `housing.leases.checkout.request` | `biz_housing_lease`: `status,checkout_at,termination_reason,version`; no checkout audit table | A durable checkout audit owner with the same exact unique key and immutable checkout/from/to/version/actor/time/hash evidence is required. Whether this is the lease audit table or a separate table is not frozen. |
| `housing.finance.refund-waive-or-deposit-refund.request` | `biz_housing_ledger_entry`: `lease_id,receivable_id,entry_type,charge_type,amount,source_type,source_id,status,reason,occurred_at,version`; `biz_housing_receivable`: amount/paid/waived/status/version; neither table has currency | Add `approval_execution_key varchar(128)` and `effect_line_key varchar(160)` to the ledger and exact `UNIQUE (tenant_id,park_id,approval_execution_key,effect_line_key)`, with legacy-null/approval-complete enforcement. Currency storage/backfill is unresolved below. |
| `housing.handovers.complete-move-out-financial.request` | `biz_housing_handover`: status, three aggregate amounts, JSON snapshots/files, version; current DTO has only aggregate `deposit_deduction_amount`; ledger creates at most one aggregate deduction | Handover needs no new CAS column. Ledger uses the same approval key columns/unique above. The required stable `deduction:{itemId}` rows cannot be represented by the current payload/schema; decision required. |
| `housing.purchases.lifecycle.request` | `biz_housing_purchase`: approval/payment statuses, remark, version; no purchase audit | A purchase audit owner with the exact execution/line unique key and immutable transition/from/to/version/actor/time/hash evidence is required. Physical table name and exact row shape are not frozen. |
| `housing.purchases.transfer.request` | `biz_housing_purchase_item`: `purchase_id,transferred_receivable_id,version`; no transfer audit or owner fields | A transfer audit owner with the exact execution/line unique key and immutable item/from-owner/to-owner/version/actor/time/hash evidence is required. Physical table name, owner semantics, and exact row shape are not frozen. |

The housing ledger entry type CHECK already permits `refund`, `waiver`, `deposit_refund`, and
`deposit_deduction`; no enum expansion is needed for the frozen effects.

## P0 contradictions/blockers

1. **Homestay cancellation financial cardinality conflicts with current behavior.** The frozen action
   requires `financial effects=0`, but current `cancelBooking` may insert a room waiver and a
   cancellation-fee charge. Schema cannot reconcile this; freeze whether cancellation financial
   adjustments move to separate approved lines/actions or the manifest is revised.
2. **Homestay stable line is unrepresentable.** The frozen key is
   `ledger:{entryType}:{sourceReceivableId}`, but Homestay has no receivable table, receivable ID, or
   source-receivable field, and its DTO accepts only booking, type, charge type, amount, and reason.
   Freeze the source identity and its FK/column before 000191.
3. **Property mode CAS owner conflicts with the write path.** The frozen mapping says `unit expected
   version CAS`; current code changes `biz_property_operation_config.version` and does not mutate
   `biz_unit.version`. Freeze which aggregate/version is the approval source and hash authority.
4. **Housing currency is absent.** Frozen financial effects require request currency and currency in
   the hash, but lease, receivable, ledger, and handover rows have no currency. Freeze the currency
   owner and legacy backfill rule (including whether existing data is provably CNY) before 000192.
5. **Housing deduction stable lines are absent.** The contract requires one
   `deduction:{itemId}` ledger row per frozen item, while the DTO/schema/service contain only three
   aggregate amounts and create at most one aggregate deposit-deduction row. Freeze an item model and
   identifiers, or revise the effect contract.
6. **Housing audit owners are unnamed.** “lease audit”, “checkout audit”, “purchase audit”, and
   “transfer audit” do not identify physical tables or whether lease events share one table. Exact DDL,
   FK shape, and `owning_unique_name` cannot be frozen until these names and row contracts are decided.
7. **Purchase transfer owner semantics are absent.** The invariant requires `fromOwner/toOwner`, but
   a purchase item only records `transferred_receivable_id`. Freeze what “owner” means and which IDs
   are persisted.
8. **Formal reservation is not established.** Filesystem vacancy is not a reservation. The schema
   owner must re-scan both live history tables and all migration filenames immediately before creation.

## Dependency/order contract

1. Resolve and freeze all P0 decisions above; update the runtime/effect authority if its semantics
   change.
2. On the target database, prove `sys_schema_migration_history` and `schema_migrations` agree on
   filename/checksum/status, have no `running`/`failed` rows, and contain no 000191/000192 prefix.
3. Formally reserve the exact filenames recognized by 000197.
4. Author and gate 000191 first. It may depend on 000176, 000177, 000186, and 000190, but must not
   depend on 000193+ because lexical execution places it before them on fresh databases.
5. Author and gate 000192 second. It may depend on 000176, 000178, 000180, 000186, and 000190; it
   should not need 000191 domain objects and must not depend on 000193+.
6. Re-run the full sequence through current 000197. On an already-current database, the runner will
   apply newly pending 000191/000192 while skipping checksum-matched 000193–000197. On a fresh
   database it will apply them lexically before 000193–000197.

## Rerun and fail-closed requirements

- Wrap each migration in one explicit transaction and set bounded lock/statement timeouts. A SQL
  failure must roll back all DDL/data changes; the runner then records `failed` externally and stops.
- Before DDL, require both history tables, required predecessor tables/extensions, exact approved
  predecessor checksums/statuses, and no unknown same-prefix history. Reject any disagreement or
  `running`/unexpected state.
- Guard exact catalog shape for every pre-existing table/column/constraint/index. `IF NOT EXISTS`
  alone is insufficient: a same-named object with different type, nullability, predicate, key order,
  or definition must fail closed.
- Legacy rows may keep all approval-link fields null. Enforce “all approval linkage null or all
  required linkage non-null”; reject partial linkage. New audit tables use non-null linkage.
- Preflight duplicate approval linkage before creating each unique constraint/index. Do not repair,
  deduplicate, or delete business rows inside these schema migrations.
- A same-checksum successful migration is a runner no-op; a changed checksum after success must stop.
  A failed same-checksum attempt may rerun only after manual inspection, relying on transaction
  rollback and exact preflight/postcheck. Gate both immediate SQL rerun and runner rerun.
- The runner auto-baselines every present file on a non-empty database with empty history when
  `MIGRATION_BASELINE_ON_NONEMPTY_DB=yes`. Formal execution must prove trustworthy non-empty history
  (or deliberately disable that mode); otherwise new 000191/000192 could be marked succeeded without
  executing.
- Postcheck exact column types/nullability, unique key order, audit table definitions, absence of
  residue, zero partial-link rows, and unchanged unrelated tables. Record before/after manifests,
  migration checksums, base/output SHA, and exact rerun evidence.

## Gate result

**NO-GO.** The lexical slot and current base tables are identifiable, and the deterministic unique-key
deltas are clear, but the frozen contract is not physically complete enough to author safe migrations.
The eight blockers above must close, followed by live formal reservation. No migration, seed, entity,
service, or existing documentation change is authorized by this review.
