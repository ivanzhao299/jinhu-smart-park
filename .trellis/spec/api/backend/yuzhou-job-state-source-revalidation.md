# Yuzhou production job-state source revalidation

## Scope

Candidate preparation only. Default T0 materialization still requires exact decision C/S/M. Explicit `--source-manifest` enables a fresh current-code semantic check of historical source evidence, not transfer of historical authorization or a current-run success claim.

## Contract

`verifyProductionJobStateSourceRevalidation({decision,triple,sourceManifest,stageManifestBytes,dictionaryBytes,employeeRows})` checks the verified v2 machine artifact, full source manifest, current S/M, all T0 domain manifest bindings, three complete dictionary byte hashes, dictionary aggregate and every state row hash/count. It independently compares employee usage and current deterministic policy results. Empty metadata and unused dictionary entries remain hash-bound rather than dropped.

The T0 CLI owns private bounded reads and current full inventory/source-manifest binding. The original decision may have historical C/M only after source and current semantic checks pass; its immutable byte SHA remains `jobStateDecisionArtifactSha256`. Current target scope, output triple and phase provenance remain independent. The output envelope is unchanged for T1/T2 consumers. No human identity/signature is asserted; outputs stay HOLD.

## Required negative tests

- Default path rejects stale C/M; opt-in requires the manifest and full current target inventory.
- Reject changed source S/current M, stage bytes/domain count, any dictionary bytes/evidence hashes, row hash, dictionary aggregate, actual employee usage, missing employees, unknown states, changed semantic results and invalid machine assertions.
- Preserve original decision bytes and original C/M; preserve current target scope rather than old lab scope.
- CLI errors contain stable codes only; invalid inputs must not create candidate output.

## T1 employment events

`verifyProductionT1SourceRevalidation({triple, sourceManifest, stageManifestBytes, stageBytes, typeDecision, statePackage})` verifies all three T1 files and recomputes event type/state usage. Original state row, snapshot and machine-attestation hashes are checked with the original triple; current policy is independently checked through `evaluateCoreT1StatePolicy` and the committed event-type contract. Original package bytes and C/M are not rewritten. The current type contract is source-specific (6,887 events/four types), not a generic zero-source approval.

`materializeProductionT1DecisionCandidates(input, options?)` enables this only with `sourceManifestPath` (`--source-manifest`). Exactly one `targetSnapshotPath` or `targetInventoryPath` is required. Full inventory requires the source manifest, all 16 target tables, current triple/canonical source identity, target scope, T0 inventory byte SHA and the existing T2 strong T0 dependency verifier. No accepted T0 employees means all source events remain quarantine. Exact existing target content becomes `skip_exact`; changed content, target ID collisions and every member of a duplicate source business group remain review. No target overwrite occurs.

For downstream compatibility, `targetSnapshotArtifactSha256` remains the byte hash of the supplied target evidence. In full inventory mode it refers to the complete inventory, not a fabricated legacy snapshot. The referenced artifact kind must be retained when freezing. Other evidence fields retain their original byte hashes. Reads are captured once, owned 0600 single-link/no-follow files and 0700 directories, at most 32 MiB/file and 128 MiB total. CLI has no head/budget override. Output creation is exclusive and hash-verified; errors expose stable codes only.

Required tests additionally cover consistent rehashed event usage drift, stale default rejection, exclusive target inputs, original evidence preservation, target/T0 drift, exact-skip/conflict/ID/source duplicates, all-quarantine conservation, modes/links/budget and existing output preservation. These tests and a real-source aggregate check are preparation evidence, not production data or API/UI parity acceptance.

T1 full-inventory candidates use strict calendar-valid local wall time, padded to six fractional digits with the existing inventory `+08:00` label; this is not UTC conversion. Other explicit offsets are rejected rather than silently discarded by PostgreSQL timestamp-without-zone. T1 writer SELECT uses `to_char(...SS.US)` and the same fixed label; readback must be an exact string, not a JS Date that lost microseconds. Keep T2 and global canonical hashing unchanged. The timestamp helper is part of the production execution dependency closure. Legacy default output remains historical compatibility only, not proof for full-inventory/current-writer exact matching. Test with actual inventory materialization, writer protocol checks and optional local fixed-literal PostgreSQL read-only casts.

## Limits

T2 uses the sibling explicit config `dictionaryRevalidation: "source_semantics"`. Its resolver accepts a final `{revalidateSourceSemantics: true}` option. Both original and current triples must be well-formed and share S; all consumed type/state bytes, source rows, aggregate hashes and actual usage remain verified. Original dictionary attestations are recomputed with original C/S/M, then each item is independently checked against `evaluateCoreT2DictionaryPolicy`. Package bytes/hash are unchanged. Current inventory, T0, phase and change-classification bindings are not relaxed. Unknown policy, changed reason/target and attestation relabeling must fail. Empty dictionaries remain explicitly validated. Tests must cover default rejection, opt-in success, malformed or different S, refreshed attestation rejection, unchanged package and stale change-classification rejection.

Integrity hashes are not external approvals. Source revalidation does not prove new runtime identity, successful production import, record-map freeze, full HR parity or business UAT. Never rewrite an old receipt's C/M or fabricate a lab checkpoint to make it current.
