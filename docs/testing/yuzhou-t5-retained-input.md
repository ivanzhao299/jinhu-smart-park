# T5 retained input preparation

The private-stage preparation CLI supports two mutually exclusive input modes:
`--stage` for the existing domain JSONL layout, or `--retained-config` for a pinned
source-free projection. Both also require `--triple`, `--t0-decisions`,
`--output-root`, and `--run-id`. Neither connects to a database or authorizes import.

The retained configuration is a private JSON file with `formatVersion: 1`,
`consumerTriple`, and five `{path, sha256}` descriptors: `historicalManifest`,
`historicalReceipt`, `currentReceipt`, `projection`, and `definitions`.
Use verified descriptor hashes; do not manufacture them from an unreviewed source.
Paths must be absolute, canonical, owner-private files. No credential belongs in
this configuration. Preserve original manifests and receipts without relabeling.

The loader verifies the two restore receipts against the same backup, retains
historical and consumer mapping identities separately, authenticates each historical
domain file, and checks complete one-to-one source identity/row/table/key/employee
coverage against the projection. Definition and materialized-field validation use
the existing adapter. Current T0 decisions determine employee inclusion; quarantined
parents remain excluded. Unresolved T0 target collisions still reject preparation.

The projection discriminator must be exactly `retained-projection`. Its row count
must match the historical manifest and be positive; empty retained preparations
are rejected before output creation, rather than producing an unusable success receipt.

Success writes `private-stage.json`, `retained-provenance.json`, and finally
`receipt.json` with private permissions. Original `--stage` mode still produces its
existing two files. Both modes refuse an existing output directory.

`sameBackupVerified` and `sourceIdentityCoverageVerified` do **not** prove field
transformation semantics, mapping compatibility, production-key compatibility,
database readback, or business UAT. Retained provenance deliberately keeps
`mappingCompatibilityVerified=false`, `projectionTransformationVerified=false`,
and `productionImport=HOLD`. Do not use preparation success as an execution gate.

Restore receipts are deterministic and have no observation timestamp. Re-probing
an unchanged read-only restore can legitimately produce the same receipt bytes.
Consequently, historical/current receipt hash equality is allowed here, and
inequality is not evidence of freshness either. The `currentReceipt` descriptor
is a caller-pinned provenance input, not a live-source attestation. Before an
operation requiring current source state, independently probe and validate that
state through the controlled source workflow; this offline helper cannot replace
that check. Do not recreate a restore merely to make the receipt hash different.

Focused checks:

```sh
node --test scripts/hr-cutover/t5-retained-source-binding.spec.mjs scripts/e2e/yuzhou-production-import-t5-nonfile-private-stage-contract.mjs scripts/e2e/yuzhou-production-import-t5-private-stage-cli-contract.mjs scripts/e2e/yuzhou-production-import-t5-binding-request-contract.mjs
```

These tests use synthetic records and disposable local files, not a production DB.
