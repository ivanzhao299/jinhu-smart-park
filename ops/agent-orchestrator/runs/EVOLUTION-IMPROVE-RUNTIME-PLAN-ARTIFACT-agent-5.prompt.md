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

- Task ID: `EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT`
- Batch ID: `EVOLUTION-IMPROVEMENT-BACKLOG`
- Title: Make agent-run-plan.md an ephemeral runtime artifact
- Domain: evolution-pattern-001
- Priority: P0
- Risk: LOW
- Prompt file: `ops/agent-orchestrator/runs/EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT-agent-5.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT",
  "batch_id": "EVOLUTION-IMPROVEMENT-BACKLOG",
  "source_goal_id": "GOAL-EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT",
  "source_improvement_id": "IMPROVE-RUNTIME-PLAN-ARTIFACT",
  "source_pattern_id": "PATTERN-001",
  "title": "Make agent-run-plan.md an ephemeral runtime artifact",
  "owner": "agent-5",
  "domain": "evolution-pattern-001",
  "priority": "P0",
  "risk": "LOW",
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
    "Self-repair identifies agent-run-plan.md as a LOW-risk runtime artifact.",
    "Self-repair restores only agent-run-plan.md when it is the sole dirty main-worktree file.",
    "Non-runtime dirty files still block with NO_GO."
  ],
  "validation_commands": [
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs self-repair --dry-run --reason \"agent-run-plan runtime dirty\"",
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
    "git diff --check",
    "pnpm typecheck"
  ],
  "requires_human_approval": false,
  "owner_assignment_reason": "Evolution Planner recommendation from PATTERN-001",
  "status": "CLAIMED",
  "expected_output_files": [
    "ops/agent-orchestrator/reports/IMPROVE-RUNTIME-PLAN-ARTIFACT.md",
    "ops/agent-orchestrator/results/IMPROVE-RUNTIME-PLAN-ARTIFACT.json",
    "docs/testing/evolution-runtime-plan-artifact-checklist.md"
  ],
  "created_at": "2026-06-22T16:17:40.162Z",
  "updated_at": "2026-06-22T16:18:09.795Z"
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

1. Self-repair identifies agent-run-plan.md as a LOW-risk runtime artifact.
2. Self-repair restores only agent-run-plan.md when it is the sole dirty main-worktree file.
3. Non-runtime dirty files still block with NO_GO.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `node ops/agent-orchestrator/scripts/orchestratorctl.mjs self-repair --dry-run --reason "agent-run-plan runtime dirty"`
- `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor`
- `git diff --check`
- `pnpm typecheck`

## Completion

After completing the task:

1. Run `git status --short`.
2. Create a local commit if the task allows commit and validation is acceptable.
3. Record the result with `complete-task.mjs`.

Example:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs \
  --task-id EVOLUTION-IMPROVE-RUNTIME-PLAN-ARTIFACT \
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
