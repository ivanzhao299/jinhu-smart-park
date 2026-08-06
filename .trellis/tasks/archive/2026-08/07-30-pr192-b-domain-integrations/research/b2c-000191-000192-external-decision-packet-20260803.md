# 000191/000192 External Decision Packet

Status: **DRAFT SUPERSEDED BY TECHNICAL NO-GO / DO NOT APPROVE AS WRITTEN**

Date: 2026-08-03

Authoritative proposal: `b2c-000191-000192-contract-change-control-proposal-20260803.md`

Proposal SHA-256: `8709056ad1d24efe79969220f89df646ef3c2a7f8dbdaf7bb9c09c0b6e2bda04`

This packet originally recorded the minimum human decision thought necessary to unblock the forward-only
000191/000192 migrations. It is not an approval, signature, migration-number
reservation, or release claim. A decision is valid only when it names every accepted
or rejected CCP ID and identifies the accountable decision maker. Silence, continued
implementation instructions, technical test success, and the presence of this file do
not constitute approval.

The independent database and QA/security review subsequently found unresolved P0/P1
contract gaps. See `b2c-000191-000192-independent-technical-review-20260803.md`.
Consequently, the blanket approval response below is withdrawn and must not be used
until a revised proposal receives technical GO.

## Decisions requested

| ID | Proposed decision | Why explicit acceptance is needed | Blocking scope |
| --- | --- | --- | --- |
| CCP-01 | Use `000191_property_b_homestay_effect_schema.sql` and `000192_property_b_housing_effect_schema.sql` as the only canonical filenames. | Changes frozen/preflight authorities and migration identity. | Both migrations |
| CCP-02 | Freeze the real atomic homestay cancellation effects: one booking cancellation plus optional positive room-waiver and cancellation-fee ledger lines. | Changes the frozen business-effect cardinality and introduces the charge effect kind. | 000191 and homestay adapter |
| CCP-03 | Replace nonexistent homestay `sourceReceivableId` with `sourceLedgerEntryId`; add ledger source linkage and currency ownership. | Corrects the public/runtime identity and financial source model. | 000191 and homestay adapter |
| CCP-04 | Make `biz_property_operation_config` the property-mode source and versioned CAS owner; keep `unit:{unitId}` only as the human/domain line key. | Changes the frozen source identity and concurrency owner. | 000191 and property-foundation adapter |
| CCP-05 | Ratify all legacy housing monetary data as CNY; add immutable owner/child currency columns and propagation constraints. | This is an irreversible product/data interpretation of rows that currently contain no currency. | 000192 and housing adapter |
| CCP-06 | Keep one aggregate handover deduction; use `handoverId` as the single deduction identity and do not add deduction items. | Freezes product cardinality and replay identity. | 000192 and housing adapter |
| CCP-07 | Add three domain-specific housing audit tables and use the resulting receivable as purchase-transfer `toOwner`. | Selects persistent audit ownership, physical FKs, and transfer semantics. | 000192 and housing adapter |

## Withdrawn response template

Do not use the following template against the current proposal. It is retained only to
show the intended audit shape after technical closure:

1. `APPROVE CCP-01, CCP-02, CCP-03, CCP-04, CCP-05, CCP-06, CCP-07 as proposed.`
2. `REJECT CCP-<IDs>` followed by the replacement decision for each rejected ID.
3. A mixed decision that explicitly lists every approved and rejected ID.

The response must also identify:

- decision maker name or durable account identity;
- decision-maker role/authority (product, data, finance, architecture, or delegated owner);
- decision timestamp and timezone;
- for CCP-05, confirmation that legacy housing financial data may be backfilled as CNY.

## Execution boundary after approval

After a complete valid decision, the technical owner may amend the frozen/runtime
authorities as one coherent revision, regenerate the schema-owner review, rescan the
filesystem and both migration-history tables, atomically reserve both exact filenames,
and only then author the forward-only migrations. No SQL file, adapter, seed, or data
backfill may be created from this packet alone.

## Current evidence status

- 000197 PostgreSQL 16 formal regression: GO in v31.
- CCP technical database review: NO-GO; proposal revision required.
- CCP QA/security review: NO-GO; proposal revision required.
- External/product/data decision: absent.
- 000191/000192 formal reservation: absent by design.
- 000191/000192 implementation authorization: blocked.
