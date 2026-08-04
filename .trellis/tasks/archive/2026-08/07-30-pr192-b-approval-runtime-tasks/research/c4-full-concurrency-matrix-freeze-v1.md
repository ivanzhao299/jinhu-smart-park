# C4 full cross-operation concurrency matrix freeze v1

Status: frozen candidate; independent product/architecture/test re-sign required before the
full PostgreSQL run.

Authority: `b2a-contract-schema-correction-plan.md` §§4.6, 6, C4 cross-operation
concurrency Gate. This file only names and counts the already-signed combinations; it does
not change state, error, receipt, projection, or lock semantics.

## 1. Command variants

The exact command variant keys are:

1. `claim-open`
2. `start-claimed`
3. `block-in-progress`
4. `unblock-blocked`
5. `release-claimed`
6. `release-in-progress`
7. `release-blocked`

Each variant starts from the named applicable assignment state. The actor, claim token,
timestamps, blocked fields, outcome fields, assignment version, projection row, content
hash, receipt, assignment audit, and replacement audit must match the signed transition.

## 2. Terminal variants

The exact terminal variant keys are the Cartesian product of active state and terminal:

- `terminal-open-closed`
- `terminal-claimed-closed`
- `terminal-in-progress-closed`
- `terminal-blocked-closed`
- `terminal-open-cancelled`
- `terminal-claimed-cancelled`
- `terminal-in-progress-cancelled`
- `terminal-blocked-cancelled`

Every terminal case uses the original authenticated actor or registered service principal,
the signed source version and expected assignment version, and the exact terminal receipt
identity/client-key/request-hash grammar.

## 3. Shared source/assignment fence exact set

For each of the seven command variants, pair the terminal outcome `closed` and `cancelled`
from the same command pre-state, then run both designated-first orders:

`7 command variants × 2 terminal outcomes × 2 orders = 28 schedules`.

The order keys are `command-first` and `terminal-first`.

The machine key grammar is exact:

`shared-fence:<command-key>:terminal-<same-command-pre-state>-<closed|cancelled>:<command-first|terminal-first>`

For example, `shared-fence:block-in-progress:terminal-in-progress-cancelled:terminal-first`.
The seven command keys, matching terminal pre-state, two terminal outcomes, and two order keys
must generate exactly 28 unique strings; extra, missing, duplicate, aliased, or renamed keys
fail the Gate.

- command-first: command commits exactly once; terminal loses after its lock-time re-read
  with `property-version-conflict`; terminal has zero receipt access and zero mutation,
  projection, assignment-audit, or replacement-audit effect.
- terminal-first: terminal commits exactly once; command loses after locking and re-reading
  the terminal source with `task-source-ineligible`; command has zero receipt access and
  zero mutation, projection, assignment-audit, or replacement-audit effect.

The existing claim-vs-claim `task-already-claimed` proof remains a separate scenario and is
not used as a substitute for either cross-operation loser.

## 4. Shared projection-head replacement fence exact set

The exact action variants are all seven command variants plus all eight terminal variants.
For each of these 15 variants, run all three modes:

1. `rebuild-first`: rebuild commits `N→N+1`; the action locks and re-reads current authority,
   then commits authority-sync `N+1→N+2`; exactly two successes.
2. `action-first-stale-N`: action first commits `N→N+1`; only after that commit is a new
   production `SERIALIZABLE` rebuild transaction started with the already-held external
   expected version `N`. Its current locked head is `N+1`, so it returns
   `task-version-conflict` and creates no rebuild receipt, replace, or audit. This is an
   ordered post-commit schedule and does not claim a waiter lock.
3. `action-first-current-N-plus-1`: action first commits `N→N+1`; only after that commit may
   the caller observe and sign expected version `N+1`. A new production `SERIALIZABLE`
   rebuild transaction then re-reads current source/assignment/head and commits `N+1→N+2`;
   exactly two successes. This is an ordered post-commit schedule, not a waiter that began
   with an impossible future expected version.

`15 action variants × 3 modes = 45 schedules`.

The full core matrix is therefore exactly `28 + 45 = 73` independently named schedules.
No representative subset, worst-path equivalence claim, wildcard outcome, or allowed-result
set may be reported as the full matrix.

The machine key grammar is exact:

`rebuild-fence:<action-key>:<rebuild-first|action-first-stale-N|action-first-current-N-plus-1>`

`action-key` is exactly one of the seven command keys or eight terminal keys in §§1–2. The
15 action keys and three mode keys must generate exactly 45 unique strings. Together with the
28 shared-fence keys, the sorted unique manifest must contain exactly 73 keys.

## 5. Mandatory execution semantics

