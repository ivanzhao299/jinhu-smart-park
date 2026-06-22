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

- Task ID: `AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX`
- Batch ID: `AGENT-PLATFORM-V2-RESOURCE-READINESS-20260622`
- Title: Runtime documentation index and readiness cross-link checklist
- Domain: asset-docs-runtime-index
- Priority: P0
- Risk: LOW
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX-agent-1.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX",
  "batch_id": "AGENT-PLATFORM-V2-RESOURCE-READINESS-20260622",
  "title": "Runtime documentation index and readiness cross-link checklist",
  "owner": "agent-1",
  "domain": "asset-docs-runtime-index",
  "priority": "P0",
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
    "Create docs/release/agent-platform-v2-runtime-docs-index.md summarizing the Agent Platform V2 runtime documentation map and ownership cross-links.",
    "Create docs/testing/agent-platform-v2-runtime-docs-index-checklist.md with a low-risk checklist for verifying docs, reports, and result artifact discoverability.",
    "Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.md summarizing changed files, checks, and remaining risks.",
    "Record truthful completion in ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.json via complete-task.mjs when finished.",
    "Do not modify apps, packages, database, infra, .github, Docker, deploy, auth, migrations, seeds, production configuration, or production data."
  ],
  "validation_commands": [
    "git status --short",
    "test -f docs/release/agent-platform-v2-runtime-docs-index.md",
    "test -f docs/testing/agent-platform-v2-runtime-docs-index-checklist.md",
    "test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.md",
    "git diff --check",
    "git status --short"
  ],
  "required_checks": [
    "Required docs and report files exist",
    "git diff --check passes",
    "No business, database, infra, auth, Docker, deploy, or CI paths changed"
  ],
  "expected_output_files": [
    "docs/release/agent-platform-v2-runtime-docs-index.md",
    "docs/testing/agent-platform-v2-runtime-docs-index-checklist.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.md",
    "ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.json"
  ],
  "requires_human_approval": false,
  "allow_commit": false,
  "created_at": "2026-06-22T12:17:18.199Z",
  "updated_at": "2026-06-22T12:23:29.505Z"
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

1. Create docs/release/agent-platform-v2-runtime-docs-index.md summarizing the Agent Platform V2 runtime documentation map and ownership cross-links.
2. Create docs/testing/agent-platform-v2-runtime-docs-index-checklist.md with a low-risk checklist for verifying docs, reports, and result artifact discoverability.
3. Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.md summarizing changed files, checks, and remaining risks.
4. Record truthful completion in ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.json via complete-task.mjs when finished.
5. Do not modify apps, packages, database, infra, .github, Docker, deploy, auth, migrations, seeds, production configuration, or production data.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `test -f docs/release/agent-platform-v2-runtime-docs-index.md`
- `test -f docs/testing/agent-platform-v2-runtime-docs-index-checklist.md`
- `test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.md`
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
  --task-id AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX \
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
