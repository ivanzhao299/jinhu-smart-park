# B-2a C2 Property-task Projection Budget Addendum Candidate

> Date: 2026-08-01 (Asia/Singapore)
>
> Status: `CANDIDATE / THREE-PARTY SIGNATURE PENDING / NOT PASS`
>
> Scope: downstream B-2a C2/C4 clarification only. This candidate does not
> modify a signed C0/C1 input and does not release C2, C3, or C4.

## 1. Authority and origin

This addendum creates a new, explicit budget for the B-2a property-task
projection replacement path. The signed runtime freeze's 200-row
notification-projection/delivery batch and five-second worker transaction are
design references only; they did not already govern property-task projection.
The addendum does not claim inheritance from that freeze.

The physical addendum independently governs migration execution. Its
`lock_timeout='5s'` and `statement_timeout='60s'` remain migration settings,
not runtime replacement allowances. The new property-task values below require
their own three-party signature because the C0 plan makes an unfrozen budget a
C2 stop-ship.

## 2. Proposed exact fields

| Field | Exact value | Meaning |
|---|---:|---|
| `budget_origin` | `new-property-task-projection-addendum` | New downstream budget; not runtime-freeze inheritance. |
| `migration_lock_timeout_ms` | `5000` | `000194` migration transaction only; `SET LOCAL lock_timeout='5s'`. |
| `migration_statement_timeout_ms` | `60000` | `000194` migration transaction only; `SET LOCAL statement_timeout='60s'`. |
| `projection_replace_batch_max_rows` | `200` | Maximum complete-source prospective projection set accepted by adapter, caller, and database function. |
| `projection_replace_transaction_limit_kind` | `hard` | Successful acknowledgement deadline is a hard ceiling, not p95. |
| `projection_replace_transaction_hard_limit_ms` | `5000` | Absolute monotonic deadline from transaction begin dispatch through success/commit acknowledgement. |
| `c2_gate_outer_watchdog_ms` | `60000` | Harness cleanup/deadlock watchdog only; never a successful runtime allowance. |

The 200 and 5,000 values deliberately adopt conservative values already used
elsewhere in the signed platform design, but their authority here comes only
from a future signature of this addendum. The 60,000 migration statement
timeout remains separate because migration DDL/catalog work is not a runtime
projection replacement.

## 3. The 200-row admission contract and dual guard

The limit counts the final top-level elements of the complete canonical
projection-row array for one `(tenant_id, park_id, source_type, source_id)`.
Partial replacement commits are prohibited.

### 3.1 Adapter admission

Before any real source adapter is registered or enabled, B-2c must prove its
maximum complete-source prospective projection set is `<=200` under its signed
domain cardinality. If it cannot prove that bound, the adapter remains disabled
and unregistered; fixture evidence cannot enable it. Any future domain change
that can exceed 200 invalidates admission until a new signed budget/design is
approved.

### 3.2 C4 caller guard

For manual rebuild and every authority-sync action, the production caller must
follow the signed global lock order, lock and re-read the source/assignment and
projection head, then compute the complete prospective set. Before authority
mutation or receipt completion it must reject a prospective count over 200.
The caller may not pre-slice, paginate, or partially commit one source to evade
the limit.

If the complete set becomes larger than 200 only after a concurrent/authority
mutation or final reconstruction, the entire transaction rolls back, including
authority mutation and receipt state. This C4 caller behavior is
`pending_C4`; C2 cannot report it as implemented.

### 3.3 `000194` function guard

The unique `000194` replacement function must:

1. validate the input is the required top-level object/array shape;
2. evaluate `jsonb_array_length` on the final projection array;
3. reject a value greater than 200;
4. do all three before receipt lookup/acquisition, head access, projection DML,
   replacement audit, or any other durable mutation.

The function is the final database guard; caller and adapter checks do not
replace it. A post-authority-mutation function rejection remains inside the
same transaction and rolls the whole transaction back. Zero through 200 rows
remain valid when all other signed invariants pass.

## 4. Deadline and commit-result semantics

### 4.1 Absolute deadline

C2's runner and C4's production caller use an absolute monotonic deadline:

```text
deadline_ns = begin_dispatch_monotonic_ns + 5_000_000_000
remaining_ms = floor((deadline_ns - now_monotonic_ns) / 1_000_000)
```

