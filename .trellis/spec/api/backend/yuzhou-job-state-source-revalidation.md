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

## Limits

T2 uses the sibling explicit config `dictionaryRevalidation: "source_semantics"`. Its resolver accepts a final `{revalidateSourceSemantics: true}` option. Both original and current triples must be well-formed and share S; all consumed type/state bytes, source rows, aggregate hashes and actual usage remain verified. Original dictionary attestations are recomputed with original C/S/M, then each item is independently checked against `evaluateCoreT2DictionaryPolicy`. Package bytes/hash are unchanged. Current inventory, T0, phase and change-classification bindings are not relaxed. Unknown policy, changed reason/target and attestation relabeling must fail. Empty dictionaries remain explicitly validated. Tests must cover default rejection, opt-in success, malformed or different S, refreshed attestation rejection, unchanged package and stale change-classification rejection.

Integrity hashes are not external approvals. Source revalidation does not prove new runtime identity, successful production import, record-map freeze, full HR parity or business UAT. Never rewrite an old receipt's C/M or fabricate a lab checkpoint to make it current.
