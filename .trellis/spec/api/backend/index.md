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

Business display names used as catalog labels must be required and normalized before validation.
Remove Unicode `\\p{Default_Ignorable_Code_Point}` characters before checking that the result contains
at least one Unicode letter (`\\p{L}`), including alphabetic or ideographic text; some default-ignorable
fillers are themselves classified as letters. A negated number/whitespace class is insufficient because
punctuation, decimal separators, and invisible characters would pass. Reject omission, blank, number-only,
punctuation-only, and invisible-only names at the API boundary even when the Web form also validates them.
Identifiers and codes belong in their dedicated fields.

Pagination DTOs must validate `page` and `page_size` as integers and cap
`page_size` at the endpoint's documented maximum before values reach
`skip`/`take`. Candidate endpoints are not exempt from the bound.

Reference files:
- `apps/api/src/main.ts`
- `apps/api/src/modules/leasing-payments/dto/create-leasing-payment.dto.ts`
- `apps/api/src/modules/leasing-receivables/dto/create-leasing-receivable.dto.ts`

## Scenario: Role Permission Bulk Assignment Capacity

### 1. Scope / Trigger
- Trigger: changing the system permission catalog or the role permission replacement endpoint.

### 2. Signatures
- `POST /roles/:id/permissions` accepts `{ permissionIds: UUID[] }`.
- `AssignPermissionsDto.permissionIds` uses `ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE` as its bounded capacity.

### 3. Contracts
- The DTO capacity must remain greater than or equal to the complete current system permission catalog plus documented tenant-extension headroom.
- Keep a finite `ArrayMaxSize`; do not remove the request bound merely because the catalog grows.
- `RolesService.assignPermissions` remains authoritative for tenant scope, active/non-deleted permission existence, and replacement semantics.

### 4. Validation & Error Matrix
- Valid UUID array at or below the capacity -> DTO accepts; the service validates every permission in the current tenant.
- Array above the capacity -> DTO validation returns HTTP 400.
- Unknown, deleted, or cross-tenant ID -> the service rejects the complete assignment.

### 5. Good/Base/Bad Cases
- Good: a role can select the complete seeded permission tree when it contains more than 200 entries.
- Base: a small role assignment follows the same replacement path.
- Bad: a hard-coded limit below the seeded catalog makes selecting a parent permission impossible to save.

### 6. Tests Required
- DTO test with a permission array larger than the retired limit and representative of the current seed count.
- DTO test with `ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE + 1` entries rejected.
- Preserve service tests for tenant isolation and missing permission IDs.

### 7. Wrong vs Correct

#### Wrong
```ts
@ArrayMaxSize(200) // smaller than the current permission tree
permissionIds!: string[];
```

#### Correct
```ts
export const ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE = 1000;
@ArrayMaxSize(ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE)
permissionIds!: string[];
```

## File Upload Validation

Read `file-upload.md` before changing multipart upload endpoints, file metadata persistence, feature-specific attachment upload routes, or file ID validation.

