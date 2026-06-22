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

- Task ID: `AGENT-PLATFORM-V3-A4-AGENT-REGISTRY`
- Batch ID: `AGENT-PLATFORM-V3-ROUND1-20260622`
- Title: Agent Registry and dynamic Agent Pool design
- Domain: agent-registry-dynamic-pool
- Priority: P0
- Risk: MEDIUM
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY-agent-4.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V3-A4-AGENT-REGISTRY",
  "batch_id": "AGENT-PLATFORM-V3-ROUND1-20260622",
  "title": "Agent Registry and dynamic Agent Pool design",
  "owner": "agent-4",
  "domain": "agent-registry-dynamic-pool",
  "priority": "P0",
  "status": "CLAIMED",
  "risk": "MEDIUM",
  "allowed_paths": [
    "docs/release",
    "docs/testing",
    "ops/agent-orchestrator/agent-registry",
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
    "Create docs/release/agent-platform-v3-agent-registry-design.md describing dynamic agent registry, status, fallback order, and router compatibility.",
    "Review ops/agent-orchestrator/agent-registry/agent-registry.schema.json and agent-registry.example.json for agent-1 through agent-5 coverage.",
    "Create docs/testing/agent-platform-v3-agent-registry-checklist.md with registry validation and route compatibility checks.",
    "Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.md summarizing changed files, validation, and remaining migration questions.",
    "Do not modify apps/web or any UI implementation code."
  ],
  "validation_commands": [
    "git status --short",
    "test -f docs/release/agent-platform-v3-agent-registry-design.md",
    "test -f docs/testing/agent-platform-v3-agent-registry-checklist.md",
    "node -e \"JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.schema.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.example.json','utf8'));\"",
    "test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.md",
    "git diff --check",
    "git status --short"
  ],
  "required_checks": [
    "Agent Registry design doc exists",
    "Agent Registry schema and example parse as JSON",
    "Registry checklist exists",
    "No business, database, infra, auth, Docker, deploy, or CI paths changed"
  ],
  "expected_output_files": [
    "docs/release/agent-platform-v3-agent-registry-design.md",
    "docs/testing/agent-platform-v3-agent-registry-checklist.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.md",
    "ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.json"
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
- ops/agent-orchestrator/agent-registry
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

1. Create docs/release/agent-platform-v3-agent-registry-design.md describing dynamic agent registry, status, fallback order, and router compatibility.
2. Review ops/agent-orchestrator/agent-registry/agent-registry.schema.json and agent-registry.example.json for agent-1 through agent-5 coverage.
3. Create docs/testing/agent-platform-v3-agent-registry-checklist.md with registry validation and route compatibility checks.
4. Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.md summarizing changed files, validation, and remaining migration questions.
5. Do not modify apps/web or any UI implementation code.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `test -f docs/release/agent-platform-v3-agent-registry-design.md`
- `test -f docs/testing/agent-platform-v3-agent-registry-checklist.md`
- `node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.schema.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.example.json','utf8'));"`
- `test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.md`
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
  --task-id AGENT-PLATFORM-V3-A4-AGENT-REGISTRY \
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
9. FINALIZE RESULT: `not applicable for worker agent` unless the prompt explicitly delegates main orchestrator finalize responsibility.
