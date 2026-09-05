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

## Incomplete execution boundary

Until the production orchestration consumes the extension in both forward and
reverse paths, both entry points reject it with
`PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_NOT_WIRED` before database access or
authorization consumption. Ordinary plans without the extension retain their
existing behavior. This temporary guard must be replaced by real capability,
apply, receipt and rollback wiring, not simply removed to make a test pass.

The full pipeline also needs the production fact loader and its successful
same-operation receipt. Identity materialization must not accept arbitrary existing
facts or a laboratory batch whose context was manually relabeled as production.
The loader, relation and identity receipts must agree on scope, batch, C/S/M, T0
receipt and fact-set digest. Nonempty synthetic fixtures verify implementation
capability; they do not establish that the authoritative old source contains
nonempty assessment results or prove live query equivalence.

## Validation

`node --test scripts/e2e/yuzhou-production-import-v2-contract.mjs` covers stable
sealing, missing parent, source/T0/hash/count/order drift, authorization binding,
legacy-plan compatibility and rejection of unwired forward/rollback execution.
These checks do not connect to a source or production database.
