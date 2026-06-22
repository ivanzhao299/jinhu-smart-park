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

- Task ID: `EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION`
- Batch ID: `EVOLUTION-IMPROVEMENT-BACKLOG`
- Title: Reduce queue bookkeeping conflicts with event-first read models
- Domain: evolution-pattern-005
- Priority: P1
- Risk: MEDIUM
- Prompt file: `ops/agent-orchestrator/runs/EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION-agent-5.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION",
  "batch_id": "EVOLUTION-IMPROVEMENT-BACKLOG",
  "source_goal_id": "GOAL-EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION",
  "source_improvement_id": "IMPROVE-QUEUE-CONFLICT-REDUCTION",
  "source_pattern_id": "PATTERN-005",
  "title": "Reduce queue bookkeeping conflicts with event-first read models",
  "owner": "agent-5",
  "domain": "evolution-pattern-005",
  "priority": "P1",
  "risk": "MEDIUM",
  "allowed_paths": [
    "ops/agent-orchestrator/scripts/**",
    "ops/agent-orchestrator/evolution/**",
    "ops/agent-orchestrator/events/**",
    "ops/agent-orchestrator/queue/**",
    "ops/agent-orchestrator/reports/**",
    "ops/agent-orchestrator/results/**",
    "docs/release/**",
    "docs/testing/**"
  ],
  "forbidden_paths": [
    "apps/**",
    "packages/**",
    "database/**",
    "infra/**",
    ".github/**",
    "Dockerfile",
    "Dockerfile.*",
    "docker-compose*",
    "deploy/**",
    "auth/**",
    ".env",
    ".env.*"
  ],
  "acceptance": [
    "Doctor reports event/read-model consistency after rebuild dry-run.",
    "Queue bookkeeping conflicts are handled through event-first reconcile rules.",
    "Compatibility queue JSON remains readable by existing agent-cycle commands."
  ],
  "validation_commands": [
    "node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run",
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
    "node ops/agent-orchestrator/scripts/check-dispatch-status.mjs",
    "pnpm typecheck"
  ],
  "requires_human_approval": true,
  "owner_assignment_reason": "Evolution Planner recommendation from PATTERN-005",
  "status": "CLAIMED",
  "expected_output_files": [
    "ops/agent-orchestrator/reports/IMPROVE-QUEUE-CONFLICT-REDUCTION.md",
    "ops/agent-orchestrator/results/IMPROVE-QUEUE-CONFLICT-REDUCTION.json",
    "docs/testing/evolution-queue-conflict-reduction-checklist.md"
  ],
  "created_at": "2026-06-22T16:57:02.585Z",
  "updated_at": "2026-06-22T16:57:26.548Z"
}
```

## Required Boundaries

Allowed paths:

- ops/agent-orchestrator/scripts/**
- ops/agent-orchestrator/evolution/**
- ops/agent-orchestrator/events/**
- ops/agent-orchestrator/queue/**
- ops/agent-orchestrator/reports/**
- ops/agent-orchestrator/results/**
- docs/release/**
- docs/testing/**

Forbidden paths:

- apps/**
- packages/**
- database/**
- infra/**
- .github/**
- Dockerfile
- Dockerfile.*
- docker-compose*
- deploy/**
- auth/**
- .env
- .env.*

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

1. Doctor reports event/read-model consistency after rebuild dry-run.
2. Queue bookkeeping conflicts are handled through event-first reconcile rules.
3. Compatibility queue JSON remains readable by existing agent-cycle commands.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run`
- `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor`
- `node ops/agent-orchestrator/scripts/check-dispatch-status.mjs`
- `pnpm typecheck`

## Completion

After completing the task:

1. Run `git status --short`.
2. Create a local commit if the task allows commit and validation is acceptable.
3. Record the result with `complete-task.mjs`.

Example:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs \
  --task-id EVOLUTION-IMPROVE-QUEUE-CONFLICT-REDUCTION \
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
9. FINALIZE RESULT: `not applicable for worker agent` unless the prompt explicitly delegates main orchestrator finalize responsibility.
