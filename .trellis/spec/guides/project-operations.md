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
