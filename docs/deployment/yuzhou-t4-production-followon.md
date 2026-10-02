# Yuzhou T4 unpublished payroll follow-on

This standalone candidate appends the **full 2010–2026 archive once to an empty
T4 tenant/park scope**, after an actual successful v2 core T0–T3 import. It does
not add T4 to the core sealed plan or change that plan, its four payload hashes,
its authorization, or its consumed nonce. Existing lab loaders retain their lab
database guard. No publish, calculation, payment, notification or employee-facing
publication is performed. `fullProductMigrationComplete` remains false.

## Evidence and binding

The candidate's execution SHA is distinct from the parent core C/S/M triple
and must descend from the parent's actual commit.
The runtime receipt must bind the new execution SHA to current, merged and
running code and the existing sole production target/scope allowlist. Migration
000316 must have passed the normal backup/migration/release procedure first.

`production-import-t4-followon-binding.mjs` defines the exact signed binding.
It includes a fresh operation ID, explicit
`APPEND_UNPUBLISHED_T4_FULL_ARCHIVE_ONCE` intent, parent core operation/seal,
actual `SUCCEEDED` CLI receipt hash, parent four payload hashes, source C/S/M,
restore hash, T4 manifest and all six output byte hashes, full/hot counts,
four full/hot weighted numeric totals, target scope, execution SHA, runtime
receipt hash and time window. Source material keeps `productionImport=HOLD`.

The parent receipt is not accepted on its JSON claim alone.
`observeT4Parent(client,binding,receipt)` verifies the database operation,
four succeeded phase receipts and exact payload hashes, active source-row maps,
and actual employee scope. It returns a count and an aggregate record/map/employee
hash for review and signing. An initial binding may use a valid placeholder hash
only while this read-only observation is being produced; execution requires the
exact observed hash. Never invent a parent operation, receipt or source hash.

The signed authorization uses the existing single accountable owner delegation
validator and operator Ed25519 attestation. Its context binds the complete T4
binding and **the actual parent T0–T3 hashes**. Those fields never stand in for
T4 files. Preparation, review and bridge evidence hashes must come from actual
private artifacts and explicit owner approval; a signature does not manufacture
that approval. The standalone validator explicitly checks the T4 intent.

`amountTotals` has `full` and `hot` objects, each with exact four-decimal strings
for `gross_total`, `deduction_total`, `tax_total`, and `net_total`. Derive these
from the hash-verified six files using PostgreSQL numeric arithmetic multiplied
by source multiplicity, without current employee-status filtering. Both source
and stored snapshot totals must match. Full net is `102194056.8000`; hot net is
`15723009.9100`. Full source/snapshot rows are 46,092 and items are 1,078,020;
2024–2026 rows/items/closes are 8,342 / 190,880 / 266. Catalog counts are 647
memberships, 711 items, 244 formulas, 9 tax rules and 1,431 closes. Source
duplicates or invalid candidates fail the transaction. Period conservation compares scheme/year/month as integers, matching the
projection SQL: preserved salary-table suffix `01` matches close scheme `1`.
Missing close periods and out-of-range years/months still reject the transaction. Unmapped employees
retain immutable historical facts and explicit review cases.

## Private CLI configuration

All descriptors are `{ "path": "<absolute private file>", "sha256": "<byte hash>" }`.
Files must be owned 0600 regular files without symlinks/hardlinks. Keep the
config and local execution claims in an owned 0700 directory.

```json
{
  "binding": { "path": "...", "sha256": "..." },
  "authorization": { "path": "...", "sha256": "..." },
  "parentReceipt": { "path": "...", "sha256": "..." },
  "stage": {
    "manifest": { "path": "...", "sha256": "..." },
    "files": {
      "scheme-memberships.jsonl": { "path": "...", "sha256": "..." },
      "items.jsonl": { "path": "...", "sha256": "..." },
      "formulas.jsonl": { "path": "...", "sha256": "..." },
      "tax-rules.jsonl": { "path": "...", "sha256": "..." },
      "closes.jsonl": { "path": "...", "sha256": "..." },
      "payslips.jsonl": { "path": "...", "sha256": "..." }
    }
  },
  "runtimeEvidence": { "path": "...", "sha256": "..." },
  "databaseBinding": { "path": "...", "sha256": "..." },
  "postgresCredentials": { "path": "...", "sha256": "..." }
}
```

`databaseBinding` contains the existing adapter's exact database/user/server
address/port/OID and target identity/scope object, generated privately on the
host from real observations. Credentials are `{host,port,database,user,password}`
and use an explicit loopback endpoint. They are never authorization evidence.

```sh
node scripts/hr-cutover/execute-production-t4-followon.mjs \
  --config "$PRIVATE_CONFIG" --sha256 "$CONFIG_SHA256" --mode prepare
```

Prepare validates immutable checked-out dependencies, signed material, private
file hashes, runtime receipt, connected server and parent database evidence.
It returns `STRUCTURE_READY`, `productionImport=HOLD` and false execution.
It does not load data or fully rehearse the SQL. Execute is a separate explicit
`--mode execute` invocation after candidate review, actual isolated rehearsal,
required production release checks, fresh observation and authorization.

