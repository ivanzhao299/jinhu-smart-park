# Training review checkpoint (2026-10-08)

Workspace `/tmp/jinhu-hr-training-employee-continuity-20261008`, branch `codex/hr-training-employee-continuity-20261008`, baseline `6985319d63e890454cc329f519b10ea5ff2d72ea`. Review complete; all code/test/spec ownership released to parent. No active review commands remain.

## Findings (fixed)

- P2 — `TrainingEmployeePicker.tsx` published unchecked API rows/count/pagination. An object-valued fullName could crash React and an oversized page could bypass the bounded selector. The picker now validates requested page, page_size20, nonnegative safe integer count, at most20 rows and scalar identity/name/code, then explicitly projects/deduplicates. A malformed response yields local retry feedback while retaining selected IDs and the parent draft.
- Added seven malformed-response/retry/deduplication interaction cases plus course-only permission routing coverage. Updated the normal test fixture to return the actual requested page.
- Added actual Nest ValidationPipe coverage for repeated query arrays, overflow, booleans/null, oversized page size, malformed keyword and unknown fields, plus valid string pagination. This is validation-boundary execution, not a live HTTP server test.
- Expanded the new API/Web specs to the required seven sections with request/response, permission, error, good/base/bad, test and wrong/correct contracts.

## Scope reviewed

Controller and direct-service exact PLAN_MANAGE/scope checks; original preboarding/probation/active/suspended set; literal bound search; stable count/page SQL; explicit minimal employee projection and required audit failure. New course-options remains independent, while original plan-options/createPlan rules are unchanged. Client full-context remount, capability-specific/allSettled reads, course-only requirement options, selection uniqueness/removal/max500/original FormData, failure preservation and stale/aborted replies were traced. No mutation, import, auth, schema, financial or lifecycle rule expansion.

## Verification

- Final API focused tests:5/5 PASS, zero skips (includes new ValidationPipe case).
- Final picker/client interactions:15/15 PASS.
- Final API and Web typecheck:PASS, exit0.
- Final affected API and Web ESLint:PASS, exit0.
- `git diff --check`:PASS.
- Reused unchanged implementation evidence: API19/19 including actual isolated PostgreSQL602 employees/31 pages/four statuses/literal search/foreign scope and zero owned database residual; existing result-maintenance6/6. Runtime service/DTO/SQL were not changed by reviewer, so no PG container was recreated.
- Parent confirmed actual390px iframe clientWidth=scrollWidth385, selected name221px/remove60px after scoped CSS repair. Reviewer made no layout change; parent owns final-source browser screenshot refresh following response validation.
- Logs: `/tmp/hr-training-continuity-review/{api-tests,web-tests,api-typecheck,web-typecheck,api-lint,web-lint}.log`.

Commands executed from this workspace:

```sh
TS_NODE_TRANSPILE_ONLY=true pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-training-employee-options.spec.ts
TEST_NODE_MODULES_DIR=/tmp/hr-profile-test-runtime-20261007/node_modules /tmp/hr-profile-test-runtime-20261007/node_modules/.bin/vitest run --config apps/web/vitest.config.ts test/interaction/hr-training-employee-options.test.tsx
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/api exec eslint src/modules/hr/hr-training-employee-options.spec.ts src/modules/hr/hr-training-employee-options.pg.spec.ts src/modules/hr/dto/hr-training-employee-options.dto.ts src/modules/hr/hr-training.controller.ts src/modules/hr/hr-training.service.ts
pnpm --filter @jinhu/web exec eslint app/hr/training/TrainingEmployeePicker.tsx app/hr/training/HrTrainingClient.tsx test/interaction/hr-training-employee-options.test.tsx lib/hr-api.ts
git diff --check
```

## Findings (not fixed)

None in the scoped change. Full builds, all-unit and full-migration runs remain release CI work per dispatch; no production role acceptance claim is made. Reviewer did not commit, push, merge, deploy or write production, and did not modify the previous departure checkout.
