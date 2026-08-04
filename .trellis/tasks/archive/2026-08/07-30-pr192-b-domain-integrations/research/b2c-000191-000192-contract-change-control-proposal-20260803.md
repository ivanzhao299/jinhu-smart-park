# 000191/000192 Contract Change-Control Proposal

Status: **PROPOSAL / NOT APPROVED / NO MIGRATION RESERVATION / NO RELEASE CLAIM**

Date: 2026-08-03

Scope: bounded change-control proposal for the schema-owner blockers affecting the proposed property B-domain migrations. This artifact does not amend a frozen authority, reserve a migration number, authorize implementation, or assert release readiness. Every decision below requires independent approval before any authority, migration, seed, runtime, test, or documentation change.

## Evidence baseline

The proposal is grounded in these immutable inputs and current implementation surfaces:

| Evidence | SHA-256 / observation |
| --- | --- |
| `research/b0-runtime-contract-freeze.md` | `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf` |
| `research/b0-product-and-access-control-freeze.md` | `d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040` |
| `research/b2c-000191-000192-schema-owner-preparation-review-20260803.md` | `72ff6ce04451a4ea5ced6ff35e10759419b8b28d19c87113b2b9452ff3fa0a58` |
| `research/b2c-000191-000192-v23-reservation-audit-20260803.json` | `de40c2b264b8a0ab6c35470b3c39340b0eb5a851f42d3557ca8b826776916770` |
| `database/migrations/000197_property_approval_active_source_index_forward_fix.sql` | `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`; its preflight accepts only the exact 000191/000192 filenames selected below |
| `database/migrations/000176_shared_property_foundation.sql` | `a32491d5f70839d7fddf7811292f5935a6f119d47c3dffa81b87d2c0ad6e92c6`; mode state and version live in `biz_property_operation_config` |
| `database/migrations/000177_homestay_mvp.sql` | `71f4f1ebd4d2238b92f11a1c876f819814668c61b5c25e524a281ec956f953e5`; bookings own currency, ledger rows do not expose a receivable identity |
| Homestay service/entity implementation | Service `4b24b429529c25825475a135ee6dd34dca906929639426bda7f7a99b530eca87`; entity `2c71c6927b55a2ad3964124fe5283dc5d196c0fbf18f219c81410dd48a8528e8`; confirmed-booking cancellation currently writes zero or one aggregate room waiver and zero or one cancellation charge in the booking transaction |
| `database/migrations/000178_housing_rental_mvp.sql` | `245312a92244394ae72324e409c199b3e68aa3343927fb41b9fc799c8853c066`; housing financial rows currently have no currency column and handover deductions are aggregate |
| Housing service/entity/DTO implementation | Service `4b820f773167100dbfa909fb0ac1071f6bbc9c2673e253fe8a413668f53ded85`; entities `73089424d8dffd8d9af51f57ae5b6af58739f301ac3cfac91cd93210976d2a97`; DTO `6f6b5274781fed320269562edb001f2b4cc1f2f4a998642a9ebe024c26c5e659` |

## Proposed decisions requiring independent approval

### CCP-01 — Canonical migration filenames

Select exactly these filenames:

- `database/migrations/000191_property_b_homestay_effect_schema.sql`
- `database/migrations/000192_property_b_housing_effect_schema.sql`

If approved, amend every older frozen/preflight reference that names `000191_homestay_approval_effect_expand.sql` or `000192_housing_approval_effect_expand.sql` to the exact canonical names above before creating either migration. The later 000197 preflight already enforces these names; selecting them minimizes forward-history drift.

Approval effect: filename alignment only. Approval does not itself reserve either number, permit either file to be created, or satisfy the formal migration reservation gate.

Rejected alternatives:

- The older `*_approval_effect_expand.sql` names: rejected because they conflict with the exact-name validation already shipped in 000197.
- Supporting aliases or duplicate-number compatibility files: rejected because migration identity must remain one filename per sequence number and duplicate 000191/000192 files would make history ambiguous.

### CCP-02 — Homestay cancellation freezes its real financial effects

Replace the cancellation assertion `financial effects = 0` with a manifest that freezes the existing atomic cancellation behavior at request submission.

Required frozen request data:

- `bookingId`, `sourceExpectedVersion`, booking currency, and the confirmed ledger snapshot used for calculation.
- `roomWaiverAmount` and `cancellationFeeAmount`, each non-negative and expressed in booking currency.
- The manifest contains exactly one cancellation line plus only the positive financial lines below.

