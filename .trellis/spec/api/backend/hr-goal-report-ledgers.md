# Goal, progress and work-report complete ledgers

## 1. Scope / Trigger
Modern goals and own/team work reports need complete authorized operational CSV ledgers. This adds read-only reporting, not legacy report-layout equivalence or payroll acceptance.

## 2. Signatures
GET `/hr/goals/ledger-export`, `/hr/goals/checkins/ledger-export`, `/hr/work-reports/me/ledger-export`, `/hr/work-reports/team/ledger-export`. Goal queries: optional UUID `cycle_id`, allowed `status`; reports: allowed `report_type`, `status`. Return `{items,total,snapshotAt}`. Existing list/projection permissions apply; no new permission, migration or business write.

## 3. Contracts
Goal READ is park-wide; TEAM_READ follows enabled managed org trees and ordinary group visibility; SELF_READ follows owner/collaborator visibility. Team/self hide draft goals as existing lists do. Work reports preserve own or managed employee projection, excluding deleted employees in team exports. Controller READ guard precedes DTO/service probes; management alone is not export authority.

Each dataset reads in one PostgreSQL REPEATABLE READ / READ ONLY transaction with UTC millisecond snapshot timestamp. Goal query passes an internal5001 limit; checkins/reports also probe5001. Return all <=5000 or reject overflow, never silently truncate. Exact numeric database strings and existing projected relationships only; do not expose change-detail-only metricDefinition. Required sensitive-read audit must finish before response, including empty exports and actual itemCount.

Web export controls capture token and controller, synchronously lock duplicates, abort/discard obsolete account/park/permission/filter responses and permit fresh requests after context changes. Goals provide cycle/status export filters; the Web helper receives camelCase cycleId and encodes the DTO query cycle_id, tested through actual apiRequest; own/team reports use their independent displayed filters. CSV validates full cardinality/IDs/timestamp and required row/nested suggestion fields, uses shared UTF8 BOM/formula escaping, preserves decimal strings and labels ratios explicitly. Work-report goal suggestions retain IDs/names/proposed progress/current value/summary. DS desktop/390px controls have44px touch targets and no horizontal overflow.

## 4. Validation / Error Matrix
Missing READ ->403 before service. Invalid query ->400. Empty ->audited header-only CSV.5000 ->complete.5001 ->400, no partial payload. Audit failure ->request fails, no download. Context change ->old response discarded and busy cleared for new context. Deleted/foreign employee/park rows ->excluded.

## 5. Good / Base / Bad Cases
Good: complete filtered snapshots include records beyond UI pagination and original relationships. Base: empty selected status exports0. Bad: unrestricted initial query then JavaScript length bound; silent first-page export; old export downloading after a filter/identity switch; omitting linked progress suggestions.

## 6. Tests Required
`HR_GOAL_LEDGER_PG_REQUIRED=1 pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-goal-report-ledger-export.pg.spec.ts` starts a uniquely labelled loopback-only disposable Docker PostgreSQL, applies original231/257/268 migrations, uses actual service + Nest HTTP/PermissionGuard/ValidationPipe and synthetic scope identities. Verify self/orgtree/park/status, foreign/deleted exclusion, decimals/relationships, independent committed writer after timestamp, all three5000/5001 bounds and audit failure; assert owned container removed. This synthetic identity fixture does not prove JWT/session or production role UAT.

HTTP and contract specs cover route binding/guard and query limits. Actual goal/CSV/report interaction suites cover filtered inputs, cancellation, retries and serialization. Run API/Web lint/typecheck/build, final full Web interaction suite serially with builds, and native browser desktop390 against recorded final source hashes. No timeout increases/skips to hide failures.

## 7. Wrong vs Correct
Wrong: call unbounded listGoals then test length. Correct: SQL5001 probe before projection. Wrong: return after audit promise is launched. Correct: await required audit. Wrong: treat new-context owner as busy forever when old finally is fenced. Correct: reset busy/message when context owner changes and ignore old completion. Effect setup restores owner.active=true so StrictMode cleanup/setup replay cannot permanently disable exports; test actual click/receipt under StrictMode.
