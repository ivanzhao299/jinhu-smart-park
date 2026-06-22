# Agent Worker Prompt

You are `agent-3` (`ops-iot-safety`) for Jinhu Smart Park.

Role: 工单、安全、IoT、能耗、联动执行器

Working directory:

```text
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-3
```

Branch:

```text
agent-3-ops-iot-safety
```

## Current Task

- Task ID: `AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3`
- Batch ID: `AGENT-PLATFORM-V2-PARALLEL-SMOKE`
- Title: Event-first read-model consistency checklist smoke task
- Domain: orchestrator-event-store
- Priority: P0
- Risk: LOW
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3-agent-3.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3",
  "batch_id": "AGENT-PLATFORM-V2-PARALLEL-SMOKE",
  "title": "Event-first read-model consistency checklist smoke task",
  "owner": "agent-3",
  "domain": "orchestrator-event-store",
  "priority": "P0",
  "status": "CLAIMED",
  "risk": "LOW",
  "allowed_paths": [
    "docs/testing/agent-platform-v2-parallel-smoke-a3.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.md",
    "ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.json"
  ],
  "forbidden_paths": [
    "apps",
    "packages",
    "database",
    "infra",
    ".github",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "deploy",
    "auth",
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local"
  ],
  "acceptance": [
    "Create docs/testing/agent-platform-v2-parallel-smoke-a3.md with a concise event-first read-model consistency checklist covering task.created, task.claimed, task.completed, queue/lock/result read models, doctor health, and audit dry-run.",
    "Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.md summarizing the checklist, exact commands considered safe, and remaining risks.",
    "Record completion with complete-task.mjs so ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.json is created truthfully.",
    "Do not edit apps, packages, database, infra, auth, Docker, deploy, CI, production configuration, migrations, seeds, or production data.",
    "Do not merge, push, deploy, run production operations, or create a local commit; leave files for orchestrator commit-agent-results."
  ],
  "validation_commands": [
    "git status --short",
    "test -f docs/testing/agent-platform-v2-parallel-smoke-a3.md",
    "test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.md",
    "node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run",
    "git diff --check",
    "git status --short"
  ],
  "requires_human_approval": false,
  "allow_commit": false,
  "created_at": "2026-06-22T11:28:30.768Z",
  "updated_at": "2026-06-22T11:29:04.297Z"
}
```

## Required Boundaries

Allowed paths:

- docs/testing/agent-platform-v2-parallel-smoke-a3.md
- ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.md
- ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.json

Forbidden paths:

- apps
- packages
- database
- infra
- .github
- Dockerfile
- docker-compose.yml
- docker-compose.yaml
- deploy
- auth
- .env
- .env.local
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

1. Create docs/testing/agent-platform-v2-parallel-smoke-a3.md with a concise event-first read-model consistency checklist covering task.created, task.claimed, task.completed, queue/lock/result read models, doctor health, and audit dry-run.
2. Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.md summarizing the checklist, exact commands considered safe, and remaining risks.
3. Record completion with complete-task.mjs so ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.json is created truthfully.
4. Do not edit apps, packages, database, infra, auth, Docker, deploy, CI, production configuration, migrations, seeds, or production data.
5. Do not merge, push, deploy, run production operations, or create a local commit; leave files for orchestrator commit-agent-results.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `test -f docs/testing/agent-platform-v2-parallel-smoke-a3.md`
- `test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.md`
- `node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run`
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
  --task-id AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3 \
  --agent agent-3 \
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
