# Five-channel template definition maintenance validation

This slice maintains formal definitions on the existing template/version identity. Five-channel definitions remain draft-only until parentC connects scoring, submission, calibration, finalization and appeal. It performs no source import, business activation, payroll calculation or production writes. ActualJulyTrial=NOT_EXECUTED; imported2026-07 across books, Wu Enguo and calculate-only remain parent acceptance.

From repository root:

```sh
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api exec env HR_PERFORMANCE_CHANNEL_DEFINITION_PG_REQUIRED=1 TS_NODE_TRANSPILE_ONLY=true node --test --require ts-node/register src/modules/hr/hr-performance-channel-definition.pg.spec.ts
pnpm --filter @jinhu/api exec env TS_NODE_TRANSPILE_ONLY=true node --test --require ts-node/register src/modules/hr/hr-performance-template-version.spec.ts
pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/hr-performance-channel-definition.test.tsx test/interaction/hr-performance-template-workflow.test.tsx
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/web lint
pnpm --filter @jinhu/api build
pnpm --filter @jinhu/web build
```

The required PostgreSQL run starts its own `postgres:16-alpine` tmpfs container on a random loopback port. It loads actual migrations258/300/302/304/321/370/371 and the existing idempotency migration; unrelated prerequisite tables are minimal synthetic fixtures. A real Nest controller/service, ValidationPipe, PermissionGuard, IdempotencyKeyGuard and database-backed IdempotencyInterceptor process HTTP requests. Authentication principals are synthetic; this does not test JWT login, real-role grants, complete monorepo migration bootstrapping or production UAT. Missing Docker/start failure fails the enabled run and cannot fall back to a shared database.

Checks include101items/41grade candidates, complete guides, negative and18digit decimal strings, explicit NULL/empty text/leading zeros, exact stable IDs, duplicate codes,19 strict shared/SQL/HTTP invalid configurations plus top-level whitespace rejection and integer JSON lexical parity, template/version/revision CAS, real request replay/conflict, full history paging and an interleaved revision commit proving coherent head/page snapshots, scoped visibility, immutable revisions/current-pointer ownership, deferred orphan-head rejection, direct SQL activation and mixed-child rejection, old dimension publication/score/frozen cycle and source fact/function/ACL preservation. The test verifies name+ownership label before removing its own container in nested cleanup, including partial creation or app/connection-close failure.

Actual component tests exercise full collections across pages, exact strings, normal create/new-version/current-draft maintenance, policies, shared write lock, definite rejection retention, uncertain original-request retry, late completion/read suppression, read-only full history and existing dimension workflow. Desktop and390px native browser inspection is performed separately by root against a preview of the actual component. A preview with synthetic fixtures is visual evidence only.

Private raw logs are retained under `/Users/mac/.codex/artifacts/hr-performance-channel-definition-20261016` with directory0700/files0600. Record each actual process exit status; observation timeout does not authorize another runner. No old applied migration, source-fact guard or production permission is altered.
