# Slice 2 runner and isolated lifecycle evidence

Recorded on 2026-08-26 from candidate baseline `4be0e8371e42eace73fc271071828c7765ea8a5e`. This is fixture and source-contract evidence only. No real A/B rehearsal, source extraction, target database load, production import, production restore, commit, push or deployment was performed.

## Delivered surface

- `full-domain-lifecycle.mjs`: closed configuration validator, C/S/M pinning, T4 pre-write gate, A/B disjointness verifier, resource plan/provisioning, append-only state/child journal, ordered forward/rollback execution, recovery cleanup, actual fixture residual enumeration and sealed cleanup audit bundle.
- `domain-adapter.mjs`: one environment allowlist and deterministic parent/child/target binding for every T0–T5 extract/load/rollback script. Fixture mode is executable; lab mode invokes only existing domain scripts after checking the isolated PostgreSQL Compose label.
- `full-domain-lifecycle.sh`: uses `exec` so HUP/INT/TERM reach the Node lifecycle directly; the Node runner is the single journal/cleanup owner and forwards signals to the active child before registry-scoped recovery.
- T1/T2/T3 package extract/load/rollback entries and T4 load/rollback entries. All six loader/rollback surfaces accept a pinned expected PostgreSQL Compose project; every rollback now requires both `ALLOW_YUZHOU_MIGRATION=yes` and `ALLOW_YUZHOU_ROLLBACK=yes`.
- Lifecycle contract test covers a complete fixture provision→T0…T5 extract→T0…T5 load→verify→UAT-ready→T5…T0 rollback→cleanup cycle.

## Executable invariants

1. State order is exactly `planned → provisioned → extracting → loading → verifying → uat_ready → rollback_ready → cleaned`; failed children and signals are journal facts, never successful state transitions.
2. `codeSha` must equal the current checkout and a real lab run rejects a dirty worktree; M is recomputed from every T0–T5 extract/transform/load/rollback script plus the adapter and contract/schema; A/B S and the full triple must match byte-for-byte.
3. T4 status/file mode/file type/content/hash are verified before the first filesystem or Docker write. A real lab additionally binds the read-only source backup hash and exact 35/46,092/711/244/1,431/647/9 profile.
4. Database and Compose project are the same `jinhu_hr_migration_lab_full_*` identity. Container, volume, role, account namespace, three ports, runtime/staging/evidence/file roots, credential artifact and audit bundle are deterministically namespaced.
   Real lab provisioning also requires a local Unix-socket Docker endpoint and rejects a pre-existing target container or volume before `docker volume create`, so a colliding/shared resource cannot be adopted and later deleted.
5. Domain order and reverse rollback order are verified from the child journal; a T2 load failure stopped after T0/T1 and never executed T3–T5.
6. Registry covers database/container/volume/role/directory/account/file/port/process/credential artifact. Cleanup records planned/observed/removed/residual for each type, performs actual post-delete enumeration, rejects symlinks and unregistered runtime paths, and only unlinks/rmdirs exact registry identities; it no longer recursively deletes the runtime root.
7. Runtime directories are `0700`; files are `0600`; audit JSON/JSONL is scanned for forbidden secret/personal/payroll keys and connection material. The credential file is never copied into a manifest, journal or audit bundle.
8. No production operation command exists. Every result remains `productionImport=HOLD`.

## Negative and recovery evidence

The fixture suite fails closed for unsafe target, A/B resource reuse, C/S/M mismatch, missing/tampered T4 evidence, `0644` source credential artifact, forbidden secret-like config, partial domain matrix, duplicate/concurrent run identity, child failure, signal interruption and unregistered cleanup residual. It proves that an unregistered file survives the rejected cleanup. A real SIGTERM was sent directly to the Node lifecycle while T0 extraction was paused; the signal owner terminated the active child and produced a sealed final registry with every registered resource `removed=true`, `residualCount=0`.

## Validation record

- Node syntax for lifecycle, adapter and lifecycle contract: passed.
- Shell syntax for lifecycle wrapper and all 18 T0–T5 extract/load/rollback scripts: passed.
- JSON parsing for package and full-domain contract/schema/fixtures: passed.
- `pnpm run test:e2e:yuzhou-full-domain-contract`: passed, 14 Slice 1 negative cases.
- `pnpm run test:e2e:yuzhou-full-domain-lifecycle`: passed, including complete fixture lifecycle, child failure, real SIGTERM recovery and nonzero-residual rejection.
- Existing T0 load/rollback, T1, T2, T3, T4 controlled rollback/extract and T5 contracts: passed after adapter tightening.
- Workspace `pnpm lint` and `pnpm typecheck`: passed.

## Boundaries and remaining work

- The `lab` provisioner path is implemented but deliberately not executed in Slice 2 because current T4 source evidence remains `not_started`; the pre-write gate correctly rejects that real configuration.
- Fresh migrations/production seed, real six-domain data, ledger/canonical hashing, three-role UAT and A/B comparison are later slices and are not claimed here.
- The mapping hash is now `3867c04767e7ee1d7d6c93999074313202d76082cbf3a51f832ca7bec81f2cb5` after expanding M to the complete executable six-domain mapping surface. All earlier M values are superseded for future rehearsal evidence.
- Production import and restore remain separate future run-level authorization surfaces and are unavailable here.
