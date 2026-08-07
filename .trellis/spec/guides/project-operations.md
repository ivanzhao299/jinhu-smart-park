# Project Operations Guide

This guide records cross-cutting rules that affect multiple packages.

## Production And Secrets

Never commit real secrets, production passwords, private credentials, `.env`, or production override files. Production auth settings have explicit safety constraints in `AGENTS.md`.

Reference files:
- `AGENTS.md`
- `.env.example`
- `.env.production.example`
- `docs/deployment/production.md`

## Release Baseline

Production initialization keeps migration, production seed, baseline checks, and bootstrap admin separate.

Release baseline order:

1. `pnpm db:migrate`
2. `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`
3. `pnpm db:check:init`
4. `pnpm db:bootstrap:admin`
5. `pnpm db:check:init`

Reference files:
- `AGENTS.md`
- `docs/deployment/production.md`
- `docs/release/production-release-sop.md`
- `scripts/check-init-baseline.sh`
- `scripts/bootstrap-admin.sh`

### Migration Conflict And Retry Contract

- Every `INSERT ... ON CONFLICT (<columns>) WHERE <predicate>` must match an active unique/exclusion
  index with the same columns and predicate in the schema state immediately before that migration/seed.
- Use the same business identity in every downstream join. If a role is unique by `(tenant_id, code)`,
  an upsert and its later permission/user bindings must not silently add `park_id` to the identity.
- Migrations own schema; tenant, permission, role, user, and relationship baselines belong in
  production-safe seeds unless the row is inseparable schema metadata.
- Never edit a migration recorded `succeeded`. A migration recorded only `failed` may be corrected
  in place after verifying transactional rollback and all long-lived environments; a later-numbered
  migration cannot repair a file that fail-fast prevents the runner from passing.
- Pull requests touching migrations, production seeds, database release scripts, or Release Smoke
  workflow definitions must trigger fresh-schema Release Smoke automatically, not by reviewer memory
  or an optional label.

Reference files:
- `scripts/db-migrate.sh`
- `.github/workflows/ci.yml`
- `docs/release/production-migration-execution-policy.md`

### Deployment Artifact Cleanup Contract

- Temporary credential files are deleted on both the CI runner and production host on success,
  command failure, interruption, and termination.
- A production source snapshot is deleted after successful deployment or successful rollback.
  Preserve it only when rollback itself fails, and print the exact recovery path.
- Recursive deletion targets must be derived from a validated run identifier and a fixed deployment
  rollback parent; never delete an unvalidated environment-supplied path.

## Testing And Smoke Scripts

The repository uses focused smoke scripts for first-release slices. Prefer the narrow script related to the touched module before running the full first-release regression.

Reference files:
- `package.json`
- `docs/testing/how-to-run-tests.md`
- `scripts/e2e/first-release-regression.mjs`
- `scripts/e2e/s5a-safety-smoke.mjs`
- `scripts/e2e/s3d-payment-smoke.mjs`

## Documentation Sync

When changing environment variables, scripts, release flow, first-release scope, menu visibility, auth behavior, database initialization, financial behavior, or idempotency behavior, update the matching docs in the same task.

Reference files:
- `AGENTS.md`
- `README.md`
- `docs/index.md`
- `docs/deployment/production.md`
- `docs/release/production-go-live-checklist.md`