Before every blocking database operation they reject a non-positive remaining
budget and set statement/lock timeout to no more than the current positive
remaining budget. A fresh 5s timeout must never be restarted after lock wait or
another statement. Raw monotonic nanoseconds are the hard-Gate authority;
rounded milliseconds and nearest-rank p95 are diagnostics only.

### 4.2 Failure before COMMIT dispatch

An oversize guard, expired deadline, forced lock/statement timeout,
cancellation, function error, late validation error, or any other failure
before COMMIT is dispatched must issue/observe rollback. Pre/post hashes and
row counts for authority, receipt, head, projection, assignment, and immutable
audit remain identical; no completed receipt exists.

### 4.3 Result after COMMIT dispatch

After COMMIT is dispatched, timeout, disconnect, cancellation, or missing
acknowledgement is commit-ambiguous. The caller must not assert rollback and
must recover the same logical identity under the signed receipt mode selection:

- ordinary command and manual rebuild use `execute-or-replay`; a genuinely
  absent physical receipt may be inserted by that mode;
- terminal flow re-locks and re-reads authority: active source state selects
  `execute-or-replay`, while the exact same terminal state selects
  `existing-only`;
- an exact completed receipt replays; `started` or `failed` fails closed;
  `existing-only` absent also fails closed.

The prohibition is a different logical identity or a second business action,
not physical receipt insertion. Recovery preserves the exact tenant, park,
actor/service principal, action, target, client key, request hash and
payload/rowset hashes required by the selected mode.

A success acknowledgement observed after the five-second deadline is still a
Gate failure, but it does not undo or deny an already committed transaction.
Recovery returns the existing receipt/result under current API rules; database
or timing detail remains hidden.

## 5. Action scope and required measurements

The budget applies independently to these exact eight paths:

1. `property.task.rebuild` (`manual-rebuild`)
2. `property.task.claim`
3. `property.task.start`
4. `property.task.block`
5. `property.task.unblock`
6. `property.task.release`
7. `property.task.source-terminal.closed`
8. `property.task.source-terminal.cancelled`

C2 must produce separate evidence for every action, or a three-party-signed
worst-path equivalence mapping that names the representative, proves its SQL,
locks, payload and writes dominate every mapped action, and still retains one
functional positive/negative case per mapped action.

For each measured action/worst path, the runner predeclares exactly twenty
positive measured attempt ordinals after at least five warm-ups. It executes
those exact ordinals once each and records all of them. It may not replace,
rerun, discard, relabel, or filter an attempt. Each attempt records
`ordinal/start_ns/end_ns/duration_ns/outcome/deadline_exceeded/commit_dispatched/
ack/receipt`.

The positive acceptance counts are exact:

```text
declared_attempts=20
recorded_attempts=20
excluded_attempts=0
replacement_attempts=0
```

All twenty must be successful 200-row acknowledgements at or before the
absolute deadline. Any unexpected timeout, cancellation, SQL error, missing
acknowledgement, commit ambiguity, or late acknowledgement immediately fails
the Gate; the attempt remains recorded with its real outcome. Nearest-rank p95
uses all twenty durations as `sorted_durations[ceil(0.95*20)-1]`; max also uses
all twenty. Both remain diagnostic because the raw nanosecond hard deadline
governs pass/fail.

Negative tests are separate injections with unique `injection_id`; they never
occupy or replace a positive ordinal. They must prove 200/201 bounds, forced
lock timeout, forced late pre-COMMIT rollback, post-authority oversize complete
rollback, and COMMIT-dispatched ambiguity for both actually committed and
actually not-committed outcomes. Ambiguous recovery must use the exact logical
identity and signed acquire mode and create no second logical business action.

## 6. Frozen fault-injection points

The following marker, location, and expected SQLSTATE are exact. A different
fault location or SQLSTATE cannot satisfy the case:

