# Production Deployment Preflight Gate Evidence

Task: `PROD-20260621-002-A5-PREFLIGHT-GATE`  
Batch: `PROD-EVIDENCE-20260621-002`  
Agent: `agent-5` (`testing-release`)  
Branch: `agent-5-testing-release`  
Evidence time: `2026-06-21 20:18:05 CST`  
Observed source commit before this evidence-only report: `e45cedcb8ee9c5b4240b6e7b879bf4cb87990518`  
Observed source commit subject: `chore(orchestrator): add one-command agent cycle pipeline`

## Scope

This report creates the preflight release-gate evidence table for production deployment readiness. It is documentation and gate evidence only.

This task did not modify business code, migrations, seeds, auth configuration, CI, Docker, deploy scripts, infrastructure, or production environment files.

## Gate Verdict

Current production deployment verdict: **No-Go**.

Reason: required external release evidence is missing or blocked. The local checkout has no `node_modules`, so `pnpm typecheck` failed before application type checking could run. CI `verify` and `release-smoke` run links were not provided. Target environment owners and human approval are still unset in the SOP. Production backup, deployment, migration, seed, bootstrap, rollback, Docker cleanup, and production data-operation evidence were not executed or collected by this task.

## Status Legend

| Status | Meaning |
|---|---|
| Pass | Evidence observed and sufficient for this preflight item. |
| Conditional-Go | Evidence is partly present, but production Go requires the listed follow-up before the release window. |
| No-Go | Missing or failed evidence blocks production deployment. |
| Not Executed | Operation is intentionally not run by default in this task. |

## Preflight Evidence Table

| Area | Preflight item | Source evidence | Command shape / evidence collection | Approval requirement | Status | Required owner | Next action |
|---|---|---|---|---|---|---|---|
| Release commit | Release candidate commit and branch are known | `git rev-parse --abbrev-ref HEAD` returned `agent-5-testing-release`; `git rev-parse HEAD` returned `e45cedcb8ee9c5b4240b6e7b879bf4cb87990518` before this report | `git rev-parse --abbrev-ref HEAD && git rev-parse HEAD`; final release tag or deploy SHA must be attached to the release ticket | Release owner must freeze the deploy SHA | Conditional-Go | Release owner | Record the final deploy commit or image tag after this evidence commit is included or explicitly excluded. |
| Clean worktree | Worktree must be clean before release handoff | Initial `git status --short` returned no output before this report | `git status --short` before and after local evidence commit | Agent 5 can collect; release owner accepts final state | Conditional-Go | Agent 5 / release owner | Re-run after commit and after completion metadata is recorded. Any unrelated uncommitted file is No-Go until explained. |
| CI reference | CI `verify` gate must pass for the release commit | `docs/testing/how-to-run-tests.md` lists `verify` as a primary CI gate; no run URL or artifact was provided in this task | GitHub Actions `verify` run for the frozen commit; collect run URL, conclusion, and timestamp | Release owner must approve the specific passing run | No-Go | Release owner / CI owner | Attach the passing `verify` run URL for the frozen release commit. |
| CI reference | CI `release-smoke` gate must pass for the release commit | `docs/testing/how-to-run-tests.md` states `release-smoke` covers migration, production seed, bootstrap-admin, baseline, health, and login validation; no run URL or artifact was provided | GitHub Actions `release-smoke` run or approved equivalent; collect logs/artifacts | Release owner approval required | No-Go | Release owner / Agent 5 | Attach the passing `release-smoke` run URL and artifact bundle. |
| Engineering gate | Workspace typecheck must pass | `pnpm typecheck` was run in this checkout and failed because local `tsc` was unavailable and `node_modules` is missing | `pnpm typecheck` | No production approval required; dependency installation was not performed in this task | No-Go | Agent 5 / build owner | Restore/install dependencies in an approved build environment, re-run `pnpm typecheck`, and attach the log. |
| Engineering gate | Lint and build evidence should exist for release Go | `docs/release/production-readiness-matrix.md` requires `pnpm lint`, `pnpm typecheck`, and `pnpm build`; this task only required `pnpm typecheck` locally | CI `verify` or local `pnpm lint && pnpm typecheck && pnpm build` | Release owner accepts CI or local gate logs | No-Go | Release owner / CI owner | Use the CI `verify` run as the source of truth, or attach local logs if CI is unavailable. |
| Target environment | Target environment owner and operational contacts are named | `docs/release/production-release-sop.md` role table still uses pending placeholders for release, operations, database, business acceptance, and rollback owners | Review SOP role table before the release window | Human assignment and approval required | No-Go | Release owner | Fill and approve release owner, operations executor, database owner, business acceptance owner, and rollback decision owner outside this evidence task. |
| Approval state | Production deployment requires human Go approval | Task metadata has `requires_human_approval: true`; no approval artifact was provided | Release ticket approval, signed checklist, or equivalent change record | Explicit human approval required | No-Go | Release owner / approver | Attach approval record with approver, timestamp, scope, and release commit. |
| Go input | Required Go criteria are satisfied | `docs/release/production-readiness-matrix.md` lists Go conditions: frozen commit/tag, backups, CI gates, release-smoke, migration, seed, bootstrap, health, login, mock-disabled evidence, file validation, and owners | Aggregate evidence table plus final release checklist | Release owner final Go decision required | No-Go | Release owner | Do not deploy until all No-Go rows are closed or accepted with documented Conditional-Go signoff. |
| Conditional-Go input | Known missing but containable evidence is owned with action | This table identifies owners and next actions for missing evidence | Review every `Conditional-Go` row before release | Release owner can approve only if risk and deadline are accepted | Conditional-Go | Release owner | Convert each Conditional-Go row to Pass or an explicit signed exception before production execution. |
| No-Go input | Missing or failed evidence blocks release | Typecheck failed due missing dependencies; CI references, target owners, and approval are absent | Review all `No-Go` rows | No override without explicit human approval and risk acceptance | No-Go | Release owner / approver | Treat deployment as blocked until No-Go rows are resolved. |