Every schedule must exercise the production `PropertyTaskOrchestrator` through a C4-only
`test_fixture_*` resolver/projector. It must not replace the production orchestration with
direct repository calls.

The fixture authority lock is a real PostgreSQL source row or source-scoped advisory lock.
The observed order is source/advisory → stable ordered derived assignments → projection
head/rows → receipt. Command and source-terminal transactions use `READ COMMITTED`; rebuild
uses `SERIALIZABLE`.

The 28 shared-fence and 15 rebuild-first schedules are the 43 true concurrent lock schedules.
Both actors rendezvous before locking. The designated first actor pauses only after obtaining
the source fence. The second actor must be observed in both `pg_locks` and
`pg_stat_activity.wait_event_type='Lock'` waiting for the same resource before the first is
released.

The 15 `action-first-stale-N` and 15 `action-first-current-N-plus-1` schedules are the 30
ordered post-commit schedules. They use latches to prove action commit precedes the
creation/start of a new production `SERIALIZABLE` rebuild transaction. The stale case carries
the external version `N`; the current case is signed as `N+1` only after the first commit.
Neither may fabricate a waiter started on an unusable old SERIALIZABLE snapshot, claim a
`pg_locks` wait, weaken production rebuild isolation, accept a raw PostgreSQL `40001` as the
business result, or add an unapproved serialization retry.

No sleep-based ordering is allowed. Each participating transaction sets lock timeout 5
seconds, statement timeout 60 seconds, and deadlock timeout 1 second.

Every schedule proves serial equivalence through the production `PropertyTaskService`: call
`detail(scope, actor, taskId)` and `list(scope, actor, { page: 1, pageSize: 100 })`; the list
fixture is isolated so its `items` and `total` are the count proof. Compare those results with
the complete projection row set, row and head content hashes, raw authority state, consecutive
assignment and projection versions, exact completed receipts and audits, loser zero effects,
and absence of lost update, deadlock, timeout, or asynchronous projection windows. Direct
repository queries may provide raw evidence but may not replace the service-level assertions.

## 6. Independent proofs outside the 73 count

The following stable proof keys are mandatory C4 evidence but are not counted as one of the
73 core schedules:

- `independent:claim-claim-one-winner`: exact `task-already-claimed` loser;
- `independent:rebuild-same-key-completed-replay`: zero new receipt/mutation/audit;
- `independent:terminal-closed-completed-replay` and
  `independent:terminal-cancelled-completed-replay`: incoming expected version is locked
  terminal version minus one and all receipt identity/hash fields match;
- `independent:terminal-pre-receipt-negative-matrix`: exact subkeys
  `expected-current`, `expected-current-minus-2`, `expected-zero`, `expected-negative`,
  `expected-fractional`, `expected-max-safe`, `expected-overflow`, `different-terminal`,
  `different-outcome`, `source-version-old`, `source-version-new`, `different-occurrence`,
  and `different-task-key`; every one of these pre-port subkeys has execute-or-replay,
  existing-only, and total receipt access count zero and zero mutation/audit;
- `independent:terminal-existing-only-state-matrix`: exact subkeys
  `existing-only-absent`, `existing-only-started`, and `existing-only-failed`; the authority
  predicate has already passed, so each performs exactly one existing-only access and one total
  receipt access, performs zero receipt INSERT/UPDATE and zero authority/projection/audit
  mutation, then fails closed with `property-runtime-unavailable`;
- `independent:projection-late-failure-rollback` and
  `independent:receipt-complete-late-failure-rollback`: full transaction rollback;
- `independent:head-absent-concurrent-winner-reattest`: exact re-attestation of
  `b2a-c2-final-gate-signoff-v12d.json` raw SHA
  `0be731ea41ffceddf050e3a4fac971ce4e03ef3c9cc8e6bbfe926cb565949274` and its bound
  `b2a-c2-candidate-gate-artifact-v12d.json` raw SHA
  `b5169a6e2668d3a2491814f34dd6745e386056f721236160aa5fe331aae41e50`;
- `independent:derived-owning-boundary`: owning authority never creates or mutates a derived
  assignment, and derived authority never delegates mutation to the owning source.

These proofs, the 73 core schedules, local static/type/build/lint gates, exact input freeze,
unique-runId reservation, immutable artifact/manifest, and exact temporary Docker/PostgreSQL
cleanup must all pass before `cross_operation_matrix_complete=true` is admissible.

## 7. Release boundary

Passing this matrix permits only C4 runtime freeze and the subsequent single-file AppModule
composition Gate. It does not complete B-2a by itself, does not release B-2b before C4/B-AR4
final signoff, keeps `B3_web_consumer_status=pending`, and keeps production enablement false.
