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

- Task ID: `PROD-20260621-002-A3-IOT-SAFETY-SMOKE`
- Batch ID: `PROD-EVIDENCE-20260621-002`
- Title: IoT safety runtime smoke and production-safe inspection plan
- Domain: ops-iot-safety
- Priority: P1
- Risk: HIGH
- Prompt file: `ops/agent-orchestrator/runs/PROD-20260621-002-A3-IOT-SAFETY-SMOKE-agent-3.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "PROD-20260621-002-A3-IOT-SAFETY-SMOKE",
  "batch_id": "PROD-EVIDENCE-20260621-002",
  "title": "IoT safety runtime smoke and production-safe inspection plan",
  "owner": "agent-3",
  "domain": "ops-iot-safety",
  "priority": "P1",
  "status": "CLAIMED",
  "risk": "HIGH",
  "allowed_paths": [
    "docs/release",
    "docs/testing",
    "ops/agent-orchestrator/reports",
    "scripts/e2e"
  ],
  "forbidden_paths": [
    "apps/api",
    "apps/web",
    "packages",
    "database/migrations",
    "database/seeds",
    "infra",
    ".github/workflows",
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
    "Creates a production-safe IoT and safety release smoke plan covering safety access, S5A/S5B, S9A-S9F1, unified action executor, alert visibility, automatic hazard visibility, duplicate prevention, and energy reversal.",
    "Classifies each command as local/pre-production full execution, production read-only sampling, or production write-path requiring approval.",
    "Defines required test data marker, cleanup expectations, and evidence fields for any approved write-path smoke.",
    "Records No-Go rules for automatic hazard invisibility, duplicate linked actions, safety access failure, or energy reversal failure.",
    "Does not modify business code, migrations, seeds, auth, CI, Docker, deploy, or production env files."
  ],
  "validation_commands": [
    "git status --short",
    "pnpm typecheck",
    "node --check scripts/e2e/s5a-safety-smoke.mjs",
    "node --check scripts/e2e/s5b-emergency-permit-smoke.mjs",
    "node --check scripts/e2e/safety-module-access-smoke.mjs",
    "node --check scripts/e2e/s9d1-unified-action-executor-smoke.mjs",
    "git diff --check",
    "git status --short"
  ],
  "requires_human_approval": true,
  "created_at": "2026-06-21T18:35:00+08:00",
  "updated_at": "2026-06-21T10:01:28.385Z"
}
```

## Required Boundaries

Allowed paths:

- docs/release
- docs/testing
- ops/agent-orchestrator/reports
- scripts/e2e

Forbidden paths:

- apps/api
- apps/web
- packages
- database/migrations
- database/seeds
- infra
- .github/workflows
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

1. Creates a production-safe IoT and safety release smoke plan covering safety access, S5A/S5B, S9A-S9F1, unified action executor, alert visibility, automatic hazard visibility, duplicate prevention, and energy reversal.
2. Classifies each command as local/pre-production full execution, production read-only sampling, or production write-path requiring approval.
3. Defines required test data marker, cleanup expectations, and evidence fields for any approved write-path smoke.
4. Records No-Go rules for automatic hazard invisibility, duplicate linked actions, safety access failure, or energy reversal failure.
5. Does not modify business code, migrations, seeds, auth, CI, Docker, deploy, or production env files.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `pnpm typecheck`
- `node --check scripts/e2e/s5a-safety-smoke.mjs`
- `node --check scripts/e2e/s5b-emergency-permit-smoke.mjs`
- `node --check scripts/e2e/safety-module-access-smoke.mjs`
- `node --check scripts/e2e/s9d1-unified-action-executor-smoke.mjs`
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
  --task-id PROD-20260621-002-A3-IOT-SAFETY-SMOKE \
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
