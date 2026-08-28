# Rehearsal A/B backup, restore, fault and rollback engineering plan

Date: 2026-08-28

## Verdict

The repository already has an executable isolated full-domain lifecycle, ordered `T0 -> T5`, reverse `T5 -> T0`, technical UAT, signal recovery, registry-scoped cleanup, and actual `residualCount=0` verification. It does **not** yet have an HR rehearsal backup/restore/fault runner. Gate 19 is a useful pattern but is production-shaped, compares only coarse platform counts plus one file checksum, uses MD5 for the file sample, and is not wired to the HR parent manifest or canonical ledger. It must not be invoked by Rehearsal A/B.

Therefore the next executable slice is an isolated `backup -> fault -> restore-to-new-db -> canonical verification -> reverse domain rollback -> cleanup` implementation, not a real A/B run yet. A/B remains `NO_GO` until the missing runner and gates below exist and pass.

## Existing reusable surfaces

| Capability | Existing source | Current proof | Boundary |
| --- | --- | --- | --- |
| A/B configuration and C/S/M pinning | `scripts/hr-cutover/prepare-full-domain-rehearsal.mjs` | Clean worktree, fixed source backup hash, unique project/database/volume/container/ports/roots/accounts/run | Writes a credential file outside evidence; commands must never print it |
| Isolated provision and sequential load | `scripts/hr-cutover/full-domain-lifecycle.mjs` | Lab target regex, loopback Docker, migrations, production seed, T0-T5 order, child failure stop | Real lab run requires completed T4 evidence |
| Technical UAT | `scripts/hr-cutover/run-full-domain-technical-uat.mjs` | Real loopback API and browser matrix; updates technical-UAT evidence | Human detached attestation remains separate |
| Reverse domain rollback | `full-domain-lifecycle.mjs` and domain adapters | Requires `uat_ready`; executes T5, T4, T3, T2, T1, T0 | It does not replace disaster restore |
| Cleanup/residual audit | `full-domain-lifecycle.mjs` | Enumerates database, container, network, volume, role, directory, account, file, port, process, credential artifact | Normal cleanup requires `rollback_ready`; recovery cleanup is failure-only |
| Global ledger/canonical facts | `materialize-full-domain-facts.mjs`, `verify-global-facts.mjs`, Slice 3 tests | PostgreSQL numeric ledger, domain/global canonical hashes, orphan and side-effect checks | No restored-database entry point/evidence yet |
| Generic backup pattern | `scripts/production-backup-restore-gate19.sh` | `pg_dump -Fc`, `pg_restore --list`, restore to a temporary DB, file archive/restore | Production-specific; insufficient HR verification; must not be called by lab runner |
| Source SQL Server restore | `scripts/restore-yuzhou-sqlserver-backup.sh` | Pinned source backup verification and read-only lab restore | This restores the immutable source, not the PostgreSQL rehearsal target |

## Missing engineering gates

1. **No HR rehearsal backup/restore runner.** There is no script that consumes one rehearsal config, creates a custom dump, hashes the dump and normalized TOC, and restores to a separately registered `jinhu_hr_migration_lab_full_*_restore_*` database.
2. **No fault catalog or fail-closed injector.** Required controlled faults are not defined. The first version should support only allowlisted, reversible target-lab faults: terminate the managed API process/container; make one registered restored file unreadable; or change one row in a dedicated verification fixture/schema. It must reject production-like targets, arbitrary SQL, arbitrary paths, and unregistered resources.
3. **No restore canonical verifier.** Restored platform schema/history, migration checksums, HR global ledger/domain hashes, orphan checks, side-effect allowlist and file tree SHA-256 are not compared with the pre-fault source facts.
4. **No RTO/RPO machine evidence.** Start/end monotonic timestamps, dump boundary, restore-ready boundary, verification-ready boundary, data-loss observation and clock source are absent. Engineering must record measured facts only; approval against targets remains `RTO_RPO_UNAPPROVED` until owners provide targets.
5. **Restore resources are absent from the resource registry.** Restore DB/role/directory/files/processes must be planned before creation, observed after creation and actually absent after cleanup.
6. **No backup evidence schema or tamper tests.** Required fields and hash chain are not represented in the parent manifest. Missing dump, altered TOC, wrong source DB, wrong C/S/M, wrong restore DB, skipped fault, failed canonical equality, reused restore identity, non-zero RPO or residual must all fail closed.
7. **Rollback entry is too weakly coupled to UAT evidence.** The lifecycle state is `uat_ready` before the external technical UAT has necessarily passed. The new pre-rollback gate must inspect the latest hash-valid manifest and require `hardGates.technicalUat.status=PASS`, all six children verified, backup/restore PASS, and fault evidence PASS before calling the existing rollback command.
8. **Gate 19 file verification is insufficient.** HR rehearsal needs a deterministic SHA-256 file-tree manifest over relative path, byte size and content hash, not a single MD5 sample. Empty file roots must be explicitly represented.

