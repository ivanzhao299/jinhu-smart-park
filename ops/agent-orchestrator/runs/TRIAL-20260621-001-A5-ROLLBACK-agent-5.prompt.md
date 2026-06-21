# Agent Worker Prompt

You are `agent-5` (`testing-release`) for Jinhu Smart Park.

Role: 测试回归、发布验收、生产稳定性检查

Working directory:

```text
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-5
```

Branch:

```text
agent-5-testing-release
```

## Current Task

- Task ID: `TRIAL-20260621-001-A5-ROLLBACK`
- Batch ID: `TRIAL-20260621-001`
- Title: Trial launch release smoke rollback file and backup evidence
- Domain: release-rollback
- Priority: P1
- Risk: HIGH
- Prompt file: `ops/agent-orchestrator/runs/TRIAL-20260621-001-A5-ROLLBACK-agent-5.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "TRIAL-20260621-001-A5-ROLLBACK",
  "batch_id": "TRIAL-20260621-001",
  "title": "Trial launch release smoke rollback file and backup evidence",
  "owner": "agent-5",
  "domain": "release-rollback",
  "priority": "P1",
  "status": "CLAIMED",
  "risk": "HIGH",
  "allowed_paths": [
    "docs/release",
    "docs/testing",
    "ops/agent-orchestrator/reports",
    "scripts/e2e"
  ],
  "forbidden_paths": [
    "apps/api",
    "apps/web",
    "packages",
    "database/migrations",
    "database/seeds",
    "infra",
    ".github/workflows",
    "scripts/prod-deploy.sh",
    "scripts/prod-docker-cleanup.sh",
    ".env.production",
    ".env.production.local"
  ],
  "acceptance": [
    "Creates release-chain evidence for migration command shape, production seed approval, init baseline, bootstrap-admin, prod health, and container login verification.",
    "Records file upload/download readiness and file backup evidence requirements without touching production data by default.",
    "Records rollback owner, previous image tag evidence requirement, database backup evidence requirement, observation window, and Docker cleanup evidence requirement.",
    "Clearly marks commands that require human approval before execution.",
    "Does not run deploy, Docker cleanup, production seed, destructive cleanup, database reset, or production write-path e2e without human approval."
  ],
  "validation_commands": [
    "git status --short",
    "test -x scripts/db-migrate.sh",
    "test -x scripts/db-seed-prod.sh",
    "test -x scripts/check-init-baseline.sh",
    "test -x scripts/bootstrap-admin.sh",
    "test -x scripts/prod-healthcheck.sh",
    "test -x scripts/verify-api-login-dockerexec.sh",
    "node scripts/e2e/first-release-files.mjs",
    "MODE=full pnpm prod:health",
    "bash scripts/verify-api-login-dockerexec.sh",
    "git status --short"
  ],
  "requires_human_approval": true,
  "created_at": "2026-06-21T14:10:00+08:00",
  "updated_at": "2026-06-21T09:11:15.786Z"
}
```

## Required Boundaries

Allowed paths:

- docs/release
- docs/testing
- ops/agent-orchestrator/reports
- scripts/e2e

Forbidden paths:

- apps/api
- apps/web
- packages
- database/migrations
- database/seeds
- infra
- .github/workflows
- scripts/prod-deploy.sh
- scripts/prod-docker-cleanup.sh
- .env.production
- .env.production.local

Hard rules:

1. Stay inside `allowed_paths`.
2. Do not modify anything under `forbidden_paths`.
3. Do not modify business code unless this task explicitly allows it and human approval has been recorded.
4. Do not add migrations.
5. Do not edit old migrations.
6. Do not modify auth, CI, Docker, deploy, SMS, or WeChat runtime configuration.
7. Do not commit secrets, tokens, passwords, production connection strings, or real production accounts.
8. Do not run production deploy.
9. Do not run destructive seed, cleanup, reset, truncate, prune, or database reset.
10. Do not merge.
11. Do not push.

## Acceptance

1. Creates release-chain evidence for migration command shape, production seed approval, init baseline, bootstrap-admin, prod health, and container login verification.
2. Records file upload/download readiness and file backup evidence requirements without touching production data by default.
3. Records rollback owner, previous image tag evidence requirement, database backup evidence requirement, observation window, and Docker cleanup evidence requirement.
4. Clearly marks commands that require human approval before execution.
5. Does not run deploy, Docker cleanup, production seed, destructive cleanup, database reset, or production write-path e2e without human approval.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `test -x scripts/db-migrate.sh`
- `test -x scripts/db-seed-prod.sh`
- `test -x scripts/check-init-baseline.sh`
- `test -x scripts/bootstrap-admin.sh`
- `test -x scripts/prod-healthcheck.sh`
- `test -x scripts/verify-api-login-dockerexec.sh`
- `node scripts/e2e/first-release-files.mjs`
- `MODE=full pnpm prod:health`
- `bash scripts/verify-api-login-dockerexec.sh`
- `git status --short`

## Completion

After completing the task:

1. Run `git status --short`.
2. Create a local commit if the task allows commit and validation is acceptable.
3. Record the result with `complete-task.mjs`.

Example:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs \
  --task-id TRIAL-20260621-001-A5-ROLLBACK \
  --agent agent-5 \
  --status DONE \
  --commit-hash <local_commit_hash_or_empty> \
  --changed-files <comma_separated_changed_files> \
  --commands-run "<command summary>" \
  --passed-checks "<passed checks>" \
  --failed-checks "<failed checks if any>" \
  --notes "<short notes and remaining risks>"
```

Use `FAILED` instead of `DONE` if required checks fail.

## Final Report

Report back with:

1. Changed files.
2. Commands run.
3. Passed checks.
4. Failed checks.
5. Skipped checks and reasons.
6. Commit hash.
7. Remaining risks.
8. Explicit statement: no merge and no push performed.
