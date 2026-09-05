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
tests do not prove the complete PostgreSQL/API chain, which remains unverified.

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
