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
- Release seed scope includes both the top-level production core seed and `database/seeds/production/`.
  If seed execution is required, reject or upgrade deployment modes that do not run migrations/seeds;
  never publish a release marker from `web` or `fast-css` while deferring required seed work.

Reference files:
- `scripts/db-migrate.sh`
- `.github/workflows/ci.yml`
- `docs/release/production-migration-execution-policy.md`

### Deployment Artifact Cleanup Contract

- Temporary credential files are deleted on both the CI runner and production host on success,
  command failure, interruption, and termination.
- Register the remote-cleanup attempt before uploading credentials. A trap installed only after the
  activation SSH shell starts cannot clean files left by a successful transfer followed by SSH failure.
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

### Service Readiness In Smoke And Rehearsal Scripts

- A spawned process, an allocated PID, or a free/bound TCP port is not an HTTP
  readiness signal. Poll every origin that the smoke flow will use, including
  Web origins in front of API rewrites, with a fixed attempt/deadline budget.
- Readiness retries may cover idempotent health pages and login-page GETs. Do
  not silently add retries around authenticated writes or business mutations.
- Track child `error` and `exit` events while waiting. A service that exits
  before readiness must fail immediately with its role and terminal state,
  then enter the same process-group, port, lease, credential, and database
  cleanup path as any other failure.
- Tests must deterministically cover transient connection refusal followed by
  success, exhaustion of the bounded retry budget, and child exit before
  listening. Do not rely on timing sleeps as the only regression check.
- Runtime diagnostics must retain the failing smoke step while redacting
  credentials, bearer tokens, database URLs, and local paths before evidence
  persistence.
- If command capture accepts an allowlisted public tool-documentation URL, the
  evidence gate must apply the same command-aware allowlist when it re-reads
  the command's exact persisted stdout/stderr log paths. All non-allowlisted
  URLs, non-build logs, and path masquerades remain fail-closed.

## Documentation Sync

When changing environment variables, scripts, release flow, first-release scope, menu visibility, auth behavior, database initialization, financial behavior, or idempotency behavior, update the matching docs in the same task.

Reference files:
- `AGENTS.md`
- `README.md`
- `docs/index.md`
- `docs/deployment/production.md`
- `docs/release/production-go-live-checklist.md`
