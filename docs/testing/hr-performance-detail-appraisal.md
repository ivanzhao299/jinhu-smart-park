# Formal detail appraisal validation

From repository root:

```sh
pnpm --filter @jinhu/shared build
node --test scripts/e2e/hr-performance-detail-appraisal.contract.mjs
TS_NODE_TRANSPILE_ONLY=true pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-performance-channel-workflow.spec.ts
HR_PERFORMANCE_CHANNEL_WORKFLOW_PG_REQUIRED=1 TS_NODE_TRANSPILE_ONLY=true pnpm --filter @jinhu/api exec node --test --test-concurrency=1 --require ts-node/register src/modules/hr/hr-performance-channel-workflow.pg.spec.ts
pnpm --filter @jinhu/shared lint
pnpm --filter @jinhu/shared typecheck
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/api build
```

The shared contract consumes freshly built shared output from this exact worktree; no Node tests or Node type dependencies are added inside shared source. Required owned PostgreSQL16 tmpfs suite now runs the same actual HTTP workflow once with the unchanged legacy JSON and once with explicitly enabled detail appraisal. Docker/start/migration failure fails the required run. Exact generated container name and ownership label are checked for cleanup. Actual258/259/300/302/304/321/370/371/372 and374 run over the existing explicit foundational projections; no production dataset/role or receipt qualification is implied.

Migration374 replaces only six existing functions with identical signatures/OIDs, SECURITY INVOKER and retained ACL. Workflow optional detailAppraisalPolicy and appealReviewAllowed.detailAppraisal must appear together; schemaVersion remains1. With the extension each detail has exactly one appraisal cell; old inputs forbid it. Every text value uses at most200 Unicode codepoints, including astral characters. Required blank/NULL is rejected; optional UNPROVIDED or explicitly permitted NULL does not block mathematical completeness. Appraisals do not enter core370 arithmetic.

Tests cover two independent detail IDs sharing one item,200/201 astral codepoints, current/history self prefinal field omission, true server author/time/evidence, stage/role/live permission, CAS/idempotency, required completion, unchanged score after narrative-only appeal, confirmed immutability and old dimension lifecycle. Direct SQL rejects missing/misplaced appraisal, wrong stage/author, required blank/NULL and overflow. Function OID/ACL/security metadata and existing source/math function fingerprints are compared, with source rows and original published dimension version preserved.

This is formal per-detail narrative functionality only. Root separately owns Web editing/history/policy/390px verification. ParentD manifest/receipt/source-link qualification, explicit activation mapping, one-time source baseline, production deployment and real business acceptance remain pending.

Required detail appraisal blank detection uses the ECMAScript trim whitespace set consistently in API, SQL input validation and stage completion, including U+FEFF and U+00A0. This is classification only: stored text is preserved verbatim, optional text may remain blank, and existing master narrative semantics are unchanged. Required PG regressions cover API rejection, direct SQL rejection and required/optional stage readiness for these Unicode characters.
