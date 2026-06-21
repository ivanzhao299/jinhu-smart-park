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

- Task ID: `PROD-20260621-002-A4-RBAC-MENU-GATE`
- Batch ID: `PROD-EVIDENCE-20260621-002`
- Title: RBAC menu dashboard and permission visibility release check plan
- Domain: rbac-menu-dashboard
- Priority: P1
- Risk: HIGH
- Prompt file: `ops/agent-orchestrator/runs/PROD-20260621-002-A4-RBAC-MENU-GATE-agent-4.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "PROD-20260621-002-A4-RBAC-MENU-GATE",
  "batch_id": "PROD-EVIDENCE-20260621-002",
  "title": "RBAC menu dashboard and permission visibility release check plan",
  "owner": "agent-4",
  "domain": "rbac-menu-dashboard",
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
    "Creates RBAC, menu, dashboard, and permission visibility release checks for pre-production execution and production read-only sampling.",
    "Maps super-admin, standard role, denied route, first-release menu whitelist, dashboard visibility, and permission consistency evidence to Go / No-Go criteria.",
    "Documents required accounts, target URLs, screenshots or command logs, and human approvals for production sampling.",
    "Records No-Go rules for unauthorized access, missing first-release menu, non-first-release menu exposure, or dashboard permission mismatch.",
    "Does not modify apps/api, apps/web, packages, migrations, seeds, auth, CI, Docker, deploy, or production env files."
  ],
  "validation_commands": [
    "git status --short",
    "pnpm typecheck",
    "node --check scripts/e2e/s1-rbac-std-fix-smoke.mjs",
    "node --check scripts/e2e/first-release-menu-whitelist.mjs",
    "node --check scripts/e2e/first-release-idempotency.mjs",
    "git diff --check",
    "git status --short"
  ],
  "requires_human_approval": true,
  "created_at": "2026-06-21T18:36:00+08:00",
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

1. Creates RBAC, menu, dashboard, and permission visibility release checks for pre-production execution and production read-only sampling.
2. Maps super-admin, standard role, denied route, first-release menu whitelist, dashboard visibility, and permission consistency evidence to Go / No-Go criteria.
3. Documents required accounts, target URLs, screenshots or command logs, and human approvals for production sampling.
4. Records No-Go rules for unauthorized access, missing first-release menu, non-first-release menu exposure, or dashboard permission mismatch.
5. Does not modify apps/api, apps/web, packages, migrations, seeds, auth, CI, Docker, deploy, or production env files.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `pnpm typecheck`
- `node --check scripts/e2e/s1-rbac-std-fix-smoke.mjs`
- `node --check scripts/e2e/first-release-menu-whitelist.mjs`
- `node --check scripts/e2e/first-release-idempotency.mjs`
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
  --task-id PROD-20260621-002-A4-RBAC-MENU-GATE \
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