Required effect lines and owning rows:

| Effect kind | Stable line key | Cardinality | Owning row / unique |
| --- | --- | --- | --- |
| `homestay.booking.cancel` | `booking:{bookingId}` | Exactly 1 | Booking PK CAS update = 1; booking action-log row = 1 under its approval-line unique |
| `homestay.ledger.waiver` | `ledger:waiver:booking:{bookingId}:room-cancellation` | Exactly 1 iff frozen `roomWaiverAmount > 0`, otherwise absent | One `room_cancellation` waiver ledger row under the ledger approval-line unique |
| `homestay.ledger.charge` | `ledger:charge:booking:{bookingId}:cancellation-fee` | Exactly 1 iff frozen `cancellationFeeAmount > 0`, otherwise absent | One `cancellation_fee` charge ledger row under the ledger approval-line unique |

Execution must lock the booking, require the frozen booking version, recompute from the same confirmed ledger inputs, and reject drift rather than changing manifest membership or amounts at execution. The booking update, action log, all frozen ledger rows, effect receipts, approval audit, and outbox remain in one transaction. Exact ledger cardinality is therefore the number of frozen financial lines: 0, 1, or 2—not a runtime-derived count.

For request invariants, `currency` is the booking currency when either financial line exists and is null when neither exists. `amount` is the sum of the positive frozen financial line amounts when any exist and is null otherwise. The sum of financial effect-line amounts must equal request `amount`.

Required authority amendments if approved:

- Add `homestay.ledger.charge` to the allowed financial effect kinds for cancellation.
- Replace the cancellation `financial effects = 0` cardinality with the table above.
- Define the two stable cancellation-ledger keys and the frozen-snapshot drift rule.

Rejected alternatives:

- Preserve `financial effects = 0`: rejected because it contradicts the current atomic domain transaction and would leave financial writes outside the frozen exactly-once manifest.
- Split cancellation finance into later requests: rejected because it changes current business atomicity and creates a partially cancelled state.
- Decide optional lines at execution: rejected because retries could produce a different effect set.

### CCP-03 — Homestay finance references a source ledger entry, not a nonexistent receivable

Rename the generic homestay refund/waiver contract field from `sourceReceivableId` to `sourceLedgerEntryId`. The current homestay model has no receivable row or receivable identifier; its confirmed charge/payment ledger entries are the representable financial sources.

Required schema/runtime contract if approved:

- Add nullable `source_ledger_entry_id` to the homestay ledger, scoped to the same tenant and park through a composite foreign key to a source homestay ledger row.
- Add ledger `currency`; every new ledger row copies and must equal its booking currency.
- Refund lines reference an eligible confirmed payment ledger entry; waiver lines reference an eligible confirmed charge ledger entry.
- Stable line key: `ledger:{entryType}:{sourceLedgerEntryId}`.
- Exactly one result ledger row per frozen source line, owned by the ledger approval-line unique.
- Submission freezes source row ID/version or immutable source financial fields, amount, and currency. Execution locks the source row and rejects if the remaining refundable/waivable balance, eligibility, booking, scope, or currency no longer matches the frozen assumptions.
- Aggregate linked refund/waiver amounts for a source must never exceed that source amount.

This is a pre-adapter contract correction, not a compatibility alias. The obsolete field must not remain as a second accepted identity.

Rejected alternatives:

- Invent a homestay receivable table solely to preserve `sourceReceivableId`: rejected as a broad new accounting subsystem unsupported by current production tables.
- Treat a ledger ID as a receivable ID without renaming: rejected because it creates a false ownership contract.
- Allow finance lines without a source: rejected because available-balance locking and duplicate prevention would be undefined.

### CCP-04 — Property mode CAS is owned by the operation-config row

Amend the property-mode contract so the source and CAS owner are the current `biz_property_operation_config` row, not `biz_unit`.

Exact contract:

- `sourceType = property-operation-config`.
- `sourceId = biz_property_operation_config.id`.
- `sourceExpectedVersion = biz_property_operation_config.version`.
- The human/domain line key remains `unit:{unitId}`.
- Execution locks the operation-config row and performs exactly one versioned update on it; affected rows must equal 1.
- The transition-log row remains exactly one and is owned by its approval-line unique.
- No `biz_unit` write is counted or required.
- A missing config row is initialized atomically before approval submission with the current neutral defaults (`operating_mode = none`, `status = enabled`, `version = 1`); execution may not create or substitute the source row.

