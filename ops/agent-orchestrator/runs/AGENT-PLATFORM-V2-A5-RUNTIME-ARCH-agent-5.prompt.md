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

- Task ID: `AGENT-PLATFORM-V2-A5-RUNTIME-ARCH`
- Batch ID: `AGENT-PLATFORM-V2-ROUND2-20260622`
- Title: Project Runtime Memory overall architecture and inventory contracts
- Domain: orchestrator-runtime-memory-architecture
- Priority: P0
- Risk: MEDIUM
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V2-A5-RUNTIME-ARCH-agent-5.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V2-A5-RUNTIME-ARCH",
  "batch_id": "AGENT-PLATFORM-V2-ROUND2-20260622",
  "title": "Project Runtime Memory overall architecture and inventory contracts",
  "owner": "agent-5",
  "domain": "orchestrator-runtime-memory-architecture",
  "priority": "P0",
  "status": "CLAIMED",
  "risk": "MEDIUM",
  "allowed_paths": [
    "docs/release",
    "docs/testing",
    "ops/agent-orchestrator/specs",
    "ops/agent-orchestrator/reports",
    "ops/agent-orchestrator/README.md",
    "ops/agent-orchestrator/parallel-task-board.md"
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
    "Defines Project Runtime Memory architecture under ops/agent-orchestrator/runtime without creating business-code changes.",
    "Specifies architecture.json, api_inventory.json, db_inventory.json, module_inventory.json, rbac_inventory.json, workflow_inventory.json, and risk_inventory.json contracts.",
    "Defines how runtime memory reduces repeated project scans while remaining generated metadata, not business truth.",
    "Documents runtime-generator, runtime-rebuild, and runtime-validate dry-run/apply responsibilities at architecture level.",
    "Does not modify apps, packages, database, infra, auth, CI, Docker, deploy, migration, seed, or production files."
  ],
  "validation_commands": [
    "git status --short",
    "node ops/agent-orchestrator/scripts/check-dispatch-status.mjs",
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run",
    "pnpm typecheck",
    "git diff --check",
    "git status --short"
  ],
  "required_checks": [
    "Task stays within docs/specs/reports orchestrator planning paths",
    "No business code, database, infra, auth, CI, Docker, deploy, or production files changed",
    "check-dispatch-status remains compatible",
    "doctor and agent-cycle --dry-run remain no-agent/no-push/no-deploy",
    "typecheck and git diff --check pass"
  ],
  "expected_output_files": [
    "docs/release/agent-platform-v2-runtime-memory-architecture.md",
    "ops/agent-orchestrator/specs/TECH-AGENT-PLATFORM-V2-RUNTIME-MEMORY.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A5-RUNTIME-ARCH.md"
  ],
  "requires_human_approval": false,
  "created_at": "2026-06-22T05:42:28.913Z",
  "updated_at": "2026-06-22T05:46:05.975Z"
}
```

## Required Boundaries

Allowed paths:

- docs/release
- docs/testing
- ops/agent-orchestrator/specs
- ops/agent-orchestrator/reports
- ops/agent-orchestrator/README.md
- ops/agent-orchestrator/parallel-task-board.md

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

1. Defines Project Runtime Memory architecture under ops/agent-orchestrator/runtime without creating business-code changes.
2. Specifies architecture.json, api_inventory.json, db_inventory.json, module_inventory.json, rbac_inventory.json, workflow_inventory.json, and risk_inventory.json contracts.
3. Defines how runtime memory reduces repeated project scans while remaining generated metadata, not business truth.
4. Documents runtime-generator, runtime-rebuild, and runtime-validate dry-run/apply responsibilities at architecture level.
5. Does not modify apps, packages, database, infra, auth, CI, Docker, deploy, migration, seed, or production files.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `node ops/agent-orchestrator/scripts/check-dispatch-status.mjs`
- `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor`
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
  --task-id AGENT-PLATFORM-V2-A5-RUNTIME-ARCH \
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
