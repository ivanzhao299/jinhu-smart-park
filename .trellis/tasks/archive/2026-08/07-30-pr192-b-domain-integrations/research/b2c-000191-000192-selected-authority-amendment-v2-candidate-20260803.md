# 000191/000192 Selected Authority Amendment v2 Candidate

Status: **CANDIDATE / TECHNICAL-GO INPUT / EXTERNAL IDENTITY BLOCKED / NOT CURRENT / NO RESERVATION / NO IMPLEMENTATION AUTHORITY**

Date: 2026-08-03

This candidate selects DEC-01..06 branch A from the frozen contract change-control
proposal. It is reviewable technical input only. It does not replace the current-only
authority locator, reserve a migration number or filename, authorize SQL or backfill,
or satisfy external identity and role verification.

## Frozen inputs

| Input | SHA-256 |
| --- | --- |
| `b2c-000191-000192-contract-change-control-proposal-v2-20260803.md` | `85c081a87aebc25ba70931ebf55571bb1d76af705f75d6bd27fb8216c84feb0b` |
| `b2c-000191-000192-contract-change-control-v2-technical-signoff-20260803.md` | `d1fcae68a1d25aa9068fb1194700024077504604c7970bc0d17d527a7df7dc86` |
| `b2c-000191-000192-external-decision-receipt-v1-20260803.md` | `1c8e670111523222dcbc2a7f6897cfa87b88d125deadd54b6df1cf88e034a152` |
| Parent runtime effect authority | `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf` |
| Parent product/access authority | `d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040` |
| Parent contract current freeze | `671ebcc86c9c49a6f6f9dbf2818ee1646c3a814a4b3d3329cfa09bbb6f705f10` |
| Successful 000197 v31 execution authority | `5d72c08ff5b4324b7477b7e61dbe6b119557370fd2c0c3258b42404cf76648bf` |
| Successful 000197 v31 terminal | `8b0a8755b4c5f3fba826ef0d62b2d1a6e5716f72c9457c8f90610d75cce9c0a4` |
| Successful 000197 v31 evidence manifest | `d7c1ea328db43f3db05365df6f9f7e6b3e49ed5d7b9382ebfc287f33e911fad7` |

The proposal SHA above is normative in full for mandatory technical invariants, lock
ordering, schemas, candidate keys/FKs, cardinality, failure handling, reservation
gates, adapter tests, and UAT. This amendment removes all unselected alternatives; it
does not weaken or summarize away any normative requirement in that frozen input.

## Selected contracts

### DEC-01 A — atomic homestay cancellation

Freeze PostgreSQL `transaction_timestamp()` as `cancellationEvaluationAt` at approval
submission. One `homestay.booking.cancel` compound effect owns exactly one booking CAS,
one action log, the frozen 0-or-1 occupancy release CAS, and every frozen issued
credential void CAS. Freeze the confirmed-ledger contributor set and evaluate waiver
and cancellation fee from that snapshot and timestamp. Positive waiver and fee lines
remain separate financial effects; `homestay.ledger.charge` is allowed. Any identity,
version, status, cardinality, amount, or contributor-set drift rejects execution.

### DEC-02 A — quarantine unresolved legacy homestay finance

Use `sourceLedgerEntryId`, not a receivable alias. New refunds reference a confirmed
payment source; new waivers reference a confirmed charge source. Existing unlinked
legacy refund/waiver rows remain immutable and may be related only through the exact
append-only `biz_homestay_legacy_finance_source_map` owner defined by the proposal.
Available balance is the exact disjoint union of direct and mapped confirmed active
results under the locked source. A booking with any unmapped legacy result rejects new
approval finance with `legacy-finance-source-unresolved`; no source is guessed.

### DEC-03 A — CNY legacy housing currency

Treat every in-scope legacy housing monetary lifecycle as CNY and backfill owner and
child currency through 000192 only after the complete orphan, cross-scope, mixed-
lifecycle, and invalid-data preflights in the proposal pass. Enforce non-null and
same-scope/same-currency relationships after validation. No JavaScript number may
carry a monetary value.

