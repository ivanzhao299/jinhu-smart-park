# B-2a C2 Property-task Projection Budget Addendum Final Signoff

> Date: 2026-08-01 (Asia/Singapore)
>
> Conclusion: `B2A C2 PROJECTION BUDGET ADDENDUM = PASS`
>
> Release: `C2_v7_owner_only`

## 1. Immutable signed identity

All three independent reviewers signed the same immutable v3 candidate and
candidate evidence:

| Signed item | Exact identity |
|---|---|
| Candidate | `b2a-c2-projection-budget-addendum-candidate.md` |
| Candidate raw SHA-256 | `127d8574978bf6719a4fe9a7865e5c99333fa3dfd93c8e3f0dcccc17d152c0b4` |
| Candidate evidence | `b2a-c2-projection-budget-addendum-candidate-evidence.md` |
| Candidate evidence raw SHA-256 | `38ebd4148083f3439a3456079ecc77a9aff1da41a19d113f61c90d30cd5499c0` |
| Canonical grammar | `b2a-c2-projection-budget-addendum-v3` |
| Canonical budget digest | `d86fc62ec471ec85f7fcc1e7dbf74093b6c9cf5deeb5d93f8b08038a03c6cc45` |
| Canonical grammar byte length | `1692` |

The unique-marker extraction, literal ASCII `<TAB>` to byte `09` replacement,
canonical digest, byte length, and full hex were independently recomputed. A
change to either signed raw file invalidates this signoff.

## 2. Independent review verdicts

| Independent perspective | P0 | P1 | P2 | Verdict |
|---|---:|---:|---:|---|
| Architecture / Database | 0 | 0 | 0 | PASS |
| Test / Security | 0 | 0 | 1 | PASS WITH NON-BLOCKING P2 |
| Product / RBAC / Interaction | 0 | 0 | 1 | PASS WITH NON-BLOCKING P2 |

```text
open_P0_P1 = []
addendum_signable = true
budget_addendum_gate = PASS
```

The only P2 is a non-blocking wording/count typo in the candidate's final
review section: the numbered list contains 12 dispositions while its closing
sentence says “all eight dispositions.” For this signoff, that sentence is
authoritatively interpreted as “all 12 listed dispositions were independently
reviewed and accepted.” The candidate bytes are intentionally unchanged to
preserve the identity all reviewers recomputed and signed.

The phrase “same receipt” is likewise not interpreted as forbidding a lawful
physical receipt insert. Its authoritative signed meaning is
`same-logical-identity signed-mode recovery`: ordinary command/manual use the
signed `execute-or-replay` mode; terminal flow selects `execute-or-replay` or
`existing-only` after the signed lock-and-state predicate; completed exact
identity replays and started/failed or invalid existing-only cases fail closed.
No different logical identity or second business action is permitted.

## 3. Accepted budget contract

The reviewers accepted the v3 contract in full, including:

- a newly signed property-task projection budget rather than an inherited
  runtime-freeze budget;
- complete-source maximum 200 rows with adapter admission, C4 prospective
  caller guard, and final `000194` function guard;
- migration `lock_timeout=5s` and `statement_timeout=60s` separated from the
  absolute 5s runtime transaction acknowledgement deadline;
- exactly 20 predeclared and recorded positive attempts per action/worst path,
  zero exclusion and replacement, raw monotonic nanosecond hard enforcement,
  and diagnostic-only nearest-rank p95/max;
- the eight action paths, independently signed worst-path equivalence rules,
  separate negative injections, five frozen markers/SQLSTATE values, complete
  rollback evidence, and committed/not-committed ambiguous recovery;
- the v3 machine evidence schema, snapshot hash grammar, environment identity,
  per-object pre/post counts and hashes, stage/access markers, exact cleanup
  targets, pending states, and review fields;
- fail-closed behavior without partial source replacement, automatic budget
  enlargement, public API drift, or a second logical business action.

## 4. C2 consumption and DAG

This PASS releases only the unique C2 v7 implementation/evidence owner to bind
both the signed candidate raw SHA and canonical budget digest into the next
`000194` migration/runner/catalog/function candidate and rerun the complete C2
Gate.

The owner split remains exact:

| Owner/phase | Signed responsibility | Current status |
|---|---|---|
| C2 schema migration owner | `000194` final 200-row function guard and migration 5s/60s settings | released for v7 candidate only |
| C2 schema Gate runner owner | absolute deadline, exact attempts, fault/rollback/ambiguity matrix and machine evidence | released for v7 candidate only |
| C4 task runtime owner | production caller deadline, prospective guard, receipt-mode recovery and eight call-sites | `pending_C4` |
| B-2c domain adapter owners | real adapter complete-source cardinality admission before registration/enabling | `pending_B2c` |

```text
C2_v7_owner_release = allowed
C2_gate = not_passed
C3_release = blocked
C4_release = blocked
production_caller_deadline_status = pending_C4
real_adapter_admission_status = pending_B2c
```

This signoff does not claim that `000194`, the v7 runner, C2, B-2a, C3, C4,
Track B, Track C, production migration, or browser/UAT has passed.

## 5. C1 no-resign condition

The three reviewers accepted `C1 re-sign not required` only while every
C1-reviewed input raw SHA remains byte-for-byte unchanged. This downstream
addendum does not enter B-contract-v2, shared source, endpoint manifest, error
filter, HTTP leak contract, or another C1 input.

If any C1 input changes to incorporate or implement this budget, this condition
immediately fails: affected digests must be recomputed and the complete C1
independent Gate repeated before C2 may resume.

## 6. Supersession

All v1/v2 candidate identities and disputed intermediate digests, including
`2793566d...`, `192ae...`, and v2 `50db98c0...`, are permanently superseded and
must not be consumed by C2. Only the v3 raw identities and canonical digest in
section 1 are signed.
