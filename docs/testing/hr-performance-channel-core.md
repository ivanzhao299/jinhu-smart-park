# Performance channel snapshot core validation

Migration `000370_hr_performance_channel_snapshot_core.sql` adds two exact pure SQL v1 functions. It neither reads nor changes HR facts, source relationships, stored totals, existing helpers, privileges, modern dimension behavior, or business workflows. New functions revoke PUBLIC EXECUTE; only their owner can execute until an actual caller role is separately reviewed. Migration installation runs constant-only golden self-checks before COMMIT; any failed check rolls back both functions.

From the repository root, install isolated dependencies and build the shared producer before checking the API:

```sh
CI=1 pnpm install --offline --frozen-lockfile
realpath apps/api/node_modules/@jinhu/shared
pnpm --filter @jinhu/shared build
HR_PERFORMANCE_CHANNEL_CORE_PG_REQUIRED=1 pnpm --filter @jinhu/api exec node --test --test-reporter=spec --require ts-node/register src/modules/hr/hr-performance-channel-snapshot-core.pg.spec.ts
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api typecheck
```

The resolved shared package must belong to this worktree. A suite run without `HR_PERFORMANCE_CHANNEL_CORE_PG_REQUIRED=1` intentionally skips and is not acceptance evidence. When enabled, Docker, image, readiness, connection, SQL, assertion and cleanup failures fail the test. The suite creates its own UUID-named `postgres:16-alpine` container, unique ownership label, tmpfs database and random loopback-only port. Its trust authentication exists only in that isolated synthetic container. It does not accept external credentials, database URLs or a default/shared container. Finally it checks for the exact container name, verifies the ownership label, removes only that container and asserts it is gone. This cleanup also runs if connection shutdown fails or Docker reports failure after partially creating the container; those failures still fail the test. No production or historical data is involved.

The fixture installs the existing300/302/304/321 source helpers and the exact258 dimension score helper. Append-only source rows and their record maps are synthetic and inserted with the original guards enabled. Each differential case has its own template/session and shares no detail rows; repeated item IDs within a case remain distinct detail facts. It compares21 exact totals and the complete highest-minimum grade projection, including source levels belonging to another assessment and whose max is already exceeded. Source tie ambiguity remains explicit. It freezes function definitions/ACL and full synthetic fact counts/digests before installing370, then asserts they remain unchanged after installation, successful/error calls and permission checks.

Covered math includes all five channels and three signed adjustments, aggregate-before-integer conversion, positive/negative half values, S/T fractions, final half/cross-zero rounding,0/NULL/missing/no-details distinctions, non100 and negative percentages, int32 limits, exact numeric(18,2) limits, final numeric totals beyond18digits and M/X/C aggregate18digit boundaries/overflow even with zero weights. Complete101-row arrays and41+grade candidates prevent accidental30/20 truncation. IDs preserve exact identity, including case/whitespace, and duplicate IDs are rejected. Grade tests include equality,0.01 below, negative totals, NULL minimum, no candidates, same-grade ties, unchanged grade text and invalid totals. Malformed shapes, missing/unknown keys, numeric JSON types, excess precision, nonfinite/exponent/whitespace values and ranges must fail with fixed22023/22003 messages.

No API/UI integration exists in this slice. Formal editable snapshots, version storage, authorization/activation, source receipt and000309 person/detail-template matching, employee/workflow integration, actual July trial and independent HR acceptance remain NOT_IMPLEMENTED/NOT_EXECUTED. `bs_ass_compute` remains pending; `u_printassessment` retains its existing separate credit. These synthetic checks establish local mathematical and isolation contracts only. They do not establish full cross-engine source parity or authorize salary execution. Web/browser, full import, historical routine sweeps and production operations are outside this validation scope. Release/CI, migration application and runtime evidence are owned by the parent task and must be recorded separately.