Required authority amendment if approved: replace every “unit expected-version CAS” and “unit update = 1” assertion for property-mode execution with “property-operation-config expected-version CAS” and “operation-config update = 1.”

Rejected alternatives:

- Add a second mode/version to `biz_unit`: rejected because it duplicates the current authoritative state and permits divergence.
- CAS the config while declaring the unit as the source: rejected because the source identity and locked version would refer to different rows.
- Create the config lazily during execution: rejected because the approval request would not identify a stable source row/version.

### CCP-05 — Housing currency owners and propagation

Ratify `CNY` as the currency of all legacy housing financial data, then make currency explicit and immutable for each financial lifecycle.

Exact ownership and propagation if approved:

- Rental owner: `biz_housing_lease.currency` (`varchar(8)`, ISO-style three-uppercase-letter check, not null).
- Purchase owner: `biz_housing_purchase.currency` with the same constraints.
- Persist copied currency on charge plans, receivables, ledger rows, and handovers; purchase items inherit their purchase currency and do not own an independent currency.
- Backfill legacy owner and child rows as `CNY`, then enforce not-null constraints. New owner rows may default to `CNY` only while the product default remains CNY; callers still freeze the explicit owner currency in approval requests.
- New charge-plan, receivable, ledger, and handover rows copy lease currency. Composite scope/ID/currency keys and foreign keys must prevent child/source currency mismatch.
- Purchase transfer requires purchase currency to equal the target lease currency. Any resulting receivable and transfer audit copy that currency.
- Request `currency` and every financial effect line must equal the relevant lease or purchase owner currency; amounts cannot be summed across currencies.

The legacy-CNY ratification is a product/data decision and cannot be inferred from rows that currently store no currency. It therefore needs explicit independent approval before a migration can backfill it.

Rejected alternatives:

- Continue implicit currency: rejected because effect hashes and amount invariants would not identify the monetary unit.
- Store currency only on approval payloads: rejected because persisted business rows could no longer prove the executed currency.
- Let each child choose currency: rejected because a single lease or purchase lifecycle could become internally inconsistent.

### CCP-06 — Handover deduction identity is the aggregate handover

Retain the current aggregate deduction model and define the frozen `itemId` as the handover ID. Do not introduce a deduction-item table as part of 000192.

Exact contract:

- Main handover line: existing handover stable key and exactly one handover update/audit result as already frozen.
- Deduction line key: `deduction:{handoverId}`.
- The frozen deductions array has length 0 when `depositDeductionAmount = 0`, and length exactly 1 when it is positive.
- For the one deduction, `itemId = handoverId`, amount equals the frozen aggregate `depositDeductionAmount`, and currency equals handover/lease currency.
- The result is exactly one `deposit_deduction` housing ledger row when the line exists, with `source_type = housing_handover`, `source_id = handoverId`, and the checkout receivable as `receivable_id` when that receivable exists.
- The ledger row is owned by the housing-ledger approval-line unique. Execution must not derive multiple lines from `item_snapshot` JSON.

Rejected alternatives:

- Use arbitrary keys embedded in `item_snapshot`: rejected because JSON entries have no enforced stable identity or referential owner.
- Add a deduction-item table now: rejected because current domain behavior and DTOs store one aggregate amount; itemization is a separate product capability.
- Use a generated line ID unrelated to the handover: rejected because retries could not independently derive and verify the same domain identity.

### CCP-07 — Housing audit tables and purchase-transfer owners

Use three relational audit tables with physical domain foreign keys. Do not use one polymorphic audit table.

#### Lease effects

Table: `biz_housing_lease_effect_audit`

Owns: lease void and checkout audit effects. Lease approval remains PK-CAS-only because the frozen contract does not require a separate lease-approval audit row.

Required columns: scoped ID fields, `lease_id`, `action_id`, `effect_kind`, `from_status`, `to_status`, `reason`, `source_expected_version`, `resulting_version`, nullable `checkout_at`, `actor_id`, `occurred_at`, `effect_hash`, `approval_execution_key`, and `effect_line_key`.

Owning unique: `uq_housing_lease_effect_audit_approval_line` on `(tenant_id, park_id, approval_execution_key, effect_line_key)`.

Rules: physical FK to lease; `resulting_version = source_expected_version + 1`; `checkout_at` is present only for checkout. The row is inserted in the same transaction as the lease CAS and is the named domain owner for the frozen audit effect.

#### Purchase lifecycle effects