### DEC-04 A — pre-created draft move-out handover

Before approval submission, lock the lease and find-or-create the unique active draft
move-out handover. Freeze handover ID/version, lease ID/version, amounts, attachment
and item snapshot hashes, database submission timestamp/business date, ledger
contributors, and exactly one existing-or-new checkout receivable mode with its target
ID/version or verified absence/reserved ID. Execution must use those identities and
CAS exactly one handover and one lease, write one lease-effect audit, and apply the
frozen 0-or-1 receivable effect. It may not switch modes or substitute a row.

### DEC-05 A — aggregate purchase-transfer receivable

Freeze one aggregate target receivable for the batch, the purchase expected version,
every sorted item ID/expected version/amount/currency/null owner, and aggregate delta.
Execution increments the purchase source version once, performs one exact CAS and one
`biz_housing_purchase_transfer_effect_audit` insert per item, and creates or CAS-
increments the frozen receivable through one
`housing.receivable.purchase-transfer` financial effect. Every item names the same
target receivable and purchase resulting version.

### DEC-06 A — terminal-safe purchase lifecycle

The only new transitions are:

| Transition | Before | After |
| --- | --- | --- |
| approve | `draft / unpaid` | `approved / unpaid` |
| reject | `draft / unpaid` | `rejected / unpaid` |
| pay | `approved / unpaid` | `approved / paid` |
| refund | `approved / paid` | `approved / refunded` |
| void-draft | `draft / unpaid` | `void / unpaid` |
| void-approved | `approved / unpaid` | `void / unpaid` |
| void-rejected | `rejected / unpaid` | `void / unpaid` |

`rejected`, `void`, and `refunded` are terminal. In particular, a refunded purchase
cannot subsequently be voided. Same-key replay returns the already recorded effect
without executing another transition. Refund and void reject transferred items.

## Exact authority replacements

Once externally verified and promoted by a distinct immutable handoff, the selected
amendment replaces only these parent authority subjects:

1. migration filenames become
   `000191_property_b_homestay_effect_schema.sql` and
   `000192_property_b_housing_effect_schema.sql`;
2. homestay cancellation becomes the DEC-01 compound contract and homestay finance
   becomes the DEC-02 source-ledger/mapping contract;
3. property mode sources are owned by `property-operation-config` with config ID,
   expected version, `operating_mode`, and `operating_status`, including the exact
   absent-row advisory-lock initialization contract from proposal section 4;
4. housing currency, handover, purchase transfer, and purchase lifecycle become
   DEC-03 A through DEC-06 A;
5. the three exact housing audit owners and all exact checks, uniques, scope/currency
   candidate keys and composite RESTRICT FKs are those in proposal section 4.1;
6. the complete PostgreSQL, adapter, failure, authorization, and UAT matrix is proposal
   section 6.

Every other parent-authority rule remains unchanged. The successful 000197 v31 chain
is evidence input and must not be edited, rerun, or represented as an authorization
for 000191/000192.

## Promotion gates

Promotion to current requires all of the following, with no inferred evidence:

- a decision record accepted by the frozen validator against a byte-frozen trusted
  signer directory and its SHA-256;
- durable issuer/evidence references and verified delegation for every represented
  role;
- explicit product, finance, data, homestay-domain, housing-domain, and audit/security
  role coverage as required by DEC-01..06;
- independent database, QA/security, and finance review of the final frozen candidate
  with `open_P0_P1=[]`;
- a new immutable promotion handoff and current-only locator.

Only after promotion may the unique schema-migration owner perform a fresh filesystem,
worktree, and dual-history scan and atomically reserve both exact filenames. Migration
or seed authoring, CNY backfill, domain adapters, UAT sign-off, and production enforce
remain prohibited before that reservation and their later gates.

## Current blocker

The recorded Codex messages prove the six branch selections and the named signer's
assertion that they represent product/finance/data. They do not provide a trusted
signer directory, issuer/evidence proof, independently verified delegation, separate
homestay/housing domain authority, or audit/security authority. This candidate must
therefore remain non-current.
