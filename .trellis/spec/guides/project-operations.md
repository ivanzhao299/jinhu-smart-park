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

### Forward-Only Migration Identity And Source Rollback

- Renamed migration history may be rekeyed automatically only when the legacy row is `succeeded` with the reviewed
  canonical checksum and the canonical identity is absent.
- If legacy and canonical identities both exist, automatic recovery requires both rows plus an existing alias audit
  marker to be `succeeded` with that exact checksum in both history tables. Delete only the duplicate legacy identity
  in one transaction; any missing marker, status/checksum drift, or cross-table disagreement must fail closed.
- History bootstrap may copy rows only when exactly one history table existed before the runner created the other
  table. If both tables already existed, never backfill missing rows between them before the FULL JOIN consistency
  audit; an incomplete alias or migration audit must remain visible and fail closed.
- A source rollback may rebuild and health-check the previous application snapshot, but it must not run that older
  snapshot's migration or production-seed manifest against a forward-migrated database. Overlay the reviewed
  candidate migration runner and replacement manifest/patches after restoring application source so a replacement
  execution checksum already committed to history remains readable.
- Source rollback does not reverse database state. Use the release backup and an explicit database-owner decision for
  database recovery.

Reference files:
- `database/migration-history-aliases.txt`
- `scripts/db-migrate.sh`
- `.github/workflows/deploy-production.yml`
- `docs/release/production-migration-execution-policy.md`

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
- When an unchanged historical migration requires a projection that can be derived from canonical
  production data, use a separately historied prerequisite only if the repair is deterministic,
  insert-only, preserves existing business rows, and fails closed for missing or ambiguous scope.
  Keep the matching production seed convergence so a clean migration-before-seed install does not
  recreate the same projection gap after migrations finish.
- A projection prerequisite must not require its repair source when the immutable target is already
  satisfied by exactly one valid destination row. For a legacy seed whose global business key retained
  old scope IDs, a fallback may be used only for one fixed documented target scope and one fixed unique
  source key. That fixed unique key may also disambiguate multiple rows inside the fixed target scope;
  generic single-row or cross-tenant guessing remains forbidden.
- When a deliberate legacy baseline skipped an earlier scope-ID type migration, use a separate,
  narrowly historied schema prerequisite before the unchanged target. Limit it to the exact columns
  consumed by that target, allow only known source/target types and sentinel rewrites, then assert the
  final type before any business projection runs.
- Pull requests touching migrations, production seeds, database release scripts, or Release Smoke
  workflow definitions must trigger fresh-schema Release Smoke automatically, not by reviewer memory
  or an optional label.
- Reproduce Release Smoke locally with the workflow's effective environment, not the developer shell's
  defaults. In particular, a job-level `NODE_ENV=production` changes dependency installation; any
  database-backed TypeScript spec must explicitly install its test runner (for example with
  `pnpm install --frozen-lockfile --prod=false`) before invoking it.
- A fresh-schema rehearsal must create its database from PostgreSQL `template0` and pass the exact
  `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` variables
  consumed by `scripts/db-migrate.sh`. A database inherited from a polluted `template1`, or a
  `DATABASE_URL` ignored by the migration runner, is not fresh-schema evidence.
- Owner/scope constraints must be tested as a bidirectional mutation matrix. Cover child-side owner
  changes, parent/owner-side changes after linking, source primary-key changes, cross-tenant/park and
  wrong unit/source identities, plus the legal same-owner path. Trigger `UPDATE OF` lists must include
  every `NEW` field read by the trigger function; linked owner fields on the referenced row must be
  protected by inverse validation or made immutable.
- Projection migrations whose target scopes come from production assignments require a read-only parity
  diagnostic and an API/full deployment gate after required secret initialization but before application release
  source sync, migration, seed, or image build.
  The diagnostic may expose scope identifiers and aggregate counts, but never credentials, personal data, or an
  inferred cross-tenant mapping. A diagnostic-only workflow path must not write a release marker or run UAT.
- Fresh-schema Release Smoke is necessary but cannot represent all historical production states. Each newly
  observed production classification must become a deterministic isolated PostgreSQL fixture before the next
  deployment attempt.
- An exact-set guard whose expected rows are derived from persisted assignments must not rely only on a
  migration-before-seed empty-database fixture: an empty target scope makes the check vacuously pass. Rehearse the
  production order by migrating to the predecessor, creating the non-empty assignment shape, then applying the
  prerequisite and unchanged target. The matching read-only predeploy classifier must distinguish deterministic
  insert-only convergence from extra rows or definition drift; only the former may proceed to migration. Continue
  that same non-empty fixture through every dependent pending migration and the production seed; stopping after the
  first repaired target can hide a later migration that still asserts an obsolete contract state.
