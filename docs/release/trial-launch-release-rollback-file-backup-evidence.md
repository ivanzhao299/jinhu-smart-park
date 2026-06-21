# Trial Launch Release Smoke, Rollback, File, And Backup Evidence

## Summary

- Task ID: `TRIAL-20260621-001-A5-ROLLBACK`
- Title: Trial launch release smoke rollback file and backup evidence
- Agent: `agent-5`
- Evidence time: 2026-06-21 17:14 CST
- Worktree: `/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-5`
- Branch: `agent-5-testing-release`
- HEAD at validation start: `6413995 chore(orchestrator): dispatch rollback readiness task`
- Scope: release-chain command shape, file smoke readiness, backup evidence requirements, rollback owner/tag requirements, observation window, and Docker cleanup evidence requirements.

This task records release-readiness evidence only. It does not run production deploy, production seed, Docker cleanup, database reset, destructive cleanup, or production write-path e2e. It does not modify business code, migrations, seeds, auth runtime, CI, Docker, deploy scripts, or production env files.

## Validation Results

| Command | Result | Data writes | Notes |
|---|---|---:|---|
| `git status --short` | Pass | No | Worktree was clean before evidence generation. |
| `test -x scripts/db-migrate.sh` | Pass | No | Migration script exists and is executable. |
| `test -x scripts/db-seed-prod.sh` | Pass | No | Production seed script exists and is executable. |
| `test -x scripts/check-init-baseline.sh` | Pass | No | Baseline check script exists and is executable. |
| `test -x scripts/bootstrap-admin.sh` | Pass | No | Bootstrap admin script exists and is executable. |
| `test -x scripts/prod-healthcheck.sh` | Pass | No | Production healthcheck script exists and is executable. |
| `test -x scripts/verify-api-login-dockerexec.sh` | Pass | No | Container-internal login verification script exists and is executable. |
| `node scripts/e2e/first-release-files.mjs` | Skipped | Would write file test data | Requires approved local/pre-production target, test admin account, `TEST_RUN_ID`, and cleanup acceptance. The script logs in, uploads, downloads, deletes, and checks the deleted file. |
| `MODE=full pnpm prod:health` | Skipped | No intended data writes | Requires selected target environment. It reads production env defaults and probes API liveness, API readiness, and Web login URLs. |
| `bash scripts/verify-api-login-dockerexec.sh` | Skipped | May bootstrap or inspect target data | Requires approved Docker containers, admin password context, production-like env values, and target database safety confirmation. |

## Release Chain Evidence Table

| Gate | Command shape | Current evidence | Required approval before execution | Status |
|---|---|---|---|---|
| Migration | `pnpm db:migrate` | `scripts/db-migrate.sh` exists and is executable. SOP and matrix require migration after backup and before seed. | Target environment, database backup, release window, DB owner confirmation. | Not verified on target |
| Production seed | `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod` | `scripts/db-seed-prod.sh` exists and is executable. Production seed requires explicit allow flag. | Release owner approval, target DB confirmation, confirmation that dev seed is not run. | Not verified on target |
| First init baseline | `pnpm db:check:init` | `scripts/check-init-baseline.sh` exists and is executable. | Target DB and expected first-release baseline scope. | Not verified on target |
| Bootstrap admin | `pnpm db:bootstrap:admin` | `scripts/bootstrap-admin.sh` exists and is executable. | Admin username/password supplied out of band, no secrets in docs/logs, target DB approval. | Not verified on target |
| Second init baseline | `pnpm db:check:init` | Same executable evidence as first baseline. | Run only after bootstrap-admin path is approved/executed. | Not verified on target |
| Production health | `MODE=full pnpm prod:health` | `scripts/prod-healthcheck.sh` exists and is executable. Script checks API liveness, API readiness, and Web login. | Target API/Web host and production env selection. | Not verified on target |
| Container login verification | `bash scripts/verify-api-login-dockerexec.sh` | Script exists and is executable. It requires Docker containers and admin password context. | Approved containers, admin password provided securely, target DB safety confirmation. | Not verified on target |
| Docker cleanup evidence | `PRUNE_DOCKER_AFTER_DEPLOY=yes pnpm prod:deploy` or approved cleanup command after health check | Production docs require Docker cleanup after deploy health check. | Production deploy window and ops confirmation. Do not run cleanup in this task. | Not verified |

## File Upload, Download, And Backup Evidence

| Item | Evidence requirement | Current evidence | Status |
|---|---|---|---|
| File smoke command | `node scripts/e2e/first-release-files.mjs` | Script exists and was inspected. It logs in, uploads a generated PNG payload, downloads it, deletes it, and checks it cannot be downloaded after deletion. | Skipped pending approved target |
| Test data marker | `TEST_RUN_ID` and generated filename `first-release-file-regression-<id>.png` | Script supports generated `TEST_RUN_ID` and idempotency keys. | Ready for approved target |
| File storage root | `FILE_STORAGE_LOCAL_ROOT` or equivalent mounted volume | Production docs identify file storage and backup requirements. | Not verified on target |
| File backup | Backup of directory or Docker volume behind `FILE_STORAGE_LOCAL_ROOT` | SOP requires file directory / volume backup and backup verification. | Not verified |
| File restore sampling | Restore sample or controlled download after backup | SOP requires backup existence, size, and recovery sampling. | Not verified |

`first-release-files.mjs` was intentionally skipped because this task has no human-approved target environment, admin account, test-data marker, or cleanup plan. Running it against an unknown API target could create or delete file records and is not allowed by the prompt's production safety rules.

## Backup And Rollback Evidence Requirements

| Evidence | Required record | Current status |
|---|---|---|
| PostgreSQL backup | Backup path, timestamp, command/log, size/check, DB owner | Not verified |
| File backup | Backup path, timestamp, command/log, sample restore/check, ops owner | Not verified |
| Previous API image tag | Immutable previous image tag and inspect/pull evidence | Not verified |
| Previous Web image tag | Immutable previous image tag and inspect/pull evidence | Not verified |
| Rollback owner | Named rollback decision owner and contact path | Not filled in current SOP/checklist |
| Observation window | 15, 30, and 60 minute checks for API errors, login errors, DB connection, file upload/download, business feedback, disk | Checklist has placeholders; not executed |
| Rollback trigger | `/ready` failure, login failure, P0, financial write anomaly, file upload failure, DB connection issue, 5xx spike | Matrix defines trigger classes; release-specific owner must confirm |
| Docker cleanup | Cleanup result after health check, or explicit skip/failure reason | Not verified |

## Human Approval Required Before Running

The following commands must not be run until a release owner confirms target, credentials, test data marker, and cleanup/rollback plan:

```bash
node scripts/e2e/first-release-files.mjs
MODE=full pnpm prod:health
bash scripts/verify-api-login-dockerexec.sh
pnpm db:migrate
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
pnpm db:check:init
pnpm db:bootstrap:admin
pnpm db:check:init
PRUNE_DOCKER_AFTER_DEPLOY=yes pnpm prod:deploy
pnpm prod:cleanup
```

Do not run destructive commands such as `pnpm db:down`, database reset, truncate, Docker prune, smoke cleanup, or production write-path e2e without separate explicit approval and a cleanup plan.

## Go / No-Go Judgment

**No-Go for production launch evidence.**

The release-chain scripts exist, but target-environment execution evidence is missing for migration, production seed, init baseline, bootstrap-admin, production health, container login verification, file upload/download, database backup, file backup, previous image tags, rollback owner, observation window, and Docker cleanup.

The task evidence pack itself is complete, but production launch must remain blocked until the missing target evidence is collected and accepted by the release owner.
