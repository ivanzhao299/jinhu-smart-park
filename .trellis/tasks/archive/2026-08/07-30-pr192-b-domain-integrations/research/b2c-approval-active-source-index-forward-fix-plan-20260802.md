# B-2c Approval Active-source Index Forward-fix Change Request and Plan

Date: 2026-08-02

Status: **CANDIDATE / CONDITIONAL GO TO FORMAL RESERVATION PREFLIGHT**

Owner requested: unique schema-migration owner

Scope: research and forward-only migration design; no existing migration or production
code is changed by this document.

## 1. QA finding and exact defect

Independent QA found one approval schema P1. The current frozen runtime contract defines
an active approval request as:

```sql
decision_status IN ('draft', 'submitted', 'pending_approval')
OR (
  decision_status = 'approved'
  AND execution_status IN (
    'not_started', 'executing', 'retry_wait', 'infra_exhausted'
  )
)
```

Migration `000186_property_b_approval_runtime_schema.sql`, raw SHA256
`5b7778888668842eac38bc4e3bc6bb56320aecedf5f02e0fbf3f13928a7a0b9e`, instead created:

```sql
WHERE decision_status IN (
  'draft', 'submitted', 'pending_approval', 'approved'
)
```

The current index therefore also treats `approved + executed` and
`approved + execution_failed` as active. This is a schema-contract defect even though
the over-broad predicate is stricter than the required active uniqueness for the same
source version. It disagrees with the frozen projection/port predicate and can retain a
false active conflict after execution is terminal.

The current approval repository already queries the correct frozen predicate. Existing
successful migrations are immutable, so `000186` must not be edited or checksummed
again. The correction is forward-only.

## 2. Authority and occupied window

Current repository migration facts:

| File | Raw SHA256 | Role |
|---|---|---|
| `000186_property_b_approval_runtime_schema.sql` | `5b7778888668842eac38bc4e3bc6bb56320aecedf5f02e0fbf3f13928a7a0b9e` | owns the original approval request/index surface |
| `000193_property_b_runtime_integrity_forward_fix.sql` | `c769efe549385f74092114cdf5f68c8ea40d78885bfecd484ed5a379f9c67f07` | existing immutable runtime integrity fix |
| `000194_property_task_projection_contract_correction.sql` | `93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0` | existing immutable task projection correction |
| `000195_property_mutation_receipt_contract_v2.sql` | `9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4` | existing immutable receipt correction |

`000191` and `000192` remain provisionally assigned and absent:

- `000191_property_b_homestay_effect_schema.sql` owns only property/homestay effect
  prerequisites;
- `000192_property_b_housing_effect_schema.sql` owns only housing effect prerequisites.

Independent QA found `000196` conflicted with an already claimed/retained number. It is
rejected for this correction and must not be reused even if a local working-tree scan
does not currently show its owner. This research lane never reserved `000196`.

The replacement candidate filename is:

```text
000197_property_approval_active_source_index_forward_fix.sql
```

This is a candidate number, not a reservation. A formal reservation is valid only after
the unique schema owner performs the scans in section 9 and preserves the immutable
reservation artifact. If `000197` is occupied in either history, repository, another
worktree/branch artifact or an active reservation, choose the next globally safe number;
never fall back to `000196`, or reuse, rename or edit `000193`–`000195`.

## 3. Dependency decision and cycle-free DAG

The correction has a semantic dependency on `000186` and the current migration-control
chain through `000195`. It has **no semantic dependency on `000191` or `000192`**.

Numerically, a final fresh install sorts `000197` after `000191/000192`. That lexical
order must not be converted into a history prerequisite. An upgrade database where
`000191/000192` are still absent is allowed to apply `000197`; later addition of the
lower-numbered effect migrations is also allowed because the runner sorts all files,
skips exact succeeded rows and executes pending rows independently.

The frozen logical DAG is:

