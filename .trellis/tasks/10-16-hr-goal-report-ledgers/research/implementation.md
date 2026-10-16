# Implementation result — goal/report ledgers

## Changed files

- `apps/api/src/modules/hr/dto/hr-goal-report.dto.ts`: bounded ledger export query DTOs.
- `apps/api/src/modules/hr/hr-goal-report.controller.ts`: read-only goal, check-in, own-report and team-report export routes with existing permission atoms.
- `apps/api/src/modules/hr/hr-goal-report.service.ts`: scoped `REPEATABLE READ`, `READ ONLY` snapshot exports, 5001 probe / 5000 explicit rejection, exact string projections, and required pre-response audit.
- `apps/web/lib/hr-api.ts`: typed signal-aware export transports.
- `apps/web/app/hr/GoalReportLedgerExport.tsx`: context-owned cancellable export control.
- `apps/web/app/hr/goals/goal-report-ledger-export.ts`: strict snapshot receipts and CSV serializers.
- Goal/work-report clients: exports for goal/check-in and own/team report ledgers, retaining current filters for report exports.
- Contract and interaction tests cover routes, bounds/audit/snapshot source shape, CSV safety, invalid receipts, and abort on identity replacement.

## Validation

Passed:

- `pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-goal-report-ledger-export.contract.spec.ts` — 1/1.
- Focused Web Vitest: 31/31 before the final export-state hardening; the goal workflow focused rerun passed 17/17 after its added abort case.
- `pnpm --filter @jinhu/api lint`
- `pnpm --filter @jinhu/web lint`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm --filter @jinhu/api build`

The full `pnpm --filter @jinhu/web test:unit:interaction` was run once. It reached the unaffected existing `hr-payroll-input-preparation.test.tsx` and failed one test by the global 5-second timeout (`source roster loads all 101 employees atomically...`); this task's goal and work-report files passed in that run. It must not be reported as fully green.

## Limits / follow-up

- No production, business database, deployment, or real-role UAT was run.
- A disposable PostgreSQL/Nest HTTP harness was not completed in this implementation pass. The controller routes and DTOs have static contract coverage, while runtime scope/snapshot/audit behavior needs the requested isolated PG + Nest HTTP evidence before release acceptance.
- For CUA inspection, use the existing actual routes `/hr/goals` and `/hr/work-reports`; the export controls are actual client components and need a synthetic authenticated transport or authorized local session. No production test route was added.

## Final root completion (supersedes initial missing-runtime limits)

- Added migration-backed uniquely owned Docker PostgreSQL test, actual HrGoalReportService through Nest HTTP/PermissionGuard/ValidationPipe, independent writer after snapshot timestamp, all three 5000/5001 limits, scope/foreign/deleted projection, exact numbers and goal suggestions, required audit rejection and asserted container cleanup. `HR_GOAL_LEDGER_PG_REQUIRED=1 ... hr-goal-report-ledger-export.pg.spec.ts` passed (1 test, 14.99 seconds). No production data used.
- Fixed team export deleted employee exclusion to match existing paged report projection. Preserved authorized relationships in CSV and explicitly labelled progress/weight ratios.
- Added goal cycle/status export selectors and actual API-helper transport regression proving Web cycleId maps to HTTP cycle_id.
- Added actual StrictMode export regression: failed before lifecycle setup restored owner.active, fixed and rechecked. Identity/filter response fencing remains.
- Actual native browser desktop1440/phone390 checked final page controls with synthetic responses; no horizontal overflow (385 client /385 scroll). Source hashes and screenshots stored in private browser artifacts. This is not production-role UAT.
- API related contracts/HTTP16 passed; API/Web lint/typecheck/build passed before final targeted lifecycle/filter correction. Full Web suite150files/1210 passed earlier; final repeat after lifecycle/filter correction and build pending root checkpoint, do not treat earlier head as final.

## Final verified completion — root integration

The prior missing-PG/runtime blocker above is resolved. Root added the owned tmpfs PostgreSQL fixture and real-service HTTP checks, passing with no skipped tests; container cleanup asserted. Final related API contracts/HTTP:16/16; full Web interactions:150 files/1212 tests PASS. API/Web lint/typecheck and both builds PASS. Actual browser final source hashes: desktop1440 and phone390, allfour exports and cycle/status filters; StrictMode setup replay also exercised. No production business test writes and no real-role UAT claimed.

Independent read-only review accepted the root runtime fixture, deleted-employee filtering, relationship CSV preservation, StrictMode lifecycle fix and camelCase cycleId to HTTP cycle_id mapping. Original source-rule/legacy report equivalence and business signoff remain outside this reporting slice. Merge/deploy/runtime verification is the next gate.
