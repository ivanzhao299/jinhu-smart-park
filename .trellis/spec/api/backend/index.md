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

For unscoped password login, resolve duplicate usernames only after password, lockout,
deletion, and enabled-state checks. A unique candidate with an active super role (or active
`*` permission) may be selected ahead of matching tenant accounts; never infer this from the
username. Zero super candidates retain normal tenant ambiguity/context selection, while
multiple super candidates must fail as duplicate privileged identities. Token issuance and
candidate selection must share the same active-role and active-permission definition.

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

Pagination DTOs must validate `page` and `page_size` as integers and cap
`page_size` at the endpoint's documented maximum before values reach
`skip`/`take`. Candidate endpoints are not exempt from the bound.

Reference files:
- `apps/api/src/main.ts`
- `apps/api/src/modules/leasing-payments/dto/create-leasing-payment.dto.ts`
- `apps/api/src/modules/leasing-receivables/dto/create-leasing-receivable.dto.ts`

## File Upload Validation

Read `file-upload.md` before changing multipart upload endpoints, file metadata persistence, feature-specific attachment upload routes, or file ID validation.

Reference files:
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/src/modules/files/files.controller.ts`
- `packages/shared/src/index.ts`

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

## Scenario: Candidate Catalog Matches Write-Side Resolution

### 1. Scope / Trigger
- Trigger: A form selects a scoped reference that the write service can resolve from
  a shared/default catalog, such as the tenant SaaS plan selector.

### 2. Signatures
- Candidate API: `GET /plans/available?page=<int>&page_size=<1..100>&keyword=<optional string>`.
- Write contract: `POST /tenants` and tenant configuration updates accept
  `planCode: string | null`.

### 3. Contracts
- The candidate API and write-side resolver use the same precedence: an enabled,
  non-deleted current-scope record overrides the enabled, non-deleted default catalog
  record with the same business code.
- The default SaaS plan catalog scope is `tenantId=10000001`, `parkId=20000001`.
- Candidate pagination occurs after precedence/deduplication and remains bounded by
  `PaginationQueryDto.page_size`.
- SQL pagination must apply a stable top-level `ORDER BY` before `OFFSET`/`LIMIT`;
  window-function ordering alone does not define the rows consumed by pagination.
- Every paginated candidate query ends its ordering with stable unique tie-breakers
  such as business code and row ID; non-unique group/sort columns are insufficient.
- For precedence catalogs, rank and select the effective scoped row before applying
  keyword filters, so a shadowed default row cannot reappear with different behavior.
- Selector clients must either expose server pagination/search or consume all pages
  reported by `total`; loading only page 1 does not satisfy the candidate/write
  parity contract.
- The scoped `GET /plans` management list remains scoped; do not broaden edit/manage
  surfaces merely to populate a cross-scope candidate selector.

### 4. Validation & Error Matrix
- Invalid page/page size -> global DTO validation returns HTTP 400.
- Disabled or deleted plan -> absent from candidates and rejected by resolution.
- Unknown `planCode` -> tenant service returns HTTP 404.
- Same code in current and default scopes -> return/resolve current scope exactly once.

### 5. Good/Base/Bad Cases
- Good: tenant creation uses `/plans/available` and can submit every returned code.
- Base: a current-scope plan shadows the default plan with the same code.
- Bad: selector calls scoped `/plans` while the write path silently searches another
  scope.

### 6. Tests Required
- Unit-test scope precedence, default fallback, keyword parameters, and page bounds.
- Run API typecheck/build and Web typecheck/build after changing this contract.
- When a database is available, verify tenant creation with a default-catalog plan.

### 7. Wrong vs Correct

#### Wrong
```ts
const candidates = await listPlans(currentScope);
const selected = await resolveFromAnyScope(planCode);
```

#### Correct
```ts
const candidates = await listAvailablePlans(currentScope);
const selected = await resolveCurrentThenDefaultCatalog(currentScope, planCode);
```

## Scenario: Optional Update Relation Clear Semantics

### 1. Scope / Trigger
- Trigger: A partial update DTO includes an optional nullable relation such as
  `building_id`, `floor_id`, or `unit_id`.

### 2. Signatures
- Update request field: `relation_id?: UUID | null`.
- Service resolution input: `string | null | undefined`.

### 3. Contracts
- Omitted/`undefined` means preserve the stored relation.
- Explicit `null` means clear the stored relation.
- DTO transforms for nullable update relations must preserve `null`; do not reuse a
  trim helper that converts both `null` and omission to `undefined`.
- Parent relation clears must reconcile and clear dependent child relations in the
  same update.
- A partial update that explicitly clears only a parent must cascade that clear to
  omitted descendants before location resolution; stored child IDs must not infer
  the cleared parent back into existence.

### 4. Validation & Error Matrix
- Omitted relation -> retain current value.
- `null` relation -> clear value; nullable validation succeeds.
- Parent `null` with omitted descendants -> clear the complete descendant cascade.
- Valid UUID -> resolve inside tenant/park scope.
- Invalid UUID or cross-scope UUID -> HTTP 400.

### 5. Good/Base/Bad Cases
- Good: `{ building_id: null, floor_id: null, unit_id: null }` clears the cascade.
- Base: `{}` leaves all three relations unchanged.
- Bad: a transform converts explicit `null` into `undefined`, silently restoring the
  old relations.

### 6. Tests Required
- DTO transformation test asserts both explicit-null preservation and omission.
- Service or payload logic test asserts clearing a parent clears descendants.
- Run API/Web typecheck and affected unit tests.

### 7. Wrong vs Correct

#### Wrong
```ts
const trimOptional = (value: unknown) => value == null ? undefined : String(value).trim();
```

#### Correct
```ts
const trimNullable = (value: unknown) => value === null ? null : trimOptional(value);
```

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

Historical financial selectors must not discard an otherwise actionable record
because its current reference row was soft-deleted. Join the historical label
without an `is_deleted = false` filter (and provide a stable fallback if the
reference is absent), while retaining tenant/park scoping.

Reference files:
- `apps/api/src/shared/entities/auditable.entity.ts`
- `apps/api/src/modules/leasing-payments/entities/leasing-payment.entity.ts`
- `apps/api/src/modules/leasing-receivables/entities/leasing-receivable.entity.ts`

Financial delete operations use soft-delete and status transitions, not physical deletes. Preserve checks for applied, partially applied, invoiced, waived, voided, or otherwise active records.

Reference files:
- `apps/api/src/modules/leasing-payments/leasing-payments.service.ts`
- `apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts`
- `AGENTS.md`

## Shared Property Occupancy

Read [shared-property-occupancy.md](./shared-property-occupancy.md) before changing whole-unit operating modes, homestay/housing rental availability, shared occupancy, or commercial contract unit binding.

The cross-table concurrency contract is mandatory: service checks alone do not prevent a commercial-contract write racing a homestay or housing-rental occupancy write.

## Property Business Controls

Read [property-business-controls.md](./property-business-controls.md) before changing homestay/housing business dates, guest identity verification, finance detail permissions, billing-period math, purchase rounding/recharge, or granular-role page loading.

## Tenant Module Access Control

Read [module-access-control.md](./module-access-control.md) before changing tenant module
assignments, `@RequireModule`, `/users/me.enabled_modules`, frontend module filtering,
post-login routing, or module-specific menu migrations.

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
