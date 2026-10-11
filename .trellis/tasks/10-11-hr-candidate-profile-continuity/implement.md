# Execution
1. Persist/review artifacts, activate task, read applicable package guidelines; user has ongoing implementation/merge/deploy authority.
2. One backend implementer owns new profile DTO/service/migration/tests and recruitment controller/module only; root owns Web transport/component/parent/CSS/tests/artifacts. No overlap, no child DB/browser/release operations.
3. Freeze backend output and review migration before root applies one complete-schema isolated lab. Add API/Web specs for durable contracts.
4. Focused API unit and actualPG workflow; root alone DB cleanup residual0. Web profile and actual-parent interaction tests, package lint/typechecks, desktop1280/390 browser under actual components+synthetic API. No production business fixture.
5. One full-scope Trellis review, repair only evidenced findings. Fresh fetch/main synchronization; clean explicitfiles commit, PR/CI, required ReleaseSmoke/fulldeploy/health/cleanup; independent production API/Web version observation equals merged main.
6. Checkpoint technical success separate real-role/legacy parity/latest-payroll independent acceptance; continue overall goal.

Commands: pnpm --filter @jinhu/api lint; pnpm --filter @jinhu/api typecheck; from apps/api TS_NODE flags node --test --require ts-node/register src/modules/hr/hr-candidate-profile.spec.ts; root-guarded pg spec same package; pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/hr-candidate-profile*.test.tsx plus touched recruitment sibling tests; pnpm --filter @jinhu/web lint/typecheck; git diff --check. Full builds in CI; no unchanged suite repetition. Exact private receipts under hr-candidate-profile-continuity-20261011 artifact.
