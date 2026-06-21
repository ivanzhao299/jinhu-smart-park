# Trial Launch Production Evidence Automation Plan

## Purpose

This plan turns the current production-readiness No-Go into auditable evidence work. It is a planning artifact only: it does not execute deployment, migration, seed, bootstrap, backup, restore, rollback, Docker cleanup, or production smoke commands.

The goal is to make the next release decision scriptable enough that the orchestrator can collect evidence and produce a Go / Conditional-Go / No-Go recommendation.

## Current Judgment

**No-Go for production launch evidence.**

The existing evidence proves that release-chain scripts are present, but it does not yet prove target-environment execution for migration, production seed, initialization, bootstrap-admin, production health, container login verification, file upload/download/delete smoke, database backup, file backup, rollback tags, rollback ownership, observation windows, or Docker cleanup.

## Evidence Model

| Evidence Area | Required Record | Default Execution Mode | Approval Required |
|---|---|---|---|
| Release commit and worktree | Branch, commit hash, clean status, CI references | Local / CI read-only | No |
| Engineering gate | `pnpm lint`, `pnpm typecheck`, `pnpm build`, selected smoke results | Local / CI | No for local; yes for production target |
| Migration | command, target, timestamp, migration history/checksum result, failure-stop evidence | Target release window | Yes |
| Production seed | command, `ALLOW_PRODUCTION_SEED=yes`, proof dev seed was not run, seed log | Target release window | Yes |
| Init baseline | before/after `pnpm db:check:init` logs | Target release window | Yes |
| Bootstrap admin | command result, secret-supplied-out-of-band confirmation, first login status | Target release window | Yes |
| Production health | `MODE=full pnpm prod:health` output, `/health`, `/ready`, Web login URL | Target release window | Yes |
| Container login verification | `bash scripts/verify-api-login-dockerexec.sh` output with secrets redacted | Target container | Yes |
| File smoke | upload/download/delete sample, test marker, cleanup record, storage root | Approved target | Yes |
| Database backup | backup path, time, size/check, owner, restore confidence | Before migration/seed | Yes |
| File backup | backup path, time, size/check, owner, sample restore or read check | Before file-affecting release | Yes |
| Rollback tags | previous API image, previous Web image, current release image, pull/inspect evidence | Before deploy | Yes |
| Docker cleanup | cleanup command/result after health check or explicit skip/failure reason | After health check | Yes |
| Observation window | 15/30/60 minute checks, owner, rollback trigger log | Post deploy | Yes |

## Command Boundary

These commands are candidates for future controlled execution and must remain skipped until a release owner approves target, credentials, data marker, backup, cleanup, and rollback plan:

```bash
pnpm db:migrate
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
pnpm db:check:init
pnpm db:bootstrap:admin
pnpm db:check:init
MODE=full pnpm prod:health
bash scripts/verify-api-login-dockerexec.sh
node scripts/e2e/first-release-files.mjs
PRUNE_DOCKER_AFTER_DEPLOY=yes pnpm prod:deploy
pnpm prod:cleanup
```

These commands remain prohibited without separate explicit approval because they can destroy or mutate runtime state:

```bash
pnpm db:down
pnpm db:seed:dev
pnpm smoke:cleanup
docker system prune
docker volume rm
database reset / truncate / cleanup commands
```

## Task Batch

The next machine-readable batch is `PROD-EVIDENCE-20260621-002`.

| Task ID | Owner | Output Focus |
|---|---|---|
| `PROD-20260621-002-A5-PREFLIGHT-GATE` | agent-5 | Production pre-check checklist and consolidated release gate table |
| `PROD-20260621-002-A5-DB-INIT-CHAIN` | agent-5 | Migration, production seed, init baseline, bootstrap-admin evidence flow |
| `PROD-20260621-002-A5-BACKUP-ROLLBACK-CLEANUP` | agent-5 | DB backup, file backup, rollback tags, rollback owner, Docker cleanup evidence |
| `PROD-20260621-002-A5-HEALTH-FILE-SMOKE` | agent-5 | Production health, container login verification, file upload/download/delete smoke dry-run |
| `PROD-20260621-002-A3-IOT-SAFETY-SMOKE` | agent-3 | IoT / safety release smoke and production-safe runtime inspection plan |
| `PROD-20260621-002-A4-RBAC-MENU-GATE` | agent-4 | RBAC, menu, dashboard, permission visibility release checks |
| `PROD-20260621-002-A2-FINANCE-GATE` | agent-2 | Contract finance, receivable, payment, invoice, audit-log release checks |
| `PROD-20260621-002-A5-ORCH-RELEASE-GATE` | agent-5 | Orchestrator release-gate automation design |

## Go / Conditional-Go / No-Go Inputs

### Go

- Engineering gate passes.
- Migration, production seed, init baseline, bootstrap-admin, second baseline, production health, and container login verification pass on the approved target.
- Database backup, file backup, rollback image tags, rollback owner, and observation windows are recorded.
- File upload/download/delete smoke passes with approved marker and cleanup evidence.
- Finance, IoT/safety, RBAC/menu/dashboard release checks either pass or have non-P0/P1 accepted residual risks.
- Docker cleanup runs after the health check or an explicit, owner-approved skip reason is recorded.

### Conditional-Go

- All release-chain and rollback-critical evidence passes.
- Only P2/P3 issues remain, each with owner, mitigation, deadline, and user-facing scope limit.
- Any disabled or deferred module is explicitly called out in the release gate report.

### No-Go

- Worktree or release commit is not frozen.
- `pnpm typecheck`, lint, build, CI verify, or release-smoke fails.
- Migration, production seed, baseline, bootstrap-admin, health, login, file smoke, database backup, file backup, rollback tag, or Docker cleanup evidence is missing.
- Production auth mock configuration is unsafe.
- Finance, safety, IoT, RBAC, menu, file, or audit evidence has an unresolved P0/P1 issue.
- Any required production command was run without approval, target confirmation, secrets handling, or cleanup/rollback plan.

## Evidence Storage

Future agent tasks should write human-readable evidence to `docs/release` or `ops/agent-orchestrator/reports`, and machine-readable task results through `ops/agent-orchestrator/scripts/complete-task.mjs`.

The orchestrator should audit changed files, run validation, and only then propose merge candidates. Merge, push, deploy, backup, restore, rollback, Docker cleanup, production data operations, migration execution, and seed execution remain human-confirmed actions.