## Files to implement in the next slice

Keep production import and production restore out of this slice.

- `scripts/hr-cutover/contracts/rehearsal-backup-restore.schema.json`
- `scripts/hr-cutover/rehearsal-backup-restore.mjs`
- `scripts/hr-cutover/rehearsal-fault-injector.mjs`
- `scripts/hr-cutover/verify-rehearsal-restore.mjs`
- `scripts/e2e/yuzhou-full-domain-backup-restore.mjs`
- package entries:
  - `hr:migration:full:backup-restore`
  - `test:e2e:yuzhou-full-domain-backup-restore`

The runner should reuse exported lifecycle validation and global-fact functions. It must not copy domain transforms or invoke `scripts/production-backup-restore-gate19.sh`.

## Required state and evidence sequence

For each rehearsal independently:

1. Read and validate the 0600 config without printing it.
2. Require latest state `uat_ready`, latest manifest technical UAT `PASS`, all T0-T5 children `verified`, fixed C/S/M, and no running operation lock.
3. Append planned restore DB/role/directory/file/process resources to the same registry before creating them.
4. Capture pre-fault facts:
   - migration history filename/status/checksum set;
   - platform schema/catalog hash;
   - global/domain canonical hashes and ledgers;
   - quarantine reason ledger;
   - online side-effect allowlist hash;
   - deterministic file-tree SHA-256 manifest.
5. Execute `pg_dump -Fc` inside the pinned rehearsal PostgreSQL container. Record dump SHA-256, bytes, `pg_restore --list` bytes/hash and a normalized TOC hash. Store artifacts under the registered 0700 evidence root with mode 0600.
6. Inject exactly one allowlisted fault and prove the expected health/canonical check fails. Record only fault type, registered target identity, timestamps and result; never record row values or credentials.
7. Create a new, explicitly registered restore database; never drop or overwrite the incident/source database. Restore with `--exit-on-error --no-owner --no-privileges` and fail on stderr/error.
8. Run the same platform, HR, ledger, orphan, side-effect and file-tree verifiers against the restore target. Require exact equality to the pre-fault facts.
9. Record measured RTO from restore start to verified-ready and measured RPO as the difference between the pinned dump boundary and restored canonical facts. For this stopped rehearsal dataset, observed RPO must be zero; target approval remains a separate business gate.
10. Append a superseding parent manifest whose restore gate is `PASS`, with only relative evidence paths and hashes.
11. Call the existing reverse rollback only after the new pre-rollback gate passes, then call normal cleanup and require every planned and observed original/restore resource to have `removed=true,residualCount=0`.

## Fault matrix for v1

| Fault ID | Injection | Expected detection | Recovery proof |
| --- | --- | --- | --- |
| `API_PROCESS_TERMINATED` | Stop only the run-registered API process/container | health/ready check fails; DB facts remain readable | Restore verifier starts a separately registered verification process or uses DB-only checks, then confirms facts |
| `REGISTERED_FILE_UNREADABLE` | Change mode only on one run-registered fixture file; restore it in `finally` | file-tree/readability verifier fails | restored file tree equals pre-fault SHA-256 manifest |
| `VERIFY_FIXTURE_ROW_CHANGED` | Mutate only a dedicated run-scoped verification schema row | canonical verifier fails | restored database canonical facts equal pre-fault facts |

