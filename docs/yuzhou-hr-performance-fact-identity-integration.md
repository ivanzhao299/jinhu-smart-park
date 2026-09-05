# Performance fact identity integration

Status: implementation in progress; production import remains HOLD. This document
describes executable plan metadata, not a successful production import or query UAT.

## Stable input binding

The optional `performanceFactIdentity` extension requires the same C/S/M and T0
receipt as `performanceRelations`. Its parent binding is the canonical payload hash
of the relation **input contract**, not the eventual relation execution receipt.
The parent execution receipt includes the sealed plan hash; sealing that receipt
inside the plan would create a circular dependency.

The authorization binding includes the complete identity extension hash. Counts,
fact-set digest, migration digests, fact kinds and reverse order cannot be appended
or changed outside that binding. The common validator is exported by
`scripts/hr-cutover/production-import-sealed-plan-lib.mjs` so adapter consumers do
not need an independent, potentially divergent plan validator.

Fact-set hashes follow the SQL canonical bytes (empty set is SHA-256 of `[]`, without
a trailing newline). Sealed payload hashes retain the existing canonical JSON plus
newline convention. These are separate contracts and must not be interchanged.

## Candidate execution boundary

The candidate total writer wires complete facts/relations/identity plans in both
directions. All artifact and capability checks precede authorization consumption;
facts then relations then identity execute inside the existing business transaction
after T0 and before T1. The returned domain hashes are the actual database receipts,
not hashes of status labels. Partial loader plans without final identity verification
still fail with `PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_NOT_WIRED`.
Ordinary plans retain their existing behavior and production activation remains HOLD.

Rollback reads the three bound receipt hashes through the narrow database function
inside its SERIALIZABLE transaction, then reverses identity, relations and facts.
It accepts neither caller-supplied receipt substitutes nor an out-of-transaction
receipt lookup. Both forward and reverse core phases restore deferred constraint
timing after extension calls; commit still checks all links. Mock orchestration
tests alone do not prove the complete PostgreSQL/API chain. The bounded PostgreSQL
results below separately establish an empty-fact transaction chain and a nonempty
configuration/service-read chain. HTTP/browser and nonempty-result parity remain pending.

The `performanceFactLoader` extension binds the configuration/detail and master
artifact hashes, source receipt hashes, six migration hashes, six fact counts,
their total active-map count and both full-fact and result-identity-set hashes.
Its complete input hash is included in authorization and referenced by
`performanceFactIdentity.parentPerformanceFactLoaderContractSha256`. Both extensions
must agree on C/S/M, source location receipts, T0, result counts and identity-set
hash. `AUTHORITATIVE_EMPTY` describes result rows, not empty configuration tables;
the metadata status itself does not prove the underlying source receipt.

The full pipeline also needs the production fact loader and its successful
same-operation runtime receipt. Identity materialization must not accept arbitrary existing
facts or a laboratory batch whose context was manually relabeled as production.
The loader, relation and identity receipts must agree on scope, batch, C/S/M, T0
receipt and fact-set digest. Nonempty synthetic fixtures verify implementation
capability; they do not establish that the authoritative old source contains
nonempty assessment results or prove live query equivalence.

The foreign-key order is facts → relations → identity, with reverse rollback
identity → relations → facts. In particular, migration 000305 score sources can
reference dimension profiles; deleting facts first is invalid for nonempty score
sources. Current empty score-source evidence cannot justify ignoring this path.
The 000310 dependency hook must reject execution until the 000311 loader capability
can verify its real successful receipt. Neither runtime receipt belongs in the
sealed metadata; both are obtained from actual execution.

## Remaining visibility transition

The current 000301/000303/000305 materializers insert maps as `loaded`, while HR
legacy readers require `verified`. The core production phase writer likewise
creates non-quarantine insert/merge maps as `loaded`. A successful load alone
therefore does not prove the new API can read the imported records.

The production chain must promote only its exact operation-owned maps after
conservation succeeds, inside the same transaction. Core maps have exact
`hr_yuzhou_production_import_projection_receipt` links to the sealed control rows;
performance maps require their exact batch, fact kind, source and target bindings.
Quarantined, inactive, foreign-operation and unrelated maps must not be promoted.
Do not change API readers to accept `loaded`, and do not manually insert `verified`
fixture maps to claim this transition works.

The candidate total writer now performs the core transition after validating the
phase writer result and inserting its control receipts, before marking the phase
successful. Its bounded updates require the exact operation, sealed plan, target
scope, successful production batch, projection map, source row and target identity.
Missing, duplicate or foreign returned identities abort the business transaction.
Quarantined maps remain quarantined. This does not promote additional performance
maps merely because they share the T0 batch; their final 000310 transition remains
separate. The core full-chain PostgreSQL test now checks the resulting status by
disposition without manually promoting fixture maps. Mock and SQL-string checks
alone do not prove that runtime transition or end-user visibility.

## Preparation checks

`node --test scripts/e2e/yuzhou-production-import-v2-contract.mjs` covers stable
sealing, missing parent, source/T0/hash/count/order drift, authorization binding,
legacy-plan compatibility, incomplete-chain refusal, complete-chain ordering,
actual returned receipt propagation, malformed receipt refusal and failure handling.
These checks do not connect to a source or production database.

