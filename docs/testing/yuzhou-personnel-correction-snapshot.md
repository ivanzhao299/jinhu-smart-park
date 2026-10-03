# Personnel correction snapshot laboratory

This is an isolated execution bridge for the two-field correction in
[the correction ledger](./yuzhou-personnel-correction-lab.md). It is not a
production capture command, import receipt issuer, production writer or evidence
that genuine source-bound A/B has run. Real source capture still requires an
independently reviewed target identity, a private consistent snapshot, separate
origin signature and independently approved new lab targets.

## Fixed evidence contract

`personnel-correction-snapshot-contract.mjs` owns thirteen fixed source relation
projections and parameterized closure queries. The capture session executes
`REPEATABLE READ READ ONLY` and checks both actual transaction settings after BEGIN.
A temporary node-postgres notice listener rejects nested BEGIN before changing
transaction settings. The library never commits or rolls back a caller-owned
transaction, including READ COMMITTED or READ WRITE transactions. Its own
transaction is set to repeatable-read/read-only before any source SELECT. The library never creates a source connection.
It retains every person_core source row for the selected operation, every receipt
for the four relevant target types and any person_core source identity (including
wrong row hashes, non-insert dispositions and ambiguity candidates), every in-scope employee/profile (including
unreceipted and deleted profiles), referenced out-of-scope targets, and all owner,
registry, archive, batch, phase and core receipt candidates. It never prefilters
by successful ownership, matching source hash, receipt disposition or selected
fills. Ambiguous evidence therefore stays ambiguous.

All operation/receipt fields and original batch fields, including
`target_database`, stay unchanged in separate snapshot relations. Source
ciphertext and archive encrypted-object references are outside the fixed
projection; no decryption or key access occurs. Full profile values, including
protected ciphertext already present in that profile, remain private. Capture
records origin `xmin` separately. It is evidence, never used as the lab row's
version.

The complete thirteen public relation column/type/nullability catalog is hashed.
Employee/profile column sets must exactly match this code's full-column contract;
other relation projections explicitly name all selected columns. Unknown or
changed profile columns fail closed. The source and lab source-facing schemas
must match. Their migration histories need not match: the origin may be at 323
while the lab has empty structures 324 and 325.

A separately provisioned registry binds origin database name, SHA-256 of
PostgreSQL system identifier + database OID + name, successful migration-history
SHA-256, tenant/park, source/parent operations, original C/S/M, approved contract
bytes, origin authority public key and expiry. Capture checks the actual source
identity and migration history against that registry. The signed origin also
binds schema, consistent transaction snapshot, capture time, and each relation's
count and PostgreSQL JSONB text SHA-256. Reports contain only counts/hashes/status;
source identifiers and values stay in 0700 directories and 0600 files.

## Narrow operator sequence

1. A resource owner calls the offline
   `createPersonnelCorrectionSnapshotLabDescriptor({directory,port,user,password,authorityPublicKey})`
   separately for A and B. It generates fresh database names and lab UUIDs,
   writes private `lab-config.json` and `resource-intent.json`, and returns
   `DESCRIPTOR_ONLY_NOT_PROVISIONED`. It reads no secrets from the environment,
   creates no resources and issues no authorization. Load the result with
   `readPersonnelCorrectionSnapshotLabDescriptor(directory)`; do not hand-edit it.
2. The resource owner provisions exactly those new loopback-only random databases
   on a dedicated PostgreSQL instance. Run the repository's `db-migrate.sh`
   including its prerequisite/history machinery through 325. Do not invoke
   seed/bootstrap helpers or insert source data/control receipts. Preserve the
   baseline produced by the existing immutable migrations; the adapter must keep
   platform account counts and hashes unchanged. Do not substitute a minimal
   predecessor fixture, reuse a named lab, disable business constraints, or use a
   production/default/shared database. Migration failure stops the sequence.
3. A database custodian, distinct from the unprivileged executor, installs the
   existing lab registration and explicit least privileges. The executor must
   not be superuser, create roles/databases, own snapshot tables, or inherit their
   owner role. It needs schema usage; SELECT on the thirteen public source-facing
   tables, five correction ledger tables, snapshot tables and trust metadata;
   INSERT on employee/profile, the correction ledger, snapshot manifest and
   thirteen typed staging tables; UPDATE on employee/profile and the lab registration
   table (employee only for the prepare table lock and the latter for `FOR SHARE`; its immutable trigger
   refuses writes). The module neither creates/grants database roles nor creates
   platform users. Registry/approval INSERT stays with the independent custodian.
4. The custodian inserts one `hr_correction_snapshot.origin_registry` row per lab,
   binding `registry_id,lab_id,origin_database,origin_identity_sha256,
   migration_history_sha256,tenant_id,park_id,source_operation_id,
   parent_operation_id,triple,contract_sha256,authority_public_key,expires_at`.
   Values must come from separately verified custody, not executor-provided
   self-signatures. `registered_by` is server-set and checked. A/B can use the
   same registry UUID, identical origin identity and contract, with their distinct
   lab registrations. `snapshotContractSha256()` gives current executable bytes.
   `originIdentity(sourceClient)` is a read-only digest helper; its result alone
   is not independent authorization. The source operator needs an existing
   privilege to query `pg_control_system`; this module grants nothing.
