# Serial review — PASS

Workspace `/tmp/jinhu-hr-lifecycle-template-workflow-20261008`, branch `codex/hr-lifecycle-template-workflow-20261008`, reviewed baseline `5a54010b274394b4e9ba2cd4c527389704106908`. All writes released to parent. No review processes remain active.

## Findings (fixed)

- P2 — `LifecycleTemplateManager.tsx`, `HrLifecycleClient.tsx`, new `lifecycle-template-data.ts`: list/detail payloads were trusted before rendering and editing. Mismatched template identity or malformed task fields could mount the wrong editor or crash controls. One shared decoder now explicitly projects summaries/detail, checks requested ID, version/cardinality/type, field shapes, unique trimmed task codes and due bounds before publishing state. Failure exposes retry without mounting unsafe values.
- P2 — `LifecycleTemplateManager.tsx`: the post-publication refresh callback checked only template ID. Closing/reopening the same template while optional refresh was pending could cause the old callback to reopen and discard the new draft. An edit generation now fences this continuation, including same-ID reopen.
- P2 — `LifecycleTemplateEditor.tsx`: an optional onSaved refresh rejection shared the publication catch and could report a failed publication after commit. Published success remains visible with a separate refresh error.
- Regression additions: seven actual component cases cover malformed/mismatched detail, candidate failure, recovery, same-ID reopen race and StrictMode; one real Nest ValidationPipe test covers malformed nested items/unknown fields. API/Web specs synchronized.

## Coverage and boundaries

Reviewed exact ASSIGN candidate and TEMPLATE_MANAGE detail authority, direct service tenant/park checks, unchanged legacy list permissions, stable latest-published summary/detail selection, scoped item joins and minimal SQL projection. Existing template-row locking, append-only version allocation, immutable prior checklist snapshot/copy behavior, relative dueDate semantics and item1..50/unique/nonblank bounds remain intact. No reviewer changes to API runtime/DTO/SQL/schema. Existing lifecycle actions, assignees, employee/event references and attachment workflows remain in scope-preserving paths.

Reviewed full ordered metadata payload including required=false/due=0, add/remove/reorder bounds, explicit submit locks, failed drafts, context remount, stale/closed detail, StrictMode alive-ref setup and success/refresh separation. No layout/CSS edits by reviewer. Parent owns final actual-component desktop/390px browser confirmation.

## Verification

- API tests:10/10 PASS, zero skips; includes five new/updated template tests and five existing lifecycle contracts.
- Web interactions:25/25 PASS (14 template workflow +11 existing employee-selection), final2.41s.
- New-baseline API and Web typecheck:PASS, exit0.
- Final affected API and Web ESLint:PASS, exit0.
- `git diff --check`:PASS.
- Reused unchanged implementation evidence: actual owned PostgreSQL1/1 with zero residual database/container, scoped query/new-version publication/old-checklist preservation; Web static contracts3/3. No relevant SQL/schema changes justify recreating that fixture.
- Logs: `/tmp/hr-lifecycle-template-review/` (`api-tests`, `api-typecheck`, `web-typecheck`, `api-lint`, `web-lint`, `web-interactions-serial`).

Commands from this workspace:

```sh
TS_NODE_TRANSPILE_ONLY=true TS_NODE_PROJECT=apps/api/tsconfig.json node --test --require ./apps/api/node_modules/ts-node/register apps/api/src/modules/hr/hr-lifecycle-template-workflow.spec.ts apps/api/src/modules/hr/hr-lifecycle.contract.spec.ts
node apps/web/node_modules/vitest/vitest.mjs run --config apps/web/vitest.config.ts apps/web/test/interaction/hr-lifecycle-template-workflow.test.tsx apps/web/test/interaction/hr-lifecycle-employee-selection.test.tsx --maxWorkers=1 --no-file-parallelism --testTimeout=30000
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/api exec eslint src/modules/hr/dto/hr-lifecycle.dto.ts src/modules/hr/hr-lifecycle.controller.ts src/modules/hr/hr-lifecycle.service.ts src/modules/hr/hr-lifecycle-template-workflow.spec.ts src/modules/hr/hr-lifecycle-template-workflow.pg.spec.ts
pnpm --filter @jinhu/web exec eslint app/hr/lifecycle/HrLifecycleClient.tsx app/hr/lifecycle/LifecycleTemplateEditor.tsx app/hr/lifecycle/LifecycleTemplateManager.tsx app/hr/lifecycle/lifecycle-template-data.ts lib/hr-api.ts test/interaction/hr-lifecycle-template-workflow.test.tsx test/interaction/hr-lifecycle-employee-selection.test.tsx
```

Initial concurrent interaction run completed20 tests and hit the default5s timeout in5 cases amid broad host slowdown (189s including slow transforms/setup, no assertion failures). After all original type/lint handles completed, one serial retry passed25/25. Timeout/worker overrides were CLI-only; no repository test gates were weakened or processes restarted.

## Findings (not fixed)

None in reviewed scope. Full builds, all-unit and full migration/trigger gates remain release CI work by dispatch. Synthetic UI/query fixtures do not establish production business-role acceptance. No commit/push/merge/deployment/production writes or import analysis were performed by reviewer. Parent-owned prior-task edits and merged training/departure files preserved.

## Cost Summary

- Task/status: lifecycle template workflow serial review, PASS.
- Reviewer files: three lifecycle components, one decoder, two focused tests, two specs and task records.
- Runs: new-baseline two typechecks/two lint checks; API10; interactions25 final.
- Retries: one environment-only serial interaction retry; no business-code retry loop.
- Approximate model rounds:20; COST_GUARD kept remaining work to one corrective path and required checks, with no new agents or repeated successful tests.
- Reused evidence: prior PG, static Web contracts and parent browser work; usage unavailable.
- Blocked issues: none. Next: parent final browser/source review and normal release gates.
