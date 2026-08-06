# B-2a C2 Worst-path Dominance / Equivalence Mapping Candidate

> Date: 2026-08-01 (Asia/Singapore)
>
> Status: `CANDIDATE / ARCHITECTURE + PRODUCT + TEST SIGNATURES PENDING / NOT CONSUMED`
>
> Release: none. This document does not sign C2, release C3/C4, or replace the
> signed projection-budget addendum.

## 1. Decision boundary

The current C2 runner must execute all eight signed actions independently and
record each action as `representative_or_self=self`. Therefore it does not need
an equivalence waiver and must set `equivalence_mapping_status=not-required-all-eight-executed`.

This candidate only describes the smallest mapping that could be signed later
if reviewers choose to reduce repeated C2 fixture measurements. Until the three
reserved signatures below are complete, no runner or handoff may cite this file
as a signed `equivalence_signature_ref`.

The detached canonical candidate is
`b2a-c2-worst-path-dominance-equivalence-mapping-v1.json`. Its detached manifest
owns the raw SHA and byte length so the canonical file does not contain a
self-referential hash. The canonical artifact contains the three signed budget
identity hashes, exact eight-action scope, and separate `sql_sequence`, `locks`,
`payload`, `writes`, `transaction`, `deadline`, and `fault` dominance records;
each record names representative, mapped set, comparison, dominance verdict and
evidence. It also retains per-action positive/negative/measurement residuals,
explicit `pending_C4`/`pending_B2c` exclusions and three-party dispositions.

```text
canonical_mapping_raw_sha256=9533d059976416486b85996b66c2c8670b39ced7e0521b9c758b6e7cabe4ceeb
canonical_mapping_byte_length=6880
mapping_signature_status=pending
```

## 2. What the C2 fixture proves

For each of the eight action identifiers, the isolated C2 fixture can prove:

- the exact `fn_property_task_projection_replace_v1` action/mode/result-reference
  branch accepts its matching 200-row canonical snapshot and rejects the signed
  neighboring mismatches;
- the same receipt table, projection head, projection replacement, immutable
  replacement audit and receipt-completion database path executes inside one
  transaction;
- the final database row-count guard, row validation, lock waits, rollback,
  commit-ambiguity recovery and database-side five-second evidence grammar;
- action-specific result-version, result-reference, row-status and source-version
  constraints at the function and direct-row CHECK layers.

The fixture does not prove production controller/service work, real source
resolver cost, owning assignment mutation cost, production authorization,
adapter cardinality, network topology, production pool contention or all C4
call-site deadlines.

In particular, production controller/service/receipt-port behavior, RBAC and
scope, authority mutation and global lock order, the real transaction chain and
remaining-budget propagation, all eight production callsites and HTTP replay
are excluded from dominance and remain `pending_C4`.

```text
production_full_action_deadline_status=pending_C4
production_caller_deadline_status=pending_C4
real_adapter_admission_status=pending_B2c
```

## 3. Proposed dominance classes

The proposed mapping is intentionally narrow and only concerns the common C2
database-function fixture. It cannot be reused for C4 production full-action
evidence.

| Class | Proposed representative | Mapped actions | Exact C2 dominance argument |
|---|---|---|---|
| Manual rebuild | `property.task.rebuild` | itself | `manual-rebuild`, source target, 200 canonical rows, receipt + head + delete/insert + immutable audit + completion. No other action is mapped to it. |
| Ordinary command | `property.task.block` | `claim`, `start`, `block`, `unblock`, `release` | In the C2 fixture all five use `authority-sync`, task target, the same 200-row payload size, identical receipt/head/projection/audit writes and identical lock order. `block` carries the strongest nullable-field population (`blockedReason`) but every mapped action must retain its own functional positive and negative branch cases. |
| Source terminal | `property.task.source-terminal.closed` | `closed`, `cancelled` | Both use `authority-sync`, source target, 200 terminal rows, outcome fields, receipt/head/projection/audit writes and the same locks. Each terminal must retain its own status/result-reference/source-version positive and forged negative cases. |

The mapping is invalid if SQL text, lock order, row count, durable writes,
receipt grammar, action-specific validation, or transaction boundary differs
for any mapped action. A C4 production caller is presumed different until C4
independently proves otherwise.

## 4. Required signed grammar if mapping is adopted

The minimal downstream addendum would be the raw SHA-256 of this exact file,
plus a canonical mapping digest over UTF-8/LF-only bytes:

```text
b2a-c2-worst-path-equivalence-v1\n
manual\tproperty.task.rebuild\tproperty.task.rebuild\n
command\tproperty.task.block\tproperty.task.claim,property.task.start,property.task.block,property.task.unblock,property.task.release\n
terminal\tproperty.task.source-terminal.closed\tproperty.task.source-terminal.closed,property.task.source-terminal.cancelled\n
scope\tC2-function-fixture-only\n
c4\tpending_C4\n
b2c\tpending_B2c\n
```

No descriptive label, function name, or test-fixture string may substitute for
the signed raw-file SHA and canonical mapping digest. If this addendum is not
signed, all eight C2 measurements remain mandatory.

## 5. Reserved independent signatures

| Reviewer | Required review | Status | Signature / immutable SHA |
|---|---|---|---|
| Architecture / Database | SQL, locks, durable writes and transaction dominance | pending | pending |
| Product / RBAC / Interaction | action semantics and C4/B-2c non-claims | pending | pending |
| Test / Security | per-action retained cases, evidence grammar and fail-closed behavior | pending | pending |

```text
open_P0_P1=not_computed
equivalence_mapping_signable=not_computed
equivalence_mapping_release=blocked
C2_candidate_status=pending
```
