# @jinhu/api Backend Specs

These rules describe the current NestJS API in `apps/api`. Follow them when changing controllers, services, DTOs, entities, migrations, seeds, and API smoke scripts.

## Package Boundary

- Source lives in `apps/api/src`.
- Feature modules live under `apps/api/src/modules/<domain>/`.
- Shared API infrastructure lives under `apps/api/src/shared/`.
- SQL migrations live in `database/migrations`; operational scripts live in `scripts/`.

Reference files:
- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/modules/leasing-payments/leasing-payments.module.ts`
- `apps/api/src/shared/interceptors/response.interceptor.ts`

## Module Shape

Feature modules use the NestJS module/controller/service/entity/DTO split:

- `*.module.ts` wires TypeORM repositories and providers.
- `*.controller.ts` owns route decorators, permissions, audit decorators, and request DTO wiring.
- `*.service.ts` owns business logic, transactions, query builders, field policy application, and persistence.
- `dto/*.dto.ts` uses `class-validator` and `class-transformer`.
- `entities/*.entity.ts` maps TypeORM columns and indexes.

Reference files:
- `apps/api/src/modules/leasing-payments/leasing-payments.controller.ts`
- `apps/api/src/modules/leasing-payments/leasing-payments.service.ts`
- `apps/api/src/modules/leasing-payments/dto/create-leasing-payment.dto.ts`
- `apps/api/src/modules/leasing-payments/entities/leasing-payment.entity.ts`

Avoid placing business rules in controllers. Controllers should delegate to services after binding `@CurrentScope`, `@CurrentUser`, `@Param`, `@Query`, and `@Body`.

## Authentication, Permissions, And Scope

Non-public endpoints must declare permission metadata. `PermissionGuard` rejects endpoints with neither `@RequirePermissions` nor `@RequireAnyPermissions`.

Routes that belong to a product module should also use `@RequireModule("<module>")` at controller level when the module is gated.

Use shared permission constants from `@jinhu/shared` instead of string literals in controllers.

Reference files:
- `apps/api/src/shared/guards/permission.guard.ts`
- `apps/api/src/shared/decorators/permissions.decorator.ts`
- `apps/api/src/shared/decorators/modules.decorator.ts`
- `apps/api/src/modules/leasing-payments/leasing-payments.controller.ts`
- `packages/shared/src/index.ts`

## DTO Validation

Global validation is configured in `apps/api/src/main.ts` with:

- `whitelist: true`
- `transform: true`
- `forbidNonWhitelisted: true`

DTOs should use `class-validator` decorators and `class-transformer` transforms for trimming and numeric coercion. Reuse existing helpers when a domain already exposes them, such as `trimOptional` and `optionalNumber` in leasing receivable DTOs.

Reference files:
- `apps/api/src/main.ts`
- `apps/api/src/modules/leasing-payments/dto/create-leasing-payment.dto.ts`
- `apps/api/src/modules/leasing-receivables/dto/create-leasing-receivable.dto.ts`

## Response And Error Shape

Successful responses are wrapped by `ResponseInterceptor` as:

```ts
{ code: 0, message: "success", data, request_id, server_time }
```

Errors are normalized by `ApiExceptionFilter` as `ApiResponse<null>` with HTTP status in `code`.

Reference files:
- `apps/api/src/shared/interceptors/response.interceptor.ts`
- `apps/api/src/shared/filters/api-exception.filter.ts`
- `packages/shared/src/index.ts`

Use Nest exceptions (`BadRequestException`, `ForbiddenException`, `ConflictException`, `NotFoundException`, etc.) from services. Do not return ad hoc error objects from controllers or services.

## Idempotent Writes

For retryable write endpoints, attach `new IdempotencyInterceptor()` and require the frontend to send `X-Idempotency-Key`. The interceptor persists successful responses and detects processing/conflicting retries.

Reference files:
- `apps/api/src/shared/interceptors/idempotency.interceptor.ts`
- `apps/api/src/shared/services/idempotency.service.ts`
- `apps/api/src/modules/leasing-payments/leasing-payments.controller.ts`
- `apps/web/lib/api-client.ts`

Guard-only idempotency is not equivalent to replay/conflict semantics. When documenting or changing idempotency behavior, distinguish routes using `IdempotencyInterceptor` from routes that only validate a key.

## Persistence And Financial Safety

Entities extend `AuditableEntity` when they participate in tenant/park scoped business data. It provides `id`, `tenantId`, `parkId`, audit columns, soft-delete state, optimistic `version`, and `remark`.

Reference files:
- `apps/api/src/shared/entities/auditable.entity.ts`
- `apps/api/src/modules/leasing-payments/entities/leasing-payment.entity.ts`
- `apps/api/src/modules/leasing-receivables/entities/leasing-receivable.entity.ts`

Financial delete operations use soft-delete and status transitions, not physical deletes. Preserve checks for applied, partially applied, invoiced, waived, voided, or otherwise active records.

Reference files:
- `apps/api/src/modules/leasing-payments/leasing-payments.service.ts`
- `apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts`
- `AGENTS.md`

## Migrations And Seeds

Migrations are forward-only SQL files in `database/migrations`. Do not edit migrations that may already have succeeded in production. `scripts/db-migrate.sh` records filename, checksum, running/succeeded/failed status, executor, and batch id in `public.sys_schema_migration_history`.

Reference files:
- `scripts/db-migrate.sh`
- `database/migrations/000139_sys_schema_migration_history.sql`
- `docs/release/production-migration-execution-policy.md`

Production seed and development seed are separate:

- Production seed: `pnpm db:seed:prod`, requires `ALLOW_PRODUCTION_SEED=yes`.
- Development seed: `pnpm db:seed:dev`, local only.

Reference files:
- `database/seeds/README.md`
- `database/seeds/production/README.md`
- `database/seeds/dev/README.md`
- `AGENTS.md`

## Verification

For API changes, choose the smallest reliable verification:

- `pnpm --filter @jinhu/api build`
- `pnpm --filter @jinhu/api lint`
- A targeted script from `scripts/e2e/`
- `pnpm db:migrate` only when migration behavior is in scope and a database is available

For first-release behavior, prefer the documented smoke/regression entry related to the touched module.

Reference files:
- `package.json`
- `docs/testing/how-to-run-tests.md`
- `scripts/e2e/first-release-regression.mjs`