| `injection_id` / marker | Exact injection point | Expected SQLSTATE | Required proof |
|---|---|---|---|
| `oversize-preaccess` | After top-level/object validation and final array count, before receipt or head access. | `22023` | Receipt access=0, head access=0, all durable object deltas=0. |
| `forced-lock-delete-replace-wait` | A blocker holds the exact row/range needed by projection `DELETE`/replacement write; measured transaction waits at that statement until remaining-budget lock timeout. | `55P03` | Blocker/waiter timeline and full rollback. |
| `late-precommit-after-projection-head-audit` | After projection rows, head and replacement audit are written, but before receipt completion and before COMMIT dispatch. | `P0001` | All writes and authority mutation roll back; COMMIT was not dispatched. |
| `post-authority-oversize` | After owning authority mutation creates a 201-row prospective set; final function guard rejects in the same transaction. | `22023` | Authority, assignment, receipt, head, projection and audits all roll back. |
| `commit-ambiguous-after-dispatch-link-cut` | Only after COMMIT bytes are dispatched, then the connection is severed before acknowledgement. | `08006` | Separate committed/not-committed outcomes; exact identity, locked state, acquire mode, receipt insert count and new logical action count. |

For commit ambiguity, `08006` is the expected client-visible connection-failure
SQLSTATE. Server truth must be established through same-identity recovery, not
inferred from the transport error.

## 7. Owner and DAG split

| Phase/owner | Required responsibility | Not allowed to claim |
|---|---|---|
| C2 `schema-migration-owner` | `000194` final 200-row function guard; migration 5s/60s settings; exact catalog/function evidence. | Production caller deadline or adapter admission. |
| C2 `schema-gate-runner-owner` | Fixture absolute monotonic deadline; remaining-budget timeouts; 200/201, lock, late rollback, ambiguous-recovery evidence; action/worst-path matrix. | C4 production implementation. |
| C4 `task-runtime-owner` | Production caller prospective-count guard, absolute deadline, same-receipt commit-ambiguous reconcile, all eight call-sites. | Adapter enablement without B-2c proof. |
| B-2c domain adapter owners | Per-adapter complete-source cardinality proof; keep unproved adapters disabled/unregistered. | Raising/splitting the budget. |

C2 signoff must explicitly record
`production_caller_deadline_status=pending_C4` and
`real_adapter_admission_status=pending_B2c`. Passing C2 does not release those
claims.

## 8. Required evidence schema

The C2 machine-readable artifact must include, at minimum:

```text
schemaVersion
runId
startedAt
finishedAt
baseCommit
contract.addendum_raw_sha256
contract.canonical_budget_digest
contract.input_raw_sha256
environment.container_image_reference
environment.container_image_digest
environment.postgresql_version
environment.cpu_model
environment.cpu_count
environment.ram_bytes
environment.os
environment.pg_settings.lock_timeout
environment.pg_settings.statement_timeout
environment.pg_settings.deadlock_timeout
environment.pg_settings.max_connections
environment.pg_settings.shared_buffers
deadline.limit_ns
deadline.clock
runner.raw_sha256
migration.raw_sha256
function.definition_sha256
fixture.raw_sha256
fixture.complete_source_rows
actions[].action
actions[].representative_or_self
actions[].equivalence_signature_ref
actions[].warmup_count
actions[].declared_attempts
actions[].recorded_attempts
actions[].excluded_attempts
actions[].replacement_attempts
actions[].attempts[].ordinal
actions[].attempts[].begin_dispatch_ns
actions[].attempts[].start_ns
actions[].attempts[].end_ns
actions[].attempts[].duration_ns
actions[].attempts[].deadline_ns
actions[].attempts[].deadline_exceeded
actions[].attempts[].outcome
actions[].attempts[].commit_dispatched
actions[].attempts[].ack
actions[].attempts[].receipt
actions[].attempts[].mode
actions[].attempts[].source_sha256
actions[].attempts[].head_sha256
actions[].attempts[].receipt_identity_sha256
actions[].attempts[].receipt_status
actions[].attempts[].payload_sha256
actions[].attempts[].rowset_sha256
actions[].attempts[].remaining_budget_ms
actions[].attempts[].lock_timeout_ms
actions[].attempts[].statement_timeout_ms
actions[].attempts[].stage_markers
actions[].attempts[].access_counts.receipt
actions[].attempts[].access_counts.head
actions[].nearest_rank_p95_ns_all_20
actions[].max_ns_all_20
negative_cases[].injection_id
negative_cases[].marker
negative_cases[].injection_point
negative_cases[].expected_sqlstate
negative_cases[].observed_sqlstate
negative_cases[].blocker_timeline
negative_cases[].stage_markers
negative_cases[].access_counts.receipt
negative_cases[].access_counts.head
negative_cases[].objects.authority.pre_count/post_count/pre_sha256/post_sha256
negative_cases[].objects.assignment.pre_count/post_count/pre_sha256/post_sha256
negative_cases[].objects.audit.pre_count/post_count/pre_sha256/post_sha256
negative_cases[].objects.head.pre_count/post_count/pre_sha256/post_sha256
negative_cases[].objects.projection.pre_count/post_count/pre_sha256/post_sha256
negative_cases[].objects.replacement_audit.pre_count/post_count/pre_sha256/post_sha256
negative_cases[].objects.receipt.pre_count/post_count/pre_sha256/post_sha256
negative_cases[].snapshot_hash_grammar
negative_cases[].rollback_proved
commit_ambiguous.cases[].truth
commit_ambiguous.cases[].locked_state
commit_ambiguous.cases[].acquire_mode
commit_ambiguous.cases[].logical_identity_sha256
commit_ambiguous.cases[].receipt_insert_count
commit_ambiguous.cases[].new_logical_action_count
commit_ambiguous.cases[].recovery_outcome
cleanup.container_absent
cleanup.volume_absent
cleanup.temp_files_absent
cleanup.errors
cleanup.exact_targets[].type
cleanup.exact_targets[].name
cleanup.exact_targets[].status
pending.production_caller_deadline_status
pending.real_adapter_admission_status
review.architecture_database
review.test_security
review.product_rbac_interaction
review.open_p0_p1
```

