# Final Rehearsal A/B local readiness audit — 2026-08-28

## Decision

**NO-GO for real A/B execution today.** The workstation has the core runtime, source backup, source lab container, disk, and a collision-free proposed resource set, but no two fresh prepared configs exist and the current technical UAT still writes `p0Execution=HOLD`; it does not create the required 25-item `technical-uat-p0-observations.json`. Final pair execution must therefore remain fail-closed. Production import remains `HOLD` and was not invoked.

Audit candidate: `16d7691030916296a7bc90254e0280a8f7eb031c`, clean worktree, with `origin/main` as an ancestor. This audit only read process/resource metadata and file hashes. It did not read credential contents, connect to business tables, start containers, create databases, reserve ports, or remove resources.

## Runtime evidence

| Gate | Observation | Status |
| --- | --- | --- |
| Docker CLI/server | client 29.7.2; server 29.5.2; overlayfs; 4 CPUs; about 8.3 GB configured memory | READY, capacity risk noted |
| PostgreSQL tools | `psql`, `pg_dump`, `pg_restore` 16.14 | READY |
| Node / pnpm / Git | Node 24.18.0; pnpm 9.12.0; Git 2.50.1 | READY |
| Browser | Google Chrome 151 executable present | READY |
| Host disk | 646 GiB available; filesystem 27% used | READY |
| Docker disk | images 5.699 GB; volumes 10.32 GB; no cleanup performed | READY |
| Read-only source lab | `jinhu_yuzhou_migration_lab-sqlserver-1` running and healthy; SQL Server port published only on loopback `127.0.0.1:14333` | READY |
| Source backup | `/Users/mac/Downloads/飞书资料收件箱/hr2026081914.dbk`, readable regular file, 364,988,928 bytes | READY |
| Backup identity | SHA-256 `3ed50b9a2ba420c0fb7a9c2628f9a2d62a05e7a14ba574929bc145ac47a9036e`; matches the completed T4 source evidence | READY |
| ETL authority artifact | `database/import-reports/yuzhou-hr/20260820_intake01-etl.env`, readable, mode 0600; contents were not printed | READY for prepare validation |
| T4 evidence | completed evidence binds 8,342 = 8,320 + 22 headers, 190,374 items, 266 closes, net 15,723,009.9100, cold archive 37,750 | READY; source artifact is copied to 0600 by prepare |

Docker reports one unrelated active Smart Park PostgreSQL listener on `127.0.0.1:15432`. That port must not be selected for rehearsal.

## Proposed fresh A/B resource set

The following identities were checked read-only and were absent/free at audit time. This is evidence for planning, not a reservation; recheck immediately before prepare and execute.

| Resource | Rehearsal A | Rehearsal B | Audit result |
| --- | --- | --- | --- |
| suffix | `finala_20260828r2` | `finalb_20260828r2` | distinct |
| project/database | `jinhu_hr_migration_lab_full_finala_20260828r2` | `jinhu_hr_migration_lab_full_finalb_20260828r2` | no matching container, volume, network or directory |
| PostgreSQL port | 15441 | 15442 | both free |
| API port | 3141 | 3142 | both free |
| Web port | 4141 | 4142 | both free |
| container | project + `-postgres-1` | project + `-postgres-1` | distinct and absent |
| volume | project + `_postgres_data` | project + `_postgres_data` | distinct and absent |
| Compose network | project + `_default` | project + `_default` | distinct and absent |
| role/account namespace | deterministically derived from each distinct project and rehearsal ordinal | same rule | cannot collide by construction; validateConfig remains authoritative |

The proposed control root `/Users/mac/Documents/jinhu_hr_rehearsal_control` does not yet exist. Creating it as mode 0700 is a required ordinary setup step immediately before prepare. No directory was created by this audit.

## Existing residual-resource audit

- No Docker container, volume, or network named `jinhu_hr_migration_lab_full_*` was present.
- No local directory matching `jinhu_hr_migration_lab_full_*` was found within the checked Documents depth.
- No host PostgreSQL database or role matching `jinhu_hr_migration_lab_full_*` / `yzfull_*` was reported by the available local PostgreSQL service.
- The source SQL Server lab and the ordinary Smart Park PostgreSQL container are expected existing resources and must not be reused as rehearsal targets.
- No cleanup was performed.

## Blocking gaps

1. **P0 execution evidence is not implemented in the current technical UAT runner.** It still writes `p0Execution=HOLD` and `humanUat=HOLD` and does not emit the required 25 immutable observation records. This is the primary hard blocker.
2. **Two fresh configs do not exist.** Prepare A and B only after the P0 runner is connected, using the same clean candidate SHA and the same source/evidence bytes.
3. **Control and summary directories are not prepared.** Create dedicated 0700 directories; keep configs, credentials, evidence and final summary 0600. The final summary must be outside both runtime roots.
4. **Docker memory is modest.** The source SQL Server plus two provisioned PostgreSQL targets and browser/API/Web stages may approach the configured 8.3 GB. Because the corrected pair runner provisions both targets before comparison, observe memory pressure during an isolated rehearsal and fail rather than swap-thrash or kill a database.
5. **Vacancy checks were missing from final preflight.** A minimal patch in this audit adds a read-only gate for occupied ports and residual Compose project/container/volume/network identities before provision. The check is still subject to a normal check/use race, so provision remains the final authority.

## Required execution order after blockers close

1. Fresh fetch; prove candidate clean and freeze C/S/M.
2. Recheck the six ports, proposed Docker identities, free disk, source container health, backup hash and artifact modes.
3. Create a 0700 control root and separate 0700 external summary directory.
4. Prepare A and B with different suffixes and all six different ports; do not print credential contents.
5. Run pair preflight without `--execute`; require runtime vacancy PASS and pair contract PASS.
6. Only after the real 25-item P0 executor exists, use the explicit isolated-lab execution authorization. The runner must compare both manifests before B→A rollback and prove actual residual zero for both.
7. Keep production historical import `HOLD`; this readiness audit grants no production authorization.
