# Agent Worker Prompt

You are `agent-1` (`assets-space`) for Jinhu Smart Park.

Role: 资产、房源、租户、空间关联

Working directory:

```text
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-1
```

Branch:

```text
agent-1-assets-space
```

## Current Task

- Task ID: `AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS`
- Batch ID: `AGENT-PLATFORM-V3-F-GOAL-TO-QUEUE`
- Title: Agent Studio V3 user workflow docs
- Domain: product-docs-runtime-index
- Priority: P1
- Risk: LOW
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS-agent-1.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS",
  "title": "Agent Studio V3 user workflow docs",
  "domain": "product-docs-runtime-index",
  "priority": "P1",
  "risk": "LOW",
  "allowed_paths": [
    "docs/release/**",
    "docs/testing/**",
    "ops/agent-orchestrator/reports/**",
    "ops/agent-orchestrator/results/**"
  ],
  "acceptance": [
    "User workflow explains natural-language goal to queue to agent-cycle dry-run.",
    "Docs distinguish Resident Observer from worker agents.",
    "No business code or production operation is touched."
  ],
  "validation_commands": [
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs goal-to-queue --text \"继续把 Agent Studio 提升到 98%\" --dry-run",
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs autonomous-loop --text \"继续把 Agent Studio 提升到 98%\" --dry-run"
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
  "owner": "agent-1",
  "owner_assignment_reason": "preferred owner agent-1 validated against Agent Registry",
  "status": "CLAIMED",
  "expected_output_files": [
    "docs/release/agent-studio-v3-goal-to-queue-user-workflow.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS.md",
    "ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS.json"
  ],
  "created_at": "2026-06-22T15:26:04.674Z",
  "updated_at": "2026-06-22T15:29:42.712Z"
}
```

## Required Boundaries

Allowed paths:

- docs/release/**
- docs/testing/**
- ops/agent-orchestrator/reports/**
- ops/agent-orchestrator/results/**

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

1. User workflow explains natural-language goal to queue to agent-cycle dry-run.
2. Docs distinguish Resident Observer from worker agents.
3. No business code or production operation is touched.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `node ops/agent-orchestrator/scripts/orchestratorctl.mjs goal-to-queue --text "继续把 Agent Studio 提升到 98%" --dry-run`
- `node ops/agent-orchestrator/scripts/orchestratorctl.mjs autonomous-loop --text "继续把 Agent Studio 提升到 98%" --dry-run`

## Completion

After completing the task:

1. Run `git status --short`.
2. Create a local commit if the task allows commit and validation is acceptable.
3. Record the result with `complete-task.mjs`.

Example:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs \
  --task-id AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS \
  --agent agent-1 \
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