Do not inject damage into migration history, production-shaped schemas, credentials, source SQL Server, Docker volumes or unregistered paths. Do not use arbitrary SQL passed from CLI.

## Contract and negative tests

The contract test must create fixture-only resources and prove:

- wrong database/project/container, production marker, unregistered restore identity or non-loopback Docker context fails before write;
- backup artifacts are 0600 and evidence directories 0700;
- dump/TOC/evidence tampering fails;
- restore database equals neither source nor any A/B identity;
- `pg_restore` always targets a new registered database and never uses an overwrite path;
- every fault is allowlisted and the expected detector actually fails before restore;
- skipped fault, skipped technical UAT, partial T0-T5 run, or technical UAT HOLD blocks rollback;
- restored migration history, platform hash, HR global/domain hashes, ledger, quarantine ledger, side-effect hashes and file-tree hashes match exactly;
- UUID, sequence, run ID and timestamps remain excluded from canonical equality;
- RTO/RPO values are non-negative measured integers and no unapproved target is reported PASS;
- signal/failure cleanup includes restore resources and ends with actual residual zero;
- reports contain no secrets, connection strings, personal fields or payroll values;
- ordinary deploy, schema migration, production seed and lab runner have no path to production import/restore.

## Exact execution sequence after implementation

The following is an operator template. Placeholder values must be supplied through local protected files or unused loopback ports; no secret value should be placed on the command line or in captured output.

```sh
cd /Users/mac/Documents/jinhu-smart-park-worktrees/yuzhou-uat-score100

git status --short
git fetch --prune origin
git rev-parse HEAD
git rev-parse origin/main

pnpm run test:e2e:yuzhou-full-domain-contract
pnpm run test:e2e:yuzhou-full-domain-lifecycle
pnpm run test:e2e:yuzhou-full-domain-slice3
pnpm run test:e2e:yuzhou-full-domain-backup-restore

pnpm run hr:migration:full:prepare -- \
  --rehearsal A \
  --suffix rehearsal_a_<unique> \
  --postgres-port <unused-loopback-port-a> \
  --api-port <unused-loopback-port-a> \
  --web-port <unused-loopback-port-a> \
  --control-root <absolute-0700-control-root> \
  --etl-env <absolute-0600-etl-env> \
  --t4-evidence <absolute-0600-t4-evidence> \
  --source-container <pinned-read-only-source-container> \
  --source-backup <absolute-pinned-source-backup>

pnpm run hr:migration:full:provision -- --config <absolute-config-a>
pnpm run hr:migration:full:run -- --config <absolute-config-a>
pnpm run hr:migration:full:technical-uat -- --config <absolute-config-a>
pnpm run hr:migration:full:backup-restore -- --config <absolute-config-a> --fault VERIFY_FIXTURE_ROW_CHANGED
pnpm run hr:migration:full:rollback -- --config <absolute-config-a>
pnpm run hr:migration:full:cleanup -- --config <absolute-config-a>
pnpm run hr:migration:full:status -- --config <absolute-config-a>
```

Repeat the same sequence for B with `--rehearsal B`, a different suffix, all different ports and a different control root. Before B starts, compare A and B configs with the existing isolation verifier and require the C/S/M triple to be byte-identical. After B cleanup, compare A/B source and staging hashes, global/domain hashes, ledgers, quarantine reasons, restore facts, technical UAT task-card version and both resource ledgers.

Normal successful cleanup removes runtime and credential artifacts, so immutable sealed audit bundles must be copied only by the lifecycle's governed evidence mechanism before removal. Operators must not use recursive cleanup commands manually.

## Go/No-Go result for this inventory

- Rehearsal A execution: `NO_GO` — backup/restore/fault/RTO-RPO runner and pre-rollback evidence gate are missing.
- Rehearsal B execution: `NO_GO` — depends on a valid, fully cleaned A and the same missing runner.
- Production historical import: `HOLD`.
- Production restore: `HOLD`, and must remain a separate future workflow and authorization from production import.
