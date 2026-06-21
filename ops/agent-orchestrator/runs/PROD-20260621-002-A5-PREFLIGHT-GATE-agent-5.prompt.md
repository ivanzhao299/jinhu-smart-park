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

- Task ID: `PROD-20260621-002-A5-PREFLIGHT-GATE`
- Batch ID: `PROD-EVIDENCE-20260621-002`
- Title: Production deployment preflight and release gate evidence table
- Domain: production-release-gate
- Priority: P0
- Risk: CRITICAL
- Prompt file: `ops/agent-orchestrator/runs/PROD-20260621-002-A5-PREFLIGHT-GATE-agent-5.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "PROD-20260621-002-A5-PREFLIGHT-GATE",
  "batch_id": "PROD-EVIDENCE-20260621-002",
  "title": "Production deployment preflight and release gate evidence table",
  "owner": "agent-5",
  "domain": "production-release-gate",
  "priority": "P0",
  "status": "CLAIMED",
  "risk": "CRITICAL",
  "allowed_paths": [
    "docs/release",
    "docs/testing",
    "ops/agent-orchestrator/reports"
  ],
  "forbidden_paths": [
    "apps/api",
    "apps/web",
    "packages",
    "database/migrations",
    "database/seeds",
    "infra",
    ".github/workflows",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.prod.yml",
    "deploy",
    "scripts/prod-deploy.sh",
    "scripts/prod-docker-cleanup.sh",
    ".env",
    ".env.production",
    ".env.production.local"
  ],
  "acceptance": [
    "Creates a production preflight evidence table covering release commit, clean worktree, CI references, engineering gates, target environment owner, approval state, and Go / Conditional-Go / No-Go inputs.",
    "Maps each preflight item to source evidence, command shape, approval requirement, pass/fail/blocked status, and required owner.",
    "Records that production deploy, migration, seed, bootstrap, backup, rollback, Docker cleanup, and production data operations are not executed by default.",
    "Identifies any missing evidence as No-Go or Conditional-Go with owner and next action.",
    "Does not modify business code, migration, seed, auth, CI, Docker, deploy, infra, or production env files."
  ],
  "validation_commands": [
    "git status --short",
    "pnpm typecheck",
    "test -f docs/release/production-readiness-matrix.md",
    "test -f docs/release/production-release-sop.md",
    "test -f docs/release/production-rollback-sop.md",
    "git diff --check",
    "git status --short"
  ],
  "requires_human_approval": true,
  "created_at": "2026-06-21T18:30:00+08:00",
  "updated_at": "2026-06-21T13:36:01.171Z"
}
```

## Required Boundaries

Allowed paths:

- docs/release
- docs/testing
- ops/agent-orchestrator/reports

Forbidden paths:

- apps/api
- apps/web
- packages
- database/migrations
- database/seeds
- infra
- .github/workflows
- Dockerfile
- docker-compose.yml
- docker-compose.prod.yml
- deploy
- scripts/prod-deploy.sh
- scripts/prod-docker-cleanup.sh
- .env
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

1. Creates a production preflight evidence table covering release commit, clean worktree, CI references, engineering gates, target environment owner, approval state, and Go / Conditional-Go / No-Go inputs.
2. Maps each preflight item to source evidence, command shape, approval requirement, pass/fail/blocked status, and required owner.
3. Records that production deploy, migration, seed, bootstrap, backup, rollback, Docker cleanup, and production data operations are not executed by default.
4. Identifies any missing evidence as No-Go or Conditional-Go with owner and next action.
5. Does not modify business code, migration, seed, auth, CI, Docker, deploy, infra, or production env files.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `pnpm typecheck`
- `test -f docs/release/production-readiness-matrix.md`
- `test -f docs/release/production-release-sop.md`
- `test -f docs/release/production-rollback-sop.md`
- `git diff --check`
- `git status --short`

## Completion

After completing the task:

1. Run `git status --short`.
2. Create a local commit if the task allows commit and validation is acceptable.
3. Record the result with `complete-task.mjs`.

Example:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs \
  --task-id PROD-20260621-002-A5-PREFLIGHT-GATE \
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