Reference files:
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/src/modules/files/files.controller.ts`
- `packages/shared/src/index.ts`

## Apartment Formal Documents

Read [Apartment Formal Documents And Signing](./apartment-documents.md) before changing apartment templates, document generation, signing evidence, default reasons, or responsibility-user role convergence.

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

## Business Action Context Endpoints

An authorized business action must receive its minimum execution context from the owning
aggregate. Do not require the browser to join an unrelated management endpoint whose read
permission is not part of the action contract. For safety inspection execution,
`GET /safety/inspect-tasks/:id/execution` is authorized by the task start/check-in/result
permissions, revalidates that the actor can execute the target task, and returns the enabled
template items together with the task. Ordinary task detail remains a read-only projection.

Lifecycle action entry points must distinguish start, resume, and reject states. A repeated
start request for an already in-progress inspection returns the current execution projection
without writing a second transition or audit log; terminal states remain rejected by both the
mutation and action-context route. Determine the disposition while holding the aggregate row's
`pessimistic_write` lock inside the mutation transaction; a browser lock or pre-transaction read
cannot serialize separate clients.
After a transition commits, its response must preserve that success even if another actor advances
the aggregate before response enrichment. Build the authorized mutation response without routing
it back through a context guard whose state predicate may now reject the already-committed action.
Nested result collections are independent field-policy entities: every task detail/action projection
must apply `safety.inspect_task_result` policies to each result before attaching it to a parent whose
own `inspect_task` policy is necessarily shallow.
For partial result writes, an omitted protected optional field means preserve the stored value;
explicit `null` means clear it. Finish-time validation must evaluate the resolved stored/submitted
value under the result-row write lock so a hidden field neither corrupts concurrent edits nor
falsely fails an abnormal-result requirement.

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

Read [TypeORM Raw Query Result Shapes](./typeorm-raw-query-results.md) before using
`EntityManager.query()` or `QueryRunner.query()` results from PostgreSQL DML with
`RETURNING`, especially for optimistic-version CAS and financial effect cardinality.

## Shared Property Occupancy

Read [shared-property-occupancy.md](./shared-property-occupancy.md) before changing whole-unit operating modes, homestay/housing rental availability, shared occupancy, or commercial contract unit binding.

The cross-table concurrency contract is mandatory: service checks alone do not prevent a commercial-contract write racing a homestay or housing-rental occupancy write.

## Property Business Controls

Read [property-business-controls.md](./property-business-controls.md) before changing homestay/housing business dates, guest identity verification, finance detail permissions, billing-period math, purchase rounding/recharge, or granular-role page loading.

Read [Property Approval Domain Effects](./property-approval-domain-effects.md) before
changing homestay cancellation/refund/waiver or housing checkout, handover, purchase
payment/refund/void, and purchase-to-receivable transfer approval flows.

## Tenant Module Access Control

Read [module-access-control.md](./module-access-control.md) before changing tenant module
assignments, `@RequireModule`, `/users/me.enabled_modules`, frontend module filtering,
post-login routing, or module-specific menu migrations.

## Migrations And Seeds

Migrations are forward-only SQL files in `database/migrations`. Do not edit migrations that may already have succeeded in production. `scripts/db-migrate.sh` records filename, checksum, running/succeeded/failed status, executor, and batch id in `public.sys_schema_migration_history`.

Read [Historical Migration Prerequisites](./migration-prerequisites.md) before adding a
`database/migration-prerequisites/<target>/` repair, or when an immutable migration's PostgreSQL
`ON CONFLICT` target no longer has an exactly inferable unique/exclusion arbiter.

Reference files:
- `scripts/db-migrate.sh`
- `database/migrations/000139_sys_schema_migration_history.sql`
- `docs/release/production-migration-execution-policy.md`

Production seed and development seed are separate:

- Production seed: `pnpm db:seed:prod`, requires `ALLOW_PRODUCTION_SEED=yes`.
- Development seed: `pnpm db:seed:dev`, local only.

For partial unique indexes, PostgreSQL conflict inference is an executable schema contract: an
`ON CONFLICT` column list and predicate must match the active unique index exactly. All later joins
that resolve the upserted record must use the same business identity; do not upsert a tenant-wide
role by `(tenant_id, code)` and then require `(tenant_id, park_id, code)` to bind it.

Failed migrations remain forward-only. Correct a failed file only after confirming it never
succeeded in a long-lived environment and its transaction rolled back; successful history is
immutable. Keep account, role, permission, and relationship provisioning in production-safe seeds.

Reference files:
- `database/seeds/README.md`
- `database/seeds/production/README.md`
- `database/seeds/dev/README.md`
- `AGENTS.md`

## Admin Issue Runner Lease And Evidence Contract

- Feedback create/mine/detail are universal authenticated-user capabilities and declare the explicit
  `RequireAuthenticated` guard contract. Do not approximate universal access with a point-in-time
  role-permission seed. Detail still enforces reporter ownership unless the actor has read permission
  or super-admin authority.
- Claim, lease renewal, triage, and result writeback serialize the target issue with a database
  write lock. An active claim cannot be triaged, renewed by another runner, or completed by an old token.
- Lease renewal and result writeback match both `runner_id` and `lease_token`, require an unexpired
  `IN_PROGRESS/CLAIMED` state, and clear the lease when the runner yields a result.
- Validate approval against the final merged and trimmed acceptance criteria, not the old row before
  applying the DTO.
- `SUCCEEDED` requires structured passing gates for CI, deployment, and production health. A generic
  root `status=PASS` or `conclusion=SUCCESS` is not release evidence.

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
