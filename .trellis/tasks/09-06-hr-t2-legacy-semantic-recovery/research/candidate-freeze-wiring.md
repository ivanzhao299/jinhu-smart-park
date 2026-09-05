# Research: Candidate freeze wiring

- Query: Shortest T0–T3 candidate → reviewed frozen decisions → existing real-artifact bridge preparation path; existing producers, interface gaps, and required tests.
- Scope: internal; source and checked-in synthetic contracts only, no private source/evidence reads or execution.
- Date: 2026-09-06

## Findings

### Recommendation

Use one strict adapter over the existing four candidate/phase artifacts and externally supplied reviewed decision evidence. Emit the existing real role wrappers, then call `bridgeProductionImportRealArtifacts`. A second planning engine, new writer, or new approval system is unnecessary for this preparation boundary. Fully formed externally reviewed `real_decisions` already work directly: the bridge contract constructs exactly this path (`scripts/e2e/yuzhou-production-import-real-artifact-bridge-contract.mjs:54`, `:73`, `:83`, `:92`). This is structural/integrity readiness, not signature verification or production authorization.

The adapter must not convert every candidate automatically into a business write. Missing review evidence is a deterministic HOLD with counts. Preserve every original exception, source identity/hash, candidate artifact and reviewed resolution. Do not repair candidates by changing source bytes, choosing duplicate winners, fabricating attestations, or replacing original reasons with generic approval text.

### Files found and responsibilities

- `scripts/hr-cutover/materialize-production-t0-decision-candidates.mjs:370` — private T0 candidate producer; emits original provenance, inventory/scope/phase bindings and HOLD (`:391`).
- `scripts/hr-cutover/materialize-production-t1-decision-candidates.mjs:300` — private T1 producer; complete inventory path additionally requires source revalidation; output uses `targetSnapshotArtifactSha256` even for the full inventory (`:338`).
- `scripts/hr-cutover/production-t2-decision-candidates.mjs:210` and `materialize-production-t2-decision-candidates.mjs` — pure assembler plus private IO owner; T2 includes phase/inventory/T0/resolution references and review-only status.
- `scripts/hr-cutover/production-t3-decision-candidates.mjs:147` and `materialize-production-t3-decision-candidates.mjs` — canonical normalized phase plus candidates, with detached policy lineage; use the matching normalized phase, not an older expanded policy phase.
- `scripts/hr-cutover/materialize-production-t{0,1,2,3}-phase-artifact.mjs` — existing phase provenance producers; T3 candidate materializer also owns the normalized phase it emits.
- `scripts/hr-cutover/materialize-production-t0-target-inventory.mjs` — read-only inventory materializer; its authenticated rich inventory must be projected into the frozen inventory payload, not passed through unchanged.
- `scripts/hr-cutover/production-import-real-artifact-bridge.mjs:140` — pure existing wrapper/hash/C/S/M/coverage adapter, calls generator and stays `productionImport: HOLD` even on READY (`:195`).
- `scripts/hr-cutover/production-import-payload-generator.mjs:127` — strict frozen-envelope, disposition, dependency, collision/CAS, crypto-metadata and complete-decision-coverage validator.
- `scripts/hr-cutover/production-import-crypto-provider.mjs:128` — existing real encryption preparation primitive with injected external key resolver, returns envelope plus metadata; no need to invent crypto hashes.
- `scripts/hr-cutover/production-import-sealed-plan-lib.mjs:378` and `execute-production-import.mjs:565` — independent downstream approval and activation enforcement.

Search under `scripts/hr-cutover` and `scripts/e2e` found `real_decisions`/`frozen_decisions` consumers and synthetic fixtures, but no production candidate-to-frozen-decisions producer. The T0 comment referring to an existing controlled resolver (`:365`) is not evidence that a callable producer exists.

### Exact interface conflicts

