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

- Task ID: `AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME`
- Batch ID: `AGENT-PLATFORM-V3-ROUND1-20260622`
- Title: Planner output schema and planning runtime flow
- Domain: planner-runtime-flow
- Priority: P0
- Risk: MEDIUM
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME-agent-3.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME",
  "batch_id": "AGENT-PLATFORM-V3-ROUND1-20260622",
  "title": "Planner output schema and planning runtime flow",
  "owner": "agent-3",
  "domain": "planner-runtime-flow",
  "priority": "P0",
  "status": "CLAIMED",
  "risk": "MEDIUM",
  "allowed_paths": [
    "docs/release",
    "docs/testing",
    "ops/agent-orchestrator/planner",
    "ops/agent-orchestrator/specs",
    "ops/agent-orchestrator/reports",
    "ops/agent-orchestrator/results"
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
    "Create docs/release/agent-platform-v3-planner-runtime.md describing how Planner output becomes REQ, TECH, task queue draft, dispatch plan, and validation plan.",
    "Review ops/agent-orchestrator/planner/planner-output.schema.json and document dry-run planning boundaries.",
    "Create docs/testing/agent-platform-v3-planner-dry-run-checklist.md with no-write planner validation checks.",
    "Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME.md summarizing changed files, validation, and remaining risks.",
    "Do not execute Agents, write queue from planner output, or modify business code."
  ],
  "validation_commands": [
    "git status --short",
    "test -f docs/release/agent-platform-v3-planner-runtime.md",
    "test -f docs/testing/agent-platform-v3-planner-dry-run-checklist.md",
    "node -e \"JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/planner/planner-output.schema.json','utf8'));\"",
    "test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME.md",
    "git diff --check",
    "git status --short"
  ],
  "required_checks": [
    "Planner runtime doc exists",
    "Planner output schema parses as JSON",
    "Planner dry-run checklist exists",
    "No business, database, infra, auth, Docker, deploy, or CI paths changed"
  ],
  "expected_output_files": [
    "docs/release/agent-platform-v3-planner-runtime.md",
    "docs/testing/agent-platform-v3-planner-dry-run-checklist.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME.md",
    "ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME.json"
  ],
  "requires_human_approval": false,
  "allow_commit": false,
  "created_at": "2026-06-22T13:30:00.000Z",
  "updated_at": "2026-06-22T14:24:03.737Z"
}
```

## Required Boundaries

Allowed paths:

- docs/release
- docs/testing
- ops/agent-orchestrator/planner
- ops/agent-orchestrator/specs
- ops/agent-orchestrator/reports
- ops/agent-orchestrator/results

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

1. Create docs/release/agent-platform-v3-planner-runtime.md describing how Planner output becomes REQ, TECH, task queue draft, dispatch plan, and validation plan.
2. Review ops/agent-orchestrator/planner/planner-output.schema.json and document dry-run planning boundaries.
3. Create docs/testing/agent-platform-v3-planner-dry-run-checklist.md with no-write planner validation checks.
4. Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME.md summarizing changed files, validation, and remaining risks.
5. Do not execute Agents, write queue from planner output, or modify business code.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `test -f docs/release/agent-platform-v3-planner-runtime.md`
- `test -f docs/testing/agent-platform-v3-planner-dry-run-checklist.md`
- `node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/planner/planner-output.schema.json','utf8'));"`
- `test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME.md`
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
  --task-id AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME \
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
