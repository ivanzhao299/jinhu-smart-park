# Formal performance source-readiness observer

This observer provides fixed-scope counts and a sorted raw source-fact tuple digest before complete formal-source continuation. It always reports formalContinuationReadiness=UNVERIFIED and productionBusinessWrites=0. Passing counts do not complete the parent task or create/qualify formal data.

## Required focused commands

Run from repository root:

```sh
node --test scripts/e2e/hr-performance-source-readiness.contract.mjs
HR_PERFORMANCE_SOURCE_READINESS_PG=1 node --test scripts/e2e/hr-performance-source-readiness.pg.mjs
node --check scripts/diagnose-hr-performance-source-readiness.mjs
node --check scripts/e2e/hr-performance-source-readiness.contract.mjs
node --check scripts/e2e/hr-performance-source-readiness.pg.mjs
git diff --check
```

The PG flag is mandatory for acceptance; without it Node explicitly skips the suite. Enabled runs must start their own labelled postgres:16-alpine tmpfs container and fail if Docker/PG is unavailable; no shared database fallback. Finally checks the exact generated name and ownership label even after partial creation, runs docker rm -fv and asserts container/owned-volume absence. Never delete unrelated instances or volumes.

The suite executes **the complete generated observer SQL** against populated typed query-projection fixtures. These expose every queried column, with UUID/char hash types, but omit full migrated constraints/triggers and business values. Passing is not full-schema, source-math or production business qualification. Cases cover empty scope/SHA256([]), independent known tuple hash, all six raw/visible/exact/gap counts, foreign tenant/park isolation, wrong map hash/table/batch/status/activity, failed batch, separate308/310/309 success/failure/rollback/binding, missing/ambiguous/unmatched/mismatched resolution, duplicate joins without fanout, exact unique T0 subject SHA, deleted/foreign employee, loaded owner, duplicate candidate ambiguity, rollback record, formal links and draft/published five-channel presence. Source rows stay unchanged and read-only transaction rejects writes.

Contracts reject missing/extra/private/duplicate (including escaped duplicate) keys, unsafe/non-integer counts, malformed digests and contradictory subsets/partitions. They check built-in-only stdin transport, fixed errors, SQL scope/timeouts/read-only, no hr_* function call and default-false workflow/success-artifact gates.

## Operation

Existing deploy-production workflow accepts optional diagnose_performance_source_readiness boolean, default false. Effective only with deploy_mode=diagnose-production-runtime-revision. Existing classification stays ops-only with Deploy skipped; no new deploy mode. The workflow sends the exact module by SSH stdin to Node; it runs fixed SQL through existing production compose PostgreSQL. Successful validated output alone uploads hr-performance-source-readiness-observation.json (seven days). Unknown remote errors become HR_PERFORMANCE_SOURCE_READINESS_REMOTE_FAILED; never print raw SSH/database errors.

Root is the sole production observer after independent review. Bind candidate/workflow SHA, observer file SHA256, workflow run and artifact identifiers, API/Web runtime-image revision evidence and explicit skipped Deploy result. Function-branch diagnostic code is separate from deployed application revision. Keep local artifacts directory0700/file0600. Do not disclose personal rows, amounts, scores, credentials or raw errors.

## Interpretation

Six source families report raw fixed-scope count, exact current service visibility, independent stronger map table/hash match, and raw-minus-exact gaps. Exact-map can include invisible batches; visibility omits source table/hash and formal receipts. Master resolution/status/link counts use raw scoped masters as denominator; missing resolution is separate from unresolved. Matched reads persisted000307 matched enum on the same both-resolved row; it does not recompute source mathematics.

Subject-active employee counters are the conservative intersection of resolved records with exact SHA, unique **succeeded-owner T0** candidate, verified active owner and scoped non-deleted employee. They do not count all stored resolved identities. Running/apply owner branch is intentionally excluded to avoid writer-capability helper invocation. Zero must not be described as zero resolved records or unavailable source data. They do not prove session/cycle binding.

308 relation receipts,310 fact receipts and309 assessment operations retain separate total/succeeded counters. Their current status/binding does not replace approved artifacts, full manifests, item reconciliation, live catalog identity, complete source mathematics or formal business acceptance. Existing review/template links and five-channel revisions/inputs prove presence only.

scopedSourceFactsSha256 hashes only sorted raw six-table tuples(kind,id,batch,map,identity,rowHash), serialized with PostgreSQL json_agg/json_build_array and C ordering, empty[]. Map-record/receipt/resolution state is excluded. It is not a full-source qualification digest. Exact keys, denominators, inequalities and joins: task research/output-contract.md.

API/Web build, lint, typecheck and browser inspection are skipped for this script-only observer: API/shared/UI/migrations are unchanged. Focused Node contracts, owned PG, syntax and diff checks are required. Implementer/fixture performs no production observation, commit, push, deployment, import or business write.
