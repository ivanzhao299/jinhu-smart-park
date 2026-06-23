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

- Task ID: `JINHU-SMART-PARK-TASK-2A48545294`
- Batch ID: `EXTERNAL-PROPOSAL-jinhu-smart-park`
- Title: 优化智慧园区仪表盘移动端样式
- Domain: external-proposal-code_development
- Priority: P0
- Risk: HIGH
- Prompt file: `ops/agent-orchestrator/runs/JINHU-SMART-PARK-TASK-2A48545294-agent-4.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "JINHU-SMART-PARK-TASK-2A48545294",
  "batch_id": "EXTERNAL-PROPOSAL-jinhu-smart-park",
  "title": "优化智慧园区仪表盘移动端样式",
  "owner": "agent-4",
  "domain": "external-proposal-code_development",
  "priority": "P0",
  "status": "CLAIMED",
  "risk": "HIGH",
  "skill_type": "code_development",
  "skill_id": "skill-code-development",
  "runtime": "codex-cli",
  "allowed_paths": [
    "apps/web",
    "packages/ui",
    "docs/release",
    "docs/testing",
    "ops/agent-orchestrator/reports",
    "ops/agent-orchestrator/results"
  ],
  "forbidden_paths": [
    "packages",
    "database",
    "infra",
    ".github",
    "Dockerfile",
    "Dockerfile.*",
    "docker-compose*",
    "deploy",
    "auth",
    ".env",
    ".env.*",
    "apps/api"
  ],
  "acceptance": [
    "Implement approved proposal: 优化智慧园区仪表盘移动端样式",
    "Stay within allowed_paths and avoid forbidden_paths.",
    "Do not deploy or perform production operations.",
    "Run all validation_commands and record truthful results.",
    "Respect approval_required and high-risk boundaries before project writes."
  ],
  "validation_commands": [
    "pnpm typecheck",
    "pnpm lint",
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
    "git diff --check",
    "manual approval before writing guarded project paths"
  ],
  "required_checks": [
    "No forbidden paths changed",
    "Validation commands pass or failures are reported truthfully",
    "No deploy or production operation executed"
  ],
  "expected_outputs": [
    "code/patch"
  ],
  "expected_output_files": [],
  "requires_human_approval": true,
  "approval_source": "anksen-agent-studio",
  "external_proposal_ref": "examples/jinhu-smart-park/task-proposals/JINHU-SMART-PARK-TASK-2A48545294.json",
  "allow_commit": false,
  "created_at": "2026-06-23T07:22:04.307Z",
  "updated_at": "2026-06-23T09:23:07.186Z"
}
```

## Required Boundaries

Allowed paths:

- apps/web
- packages/ui
- docs/release
- docs/testing
- ops/agent-orchestrator/reports
- ops/agent-orchestrator/results

Forbidden paths:

- packages
- database
- infra
- .github
- Dockerfile
- Dockerfile.*
- docker-compose*
- deploy
- auth
- .env
- .env.*
- apps/api

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

1. Implement approved proposal: 优化智慧园区仪表盘移动端样式
2. Stay within allowed_paths and avoid forbidden_paths.
3. Do not deploy or perform production operations.
4. Run all validation_commands and record truthful results.
5. Respect approval_required and high-risk boundaries before project writes.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `pnpm typecheck`
- `pnpm lint`
- `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor`
- `git diff --check`
- `manual approval before writing guarded project paths`

## Completion

After completing the task:

1. Run `git status --short`.
2. Create a local commit if the task allows commit and validation is acceptable.
3. Record the result with `complete-task.mjs`.

Example:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs \
  --task-id JINHU-SMART-PARK-TASK-2A48545294 \
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
