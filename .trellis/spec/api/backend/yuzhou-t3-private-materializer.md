# T3 private artifact materializer

## Scope and interface

`materialize-production-t3-decision-candidates.mjs --config <private-absolute-path>`
authenticates existing attendance, policies and insurance staging, then calls the
normalized T3 assembler. It creates private review files only. It has no source
extractor, credentials, database, approval or production execution operation.

Config has exactly `formatVersion: 1`, `triple`, `stagingDir`, `artifacts` and
`outputDir`. `artifacts` has exactly `sourceManifest`, `targetInventory` and
`t0Candidates`; each descriptor has exactly canonical absolute `path` and lowercase
64-character `sha256`. C/S/M use the existing triple keys. No stale receipt rebinding
or CLI head/budget overrides are allowed. The exported function accepts test-only
`currentHead` and a lower `maximumReadBytes`; limits cannot be raised.

## Authentication contract

- Require clean current Git HEAD equal to C before preparation and before output.
- Authenticate descriptor file bytes, validate the complete source manifest, and
  match source S/M. Target inventory binds the verifier's canonical manifest hash
  (no newline), not the source descriptor's raw file-byte hash.
- Use the pure assembler's complete sixteen-table target inventory and exact T0
  dependency/identity/content validator. Hash references alone do not bypass these
  checks or prove current live target state.
- Bind stage manifest bytes to `phases.T3.stageManifestSha256`. Require exactly the
  three domains and fixed files/tables: attendance/`attendance.jsonl`/`dbo.timekeeptable`,
  policies/`policies.jsonl`/`dbo.insure_method`, insurance/`insurance.jsonl`/`dbo.person_insure`.
  Compare each hash and row count with both manifests. Validate optional source,
  restore-receipt, catalog, mapping and HOLD fields when present.
- Files are canonical-path, owned 0600 regular single-link files, opened no-follow.
  Compare dev/inode/mode/uid/gid/link count/size/mtime/ctime before and after reading
  and against the final path entry. Stage/output directories are owned canonical
  0700 directories; output is distinct and empty.
- Read at most 64 KiB per call. Config is at most 1 MiB, metadata/T0/inventory each
  at most 32 MiB, each fixed JSONL stage at most 64 MiB, aggregate input at most
  128 MiB. Every nonempty line must be valid fatal-decoded UTF-8 JSON and at most
  1 MiB. Blank LF-only lines do not count; whitespace-only lines fail. Missing final
  newline and UTF-8 characters split across read chunks are supported.

## Output and failure contract

Use `productionT3ArtifactJsonChunks` for canonical phase, candidate and lineage
serialization, with 64 KiB buffered writes and short-write handling. Preflight
hashes and byte counts before output creation. Each artifact is at most 384 MiB;
all outputs including the receipt are at most 1 GiB. The pure assembler retains
structured source/projection/output records; this is bounded serialization, not
fully streaming end-to-end processing or a full-scale peak-memory proof.

Reserve `t3-phase.json`, `t3-candidates.json` and `t3-policy-lineage.json` with
exclusive/no-follow 0600 descriptors before writing content. Fsync and stream
read back each file; require exact preflight hash/bytes and original inode. Check
all completed file stats again before receipt creation, comparing against the exact
snapshot authenticated during readback rather than a fresh post-readback baseline. Lineage uses an envelope
with `records: policyRecoveries`; recovered policies preserve their twelve-to-six
source relationship without conferring skip/archive approval.

Create `t3-materialization-receipt.json` last with exclusive/no-follow 0600 semantics,
then fsync, read back and fsync the directory. It contains only counts, status,
hashes, byte lengths, source/target references, C/S/M, `approvalClaimed: false` and
`productionImport: HOLD`. stdout returns only a safe aggregate summary.

On failure preserve the three data artifacts, including empty reservations and
partial files. Never overwrite or delete source, existing output or another
writer's file. The sole rollback exception is this run's failed completion marker:
unlink it only if the path still names the dev/inode created by this invocation.
Do not unlink a replaced receipt. Rollback failure emits
`T3_MATERIALIZER_RECEIPT_ROLLBACK_FAILED` and must never be treated as success.
After any failure, retain the directory for investigation and use another empty
directory for retry. Abrupt process/OS failure can leave incomplete state; existence
of a receipt alone is not sufficient: downstream acceptance must validate its
format and every referenced artifact and retain the successful command outcome.

All thrown/CLI errors contain a stable `T3_MATERIALIZER_*`, `T3_CANDIDATE_*` or
`T3_POLICY_RECOVERY_*` code without values, credentials or private paths. Results
remain `READY_FOR_REVIEW` or `REVIEW_HOLD`; neither means approved or executable.

## Required checks

`node --test scripts/e2e/yuzhou-production-t3-materializer-contract.mjs` exercises
actual synthetic file IO and clean-repository CLI execution: fixed domains,
canonical hashes, current/recovered policy values, empty domains, conservation,
binding drift, fatal UTF-8 and chunk boundaries, size limits, permissions/links,
mutations during reads, exclusive collisions, short writes, failed data writes,
readback corruption, and failed/changed receipt rollback. Large output bounds use
small synthetic byte-accounting fault injection; they do not create large artifacts.

The canonical helper's parity suite and materializer suite are included in the
existing `pnpm test:e2e:yuzhou-production-import-t3-artifact` CI entry.
