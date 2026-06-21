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

- Task ID: `AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS`
- Batch ID: `AGENT-PLATFORM-V2-20260621`
- Title: Event read model status aggregation and conflict-free results
- Domain: orchestrator-read-model
- Priority: P0
- Risk: MEDIUM
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS-agent-3.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS",
  "batch_id": "AGENT-PLATFORM-V2-20260621",
  "title": "Event read model status aggregation and conflict-free results",
  "owner": "agent-3",
  "domain": "orchestrator-read-model",
  "priority": "P0",
  "status": "CLAIMED",
  "risk": "MEDIUM",
  "allowed_paths": [
    "docs/release",
    "docs/testing",
    "ops/agent-orchestrator/specs",
    "ops/agent-orchestrator/events",
    "ops/agent-orchestrator/scripts",
    "ops/agent-orchestrator/queue",
    "ops/agent-orchestrator/results",
    "ops/agent-orchestrator/reports"
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
    "Designs read-model aggregation from event files into queue status without requiring multiple Agents to write one shared JSON file.",
    "Defines conflict-free result and audit event shapes, including per-task result files and summary materialization.",
    "Specifies adapter behavior for check-dispatch-status, audit-all-results, complete-task, reconcile-task-results, and integrate-agent-results.",
    "Defines deterministic ordering, duplicate detection, corrupt-event handling, and no-write dry-run behavior.",
    "Does not modify business code, database, infra, auth, CI, Docker, deploy, production environment files, or run any Agent."
  ],
  "validation_commands": [
    "git status --short",
    "node --check ops/agent-orchestrator/scripts/reconcile-task-results.mjs",
    "node --check ops/agent-orchestrator/scripts/check-dispatch-status.mjs",
    "node ops/agent-orchestrator/scripts/check-dispatch-status.mjs",
    "pnpm typecheck",
    "git diff --check",
    "git status --short"
  ],
  "required_checks": [
    "Read model design covers READY, CLAIMED, DONE, FAILED, BLOCKED, and AUDITED statuses",
    "Result and audit events avoid shared JSON write conflicts",
    "Legacy queue JSON can still be generated from events",
    "typecheck passes"
  ],
  "expected_output_files": [
    "docs/release/agent-platform-v2-read-model-plan.md",
    "docs/testing/agent-platform-v2-read-model-test-plan.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS.md"
  ],
  "requires_human_approval": false,
  "created_at": "2026-06-21T21:46:00+08:00",
  "updated_at": "2026-06-21T13:36:01.171Z"
}
```

## Required Boundaries

Allowed paths:

- docs/release
- docs/testing
- ops/agent-orchestrator/specs
- ops/agent-orchestrator/events
- ops/agent-orchestrator/scripts
- ops/agent-orchestrator/queue
- ops/agent-orchestrator/results
- ops/agent-orchestrator/reports

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

1. Designs read-model aggregation from event files into queue status without requiring multiple Agents to write one shared JSON file.
2. Defines conflict-free result and audit event shapes, including per-task result files and summary materialization.
3. Specifies adapter behavior for check-dispatch-status, audit-all-results, complete-task, reconcile-task-results, and integrate-agent-results.
4. Defines deterministic ordering, duplicate detection, corrupt-event handling, and no-write dry-run behavior.
5. Does not modify business code, database, infra, auth, CI, Docker, deploy, production environment files, or run any Agent.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `node --check ops/agent-orchestrator/scripts/reconcile-task-results.mjs`
- `node --check ops/agent-orchestrator/scripts/check-dispatch-status.mjs`
- `node ops/agent-orchestrator/scripts/check-dispatch-status.mjs`
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
  --task-id AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS \
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
