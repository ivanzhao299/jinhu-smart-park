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

- Task ID: `AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION`
- Batch ID: `AGENT-PLATFORM-V3-F-GOAL-TO-QUEUE`
- Title: Planner Output validation
- Domain: planner-runtime
- Priority: P0
- Risk: MEDIUM
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION-agent-3.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION",
  "title": "Planner Output validation",
  "domain": "planner-runtime",
  "priority": "P0",
  "risk": "MEDIUM",
  "allowed_paths": [
    "ops/agent-orchestrator/planner/**",
    "ops/agent-orchestrator/reports/**",
    "ops/agent-orchestrator/results/**",
    "docs/release/**",
    "docs/testing/**"
  ],
  "acceptance": [
    "Planner output is checked against expected task candidate fields.",
    "Planner runtime explains owner assignment and expected outputs.",
    "No queue writes happen in dry-run mode."
  ],
  "validation_commands": [
    "node ops/agent-orchestrator/scripts/goal-to-queue.mjs --text \"继续把 Agent Studio 提升到 98%\" --dry-run",
    "node ops/agent-orchestrator/scripts/check-dispatch-status.mjs"
  ],
  "batch_id": "AGENT-PLATFORM-V3-F-GOAL-TO-QUEUE",
  "source_goal_id": "GOAL-AGENT-STUDIO-98",
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
  "requires_human_approval": false,
  "owner": "agent-3",
  "owner_assignment_reason": "preferred owner agent-3 validated against Agent Registry",
  "status": "CLAIMED",
  "expected_output_files": [
    "docs/testing/agent-studio-v3-planner-output-validation.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION.md",
    "ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION.json"
  ],
  "created_at": "2026-06-22T15:26:04.674Z",
  "updated_at": "2026-06-22T15:29:42.712Z"
}
```

## Required Boundaries

Allowed paths:

- ops/agent-orchestrator/planner/**
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

1. Planner output is checked against expected task candidate fields.
2. Planner runtime explains owner assignment and expected outputs.
3. No queue writes happen in dry-run mode.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `node ops/agent-orchestrator/scripts/goal-to-queue.mjs --text "继续把 Agent Studio 提升到 98%" --dry-run`
- `node ops/agent-orchestrator/scripts/check-dispatch-status.mjs`

## Completion

After completing the task:

1. Run `git status --short`.
2. Create a local commit if the task allows commit and validation is acceptable.
3. Record the result with `complete-task.mjs`.

Example:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs \
  --task-id AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION \
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
9. FINALIZE RESULT: `not applicable for worker agent` unless the prompt explicitly delegates main orchestrator finalize responsibility.
