# T0–T3 candidate freeze preparation

## 1. Scope / Trigger

Use this adapter after the four T0–T3 phase and candidate producers have emitted exact private artifacts and, when needed, an external review process has supplied non-insert resolutions. This is preparation only: it performs no source extraction, database access, signing, trust decision, activation or production write.

## 2. Signatures

`freezeProductionImportCandidates({expectedTriple,phaseArtifacts,candidateArtifacts,targetInventoryArtifact,targetScopeArtifact,reviewedDecisionsArtifact})` consumes explicit `{path,bytes,sha256}` descriptors. Phase and candidate maps contain exactly T0–T3; reviews may be null. It returns `{summary,evidence,wrappers,bridge}`. Missing review returns counted HOLD with `wrappers: null` and `bridge: null`.

`materializeProductionImportFrozenDecisions(configPath, options?)` owns private file IO. The production CLI accepts only `--config`; test options may lower byte limits or inject the expected clean candidate revision. Every runtime dependency must be tracked, all tracked repository files must be clean, and HEAD must equal C before artifacts are consumed and again before output starts.

## 3. Contracts

- Authenticate exact byte SHA, fatal UTF-8, exact producer envelopes and expected C/S/M. Require the existing complete sixteen-table inventory, target identity/scope and all candidate phase/inventory/T0/source-manifest bindings. Preserve immutable source M; never rebind to the running mapping automatically.
- Match all seven provenance fields one-to-one between candidate and phase, reject duplicate/missing/extra rows, and verify disposition and table counts before HOLD. Existing T0/T1 phases without count fields need full table presence. Preserve T2/T3 explicit zeros and exact normalized T3 phase file SHA.
- Reuse the full target model/normalizer and T0 dependency validator. Recompute accepted business identities, derived IDs, canonical target matches, inventory versions and graph dependencies. T1's five-key ref annotation must equal the referenced candidate before projecting the existing four-key reference.
- Automatically project insert rows only. Non-inserts need exact externally reviewed rows. Skip/merge preserve candidate fields and refs; collisions never become implicit merges. Original quarantines cannot become inserts. Unknown fields, malformed reviews and invalid inserts reject even when another review is absent.
- Review and attestation declared content bind exact triple/scope/inventory/candidate bytes/source row/decision fields/crypto envelope. Attestation hash authenticates bytes, not a signature or signer. No signing, trust registry, authority grant or external key resolver belongs in this adapter.
- Use actual externally prepared crypto envelopes: compare encoded nonce/tag lengths, ciphertext hash, key reference, before canonical hash and version with generator metadata. Only the existing downstream crypto provider establishes actual AEAD context validity; retain the exact prepared envelope. Encrypting `{}` as a quarantine payload archives no original source fields.
- Reviewed quarantine explicitly supplies partial fields and executable refs, while evidence retains the original candidate, reason and dangling refs. Never silently remove orphan refs to obtain READY. Supplied executable refs must resolve; the existing generator owns final cycle/CAS/collision/coverage checks.
- Construct the existing frozen payloads and real role wrappers and call the existing bridge once. Do not create a parallel generator, writer, sealed planner or approval system. `phaseManifests` contain original phase byte hashes; canonical frozen content hashes are separate identities.
- Always report `productionImport: HOLD` and `approvalClaimed: false`. READY means preparation integrity only. A bridge HOLD emits no decision/inventory/scope wrappers.
- Config is at most 1 MiB; metadata at most 32 MiB; each phase/candidate/review at most 384 MiB; aggregate input at most 1 GiB. Each output is at most 384 MiB and aggregate output including the receipt at most 1 GiB. Use owned canonical 0600 no-follow single-link files and owned canonical 0700 directories.
- Use chunked canonical records serialization and 64 KiB IO. Reserve outputs exclusively, fsync and hash-read them back, recheck the exact output set, and create the receipt last. Preserve partial data; remove only this run's failed receipt inode. Errors and CLI output contain stable codes or aggregates only. These bounds do not prove real-scale peak-memory suitability.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Phase/candidate bytes, C/S/M, scope, inventory, T0 or source-manifest binding differs | stable `CANDIDATE_FREEZE_*` rejection, no output |
| Candidate row/count/field/target/dependency integrity differs | stable rejection before review HOLD can conceal it |
| Valid non-insert has no review | counted `REVIEW_HOLD`; retained evidence only |
| Review is duplicate, extra, stale, changes an original quarantine to insert, or changes skip/merge projection | stable rejection |
| Declared attestation or crypto bytes do not match their bound hashes/metadata | stable rejection; no claim of signer trust or AEAD authentication |
| Existing generator detects a dependency cycle, incomplete coverage or CAS/collision issue | bridge `REVIEW_HOLD`; wrappers withheld |
| CLI dependency is untracked, tracked work is dirty/staged, or HEAD differs from C | `FREEZE_MATERIALIZER_CURRENT_CODE_REQUIRED` before private outputs |
| Input permissions/link/path/size/hash changes or read budget is exceeded | stable materializer rejection |
| Output is replaced/corrupted, an unexpected file appears, or fsync/readback fails | no completion receipt; partial evidence remains |

## 5. Good / Base / Bad Cases

- Good: every insert candidate is fully validated and automatically projected; an externally reviewed merge uses matching inventory version, before-image metadata and retained ciphertext envelope.
- Base: a missing quarantine review produces counted evidence and a completion receipt for the HOLD preparation, but no executable wrappers.
- Bad: treating a collision as merge, hashing a label as ciphertext, changing reviewed fields while retaining unrelated attestation bytes, accepting an untracked CLI as C, or claiming an empty encrypted payload preserves original source data.

## 6. Tests Required

Run `pnpm test:e2e:yuzhou-production-import-real-artifact-bridge` and the payload-generator contract. Cover actual T2/T3 producer envelopes, all sixteen tables, explicit zero counts, byte/triple/scope/inventory/T0 drift, complete source conservation, deterministic output, missing/duplicate/extra reviews, synthetic signing/encryption roundtrips, reason/ref retention, file races/links/modes/budgets, clean tracked candidate checks, short writes/readback corruption, unexpected output files, and failed/replaced receipt cleanup.

These synthetic tests do not prove actual source/target authenticity, external signer authority, live production acceptance, full-scale memory, T4/binaries or production import readiness.

## 7. Wrong vs Correct

### Wrong

```js
const decision = candidate.candidateDisposition === "review_target_collision"
  ? { ...candidate, disposition: "merge" }
  : candidate;
```

### Correct

```js
const prepared = freezeProductionImportCandidates(authenticatedInputs);
if (prepared.summary.status !== "READY") return prepared.summary;
// A later, independent signed approval and activation gate still owns execution.
return { ...prepared.summary, productionImport: "HOLD" };
```

Operator schema and handoff: `docs/testing/yuzhou-production-candidate-freeze.md`.