```text
000186 + 000193 + 000194 + 000195
  -> 000197 active-source index correction

approval-port terminal-version pre-insert correction
  -> approval-port PostgreSQL Gate/current runtime SHA

000197 SHA + corrected approval-port current runtime SHA
  -> approval request-creation rollout eligibility

000186 + 000187 + property/homestay effect authority
  -> 000191 -> property/homestay effect-schema SHA

000186 + 000187 + housing effect authority
  -> 000192 -> housing effect-schema SHA

approval-port current SHA + 000197 SHA + 000191 SHA
  -> property-foundation/homestay adapters

approval-port current SHA + 000197 SHA + 000192 SHA
  -> housing adapters
```

Thus approval-port code and its terminal-version correction may be implemented and
unit-gated without domain effect schema; its final PostgreSQL/current handoff consumes
`000197`. `000197` may be reserved and migration-gated without waiting for that code,
but may not be applied to a live writer environment until the corrected runtime handoff
exists. The two effect migrations do not consume the approval-port handoff. Domain
adapters are the join point. This prevents the invalid cycle
`approval ports -> 000191/192 -> adapters -> approval ports`.

`000197` does not authorize, create or modify any homestay, housing, property-operation,
effect, receipt, outbox or task object.

## 4. Frozen active and terminal predicates

The only active predicate is:

```sql
(
  decision_status IN ('draft', 'submitted', 'pending_approval')
  OR (
    decision_status = 'approved'
    AND execution_status IN (
      'not_started', 'executing', 'retry_wait', 'infra_exhausted'
    )
  )
)
```

The complementary legal terminal combinations relevant to this correction are:

```sql
(
  decision_status = 'approved'
  AND execution_status IN ('executed', 'execution_failed')
)
OR (
  decision_status IN ('rejected', 'withdrawn', 'expired')
  AND execution_status = 'not_required'
)
```

`infra_exhausted` remains active by explicit freeze. `executed` and
`execution_failed` are terminal. The correction must not change the existing status-pair
CHECK, business-intent lifetime uniqueness, client-key uniqueness or the rule that a new
intent after a terminal request uses a strictly greater source expected version.

## 5. Exact forward DDL strategy

The migration uses one PostgreSQL transaction, the repository-standard timeouts and a
create-first/swap strategy. It must not use `CREATE INDEX CONCURRENTLY`, because that is
incompatible with the transaction envelope and makes failure/rerun evidence harder to
close.

The exact envelope is:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
-- prerequisite/history guard, table lock, catalog/data guards and DDL below
COMMIT;
```

The migration itself must verify identical `succeeded` rows for current `000186` and
`000195` checksums in both history tables; `000195` transitively pins `000193/000194`.
For any `000191/000192` row that exists, both histories must contain the same filename,
checksum and `succeeded` status, but absence is valid and neither filename is a required
prerequisite. If the measured index build cannot complete inside the signed 120-second
budget, the owner must return for a separately reviewed online/two-phase design rather
than raising timeouts ad hoc.

After history/prerequisite checks, it must first issue the following lock, before any
catalog or duplicate guard, so no writer or competing DDL can change the inspected state:

```sql
LOCK TABLE public.biz_property_approval_request IN SHARE MODE;
```

While that lock is held, it must fail closed unless all of the following are true:

1. `public.biz_property_approval_request` and the final index name exist;
2. the final index is unique, valid, ready, non-primary, not constraint-owned, has no
   INCLUDE columns, and has exactly these six key columns in order:
   `tenant_id, park_id, action_id, source_type, source_id, source_expected_version`;
3. its predicate is byte-authorized as either the exact old `000186` predicate or the
   exact new predicate in section 4;
4. temporary index `public.uq_biz_property_approval_request_active_source_v2_build`
   does not exist;
5. grouping rows under the new predicate by the six key columns produces zero groups
   with `count(*) > 1`;
6. no invalid decision/execution status pair exists.

The implementation Gate must derive and freeze old/new `pg_get_indexdef` and
`pg_get_expr(indpred, indrelid, false)` SHA256 constants from the target PostgreSQL major
version. SQL must compare catalog structure plus those signed hashes; substring or
`LIKE '%approved%'` checks are forbidden.

After the guards, while retaining that lock, the exact state-changing DDL is:

```sql
CREATE UNIQUE INDEX uq_biz_property_approval_request_active_source_v2_build
  ON public.biz_property_approval_request
    (tenant_id, park_id, action_id, source_type, source_id, source_expected_version)
  WHERE (
    decision_status IN ('draft', 'submitted', 'pending_approval')
    OR (
      decision_status = 'approved'
      AND execution_status IN (
        'not_started', 'executing', 'retry_wait', 'infra_exhausted'
      )
    )
  );

