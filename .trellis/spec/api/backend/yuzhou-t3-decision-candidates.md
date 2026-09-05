# T3 normalized phase and decision candidates

## 1. Scope / Trigger

Pure preparation after T3 source projection and optional historical policy recovery.
This module has no private input reader, database adapter, network call or writer entry point.

## 2. Signatures

`assembleProductionT3DecisionCandidates({triple, targetScope, targetInventory, t0Candidates, stagedRecords, attendanceFileSha256, artifactHashes}) -> {phaseArtifact, candidates, policyRecoveries}`.

`artifactHashes` contains exactly `targetInventoryArtifactSha256` and `t0CandidatesArtifactSha256`.
The returned candidate envelope contains `phaseArtifactSha256`, calculated from the exact UTF-8
`stableProductionImportCanonicalJson(phaseArtifact) + "\n"` bytes. It does not accept a caller-supplied
phase artifact, phase hash, resolution hash or attestation hash.

## 3. Contracts

- Require exact C/S/M, scope hash and full sixteen-table inventory with matching source triple, target identity,
  table counts and scope. Reuse `validateProductionT0CandidateDependencies` from the T2 owner for T0 envelope,
  employee identity, accepted parent, derived ID, business identity and exact existing-target checks.
- Project each source parent once. Any old six-key policy item invokes the strict full twelve-item recovery;
  partial/mixed layouts and failed raw reconstruction reject the entire input. Current layouts retain their
  existing fractional semantics. Retain detached `{proof, lineage}` per recovered policy without retaining
  another normalized source array.
- Build provenance and candidates from the same normalized projections. Include exactly the existing seven
  provenance keys, one deterministic attendance batch even for zero attendance, and explicit counts for all
  eight T3 model tables. Sort by model table order and source identity. Policy lineage never creates skip or
  archive permission for the consumed old variant-two identities.
- Resolve FK roles from the target model in its parent-before-child table order; validate that order.
  Employee references use only the projector's exact T0 source identity. Never infer policy-to-person links.
- Finalize every source business-key/target-ID duplicate within a table before processing its child tables.
  All competing parents are quarantined; their descendants cannot insert. Detect target-ID ownership conflicts.
  For an existing business identity, compare the actual model canonical hash including derived FK IDs: exact
  content yields `skip_exact` with the inventory's real ID/version/hash, otherwise `review_target_collision`.
- Semantic projection failures retain original identities, reasons and phase coverage; missing or reviewed
  parents quarantine dependent rows. Child-only semantic failures retain valid siblings. Unknown attendance
  symbols retain day values and `needs_review`, while their unresolved rule remains quarantined.
- Return only review artifacts: `READY_FOR_REVIEW` or `REVIEW_HOLD`, always `productionImport: HOLD`.
  Input hashes are references; they do not authenticate private bytes, a source signature, live target state
  or approval. Reduced non-policy records cannot reproduce their pre-transform raw row SHA.
- Do not clone full source or expanded arrays at return. Projections own detached fields; release table
  projection arrays as each level completes. Capacity and eventual sealed-plan reader limits require separate
  measurement and remain outside this pure assembler's acceptance.

## 4. Validation & Error Matrix

Structural source/layout/identity or input binding errors reject the entire call with stable sanitized
`T3_CANDIDATE_*` or `T3_POLICY_RECOVERY_*` errors. Reused T0 validator error codes retain their suffix with
the T3 prefix. No raw values, source names or paths enter thrown error messages.

| Condition | Candidate result |
| --- | --- |
| Semantic projector failure | `quarantine`, original `T3_*` reason |
| Missing employee or required parent | `T3_EMPLOYEE_MISSING` / `T3_PARENT_MISSING` |
| Quarantined or colliding parent | `T3_PARENT_REQUIRES_REVIEW` |
| Competing source business identity or resolved ID | `T3_SOURCE_BUSINESS_COLLISION` |
| Derived ID owned by unrelated target business | `T3_TARGET_ID_COLLISION` |
| Existing target business with different canonical content | `review_target_collision`, `TARGET_CANONICAL_MISMATCH` |
| Exact existing target content | `skip_exact`, actual inventory ID/version/hash |

## 5. Good / Base / Bad Cases

Good: a recovered policy produces six items in both new phase and candidate artifacts with twelve-to-six
lineage. Base: no staged records still yields one deterministic batch and seven zero-count table entries.
Bad: borrowing a hash from the old twelve-item phase, selecting the first duplicate employee period, or
calling an in-memory `READY_FOR_REVIEW` artifact production-ready.

## 6. Tests Required

`node --test scripts/e2e/yuzhou-production-t3-decision-candidates-contract.mjs` covers eight-table fields/FKs,
canonical target matches and real-ID reuse, policy recovery lineage, exact phase bytes, zero counts,
duplicate-parent propagation, no employee guessing, invalid-source conservation, deterministic ordering,
frozen inputs and nested output detachment, and stale C/S/M/scope/inventory rejection.

The suite also runs through `pnpm test:e2e:yuzhou-production-import-t3-artifact` in the existing CI step.
These synthetic pure checks prove assembly contracts, not private IO authentication, full HR parity or
production execution.

The [private materializer](./yuzhou-t3-private-materializer.md) authenticates the
existing private source/target artifacts and serializes the same canonical phase,
candidates and recovery lineage. Its separate IO contracts do not grant approval
or change the pure assembler's evidence boundary.

## 7. Wrong vs Correct

Wrong: `existing ? "skip_exact" : "insert"` treats business-key equality as content equality.
Correct: compare `computeProductionImportTargetCanonicalHash` with exact model fields and accepted parent
target IDs; quarantine descendants until each parent table's complete collision set has been finalized.
