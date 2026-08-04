# 000191/000192 Independent Technical Review

Status: **NO-GO / PROPOSAL REVISION REQUIRED**

Date: 2026-08-03

Reviewed proposal SHA-256:
`8709056ad1d24efe79969220f89df646ef3c2a7f8dbdaf7bb9c09c0b6e2bda04`

Reviewers:

- database review: `v16_db_review`;
- QA/security review: `v16_qa_review`.

This artifact consolidates their independent findings. It is a technical review, not a
product, finance, data, UAT, migration, or release signature. No finding was fixed as
part of the review.

## Disposition

| ID | Database review | QA/security review | Consolidated disposition |
| --- | --- | --- | --- |
| CCP-01 | NO-GO, P1 | Directional GO, P1 | NO-GO until a new superseding authority/current-only locator is defined; frozen historical artifacts must not be edited. |
| CCP-02 | NO-GO, P1 | NO-GO, P0 | NO-GO until the submission evaluation instant, ledger-source snapshot/locks, occupancy release, and credential revocation are part of the frozen manifest and execution drift rules. |
| CCP-03 | Conditional GO, P1 | NO-GO, P0 | NO-GO until source version/immutable snapshot, cumulative balance allocation, legacy unlinked rows, same-scope self-FK prerequisites, and locking across every refund/waiver path are frozen. |
| CCP-04 | GO | Conditional GO, P1 | Conditional GO: freeze concurrent config pre-creation, exact source fields, and the execution-time no-create/no-substitute rule in the superseding authority. |
| CCP-05 | NO-GO, P0+P1 | NO-GO, P0 | NO-GO. Legacy CNY cannot be inferred; an accountable product/finance/data decision and a superseding authority that explicitly permits the backfill are mandatory. |
| CCP-06 | NO-GO, P0+P1 | NO-GO, P0 | NO-GO until approval submission can name a stable handover identity/version and deterministic checkout receivable. Choose pre-creation or a deterministic-ID lifecycle before freezing the line key. |
| CCP-07 | NO-GO, P0+P1 | NO-GO, P0 | NO-GO until every purchase item has a frozen expected-version CAS/resulting version and the target-receivable model is chosen. Exact transition constraints, nullability, and composite FKs must also be frozen. |

Cross-cutting P1 findings:

- publish new superseding authorities; do not mutate immutable frozen evidence;
- correct the baseline authority path/name and bind the revision to a new current-only
  locator and promotion handoff;
- perform a fresh filesystem plus dual-history scan and atomic reservation only after
  the revised proposal is independently approved.

## Human decisions still required

Technical revision cannot decide these business/data semantics:

- CCP-02: which cancellation instant owns the fee evaluation and whether occupancy and
  credential revocation remain atomic cancellation effects;
- CCP-03: eligibility and allocation policy for legacy/unlinked refund and waiver data;
- CCP-05: whether every legacy housing monetary row may be interpreted and backfilled
  as CNY;
- CCP-06: whether move-out handovers are pre-created before approval submission or use
  a deterministic identity lifecycle;
- CCP-07: whether purchase transfer creates one receivable per item or freezes one
  aggregate/existing target receivable before execution.

Until those decisions and a revised technical GO exist, 000191/000192 creation,
reservation, backfill, and dependent domain adapters remain blocked.
