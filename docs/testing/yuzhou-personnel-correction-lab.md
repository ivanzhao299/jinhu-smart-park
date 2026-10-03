# Personnel NULL-fill correction: isolated PostgreSQL execution

This slice adds a usable **isolated lab** transaction for `oldaddr → native_place`
and `edulevel → degree`. It does not authorize or execute a production correction.
Original import operations, receipts, source records, ownership maps and their
whole-row `owned_state` remain immutable. Later corrections must be explained by
the independent ledger; they must never overwrite the original import baseline.

## Files and entry point

- `database/migrations/000324_hr_personnel_correction_ledger.sql` creates empty
  lab registration, operation, detail, rollback and authorization-use tables.
  It grants no privileges and contains no business-data backfill.
- `scripts/hr-cutover/personnel-correction-lab.mjs` exports
  `executePersonnelCorrectionLab(config, signedToken)`. There is deliberately no
  CLI, production adapter, API route, deployment hook or token issuer.
- `scripts/hr-cutover/personnel-correction-sql.mjs` uses the existing observer's
  reviewed source/receipt/owner predicates and PostgreSQL JSONB seal algorithm.
  Four scope occurrences per tenant/park become SQL parameters, and the operation
  and parent are narrowed explicitly. The equivalence test reverses precisely
  these changes and compares every original SQL byte. The prototype JavaScript
  planner's hashes are a different format and are not accepted as these seals.

## Independent lab authorization

A lab custodian creates a new, dedicated database from `template0`, with a random
name matching `jinhu_hr_correction_lab_[0-9a-f]{24}`. Only explicit IPv4 loopback,
port, database, database user and lab UUID are accepted; shared migration-lab
names, defaults, arbitrary URLs and remote hosts fail **before connection**.
No environment database override or production allowlist exists in the writer.

Before handing the database to the executor, the custodian registers one row in
`hr_personnel_correction_lab`, containing its lab UUID, exact database/user and
SHA-256 of the independent review authority's Ed25519 SPKI DER public key. The
registration is immutable and database-name unique. Keep registry provisioning
and signing authority under independent operator custody; the executor must not
hold the signing private key. Ordinary production deployment only installs the
empty schema. It does not register a target or grant the writer any access.
A caller-supplied key alone cannot authorize a write: it must match this previously
registered trust anchor. A database owner/superuser can override database controls;
that privileged operator is outside the untrusted-request boundary.

`config` has exactly `host`, `port`, `database`, `user`, `password`, `labId` and
`authorityPublicKey`. The token has exactly `payload` (the original signed UTF-8
JSON text) and `signature` (base64 Ed25519 signature). Signed payload v1 contains:

- `purpose: ISOLATED_PERSONNEL_CORRECTION`, separate `action: apply|rollback`,
  UUID `nonce`, hashed actor, and integer millisecond issue/expiry times with a
  maximum one-hour validity window.
- Exact target host/port/database/user/lab UUID.
- Binding with correction operation UUID, idempotency UUID, tenant/park, original
  T5 and parent operation IDs, original C/S/M triple, current correction execution
  byte hash and the observer's exact three seals plus all three fill counts.

`correctionExecutionSha256()` hashes the writer, SQL wrapper, observer and ledger
migration bytes, so editing any of them invalidates old tokens. The original C/S/M
triple remains independently checked against the persisted import binding. The
review authority must inspect the concrete PostgreSQL plan and issue the token
outside the executor; no automatic boolean approval or old import credential is
accepted. Do not log config, tokens, row IDs or field values.

## Transaction, replay and rollback contract

The library validates the signature, target, execution bytes, action and expiry
before connecting, verifies the registered DB trust anchor, then acquires one lab
transaction advisory lock. It checks expiry again after waiting, after locking
source tables, and before commit. Receipt lookup follows the lock, allowing two
concurrent identical submissions to return one commit and one exact replay.

Apply locks the source, receipts, maps, employee and profile tables against writes
in a fixed order, recomputes the authorized PostgreSQL JSONB seals, and materializes
only the selected subset in a transaction-local temporary table. It also rejects
non-unique source identities, registries and profile ownership. The profile UPDATE
requires matching scope, employee, source hashes and the full captured before row.
Only SQL NULL is filled; empty strings and other non-NULL modern values survive.

Business updates, immutable per-profile detail, aggregate operation receipt and
nonce consumption commit together. Details retain private full before/after rows,
source/owner binding, actual patch and PostgreSQL `xmin`, inside the controlled DB.
The actual after rows must reproduce the authorized after seal. Any failure rolls
back all four kinds of writes. A failed transaction leaves its token unconsumed,
allowing a still-valid exact retry. Successful same-token/same-binding retries
return the aggregate receipt. Different bindings or new credentials for an already
consumed action conflict. Reusing a nonce for another action/operation conflicts.

Rollback requires a distinct signed action and nonce for the exact original
binding. It restores only the fields actually filled, and only when the current
whole row **and xmin** match the saved after-image. Even an edit to an unrelated
field, or an edit that returns to the same value, blocks rollback. One mismatched
row aborts the entire rollback. A separate immutable rollback receipt is appended;
original correction evidence is retained. An apply replay after rollback fails.
UPDATE, DELETE and TRUNCATE are refused on ledger tables; later additions to an
already committed operation's details are refused. Deferred constraints reject
operations missing their complete detail set or transaction-bound nonce receipt.

Public results contain fixed status/action, counts, mapping version and hashes
only. PostgreSQL errors are translated to fixed codes without SQL/DETAIL leakage.
`productionImport` remains `HOLD` for apply, replay and rollback alike.

## Reproducible synthetic regression

With repository API dependencies installed and a local PostgreSQL administrator
able to create databases:

```sh
umask 077
HR_CORRECTION_PG_TEST=1 node --test scripts/hr-cutover/tests/personnel-correction-lab.test.mjs
node --test scripts/hr-cutover/tests/legacy-personnel-alias-observation.test.mjs scripts/hr-cutover/tests/legacy-personnel-alias-backfill-plan.test.mjs
node --check scripts/hr-cutover/personnel-correction-lab.mjs
node --check scripts/hr-cutover/personnel-correction-sql.mjs
git diff --check
```

Optional test-only settings are `HR_CORRECTION_PG_PORT`, `HR_CORRECTION_PG_USER`
and `HR_CORRECTION_PG_PASSWORD`; they cannot change host or choose a database.
Use a private process environment for credentials, never command-line literals.
The harness creates a new random dedicated database, applies the actual new
migration over minimal synthetic predecessor relations, uses an ephemeral test
signing authority, and drops only the database it successfully created. It never
modifies an existing named lab, production database or source store. An interrupted
harness may leave its newly created disposable database for operator cleanup.
Without `HR_CORRECTION_PG_TEST=1`, real PostgreSQL coverage is explicitly skipped.

Coverage includes exact observer SQL parity, all seals/counts, source/scope/owner/
receipt/target/parent drift, NULL vs empty values, duplicate source/profile cases,
C/S/M mismatch, atomic failure injection, concurrent replay, rollback and later
whole-row edits, authority/expiry/nonce/action rejection, late-detail insertion,
incomplete operation commit, ledger immutability and unchanged original lineage.

The minimal fixture proves transaction behavior and the new migration, not the
full predecessor schema, fresh-schema Release Smoke, historical upgrade path or
real source-bound A/B execution. Those remain independent acceptance gates before
any production correction design can be approved. The previously observed live
2456-profile / 2454-native-place / 68-degree plan is a historical read-only result,
not a hardcoded authorization or synthetic-test expectation.
