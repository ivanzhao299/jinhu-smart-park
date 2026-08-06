# D5 property runtime control rollback/re-enable PostgreSQL handoff v1

Date: 2026-08-03  
Owner: D5 feature-flag lane  
Scope: `approval.enforce` rollback/re-enable drill only

## Result

PASS. A real `sys_property_runtime_control` row and the production
`DatabasePropertyRuntimeControlAdapter` were exercised against a disposable PostgreSQL
database cloned from `jinhu_b2c197_v11v6_direct_v31_20260803a`.

The drill proves:

1. `enforce` permits a representative approved request to be claimed and executed through
   `PropertyApprovalService`.
2. Execution persists two domain rows plus the approval request, effect receipt, terminal
   execution audit, and outbox event atomically.
3. A verified `biz_party` and its `biz_party_identity_snapshot` remain persistent evidence.
4. Updating the real control row to the valid disabled shape makes the database adapter
   report `disabled` and blocks a new claim with `property-runtime-unavailable`.
5. While disabled, the retained approval, identity, snapshot, receipt, audit, outbox, and
   domain rows compare equal to their pre-rollback snapshots. The blocked request remains
   `not_started` with zero domain rows, receipts, audits, or outbox events.
6. Updating the same control row back to the valid `enforce` shape makes the adapter report
   `enforce`; the formerly blocked request then claims and executes through the same
   maker-checker path.
7. Disabling a second time does not mutate either executed evidence set.

## No-direct-path boundary

The PostgreSQL drill proves the persisted runtime-control and approval-executor behavior. It
does not claim that toggling a database row dynamically rewrites every domain service call
site. The independent service stop-ship contract remains the authority for the legacy direct
path: `assertPropertyHighRiskActionApprovalRequired` still rejects the high-risk homestay
cancel action, and the exact nine-action stop-ship suite passed alongside the existing
approval execution contract suite. Thus rollback disables new approval execution without
restoring direct high-risk execution.

## Files

- Added `apps/api/src/modules/property-approvals/property-runtime-control-rollback.pg.spec.ts`
- Added this handoff
- No production source, housing, Web, migration, or authority file was changed in this lane.

Focused PG spec SHA-256:

`8c5c4579580c5783ccf5602845194920783ac383eb988a9a1b89a6e584162f25`

## Validation evidence

API typecheck:

```text
docker exec -w /workspace 5cc271258d86 corepack pnpm --filter @jinhu/api typecheck
PASS
```

API lint:

```text
docker exec -w /workspace 5cc271258d86 corepack pnpm --filter @jinhu/api lint
PASS
```

Real PostgreSQL drill (connection credential omitted):

```text
PROPERTY_RUNTIME_PG_URL=<disposable-db-url> node --test --require ts-node/register \
  src/modules/property-approvals/property-runtime-control-rollback.pg.spec.ts
PASS: tests 1, suites 1, pass 1, fail 0, skipped 0
```

Approval execution and stop-ship contracts:

```text
node --test --require ts-node/register \
  src/shared/property-workbench/property-high-risk-stopship.spec.ts \
  src/modules/property-approvals/property-approval.execution.spec.ts
PASS: tests 25, pass 25, fail 0, skipped 0
```

`git diff --check` for the focused spec: PASS.

## First-run correction

The first test run failed before the rollback assertions because the evidence projection used
nonexistent convenience names (`event_type` on approval audit and `id` on outbox). The query
was corrected to the authoritative schema columns (`action_id` and `event_id`). This exposed
no production defect and required no production edit. The disposable database was recreated
from the clean template before the passing run.

## Cleanup

Disposable database: `jinhu_d5_feature_flag_20260803a`

It was dropped after the passing run. Verification query:

```sql
SELECT count(*) FROM pg_database
WHERE datname='jinhu_d5_feature_flag_20260803a';
```

Result: `0`.

## Residual risk

No open P1 remains in this feature-flag lane. The evidence is deliberately scoped to the
approval runtime control plus the frozen service stop-ship contract; it is not a deployment
or production data exercise. Any future removal or bypass of the stop-ship call sites must
continue to be guarded by their domain service tests and release review.
