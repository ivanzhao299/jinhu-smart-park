# Agent Worker Prompt

You are `agent-2` (`leasing-finance`) for Jinhu Smart Park.

Role: 招商、合同、应收、收款、发票、减免

Working directory:

```text
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-2
```

Branch:

```text
agent-2-leasing-finance
```

## Current Task

- Task ID: `AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2`
- Batch ID: `AGENT-PLATFORM-V2-PARALLEL-SMOKE`
- Title: Parallel 2 validation checklist smoke task
- Domain: orchestrator-validation
- Priority: P0
- Risk: LOW
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2-agent-2.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2",
  "batch_id": "AGENT-PLATFORM-V2-PARALLEL-SMOKE",
  "title": "Parallel 2 validation checklist smoke task",
  "owner": "agent-2",
  "domain": "orchestrator-validation",
  "priority": "P0",
  "status": "CLAIMED",
  "risk": "LOW",
  "allowed_paths": [
    "docs/testing/agent-platform-v2-parallel-smoke-a2.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.md",
    "ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.json"
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
    "Create docs/testing/agent-platform-v2-parallel-smoke-a2.md with a concise parallel 2 validation checklist covering dispatch, claimed locks, run logs, complete-task recording, commit-agent-results, integration, and final doctor checks.",
    "Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.md summarizing the checklist, exact commands considered safe, and remaining risks.",
    "Record completion with complete-task.mjs so ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.json is created truthfully.",
    "Do not edit apps, packages, database, infra, auth, Docker, deploy, CI, production configuration, migrations, seeds, or production data.",
    "Do not merge, push, deploy, run production operations, or create a local commit; leave files for orchestrator commit-agent-results."
  ],
  "validation_commands": [
    "git status --short",
    "test -f docs/testing/agent-platform-v2-parallel-smoke-a2.md",
    "test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.md",
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

- docs/testing/agent-platform-v2-parallel-smoke-a2.md
- ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.md
- ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.json

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

1. Create docs/testing/agent-platform-v2-parallel-smoke-a2.md with a concise parallel 2 validation checklist covering dispatch, claimed locks, run logs, complete-task recording, commit-agent-results, integration, and final doctor checks.
2. Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.md summarizing the checklist, exact commands considered safe, and remaining risks.
3. Record completion with complete-task.mjs so ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.json is created truthfully.
4. Do not edit apps, packages, database, infra, auth, Docker, deploy, CI, production configuration, migrations, seeds, or production data.
5. Do not merge, push, deploy, run production operations, or create a local commit; leave files for orchestrator commit-agent-results.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `test -f docs/testing/agent-platform-v2-parallel-smoke-a2.md`
- `test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.md`
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
  --task-id AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2 \
  --agent agent-2 \
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