- Keep reviewed historical migration bytes immutable. When a pending/failed target must execute corrected SQL but
  an older environment may already have succeeded the immutable source, use a narrowly reviewed replacement manifest
  with source, patch, and generated-output SHA-256. Execute the generated SQL only for absent/failed history, accept
  the immutable checksum only as a skip identity, and fail closed for every other succeeded checksum.
- Release seed scope includes both the top-level production core seed and `database/seeds/production/`.
  If seed execution is required, reject or upgrade deployment modes that do not run migrations/seeds;
  never publish a release marker from `web` or `fast-css` while deferring required seed work.
- Treat the workflow's explicit `RUN_PRODUCTION_SEED=yes|no` as a one-release control-plane decision. Preserve it
  over any long-lived `.env.production` default loaded by the remote deploy script, reject unknown values before
  mutation, and regression-test both precedence directions plus the no-override fallback.
- A production seed that writes only tenant/park-scoped metadata must treat multiple active business rows inside
  that same validated scope as valid unless it actually selects one row as a source. Require at least one scoped
  row for existence; reserve exact-one checks for logic whose output depends on a unique source record.
- A forward migration that retires ambiguous historical source rows may proceed only when an existing unique derived
  projection identifies exactly one matching survivor. Lock and revalidate the scope in the migration transaction,
  record immutable before/after evidence for every retired row, and rerun the read-only parity gates after migration
  and before seed. A migration-only ready classification must be checksum/history bound and disappear permanently
  after that migration succeeds; future ambiguity is drift, not an automatic repair opportunity.
- Immutable migration and production-seed copies of one signed metadata manifest must preserve the same field
  semantics and be checked by a source-level contract. Production-order fixtures must exercise rows created by
  the migration, not approximate that state by changing one field on rows created by the seed.
- CI steps that pipe release commands through `tee` must enable `pipefail` at workflow scope (or in that exact run
  block), so migration, seed, bootstrap, baseline, and login failures cannot be reported as successful steps.
- Responsibility-role permission repairs must use an explicit reviewed alias set (never derive target roles from a
  username), remain tenant/park scoped, grant only the UAT-required permission, and no-op for an absent optional alias.

Reference files:
- `database/migration-replacements.txt`
- `scripts/db-migrate.sh`
- `.github/workflows/ci.yml`
- `docs/release/production-migration-execution-policy.md`

### Executable Contract: Immutable Migration Replacement

#### 1. Scope / Trigger

- Trigger only when a reviewed immutable migration is pending/failed in the runner's real order, while an older
  long-lived environment may already have succeeded the same immutable source.

#### 2. Signatures

- Manifest row: `filename|immutable_source_sha256|patch_filename|patch_sha256|execution_sha256`.
- Runner inputs: `MIGRATION_REPLACEMENTS_FILE` and `MIGRATION_REPLACEMENTS_DIR`.

#### 3. Contracts

- `filename` must exist exactly once in the default migration manifest; subset test manifests may omit it.
- `patch_filename` is a plain `.patch` file. All three hashes are lowercase 64-character SHA-256 values.
- The immutable source file is never edited. Generated SQL is executed under the original migration filename.

#### 4. Validation & Error Matrix

- missing/duplicate target -> `migration replacement target is absent or duplicated`.
- source, patch, or generated output hash mismatch -> fail before SQL execution.
- history `failed`/absent -> execute generated SQL and record `execution_sha256`.
- history `succeeded|immutable_source_sha256` -> skip without changing history.
- history `succeeded|execution_sha256` -> normal skip; every other succeeded checksum -> fail closed.

#### 5. Good / Base / Bad Cases

- Good: production failed source checksum retries generated SQL and converges.
- Base: clean database executes generated SQL; an old successful database skips immutable source identity.
- Bad: unknown success checksum, orphan manifest row, patch drift, mixed runtime contract, or partial dual history.

#### 6. Tests Required

- Static contract freezes source/patch/manifest hashes and runner branches.
- Disposable PostgreSQL fixture must assert failed retry, generated success history, immutable-source skip, unknown
  success rejection, full dependent migration tail, production seed, and post-state hashes/audits.

#### 7. Wrong vs Correct

- Wrong: edit the immutable SQL, downgrade final rows in a prerequisite, or stop the fixture after the first repair.
- Correct: patch only pending/failed execution, preserve final audited state, and run the non-empty fixture through
  every dependent migration and seed.

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