Snapshot hashes use one frozen artifact-declared grammar: object name, stable
column order, canonical value encoding, stable row sort keys, LF-only rows and
final LF. The artifact records that grammar text and its SHA. Container tags
alone are insufficient; a digest is required. Missing run identity/time,
hardware, PostgreSQL settings, exact attempts, remaining budgets, per-object
snapshots, stage/access markers, ambiguity modes/counts, exact cleanup targets,
pending-status, or review fields makes the artifact incomplete.

## 9. Failure and API/business boundaries

Budget failure is fail-closed. No owner may automatically enlarge a timeout or
batch, split one complete source, create a different logical identity, or
convert an ambiguous commit into a second business action. A selected
`execute-or-replay` may legitimately insert one physical receipt when the exact
identity is absent. A legitimate source that exceeds the budget remains
disabled/blocked until a new signed correction.

This addendum creates no route, permission, action, error code, DTO/response
field, task state, allowed action, receipt meaning, or domain effect. Existing
shared API, idempotency, replay, error filtering, and business contracts remain
authoritative.

## 10. C2 consumption and C1 re-sign

After independent signature, C2 migration, runner, catalog/function sidecars,
and final signoff must bind both the signed addendum raw SHA and canonical
budget digest. A raw/digest mismatch is stop-ship.

Recommended disposition remains `C1 re-sign not required` only if all three
reviewers classify this as a downstream C2/C4 addendum and every C1-reviewed
input raw SHA remains unchanged. If any B-contract freeze, shared source,
endpoint manifest, filter, HTTP contract, or other C1 input changes, that
disposition is invalid and the complete C1 independent Gate must be repeated.

## 11. Canonical signing grammar and exact extraction

Grammar source is the byte substring of this file strictly after the LF ending
the exact begin-marker line and strictly before the first byte of the exact
end-marker line. The extracted source therefore includes the LF after the final
`semantic` row. Replace every five-byte ASCII sequence `<TAB>` (`3c5441423e`)
with one byte `09`; perform no other normalization. Hash the resulting bytes.

The grammar source contains no literal TAB, CR, BOM, or trailing spaces. Input
order and field order are exact. The v6 performance artifact is intentionally
absent: it is non-authoritative candidate evidence, not a contract input.