## Production Operations Not Executed By Default

| Operation | Source evidence / SOP reference | Command shape | Default execution policy in this task | Approval requirement | Status | Required owner | Next action |
|---|---|---|---|---|---|---|---|
| Production deploy | `docs/release/production-release-sop.md` section 7; `pnpm prod:deploy` is the deploy entry | `PRUNE_DOCKER_AFTER_DEPLOY=yes pnpm prod:deploy` | Not executed | Human production approval required | Not Executed / No-Go until approved | Operations executor / release owner | Execute only in the approved release window and record logs. |
| Migration | `docs/release/production-release-sop.md` section 7.4; `docs/release/production-readiness-matrix.md` migration row | `pnpm db:migrate` with production compose/env context | Not executed | Database owner and release approval required | Not Executed / No-Go until evidence exists | Database owner | Run only after backup and release approval; stop on failure. |
| Production seed | `docs/release/production-release-sop.md` section 7.5; readiness matrix seed row | `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod` | Not executed | Release owner approval required | Not Executed / No-Go until evidence exists | Release owner / database owner | Run only after migration success; never run dev seed in production. |
| Bootstrap admin | `docs/release/production-release-sop.md` section 7.7 | `pnpm db:bootstrap:admin` with approved admin inputs | Not executed | Release owner approval and secret handling required | Not Executed / No-Go until evidence exists | Release owner / operations executor | Execute only if first admin is not already present; keep password out of logs. |
| Baseline check | `docs/release/production-release-sop.md` sections 7.6 and 7.8 | `pnpm db:check:init` before and after bootstrap-admin | Not executed | Release owner approval required | Not Executed / No-Go until evidence exists | Agent 5 / operations executor | Run in the documented release order and attach logs. |
| PostgreSQL backup | `docs/release/production-release-sop.md` section 5.1 | `pg_dump -Fc -f <backup_dir>/jinhu_pg_<timestamp>.dump` | Not executed | Database owner approval required | Not Executed / No-Go until evidence exists | Database owner | Record backup path, size, checksum or restore check, and owner. |
| File backup | `docs/release/production-release-sop.md` section 5.2 | `rsync -a --delete <FILE_STORAGE_LOCAL_ROOT>/ <backup_dir>/jinhu_files/` | Not executed | Operations approval required | Not Executed / No-Go until evidence exists | Operations executor | Record backup location, sample restore/download check, and owner. |
| Rollback execution | `docs/release/production-rollback-sop.md` sections 3-5 | `docker compose -f infra/docker/docker-compose.prod.yml up -d api web` with rollback tags | Not executed | Rollback decision owner approval required | Not Executed / Conditional-Go for readiness; No-Go if rollback tags/backups are absent | Rollback decision owner / operations executor | Confirm rollback image tags, backup availability, and verification checklist before release. |
| Docker cleanup | `docs/release/production-readiness-matrix.md` deploy health row; `AGENTS.md` production cleanup rule | `PRUNE_DOCKER_AFTER_DEPLOY=yes pnpm prod:deploy`; optionally `PRUNE_DOCKER_BUILD_CACHE=yes` under disk pressure | Not executed | Release/operations approval required | Not Executed / No-Go until post-deploy cleanup evidence exists | Operations executor | Record cleanup result after health check; do not silently skip cleanup. |
| Production data operations | `docs/release/production-readiness-matrix.md` production environment policy | Approved read-only checks by default; write-path smoke only with test marker and cleanup plan | Not executed | Explicit approval, test account, test data marker, and cleanup plan required | Not Executed / No-Go for unapproved writes | Release owner / business owner | Do not run write-path production e2e by default. Document approval and cleanup before any production write. |