| Candidate or input | Existing consumer contract | Required adapter behavior |
| --- | --- | --- |
| `candidateDisposition` plus seven provenance fields, `reasonCode`, business hash and expected-target diagnostics | Frozen row permits exactly phase/table/source identity, `disposition`, `targetFields`, `dependencyRefs`, plus four disposition-specific optional keys (`payload-generator:24`, `:182`) | Construct an explicit allowlisted row; preserve excluded diagnostics in authenticated review evidence. Match all candidate provenance to the phase row before projection. |
| `insert`, `skip_exact`, `review_target_collision`, `quarantine` | `insert`, `skip_approved`, `merge`, `quarantine` | Insert may preserve approved candidate fields. Exact skip requires externally supplied attestation and version. Collision needs explicit reviewed merge or quarantine; never rename collision to merge implicitly. Existing exceptions remain quarantined unless separately reviewed source/semantic correction produces new valid evidence. |
| `expectedTargetVersion` and candidate ID/hash | `expectedTargetVersionBefore` for skip/merge; target ID and canonical before hash recomputed from inventory (`:264`) | Compare candidate hints to authenticated inventory and generator results; do not trust/forward hints as authoritative outputs. Merge requires actual encrypted before-image metadata and exact before canonical hash. |
| T1 dependency objects include `candidateDisposition` (`t1-materializer:249`) | Exact four keys: role, phase, source identity, expected table (`payload-generator:205`) | Validate the annotation against the referenced candidate, then explicitly project the four consumer keys. Unknown extra keys still fail. |
| Quarantine `targetFields: null` (`production-t3-decision-candidates:28`; T2 `:45`) | Plain object required even for partial quarantine (`payload-generator:75`, `:299`) | For reviewed quarantine, use an explicitly reviewed partial business object, including `{}` when there are no valid fields. Preserve original candidate/reason/source evidence separately; this does not make invalid fields valid. |
| T3 quarantine can retain refs to absent parents (`production-t3-decision-candidates:98`) | Every supplied ref must resolve, including quarantine (`payload-generator:188`, `:205`); absent refs are permitted for quarantine (`:216`) | Require explicit reviewed executable dependency projection for these quarantines. Preserve original unresolved refs in the retained evidence. Do not silently drop refs, invent parent records, or turn a blocked child into insert. Cycles likewise remain HOLD until explicitly resolved. |
| Rich raw inventory and candidate artifact byte hashes | Frozen inventory exact payload `{formatVersion,artifactKind,targetScope,records}`; records exact five inventory fields (`payload-generator:138`, `:169`) | Authenticate rich inventory, scope, target identity, C/S/M and all candidate bindings first; project the frozen payload and recompute its canonical envelope hash. Raw-file SHA and frozen-envelope SHA are different contracts. |
| Different candidate envelope names/statuses | Bridge real wrappers have exact `{formatVersion,artifactKind,triple,payload}`; all four exact phase artifacts required (`real-artifact-bridge:110`, `:144`) | Validate each phase-specific envelope, including T1 inventory alias and T0 dependency hash aliases; accept review artifacts as evidence, never as approval. Do not force all phases to one guessed envelope shape. |

### Minimal preparation algorithm and proposed ownership

1. Authenticate explicit bytes/descriptors for all four phase artifacts and candidates, complete target inventory, scope, and externally reviewed decisions/evidence. Validate exact C/S/M, phase hashes, target scope/identity, candidate counts and T0 dependency references. No source DB or writer access.
2. Require one reviewed disposition per source identity for the entire phase index, rejecting duplicates/extras/missing rows. Bind non-insert evidence to candidate artifact hash, source identity/hash, selected disposition, fields/dependencies, inventory/scope and C/S/M. Hash shape alone is not proof that a human signed it; the external review authority owns authenticity. Do not synthesize signatures from user authorization or role names.
3. Build the frozen staging content exactly as the bridge does: phases in T0→T3 order, each original record array retained (`real-artifact-bridge:148`, `:157`). Preserve explicit zero-table counts; do not omit rejected records to obtain READY.
4. Build frozen inventory and sealed scope payloads; use `computeFrozenArtifactHash` for their content hashes. Build frozen decisions with these hashes and the frozen staging hash. Set each `phaseManifests[phase]` to the exact phase **file-byte** SHA, not a candidate/source-stage-manifest SHA (`real-artifact-bridge:182`). Wrap decisions/inventory/scope with the existing real role identities and exact triple.
5. Validate with the existing bridge/generator. Persist only private exclusive output and a sanitized aggregate receipt when IO is authorized; all preparation results stay HOLD for production.

Proposed minimal write ownership for an implementer:

- New `scripts/hr-cutover/production-import-candidate-freeze.mjs`: pure explicit-input validation, review join, exact projection, wrapper preparation and existing bridge invocation.
- New `scripts/e2e/yuzhou-production-import-candidate-freeze-contract.mjs`: synthetic preparation/negative contracts.
- Only if an actual private-file command is required, add `scripts/hr-cutover/materialize-production-import-frozen-decisions.mjs` and its IO contract test. Follow the existing private reader/output ownership rules; no DB, runtime activation, credential discovery or signing capability. A pure adapter is sufficient when an existing caller supplies authenticated bytes.
- Add the focused test to the existing relevant package/CI command and document the preparation contract through the normal implementation/spec workflow. No changes to writer, sealed-plan approval rules, activation contract, or existing candidate semantics are required by the minimal path.

### Crypto and authorization boundaries

Skip needs `decisionAttestationSha256`; merge additionally needs exact inventory version and `{algorithm,plaintextSha256,ciphertextSha256,keyReferenceSha256}`; quarantine additionally needs original reason and `{algorithm,payloadCiphertextSha256,keyReferenceSha256}` (`payload-generator:238`, `:250`, `:275`). Use actual external envelopes/bindings, or the existing encryption primitive with an authorized resolver. Never dummy/hash a label as production attestation or ciphertext evidence.

The crypto provider authenticates quarantine plaintext against the **generated payload hash** (`production-import-crypto-provider:70`), and the writer checks the actual returned ciphertext against the sealed hash (`production-import-phase-writers:463`). Thus `{}` encrypted as a quarantine payload preserves no rejected source fields. Original exception details/source lineage must remain in separately authenticated retained review/source evidence; do not claim the runtime quarantine payload archives the full original record. Full-source encrypted archival would be a separate contract change. Bind/reuse actual prepared envelopes; re-encrypting with a new random nonce will not reproduce a previously frozen ciphertext hash (`production-import-crypto-provider:137`).

Production activation and distinct `hr_owner`, `data_security_owner`, `release_owner` subjects and signed receipts remain separate (`production-import-sealed-plan-lib:28`, `:378`, `:391`; `execute-production-import:571`). READY bridge output neither checks signature authenticity nor activates production.

### Required tests, not executed in this research

- Real producer-shaped T0–T3 synthetic candidates through adapter → bridge → generator, all sixteen model tables plus zero-count tables; exact original provenance/record conservation and deterministic frozen hashes.
- Insert, approved exact skip, reviewed merge with real synthetic crypto, reviewed quarantine with null/partial fields, and T1 five-key dependency normalization. Missing/invalid attestation or envelope remains HOLD/fails; no implicit collision decision.
- Missing/duplicate/extra decisions; changed candidate/phase/raw-byte/frozen hash; stale C/S/M/scope/inventory; wrong T0 dependency artifact; false counts; unsupported keys/statuses.
- Quarantined parent with valid child quarantine, inserted child of quarantined parent rejection, explicit unresolved-ref preservation versus reviewed executable-ref projection, missing ref/cycle rejection, duplicate business identity, stale target version and mismatched before-image.
- Preserve semantic reasons, orphan exceptions and T3 policy lineage; null-to-object normalization must not earn compatibility credit or claim source archival. No candidate/raw input mutation.
- External real-decisions bypass path works without adding candidate producer layers when already complete and reviewed. READY still reports production HOLD and does not call writer, signing, activation, network or DB.
- Run existing bridge and payload-generator contracts alongside adapter suite. If CLI added, test owned 0600/0700 no-follow bounded IO, byte races, exclusive outputs, fsync/readback, safe failure and aggregate-only logs; use synthetic input only.

## Related specs and external references

- `.trellis/spec/api/backend/yuzhou-t2-production-projection.md` — authenticated original source hashes, legacy semantics, explicit exceptions and private IO.
- `.trellis/spec/api/backend/yuzhou-t3-decision-candidates.md` — normalized phase conservation, parent-before-child quarantine and lineage.
- `.trellis/spec/api/backend/yuzhou-t3-private-materializer.md` — private file authentication, canonical output, receipt and failure discipline.
- `.trellis/spec/guides/project-operations.md` — scoped evidence, secret safety and binding changes.
- External references: none needed; findings are from repository implementations and contracts, not external product/version claims.

## Caveats / Not Found

- No current private artifacts, source rows, database, credentials, runtime, CI or deployment were inspected; no tests/builds/git operations performed. Existing task's aggregate real-source findings were not independently revalidated.
- Availability/authenticity of actual external decision attestations, crypto envelopes, before-images and reviewer identities is unproven. The adapter can consume them; it cannot manufacture them.
- Full-scale memory/output capacity and current release binding remain separate validation. Pure code readiness does not demonstrate real production import readiness.
