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

- Task ID: `AGENT-PLATFORM-V3-A1-PRODUCT-DOCS`
- Batch ID: `AGENT-PLATFORM-V3-ROUND1-20260622`
- Title: ANKSEN Agent Studio productization and V3 user flow docs
- Domain: agent-studio-product-docs
- Priority: P1
- Risk: LOW
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS-agent-1.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V3-A1-PRODUCT-DOCS",
  "batch_id": "AGENT-PLATFORM-V3-ROUND1-20260622",
  "title": "ANKSEN Agent Studio productization and V3 user flow docs",
  "owner": "agent-1",
  "domain": "agent-studio-product-docs",
  "priority": "P1",
  "status": "CLAIMED",
  "risk": "LOW",
  "allowed_paths": [
    "docs/release",
    "docs/testing",
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
    "Create docs/release/anksen-agent-studio-v3-user-flow.md explaining the V3 natural-language goal to approval-gated agent-cycle flow for operators.",
    "Create docs/release/agent-platform-v3-productization-notes.md describing ANKSEN Agent Studio product positioning, user roles, and non-goals.",
    "Create docs/testing/agent-platform-v3-user-flow-acceptance-checklist.md with low-risk acceptance checks for user-facing docs.",
    "Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS.md summarizing changed files, validation, and remaining documentation gaps.",
    "Do not modify frontend, portal implementation, apps, packages, database, infra, CI, Docker, deploy, auth, or production data."
  ],
  "validation_commands": [
    "git status --short",
    "test -f docs/release/anksen-agent-studio-v3-user-flow.md",
    "test -f docs/release/agent-platform-v3-productization-notes.md",
    "test -f docs/testing/agent-platform-v3-user-flow-acceptance-checklist.md",
    "test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS.md",
    "git diff --check",
    "git status --short"
  ],
  "required_checks": [
    "V3 user flow doc exists",
    "V3 productization notes exist",
    "User flow acceptance checklist exists",
    "No business, database, infra, auth, Docker, deploy, or CI paths changed"
  ],
  "expected_output_files": [
    "docs/release/anksen-agent-studio-v3-user-flow.md",
    "docs/release/agent-platform-v3-productization-notes.md",
    "docs/testing/agent-platform-v3-user-flow-acceptance-checklist.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS.md",
    "ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS.json"
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

1. Create docs/release/anksen-agent-studio-v3-user-flow.md explaining the V3 natural-language goal to approval-gated agent-cycle flow for operators.
2. Create docs/release/agent-platform-v3-productization-notes.md describing ANKSEN Agent Studio product positioning, user roles, and non-goals.
3. Create docs/testing/agent-platform-v3-user-flow-acceptance-checklist.md with low-risk acceptance checks for user-facing docs.
4. Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS.md summarizing changed files, validation, and remaining documentation gaps.
5. Do not modify frontend, portal implementation, apps, packages, database, infra, CI, Docker, deploy, auth, or production data.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `test -f docs/release/anksen-agent-studio-v3-user-flow.md`
- `test -f docs/release/agent-platform-v3-productization-notes.md`
- `test -f docs/testing/agent-platform-v3-user-flow-acceptance-checklist.md`
- `test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS.md`
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
  --task-id AGENT-PLATFORM-V3-A1-PRODUCT-DOCS \
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