## Required Evidence To Move Toward Go

| Missing evidence | Current gate impact | Owner | Required next action |
|---|---|---|---|
| Passing `pnpm typecheck` or CI `verify` typecheck log | No-Go | Agent 5 / CI owner | Run in an environment with dependencies available and attach the passing log. |
| Passing CI `verify` URL for the frozen release commit | No-Go | Release owner / CI owner | Attach GitHub Actions run link and result. |
| Passing `release-smoke` URL or approved equivalent | No-Go | Release owner / Agent 5 | Attach run link, migration/seed/bootstrap/baseline/health/login logs, and artifact bundle. |
| Target environment owner assignments | No-Go | Release owner | Fill release, operations, database, business acceptance, and rollback decision owners. |
| Human approval record | No-Go | Release owner / approver | Attach approval with release scope, commit/image tags, timestamp, and approver. |
| Backup evidence | No-Go | Database owner / operations executor | Attach DB and file backup paths plus verification. |
| Rollback readiness evidence | Conditional-Go until tags/backups missing; No-Go if release window starts without it | Rollback decision owner | Attach rollback tags and validation checklist. |
| Docker cleanup plan and post-deploy evidence | No-Go after deploy if absent | Operations executor | Run cleanup after health check and record result. |

## Validation Command Evidence

| Command | Result | Notes |
|---|---|---|
| `git status --short` | Pass before report creation | Returned no output. |
| `pnpm typecheck` | Fail / blocked | Failed before type checking because `packages/shared` and `packages/ui` could not find `tsc`; pnpm warned that local `node_modules` is missing. |
| `test -f docs/release/production-readiness-matrix.md` | Pass | Required release matrix source file exists. |
| `test -f docs/release/production-release-sop.md` | Pass | Required release SOP source file exists. |
| `test -f docs/release/production-rollback-sop.md` | Pass | Required rollback SOP source file exists. |
| `git diff --check` | Pass | No whitespace errors were reported after this report was written. |
| `git status --short` | Pass with expected report file | After this report was written, only `ops/agent-orchestrator/reports/PROD-20260621-002-A5-PREFLIGHT-GATE.md` was untracked. |

## Boundary Confirmation

- No production deploy was run.
- No migration was run.
- No production seed was run.
- No bootstrap-admin command was run.
- No backup command was run.
- No rollback command was run.
- No Docker cleanup or prune command was run.
- No production data operation or production write-path e2e was run.
- No secrets, tokens, production passwords, production connection strings, or real production accounts are recorded in this report.
