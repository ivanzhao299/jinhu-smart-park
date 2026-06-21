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

- Task ID: `AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH`
- Batch ID: `AGENT-PLATFORM-V2-20260621`
- Title: Event sourcing queue architecture and compatibility layer
- Domain: orchestrator-event-sourcing
- Priority: P0
- Risk: MEDIUM
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH-agent-5.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH",
  "batch_id": "AGENT-PLATFORM-V2-20260621",
  "title": "Event sourcing queue architecture and compatibility layer",
  "owner": "agent-5",
  "domain": "orchestrator-event-sourcing",
  "priority": "P0",
  "status": "CLAIMED",
  "risk": "MEDIUM",
  "allowed_paths": [
    "docs/release",
    "ops/agent-orchestrator/specs",
    "ops/agent-orchestrator/events",
    "ops/agent-orchestrator/scripts",
    "ops/agent-orchestrator/queue",
    "ops/agent-orchestrator/reports",
    "ops/agent-orchestrator/README.md"
  ],
  "forbidden_paths": [
    "apps/api",
    "apps/web",
    "packages",
    "database",
    "infra",
    ".github",
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
    "Designs the V2 event-sourcing directory layout under ops/agent-orchestrator/events with tasks, results, locks, and audits subdirectories.",
    "Defines event file naming, required fields, idempotency keys, ownership rules, and append-only write discipline.",
    "Preserves existing task-queue.json, task-locks.json, and task-results.json as a compatibility read/write layer during migration.",
    "Lists every script that must be adapted and defines backward-compatible migration phases.",
    "Does not modify business code, database, infra, auth, CI, Docker, deploy, production environment files, or run any Agent."
  ],
  "validation_commands": [
    "git status --short",
    "node --check ops/agent-orchestrator/scripts/lib/queue-utils.mjs",
    "node ops/agent-orchestrator/scripts/check-dispatch-status.mjs",
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run",
    "pnpm typecheck",
    "git diff --check",
    "git status --short"
  ],
  "required_checks": [
    "JSON parse queue, locks, and results",
    "check-dispatch-status remains compatible with current JSON queue",
    "agent-cycle --dry-run remains no-write",
    "typecheck passes"
  ],
  "expected_output_files": [
    "docs/release/agent-platform-v2-event-sourcing-architecture.md",
    "ops/agent-orchestrator/specs/TECH-AGENT-PLATFORM-V2-EVENT-SOURCING.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH.md"
  ],
  "requires_human_approval": false,
  "created_at": "2026-06-21T21:45:00+08:00",
  "updated_at": "2026-06-21T22:13:39.824Z"
}
```

## Required Boundaries

Allowed paths:

- docs/release
- ops/agent-orchestrator/specs
- ops/agent-orchestrator/events
- ops/agent-orchestrator/scripts
- ops/agent-orchestrator/queue
- ops/agent-orchestrator/reports
- ops/agent-orchestrator/README.md

Forbidden paths:

- apps/api
- apps/web
- packages
- database
- infra
- .github
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

1. Designs the V2 event-sourcing directory layout under ops/agent-orchestrator/events with tasks, results, locks, and audits subdirectories.
2. Defines event file naming, required fields, idempotency keys, ownership rules, and append-only write discipline.
3. Preserves existing task-queue.json, task-locks.json, and task-results.json as a compatibility read/write layer during migration.
4. Lists every script that must be adapted and defines backward-compatible migration phases.
5. Does not modify business code, database, infra, auth, CI, Docker, deploy, production environment files, or run any Agent.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `node --check ops/agent-orchestrator/scripts/lib/queue-utils.mjs`
- `node ops/agent-orchestrator/scripts/check-dispatch-status.mjs`
- `node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run`
- `pnpm typecheck`
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
  --task-id AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH \
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
