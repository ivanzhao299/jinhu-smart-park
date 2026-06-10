# AGENTS.md

## Repository Overview

This repository is `jinhu-smart-park`, a pnpm workspace monorepo for the Jinhu Smart Park digital operations SaaS.

The workspace includes:

- `apps/*`
- `packages/*`

Run commands from the repository root unless a package-specific command is explicitly needed.

## Directory Map

- `apps/api`: NestJS API, auth, RBAC, modules, guards, interceptors, services, entities, DTOs, and controllers.
- `apps/web`: Next.js / React / TypeScript frontend.
- `packages/shared`: Shared constants, permission contracts, and cross-app types used by API and Web.
- `packages/ui`: Shared UI package.
- `packages/config`: Shared config package, including exported TypeScript config.
- `database/migrations`: Forward-only SQL migrations.
- `database/seeds`: Production-safe and development-only seed SQL plus seed documentation.
- `scripts`: Development, migration, seed, bootstrap, production, verification, cleanup, and import helpers.
- `scripts/e2e`: Smoke and first-release regression scripts.
- `docs`: Architecture, deployment, release, testing, production safety, regression, and operational documentation.
- `.github/workflows`: CI and production deployment workflows.

## Common Commands

Workspace commands:

- `pnpm dev`
- `pnpm dev:web`
- `pnpm dev:api`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm db:up`
- `pnpm db:down`
- `pnpm db:migrate`
- `pnpm db:check:init`
- `pnpm db:bootstrap:admin`
- `pnpm db:seed:prod`
- `pnpm db:seed:dev`
- `pnpm prod:deploy`
- `pnpm prod:health`
- `pnpm smoke:cleanup`
- `pnpm check:s1`

Package-specific commands:

- `pnpm --filter @jinhu/api start:dev`
- `pnpm --filter @jinhu/api build`
- `pnpm --filter @jinhu/web dev`
- `pnpm --filter @jinhu/shared build`

Direct node regression entries:

- `node scripts/e2e/first-release-regression.mjs`
- `node scripts/e2e/first-release-leasing.mjs`
- `node scripts/e2e/first-release-workorders.mjs`
- `node scripts/e2e/first-release-auth-health.mjs`
- `node scripts/e2e/first-release-idempotency.mjs`
- `node scripts/e2e/first-release-files.mjs`
- `node scripts/e2e/first-release-users-assets.mjs`
- `node scripts/e2e/first-release-menu-whitelist.mjs`

## Change Discipline

- Run commands from the repository root unless a package-specific command is explicitly needed.
- Modify only files required by the task.
- Do not perform unrelated refactors, formatting sweeps, dependency upgrades, workflow changes, or documentation rewrites unless explicitly requested.
- If changing `packages/shared`, consider both API and Web impact.
- If changing scripts, check related docs and workflows.
- Preserve existing project patterns before adding new abstractions.
- Avoid changing release, production, auth, database, or financial behavior without checking the related scripts and docs.

## Environment And Production Configuration Rules

- Do not commit secrets, tokens, production passwords, or private credentials.
- Production must keep `AUTH_SMS_FIXED_CODE` empty.
- Production must keep `AUTH_SMS_CODE_VISIBLE=false`.
- Production must keep `AUTH_WECHAT_MOCK_ENABLED=false`.
- Production first release supports password login by default.
- SMS and WeChat login remain disabled unless explicitly enabled by a production-safe change.
- When auth config changes, check `.env.production.example`, `docs/deployment/production.md`, `scripts/check-init-baseline.sh`, and `./scripts/verify-api-login-dockerexec.sh`.
- When relevant, verify current auth behavior against `apps/api/src/modules/auth`.

## Seed Rules

- `database/seeds` separates production-safe seed and dev-only seed.
- Production seed is `pnpm db:seed:prod`.
- Production seed requires `ALLOW_PRODUCTION_SEED=yes`.
- Dev seed must not run in shared, staging, or production unless explicitly and safely overridden.
- Production-safe seed must not create fixed-password accounts, plaintext passwords, test phone numbers, test emails, or demo business data.
- Dev-only seed may create local smoke-test accounts and sample data for local testing only.
- Do not mix seed responsibilities with migration responsibilities.

## Migration Rules

- Migrations are forward-only.
- Do not edit already-applied or already-successful production migrations.
- `scripts/db-migrate.sh` enforces migration history, checksum, skip, and fail-fast behavior.
- Checksum or history conflicts must fail loudly.
- Migration and production seed are separate concerns and must not be mixed.
- Avoid duplicate migration numbers.
- The repository has existing duplicated `000136_*` migration history, so new migrations require extra care.
- Production migration execution must preserve backup, log, and audit expectations.
- Stop on migration failure; do not continue seed, bootstrap, deploy, or verification steps after a failed migration.

## Release Initialization Rules

Release baseline order:

1. `pnpm db:migrate`
2. `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`
3. `pnpm db:check:init`
4. `pnpm db:bootstrap:admin`
5. `pnpm db:check:init`
6. Verify API login with `./scripts/verify-api-login-dockerexec.sh` when container-internal verification is needed.

Rules:

- `bootstrap-admin` only creates the first login-capable admin.
- `bootstrap-admin` does not create tenant, park, role, permission, or module baseline.
- `check-init-baseline` may fail before bootstrap admin exists.
- After bootstrap admin exists, `check-init-baseline` should pass or warn.
- Keep bootstrap admin passwords out of logs and committed files.

## Release Smoke And Regression Rules

- CI has `verify` and `release-smoke` gates.
- `verify` covers install, lint, shared build, typecheck, and build.
- `release-smoke` covers PostgreSQL, migration, production seed, bootstrap-admin, baseline, and API login verification.
- First-release regression is deeper than `release-smoke` and does not replace it.
- `node scripts/e2e/first-release-regression.mjs` is the current full first-release regression entry.
- When changing first-release behavior, verify the relevant direct node regression entry when practical.

## Leasing Receivables And Payments Rules

- Leasing receivables and payments are first-release core financial modules.
- `DELETE /leasing/receivables/:id` means soft delete plus `status=void`, not physical delete.
- `DELETE /leasing/payments/:id` means soft delete plus `status=void`, not physical delete.
- Do not bypass checks for paid, waived, invoiced, voided, applied, partially applied, or otherwise financially active records.
- Receivable delete must block records with `amountPaid > 0`, `amountWaived > 0`, `invoiceStatus != none`, existing payment application, void status, or other financial activity.
- Payment delete must block applied, partially applied, application-linked, already-voided, or otherwise financially active payments.
- Preserve financial auditability.
- When relevant, verify current financial rules against current service code and release docs.

## Idempotency Rules

- Global `IdempotencyKeyGuard` requiring `X-Idempotency-Key` does not by itself provide replay or conflict semantics.
- Only routes explicitly using `IdempotencyInterceptor` have true replay/conflict semantics.
- `POST /leasing/receivables/generate-batch` currently has guard-only behavior and must not be described as fully idempotent.
- For `generate-batch` changes, prioritize partial success behavior, concurrent conflict translation, batch history/result, and duplicate prevention rather than simply attaching a generic interceptor.
- For retryable financial write paths, require idempotency or equivalent duplicate-prevention handling.
- When documenting idempotency coverage, use current code scan results over outdated docs snapshots.

## Documentation Synchronization

- When changing env vars, sync `.env.example`, `.env.production.example`, and relevant production/release docs.
- When changing scripts or release flow, sync `docs/deployment`, `docs/release`, `docs/testing`, and workflows when relevant.
- When changing first-release scope or menu, sync frontend whitelist logic, production docs, and regression scripts.
- When relevant, verify against current code, docs, scripts, and workflows before writing hard claims.

## Done Means

- Required files changed only.
- Relevant validation commands run, or explicitly skipped with a reason.
- No unrelated files modified.
- Production, auth, migration, seed, financial, and idempotency risks considered when relevant.
- Remaining risks documented.

## Reporting Requirements

At the end of each task, report:

- Changed files.
- Validation commands run.
- Validation results.
- Skipped checks and reasons.
- Remaining risks.