Table: `biz_housing_purchase_effect_audit`

Owns: purchase approve, reject, pay, refund, and void audit effects.

Required columns: scoped ID fields, `purchase_id`, `action_id`, `transition`, before/after approval status, before/after payment status, `reason`, `source_expected_version`, `resulting_version`, `actor_id`, `occurred_at`, `effect_hash`, `approval_execution_key`, and `effect_line_key`.

Owning unique: `uq_housing_purchase_effect_audit_approval_line` on `(tenant_id, park_id, approval_execution_key, effect_line_key)`.

Rules: physical FK to purchase; valid transition/status combinations are constrained; `resulting_version = source_expected_version + 1`; one row per frozen lifecycle audit line in the same transaction as purchase CAS.

#### Purchase transfer effects

Table: `biz_housing_purchase_transfer_effect_audit`

Owns: exactly one transfer audit row per frozen purchase item.

Required columns: scoped ID fields, `purchase_id`, `purchase_item_id`, `from_purchase_id`, `to_lease_id`, `to_receivable_id`, `currency`, `source_expected_version`, `resulting_version`, `reason`, `actor_id`, `occurred_at`, `effect_hash`, `approval_execution_key`, and `effect_line_key`.

Owning unique: `uq_housing_purchase_transfer_effect_audit_approval_line` on `(tenant_id, park_id, approval_execution_key, effect_line_key)`.

Owner semantics:

- `fromOwner` is the purchase identified by `from_purchase_id`; it must equal `purchase_id` and own the purchase item.
- `toOwner` is the resulting housing receivable identified by `to_receivable_id`, under the target lease `to_lease_id`.
- The domain mutation is the purchase item linkage changing from `transferred_receivable_id IS NULL` to `to_receivable_id`; it is guarded by the frozen purchase/source version and item eligibility.
- The transfer audit has physical FKs to purchase, purchase item, lease, and receivable, and all rows must share tenant, park, and currency.
- One purchase item yields one deterministic transfer line, one item linkage mutation, and one transfer audit. The receivable may be the deterministic per-item receivable or an existing frozen target receivable only if the approved manifest names it before execution; execution may not choose a different owner.

All three audit tables require non-null approval execution and line keys for approval-driven writes. Their audit rows, domain CAS/mutations, ledger/receivable results, effect receipts, approval audit, and outbox are committed in one transaction.

Rejected alternatives:

- One generic polymorphic audit table: rejected because it cannot enforce physical foreign keys or action-specific state contracts.
- Treat an existing free-text remark or generic mutation receipt as the domain audit: rejected because neither owns the frozen domain effect under a domain-specific approval-line unique.
- Define transfer owners as labels without row identities: rejected because exactly-once replay could not prove which purchase value moved to which housing financial owner.

## Required authority amendment set after approval

Independent approval must identify each accepted decision ID. Only then should a separate change update the frozen/runtime authorities as one coherent revision:

1. Adopt CCP-01 exact filenames in every older authority and preflight reference.
2. Replace cancellation cardinality and amount/currency rules with CCP-02, including the new charge effect kind.
3. Replace homestay `sourceReceivableId` with `sourceLedgerEntryId` and its balance/source rules from CCP-03.
4. Replace property-mode unit CAS ownership with operation-config ownership from CCP-04.
5. Add explicit housing currency ownership, legacy-CNY ratification, and propagation from CCP-05.
6. Define aggregate handover deduction identity/cardinality from CCP-06.
7. Name the three housing audit owners, exact unique constraints, and transfer owner semantics from CCP-07.
8. Regenerate the schema-owner review and formal migration reservation evidence against the amended authorities before either migration file is created.

Approval must not be inferred from implementation, an existing migration number, or this proposal's presence. Partial approval is allowed only when the corresponding migration remains blocked on every unapproved dependency.

## Implementation boundary if later approved

The smallest forward-compatible implementation would place homestay-only schema changes in canonical 000191 and housing/audit schema changes in canonical 000192, while property-mode authority/runtime alignment is implemented in the relevant shared-property runtime without inventing a second unit-owned state. Migration SQL must be additive and forward-only, must fail loudly on incompatible legacy data, and must not silently synthesize approval keys for existing domain rows.

Before implementation, the independently approved authority revision must specify exact DDL column types, FK/constraint names, and per-action effect tables. Before promotion, the project must separately complete migration-number reservation, generated-artifact validation, lint, type-check, targeted tests, and the applicable release gates. None of those gates is claimed by this research proposal.
