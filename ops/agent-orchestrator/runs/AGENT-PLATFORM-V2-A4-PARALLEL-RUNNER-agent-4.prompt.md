# Agent Worker Prompt

You are `agent-4` (`dashboard-mobile-rbac`) for Jinhu Smart Park.

Role: 驾驶舱、移动端、菜单权限、回归验收

Working directory:

```text
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-4
```

Branch:

```text
agent-4-dashboard-mobile-rbac
```

## Current Task

- Task ID: `AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER`
- Batch ID: `AGENT-PLATFORM-V2-20260621`
- Title: Parallel Codex runner CLI parameters logs and summary output
- Domain: orchestrator-parallel-runner
- Priority: P1
- Risk: MEDIUM
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER-agent-4.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER",
  "batch_id": "AGENT-PLATFORM-V2-20260621",
  "title": "Parallel Codex runner CLI parameters logs and summary output",
  "owner": "agent-4",
  "domain": "orchestrator-parallel-runner",
  "priority": "P1",
  "status": "CLAIMED",
  "risk": "MEDIUM",
  "allowed_paths": [
    "docs/release",
    "docs/testing",
    "ops/agent-orchestrator/specs",
    "ops/agent-orchestrator/scripts",
    "ops/agent-orchestrator/runs",
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
    "Designs run-claimed-agent-prompts.mjs support for --parallel 1, --parallel 2, --parallel 3, and --parallel 5 with default --parallel 1.",
    "Preserves serial safe mode and all existing no-deploy, no-push, no-merge, no-production-operation guardrails.",
    "Defines per-agent prompt, worktree, run.log, exit code, and aggregated summary behavior.",
    "Defines failure strategy: stop launching new tasks after first failure while allowing already-started tasks to finish.",
    "Documents why event-sourcing queue is required before safe parallel execution can write completion state."
  ],
  "validation_commands": [
    "git status --short",
    "node --check ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs",
    "node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run",
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run",
    "pnpm typecheck",
    "git diff --check",
    "git status --short"
  ],
  "required_checks": [
    "--parallel defaults to 1",
    "--parallel accepts only 1, 2, 3, or 5",
    "Dry-run prints planned parallel batches without executing Codex",
    "typecheck passes"
  ],
  "expected_output_files": [
    "docs/release/agent-platform-v2-parallel-runner-plan.md",
    "docs/testing/agent-platform-v2-parallel-runner-test-plan.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER.md"
  ],
  "requires_human_approval": false,
  "created_at": "2026-06-21T21:47:00+08:00",
  "updated_at": "2026-06-21T13:36:01.171Z"
}
```

## Required Boundaries

Allowed paths:

- docs/release
- docs/testing
- ops/agent-orchestrator/specs
- ops/agent-orchestrator/scripts
- ops/agent-orchestrator/runs
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

1. Designs run-claimed-agent-prompts.mjs support for --parallel 1, --parallel 2, --parallel 3, and --parallel 5 with default --parallel 1.
2. Preserves serial safe mode and all existing no-deploy, no-push, no-merge, no-production-operation guardrails.
3. Defines per-agent prompt, worktree, run.log, exit code, and aggregated summary behavior.
4. Defines failure strategy: stop launching new tasks after first failure while allowing already-started tasks to finish.
5. Documents why event-sourcing queue is required before safe parallel execution can write completion state.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `node --check ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs`
- `node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run`
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
  --task-id AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER \
  --agent agent-4 \
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