<!-- B2A_C2_PROJECTION_BUDGET_GRAMMAR_BEGIN -->
b2a-c2-projection-budget-addendum-v3
input<TAB>runtime-freeze-raw<TAB>1c61c425b709b4155423d6fff1a39ce778e995ff96aef41135df2c410b15b27d
input<TAB>physical-addendum-raw<TAB>3830b12d665bbfb39c6e2747637ebd1592f7abfbe4d44af53c64aa123dd844d5
input<TAB>correction-plan-raw<TAB>b89de6a675e9afdf7490861f8600898d2658dd5c26be6469ad93fcfdd95f93da
input<TAB>c0-signoff-raw<TAB>192a036a4645244b1caee12ff2be240ca25bdfb95c5095514c9208e650eaa386
input<TAB>shared-handoff-raw<TAB>a9a9d7bbac595a852483774b2a7883055a925e36f621e26359670cffb0ca9371
input<TAB>b-shared-source<TAB>b4930006f4e9bef6f2976ab5b0e1a5127561cdb6576c464650ac82cf0864056a
input<TAB>c1-final-signoff-raw<TAB>1856d7a5903fc5022a6904e6e21c92be16056a84ef2250846b31fc7baa775056
budget<TAB>budget_origin<TAB>new-property-task-projection-addendum
budget<TAB>migration_lock_timeout_ms<TAB>5000
budget<TAB>migration_statement_timeout_ms<TAB>60000
budget<TAB>projection_replace_batch_max_rows<TAB>200
budget<TAB>projection_replace_transaction_limit_kind<TAB>hard
budget<TAB>projection_replace_transaction_hard_limit_ms<TAB>5000
budget<TAB>c2_gate_outer_watchdog_ms<TAB>60000
budget<TAB>positive_measured_attempts_exact<TAB>20
budget<TAB>positive_attempt_excluded_exact<TAB>0
budget<TAB>positive_attempt_replacement_exact<TAB>0
semantic<TAB>batch_scope<TAB>complete-source-replacement
semantic<TAB>guards<TAB>adapter-admission-caller-prospective-function-final
semantic<TAB>deadline<TAB>absolute-monotonic-begin-dispatch-through-commit-ack
semantic<TAB>positive_attempts<TAB>predeclared-record-all-no-replace
semantic<TAB>pre_commit_failure<TAB>rollback-unchanged
semantic<TAB>commit_ambiguous<TAB>signed-mode-same-logical-identity-recover
semantic<TAB>fault_sqlstates<TAB>oversize-22023-lock-55P03-late-P0001-post-authority-22023-ambiguous-08006
semantic<TAB>api_business_contract<TAB>unchanged
semantic<TAB>c2_pending<TAB>production-caller-c4-real-adapter-b2c
<!-- B2A_C2_PROJECTION_BUDGET_GRAMMAR_END -->

Independent executable recomputation command from repository root:

```bash
node -e 'const fs=require("fs"),c=require("crypto");const p=process.argv[1],s=fs.readFileSync(p);const a=Buffer.from("<"+"!-- B2A_C2_PROJECTION_BUDGET_GRAMMAR_BEGIN -->\n"),z=Buffer.from("<"+"!-- B2A_C2_PROJECTION_BUDGET_GRAMMAR_END -->");const i=s.indexOf(a),j=s.indexOf(z,i+a.length);if(i<0||j<0||s.indexOf(a,i+1)>=0||s.indexOf(z,j+1)>=0)throw Error("marker cardinality");const g=s.subarray(i+a.length,j);if(g.includes(9)||g.includes(13)||g.subarray(0,3).equals(Buffer.from([239,187,191]))||g[g.length-1]!==10)throw Error("grammar shape");const b=Buffer.from(g.toString("ascii").replaceAll("<TAB>","\t"),"ascii");console.log("sha256="+c.createHash("sha256").update(b).digest("hex"));console.log("bytes="+b.length);console.log("hex="+b.toString("hex"));' .trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c2-projection-budget-addendum-candidate.md
```

Reviewers must compare all three command outputs with the adjacent candidate
evidence. Any difference is stop-ship; nobody may choose a preferred digest.

## 12. Three-party dispositions still required

Architecture/database, test/security, and product/RBAC/interaction must each
explicitly accept or return:

1. new-addendum authority rather than inheritance;
2. adapter admission plus caller/function guards and no partial source;
3. pre-COMMIT rollback versus COMMIT-ambiguous same-receipt recovery;
4. C2/C4/B-2c owner split and pending statuses;
5. eight-action measurement or a signed worst-path equivalence mapping;
6. full evidence schema and cleanup requirements;
7. fixed predeclared twenty-attempt evidence with no replacement/exclusion;
8. signed receipt-mode selection for committed/not-committed ambiguity;
9. five exact fault markers and SQLSTATE values;
10. expanded per-object/stage/timing/cleanup evidence schema;
11. exact grammar SHA/byte length/hex agreement;
12. conditional no-C1-re-sign disposition.

Until all three perspectives accept all eight dispositions, this candidate is
not signed and the C2 budget item remains blocked.