The core-only direct PostgreSQL fixture separately passed two 16-table T0-T3
apply/rollback iterations and a failure injected after T0 map verification. The
failure left no batch, projection, control or phase rows; isolated fixture resources
were cleaned. That run excluded performance extensions and used the integration
worktree while performance orchestration was being edited; it proves the unchanged
core transition, not immutable full-chain release readiness.

## Bounded total-writer PostgreSQL evidence

The first performance total-writer run passed against a fresh isolated schema
migrated through 000311. The executed test is committed as `10c86bd24ad8163a4e2781fdd3ef9b25897eb611`;
its file SHA-256 is `c7afc9410d7db8142d70dd468b5a7774fb6f79b63d55ce2abd0725925d257df4`.
Execution started from candidate `9a06e34e53aaef832a92d97096867bb19c218b7b` with
that new test file; the later entrypoint dependency-list fix does not change the
total writer exercised here. This is synthetic transaction evidence, not proof
of a merged, deployed or production-authorized candidate.

- Actual `executeSealedProductionImport` applies T0, 311 facts, 308 relations,
  310 identity and T1-T3; it returns three real database receipt hashes.
- The fixture has 7 sessions, 117 assignments, 234 identity resolutions and
  7 session bindings. All 124 performance owner maps become `verified` without
  hand-written status promotion or relabeling a laboratory batch as production.
- Actual total rollback consumes the bound receipt chain, reverses 310/308/311
  before core T0 and verifies zero active maps and zero performance rows.
- A separate failure injected at T1 observes the completed performance chain
  inside the transaction, then proves no batch, phase, control, projection or
  performance receipt survives the failed business transaction.
- The initial shell cleanup did not remove the temporary database/role because
  its psql variable substitution was incorrect. Exact-target follow-up cleanup
  and a second read-only check verified both counts zero; the temporary dependency
  link and migration log were also removed. Test PASS is not used as cleanup proof.

Reproducible entry: `pnpm test:e2e:yuzhou-production-import-performance-full-chain:pg`,
with the existing explicit loopback/laboratory environment and a prepared isolated
schema. The test does not provision, authorize or connect to production by default.
The six fact collections in this first fixture are all empty. It therefore does
not prove nonempty configuration visibility, nonempty result functionality, actual
service/HTTP queries or CLI encryption; its crypto provider is a synthetic test
substitute. The next combined run must add nonempty configuration with zero results
and actual service queries without relaxing source-empty production constraints.

## Nonempty configuration and actual service readback

The combined isolated run completed successfully with runner commit `03a58461c5f4e98e1efd590e3ef6a75ab1256acb`
and the API assertion correction in final candidate `ca5a7f68d2f6fcaaa5dc19e975211add62f9a837`.
Executed runner SHA-256: `f269aefc55c6f9e5969764fefe25b0ca3cbed884d38d658068df87eb791d86c1`.
Executed API test SHA-256: `5211277e2465200533e1a33058a2fa8ea79075e37c087df23c057902f3f7bb08`.
The runner started before the API correction was committed; the child API process
loaded the corrected bytes. These identities describe what ran, not a claim that
the whole test started from an unchanged release checkout.

The fixture uses synthetic field values with the safe source-summary shape:
0 templates, 3 levels, 33 dimensions, 30 guides, 7 sessions, 117 assignments,
and 0 detail/master outcomes. An isolated original-materializer oracle computes
the 66-fact aggregate and is reversed to zero live rows before the actual total
writer executes. Oracle maps are not promoted or relabeled as production evidence.

Verified in that same freshly migrated PostgreSQL schema:

- Actual total import loads 66 configuration facts, the 124 session/assignment
  relations and 234 identity resolutions; final identity verification automatically
  promotes all 190 performance maps before the remaining T1-T3 phases succeed.
- `HrPerformanceLegacyService` and `HrPerformanceLegacyRelationsService` query
  the actual committed rows, with read-only database sessions and an in-memory
  audit sink. Nine surfaces return the expected configuration/relation/empty-result
  counts and audit item counts; assignment pagination returns 50/50/17 unique rows.
  Definition-only assignment access is denied and another park sees no sessions.
- Actual total rollback reverses identity, relations, facts and core. The same
  services then return empty collections. The original import retains its success
  history; a separate successful rollback operation proves the reversal, rather
  than incorrectly expecting the original operation to change status.
- Failure at T1 after the complete extension chain leaves no business batch,
  phase, projection, control, performance receipt or active map outside the failed
  transaction. Inserted core rows are also absent.
- Exact temporary database and role counts were verified as 0/0 after cleanup;
  temporary root/API dependency links and the migration log were removed.

The API test is `apps/api/src/modules/hr/hr-performance-legacy-post-import.pg.spec.ts`;
it is disabled unless explicitly enabled by the isolated runner. No source field
values or production credentials were read to build this fixture. This proves the
current-shaped synthetic import-to-service-to-rollback chain, not the real private
payload import, HTTP/controller/authentication behavior, browser UAT, CLI/GCM
encryption or nonempty-result calculation equivalence. Production remains HOLD.