DROP INDEX public.uq_biz_property_approval_request_active_source;

ALTER INDEX public.uq_biz_property_approval_request_active_source_v2_build
  RENAME TO uq_biz_property_approval_request_active_source;
```

The create-first step validates new uniqueness while the old stricter index remains
present. The explicit table lock makes the write pause deterministic. Drop and rename
are in the same transaction, so another session never observes a committed state with
neither index. `IF EXISTS`, `IF NOT EXISTS`, `CREATE OR REPLACE` and silent drift repair
are forbidden in the state-changing block.

Direct rerun is intentionally supported: the preflight accepts an already-correct final
index, creates the temporary duplicate, then atomically swaps it again. Any pre-existing
temporary index is drift and fails before mutation.

## 6. Upgrade and fresh-install paths

### 6.1 Current upgrade, 000191/000192 absent

Required history is exact succeeded `000186`, `000193`, `000194`, `000195`; both rows for
`000191/000192` are absent. `000197` changes only the index. Later formal
`000191/000192` runs must neither inspect nor replace this index.

### 6.2 Upgrade with 000191/000192 present

Both history tables must agree on each present effect migration's filename, checksum and
`succeeded` status. `000197` still consumes no effect object. A running, failed,
single-history or checksum-mismatched `000191/000192` state blocks the whole migration
batch under normal fail-fast rules.

### 6.3 Final fresh database

The lexical path is `000185..000192 -> 000193..000197`. `000186` first creates the old
index and `000197` replaces it. The final catalog must contain exactly one final-name
index, the new predicate and no build-name residue.

### 6.4 Non-empty database with empty history

This path is **NO-GO** for correction evidence. The current runner may auto-baseline all
repository files as succeeded without executing their SQL. A target with business tables
but empty history must not use baseline to claim `000197` applied. It requires a separate
audited baseline/reconcile decision followed by proof that the final catalog already
matches the new index, or a controlled execution path approved by the database owner.

## 7. Old/new application compatibility and release sequence

The index name and columns do not change, so current/new readers, decision workers and
execution workers remain structurally compatible. The current approval port projection
query already uses the new predicate.

The current candidate request-creation implementation is not yet compatible with the
weaker exact index: it checks latest terminal source version only after an insert returned
no row because of a unique conflict. Once `approved+executed/execution_failed` leave the
partial index, a same/lower-version new intent can insert successfully and bypass that
conflict-only branch. The corrective design below closes the plan-level finding, but its
implementation and independent Gate remain mandatory pre-apply evidence; the index
migration must not be treated as supplying that protection.

The approval-runtime owner must, without any `000191/000192` dependency:

1. after the caller has locked the owning source and before request insertion, read the
   latest terminal request for the scoped action/source using the supplied manager;
2. return `approval-source-changed` when the proposed source version is less than or
   equal to the latest terminal version;
3. retain the post-conflict lookup for replay/race classification, but never rely on it
   as the primary monotonicity check;
4. prove same/lower denial and higher-version success when the database already has the
   corrected index, including two concurrent intents serialized by the owning source
   lock.

However, legacy request-creation code does not enforce terminal source-version
monotonicity as completely as the new port. Weakening the old over-broad index while old
writers remain live could admit a same-version post-terminal request. Therefore the
release sequence is mandatory:

1. keep approval creation/enforcement fail closed;
2. deploy and verify a port-capable build containing the pre-insert terminal-version
   correction while it is disabled/shadowed, or prepare that exact signed build for the
   same maintenance window;
3. stop intake, drain all old request-creation writers and verify zero in-flight approval
   create transactions;
4. take the required backup and apply `000197`;
5. start only the new writer build, run post-migration smoke, then enable the controlled
   approval creation path;
6. retain legacy read/decision/execution compatibility, but do not re-enable a legacy
   create writer.

Application rollback after `000197` may use an old build only with approval request
creation disabled. The schema correction itself is not rolled back; any further repair
is another forward migration. This operational fence is part of the Gate, not an
optional deployment note.

## 8. Failure, retry and rerun semantics

- Lock timeout, duplicate precheck, CREATE, DROP, rename or postcheck failure rolls back
  the full migration transaction; the prior committed index remains authoritative.
- The migration runner stops immediately and records `failed` in both histories. No
  seed, bootstrap, later migration or deploy verification may continue.
- A `failed` row with the same migration checksum may be retried only after catalog and
  lock investigation. Changed migration bytes require a new forward migration; do not
  overwrite a succeeded checksum.
- A `running` row is never auto-retried. Inspect the database. If commit outcome was
  ambiguous but the final index is exact, reconcile history only through the approved
  history-recovery procedure; if not exact, restore/repair and retry the same immutable
  bytes as authorized.
- Direct SQL rerun on either exact old or exact new catalog converges to one exact new
  index. Missing/drifted final index or leftover build index fails before mutation.
- Post-run counts of request rows, stages, decisions, exclusions, manifests, receipts,
  audits and outbox rows must equal pre-run counts. This migration changes no data.

### 8.1 Failed-row checksum immutability Gate

The current `db-migrate.sh` warns and retries when a `failed` history row has a different
checksum. That behavior is not authority for this correction. A dedicated independent
Gate must run before every migration-runner invocation and must fail closed before the
runner can downgrade the mismatch to a warning.

The reservation/checksum evidence has two immutable stages:

1. number reservation `R0`, created only after section 9 scans, freezes candidate
   filename `000197_property_approval_active_source_index_forward_fix.sql`, owner,
   repository HEAD, both-history digests, retained-reservation digest and timestamp;
2. checksum seal `R1`, created after SQL bytes exist and before execution, freezes the
   raw SQL SHA256 and references the raw SHA256 of immutable `R0`. `R0` is never edited
   to add a checksum. An independent reviewer recomputes and signs the R0/R1/file chain.

For the exact candidate filename, the pre-run Gate applies this matrix to both history
tables:

| Dual-history observation | Required outcome |
|---|---|
| Both rows absent and repository SHA equals R1 | May execute. |
| Both rows `failed`, filename/checksum identical, checksum equals R1 | Retry only the same immutable bytes after independent failure/correct-catalog review. |
| Any `failed` checksum differs from R1 or the two failed rows differ | Hard fail; do not invoke the runner, edit bytes or reuse the number. Preserve evidence and allocate a newly scanned number through a new R0/R1 chain. |
| Either row `running` | Hard fail for manual commit-outcome investigation. |
| One history row absent or status/checksum differs | Hard fail; neither history is selected as authority. |
| Both rows `succeeded` with checksum equal to R1 | Do not execute; verify exact final catalog and treat as history skip. |
| Any `succeeded` checksum differs from R1 | Hard fail as immutable migration drift. |

The Gate artifact records both raw history result sets, R0/R1/file hashes, decision and
reviewer identity. A shell warning, changed failed-file retry, mutable manifest, or
self-review cannot satisfy this Gate.

## 9. Formal reservation preflight

No formal reservation is declared by this research lane. The unique migration owner may
enter reservation preflight for candidate `000197` only after an independent review of
this plan. The preflight must capture:

1. `rg`/filesystem scan of all migration directories, worktrees and retained reservation
   artifacts for `000196_*` and `000197_*`: `000196` remains rejected/occupied and
   `000197` must be absent; also confirm provisional `000191/000192` remain uniquely
   owned;
2. both `public.sys_schema_migration_history` and `public.schema_migrations` on every
   actual target, listing filename/checksum/status for `>=000185` and any non-succeeded
   row;
3. exact equality of the two histories; no `running`/`failed`, duplicate prefix,
   single-table row or checksum drift for the inspected Track B window, and specifically
   no duplicate `000197` prefix (the repository's pre-existing unrelated duplicate
   history is not silently reclassified by this plan);
4. exact succeeded current checksums for `000186`, `000193`, `000194`, `000195`;
5. `000197_*` absent from both histories before reservation, and any `000196_*` evidence
   recorded as the reason it is unavailable rather than overwritten;
6. upgrade/fresh fixture topology declaration, including whether `000191/000192` are
   both absent or exact succeeded;
7. immutable R0 number reservation containing owner, filename, timestamp, repository
   HEAD, repository/worktree/retained-reservation scan digests, both-history digests and
   input authority SHAs; R1 is added later as a separate immutable checksum seal.

If any check fails, do not create SQL. Select the next safe number only after repeating
the complete scan and updating this plan/authority locator; never silently renumber the
approved filename.

## 10. Independent PostgreSQL and dual-history Gate

The implementation Gate must use unique run IDs and cover at least:

1. fresh path with final ordered migrations and exact final index catalog;
2. upgrade path with `000191/000192` absent;
3. upgrade path with both effect migrations present and exact;
4. old predicate accepted and corrected; new predicate accepted on immediate direct
   rerun; missing/drifted/build-residue indexes rejected without mutation;
5. one row for every active combination and multiple terminal combinations proving
   active uniqueness blocks only the frozen active set;
6. duplicate active insert blocked; `approved+executed` and
   `approved+execution_failed` excluded from active lookup/index, while
   `approved+infra_exhausted` remains active;
7. new-intent terminal source-version monotonicity enforced before INSERT by the new
   application port, including same/lower denial on a successful-insert-capable catalog,
   higher-version success and a negative proving the Gate does not depend on the old
   over-broad unique conflict;
8. lock-timeout/failure injection before CREATE, after CREATE, after DROP and before
   rename, proving transactional restoration and zero build residue;
9. immediate migration rerun with identical bytes and unchanged catalog/data counts;
10. old writer drain/fail-closed evidence and new writer compatibility smoke;
11. both histories contain exactly one identical `000197` filename/checksum/status row
    after success; repository bytes recompute to that checksum;
12. mismatched, running, failed, single-history and unknown `000197` history negatives,
    including a changed-checksum failed row proving the independent pre-run Gate aborts
    before `db-migrate.sh` and its warning path execute;
13. R0/R1/file hash-chain tamper negatives and exact same-checksum failed retry positive;
14. later application of `000191` and `000192` to an already-`000197` upgrade fixture,
    proving the corrected index SHA and request data remain unchanged;
15. cleanup of only the Gate's dedicated temporary databases/containers/volumes after
    evidence capture by the separately authorized execution owner.

The Gate must publish immutable upgrade artifact, fresh artifact, manifest, reservation
and combined SHA. A self-review by the migration implementer is not the independent
Gate.

## 11. Findings and decision

QA return disposition:

- P0 number conflict: `000196` is rejected and never claimed by this lane; `000197` is
  only a candidate pending a complete new scan.
- P1 failed-row checksum mutability: closed in design by the independent immutable
  R0/R1/file fail-closed Gate in section 8.1; runner warnings are explicitly
  non-authoritative.
- Earlier terminal-version compatibility finding: closed in design by the mandatory
  pre-INSERT runtime correction and pre-apply independent Gate in section 7.

Plan-level findings after this revision:

```text
open_P0=[]
open_P1=[]
open_P2=[]
```

The schema plan has no unresolved design choice. Delivery remains blocked because the
runtime correction, formal reservation, migration bytes, checksum seal, PostgreSQL
artifact and independent Gates do not exist yet.

Reservation decision:

```text
CONDITIONAL GO: may enter formal 000197 reservation preflight.
NO GO: 000196 is unavailable and must not be claimed by this correction.
NO GO: may not claim 000197 reserved or create migration SQL until the current
dual-history/repository/reservation scan and independent plan review pass.
NO GO: may not apply 000197 to an environment with approval writers, or publish the
final approval runtime handoff, until the section 7 runtime correction and section 8.1
checksum Gate are independently closed.
```

`000191/000192` do not need to be implemented first and must not become prerequisites of
`000197`. Domain adapters remain blocked until the independent `000197` Gate, current
approval-port runtime handoff and their respective effect-schema handoffs all exist.
