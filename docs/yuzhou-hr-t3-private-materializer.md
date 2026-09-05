# T3 private review artifact preparation

The private materializer connects authenticated staging files to the normalized
T3 assembler and creates a phase file, candidate file, policy lineage file and
completion receipt. Every result remains `productionImport: HOLD`. This command
does not approve decisions, connect to a database, extract source data or import
production records.

Run from a clean checkout matching the C component of the existing source/target
evidence:

```sh
node scripts/hr-cutover/materialize-production-t3-decision-candidates.mjs --config /private/canonical/config.json
```

The private 0600 JSON config has exactly this shape; replace the descriptive
placeholders with existing authenticated evidence, not newly invented hashes:

```json
{
  "formatVersion": 1,
  "triple": {
    "codeSha": "CURRENT_C_40_HEX",
    "sourceSnapshotHash": "EXISTING_S_64_HEX",
    "mappingContractHash": "EXISTING_M_64_HEX"
  },
  "stagingDir": "/private/canonical/t3-stage",
  "artifacts": {
    "sourceManifest": {"path": "/private/canonical/source-manifest.json", "sha256": "FILE_BYTES_64_HEX"},
    "targetInventory": {"path": "/private/canonical/target-inventory.json", "sha256": "FILE_BYTES_64_HEX"},
    "t0Candidates": {"path": "/private/canonical/t0-candidates.json", "sha256": "FILE_BYTES_64_HEX"}
  },
  "outputDir": "/private/canonical/new-empty-output"
}
```

Both directories must already exist, be owned 0700 directories and resolve to
their exact canonical paths. All inputs are owned 0600 regular files with one
link; symlink paths and hardlinked inputs fail. Output must be a distinct empty
directory. Staging always contains `manifest.json`, `attendance.jsonl`,
`policies.jsonl` and `insurance.jsonl`.

The source manifest descriptor authenticates raw file bytes. The target inventory's
`sourceManifestSha256` must match the source verifier's canonical JSON hash, which
is a different binding. Current C/S/M, source restore/catalog references, stage
hashes/counts, full target inventory, target scope and T0 dependencies must agree.
The command never relabels old evidence to satisfy a new C/S/M.

Successful output contains:

| File | Contents |
| --- | --- |
| `t3-phase.json` | Canonical normalized provenance across all eight T3 tables |
| `t3-candidates.json` | Same normalized records with explicit candidate dispositions |
| `t3-policy-lineage.json` | Recovery proof and twelve-to-six lineage under `records` |
| `t3-materialization-receipt.json` | Completion, source/target references, hashes, bytes and counts |

The receipt is created last, after fsync and authenticated readbacks of all three
artifacts. Candidate `phaseArtifactSha256` hashes the exact phase-file bytes,
including the final newline. Historical policies are reconstructed and checked
against their original raw row SHA before normalization. Current fractional
policies retain their existing semantics. Missing dependencies and semantic
failures remain explicit review/quarantine records.

Input reads and output writes use 64 KiB buffers. Limits are config 1 MiB,
metadata/T0/inventory 32 MiB each, fixed stage files 64 MiB each, JSONL lines 1 MiB,
aggregate input 128 MiB, output artifacts 384 MiB each and all output including
receipt 1 GiB. No CLI flag raises these limits. Structured records remain in
memory inside the assembler; full-size memory/throughput acceptance is separate.

On failure, preserve the output directory and all data artifacts for inspection.
The command removes only its own failed completion marker after confirming the
inode identity. It never removes another writer's replaced marker or data files.
An unsuccessful marker rollback reports a distinct stable error and remains a
failed run. Retry into a different empty directory. A receipt's mere existence
does not prove successful completion after an abrupt interruption or failed
cleanup; require a successful command result and verify every referenced artifact.

stdout contains aggregate counts, reasons and hashes only; errors contain stable
codes only. Private source values and file paths are not suitable for logs or Git.

Validation entry:

```sh
pnpm test:e2e:yuzhou-production-import-t3-artifact
```

Synthetic tests exercise real file IO and the CLI, including late write/readback
and receipt failures. They do not prove a real source run, live target freshness,
approved-decision freezing, full business parity or production execution. Existing
stale receipts must be refreshed through their original authorized producers before
a real materialization; do not transplant current hashes into old receipts.