5. A separately authorized source operator supplies idle, established registry
   and source sessions to `capturePersonnelCorrectionSnapshot({registryClient,
   sourceClient,registryId,directory})`. This fixed library call writes thirteen
   private relation files and `origin-unsigned.json`. Failed capture never writes
   a complete manifest. No automatic production export or source connection is
   exposed. The independently held origin authority reviews the manifest and
   custody and signs the **exact UTF-8 manifest bytes** with Ed25519 externally.
   The token is `{payload: exactManifestText, signature: base64Signature}`. No
   signing/key-reading function exists in this library.
6. For each lab, the independent custodian inserts `prepare_approval` with
   `snapshot_id,registry_id,manifest_sha256,expires_at`, where the SHA-256 input
   is `payload + '\n' + signature`. Approval and origin expiry are checked during
   prepare **and every execution, replay and rollback**. The executor cannot
   insert its own trust even if INSERT were accidentally granted: the trigger
   requires a custodian distinct from the registered executor.
7. Call `preparePersonnelCorrectionSnapshotLab(config,token,captureDirectory)`.
   It requires empty employee/profile/manifest targets and atomically stages
   typed immutable evidence, checks round-trip relation hashes, creates narrow
   employee FK carriers and copies every full profile before image exactly.
   Its private `lab-review-<labId>.json` is review material, not an execution
   authorization or proof of commit; only the returned `PREPARED` confirms the
   transaction committed. A failed preparation needs a new review after fixing
   the input; never mutate a committed snapshot. A changed source/schema/contract
   or expired registry requires fresh independently registered labs.
8. The separate correction authority uses that reviewed descriptor to issue the
   existing one-time apply token: fresh operation/idempotency/nonce IDs, action,
   actor hash, target, C/S/M, current `correctionExecutionSha256()`, returned seals
   and `snapshot:{snapshotId,manifestSha256}`. Run the existing
   `executePersonnelCorrectionLab`. Rollback has a separate signed action/token.
   A/B results may only be compared after both targets independently complete
   prepare/apply/replay/reconciliation/rollback and exact resource cleanup.

The public `hr_employee` row is explicitly a laboratory FK carrier: same ID,
scope, employee code/name, employment type/status and deletion flag; platform
links and other optional carrier values use schema defaults. It is not a source
employee reconstruction. Every correction source employee join (including
status/account diagnostics in the reused CTE) reads the immutable faithful
snapshot employee. No `sys_user`, `sys_org` or position rows are copied or created.
All profile columns are copied without transformation; their only FK is employee.
This bridge reuses the observer CTE through `correction_seal`, not the observer's
later contract diagnostics, and makes no current-contract parity claim.

Only fixed FROM/JOIN relation tokens are mapped. Quoted `target_table` literals
and every reviewed scope/receipt/owner/cardinality predicate stay intact. The
single `follow_batch.target_database=current_database()` expression becomes
comparison to the verified registry's original database. There is no global
`current_database` replacement. Real public profiles stay the writable target.
Source relation counts/hashes, origin signature, schema and approval are checked
on every use. Later modern profile edits block rollback by full after image and
lab `xmin`, using the existing ledger logic.

## Focused validation

```
node --test scripts/hr-cutover/tests/personnel-correction-snapshot.test.mjs
HR_CORRECTION_SNAPSHOT_PG_TEST=1 node --test scripts/hr-cutover/tests/personnel-correction-snapshot.test.mjs
```

The opt-in PostgreSQL test requires Docker and an already available
`postgres:16-alpine` image. It creates one random Compose project, a tmpfs-backed
cluster with a random loopback port, runs the **standard full migration path**,
and creates new full-schema databases from the migrated template before any
HR source fixture, correction data or trust registration is inserted. Existing
platform baseline rows created by immutable migrations remain unchanged. It
never connects to host PostgreSQL or a pre-existing database. Synthetic signed
receipt fixtures are stored only in the separate typed snapshot relations; no
successful original import is fabricated in guarded import controls. The test
creates an isolated PostgreSQL executor role solely to verify privilege
separation; no application account is created.

Logs and generated descriptors are private. Set
`HR_CORRECTION_TEST_ARTIFACT_ROOT` to an existing private artifact parent to retain
all evidence there. The harness owns and deletes only its new Compose project,
then checks container/network/volume residuals individually. Synthetic results
do not establish genuine retained-source A/B, production approval or business
acceptance.

The permission-only gate is available with
`HR_CORRECTION_SNAPSHOT_PREFLIGHT_ONLY=1` together with the PostgreSQL test flag;
it proves the exact lock privilege requirement and cleanup, then stops before
migrations. Its `PREFLIGHT_PASS` is not a full-path or correction result.

After a standard migration, the harness saves a private complete baseline dump
before any fixture. `HR_CORRECTION_SNAPSHOT_SCHEMA_CACHE=<private-run-directory>`
can restore it only into another newly created isolated cluster. It requires
regular 0600 dump/metadata/provenance/binding files in a 0700 directory, exact
migration/prerequisite/migration-runner bytes, the dump digest, and matching
actual image ID, PostgreSQL version, encoding, collation/ctype/locale provider,
collation version, timezone and fixed setup policy. Missing or changed provenance
fails before restore. The original 327-history standard migration result remains
a separate proof; cache restoration is explicitly reported as
`VERIFIED_STANDARD_MIGRATION_TEMPLATE_CACHE`, never as a new standard migration,
real source snapshot, runtime identity or genuine A/B result.

The cache restore also reproduces the eight original NOLOGIN role definitions
from the hash-bound immutable migrations 308–311 before restoring their ACLs.
It neither restores login credentials nor grants those roles to the executor.