The writer uses one SERIALIZABLE transaction and scope lock, no automatic
retry. Any definite failure rolls back all T4 tables, maps and control writes.
The durable local claim remains after failure; ambiguous COMMIT/network outcomes
return `T4_OUTCOME_UNKNOWN_DO_NOT_RETRY`. Inspect the exact database receipt and
claim before recovery. Do not delete a claim and blindly rerun.

## Precise rollback

`--mode rollback` requires a separately signed
`ROLLBACK_UNPUBLISHED_T4_FULL_ARCHIVE_ONCE` intent and a fresh nonce, within the
binding's valid window and runtime receipt. It binds the exact original binding;
renewal outside that window is not supported by this version. It does not use
the lab rollback procedure. The SQL procedure is revoked from PUBLIC; no new
application role receives access.

The new procedure locks the eleven tables, rejects published or changed rows,
checks the complete owned record/map count and hashes, suspends only the eleven
named immutable guards while deleting exact mapped targets in dependency order,
and reenables them inside that transaction. Control history remains immutable.
The standalone writer compares all protected employee, attendance, compensation,
online payroll, payment, tax, outbox and message tables before/after either
operation. No applied migration or existing immutable-fact guard is relaxed.

After inserting the 46,092 parent snapshots, the new writer explicitly analyzes
that new table before inserting its items. A synthetic PostgreSQL EXPLAIN showed
the fresh-table FK plan using `idx_hr_payroll_legacy_snapshot_employee_fk` with
only scope predicates and filtering each target ID; after ANALYZE it uses
`hr_payroll_legacy_snapshot_pkey(id)`. This local bulk-load correction does not
change any existing loader or application query.

## Acceptance and checkpoint

- Objective: independent unpublished full T4 append, core history unchanged.
- Initial baseline: `6e85a6683ac516b6bc49d2bdc4784b9c14589f3e`; the independent
  commit was rebased onto `1629350a07f041c74c2f3b6cefb3554d5e6ca9b8`, with
  the exact parent ancestry verified.
  Branch: `codex/yuzhou-t4-production-followon-20261001`. The actual parent
  operation/C/hashes remain runtime input, never guessed constants.
- Unit contract: `node --test scripts/e2e/yuzhou-t4-followon-contract.mjs`.
- Real isolated database: set `YUZHOU_T4_POSTGRES_BIN` to a local PostgreSQL 16
  bin directory and run `node scripts/e2e/yuzhou-t4-followon-postgres.mjs`.
  This creates its own cluster/socket, disables TCP and removes only its own
  cluster after a successful shutdown. It never accepts an external database URL.
  Add `--schema-only` to apply the same migrations and run only the production
  context, procedure privilege and authorization immutability guards.
- The database test applies actual T4/control migrations with minimal unrelated
  HR shells, uses only synthetic records, and exercises full-size conservation,
  failed partial inserts, replay, immutable facts, drift rejection and precise
  authorized rollback. This is not full fresh-schema release smoke or real HR
  business acceptance.
- Root owns actual core receipt, real evidence production, release and any
  production write. No production action is performed by this implementation.

### Local acceptance record, 2026-10-01

- Seven authorization/private-artifact/runtime contract tests passed; targeted
  ESLint and Node syntax checks passed.
- Full synthetic PostgreSQL execution passed late-failure atomic rollback,
  46,092 snapshots / 1,078,020 items, exact full/hot numeric totals, retention of
  departed and unmapped employees, committed append, nonce replay rejection,
  immutable facts, drift refusal, separately authorized rollback, all eleven
  business tables empty, parent operation still succeeded and employee retained.
- The full script's final authorization-row DELETE assertion returned PostgreSQL
  `42703` instead of `T4_CONTROL_IMMUTABLE`: its shared trigger referenced a
  nonexistent `status` field before short-circuiting. That run exited 1 at this
  last assertion, after the above checks. The new migration now branches before
  accessing operation-only fields; the regression runs before large inserts.
  A fresh native PostgreSQL cluster applied the corrected migrations and passed
  `--schema-only`, including the exact failed assertion. The unchanged writer,
  data SQL and full-size fixture were not loaded again for this error-code fix.
- No full application fresh-schema release smoke, real private T4 rehearsal,
  production CLI prepare/execute or deployment was performed. Root must provide
  the actual parent success receipt, signed binding, runtime evidence and host
  invocation after review; the existing core transport route is unchanged.
- Checkpoint: implementation and scoped local acceptance complete; temporary
  clusters stopped and removed. Production remains unexecuted. Next action is
  root review and integration, with a real isolated T4 rehearsal before any
  separately authorized production append.

The follow-on also refreshes the temporary `cls` classification statistics before
its sixteen item shards, matching the deployed native-loader performance fix.
Snapshot and classification analysis preserves the existing transaction and
foreign-key checks; the same actual-source conservation checks still apply.

### Source employee scope preflight performance

The standalone writer materializes the distinct source person codes once before
checking resolved employees against the succeeded parent T0 records. This avoids
repeatedly detoasting the full wage JSON for current employees with no wage
history. The unique employee rule, exact parent operation, T0 employee table and
`rollback_status=not_started` requirements are unchanged. Wrong or rolled-back
parent mappings still abort the complete transaction. No source bytes or values
are normalized by this preflight.
