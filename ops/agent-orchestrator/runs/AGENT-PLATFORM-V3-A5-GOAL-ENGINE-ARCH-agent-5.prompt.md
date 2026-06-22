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

- Task ID: `AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH`
- Batch ID: `AGENT-PLATFORM-V3-ROUND1-20260622`
- Title: Goal Engine architecture and schema
- Domain: goal-engine-platform-architecture
- Priority: P0
- Risk: MEDIUM
- Prompt file: `ops/agent-orchestrator/runs/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH-agent-5.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH",
  "batch_id": "AGENT-PLATFORM-V3-ROUND1-20260622",
  "title": "Goal Engine architecture and schema",
  "owner": "agent-5",
  "domain": "goal-engine-platform-architecture",
  "priority": "P0",
  "status": "CLAIMED",
  "risk": "MEDIUM",
  "allowed_paths": [
    "docs/release",
    "docs/testing",
    "ops/agent-orchestrator/goal",
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
    "Create docs/release/agent-platform-v3-goal-engine-architecture.md describing Goal Engine current_state, target_state, gap_analysis, roadmap, recommended tasks, and risk scoring.",
    "Review ops/agent-orchestrator/goal/goal-engine.schema.json and ops/agent-orchestrator/goal/goal-state.example.json for completeness without changing business code.",
    "Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH.md summarizing changed files, validation, and remaining approval questions.",
    "Record truthful completion in ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH.json via complete-task.mjs when finished.",
    "Do not modify apps, packages, database, infra, .github, Docker, deploy, auth, migrations, seeds, or production data."
  ],
  "validation_commands": [
    "git status --short",
    "test -f docs/release/agent-platform-v3-goal-engine-architecture.md",
    "node -e \"JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/goal/goal-engine.schema.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/goal/goal-state.example.json','utf8'));\"",
    "test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH.md",
    "git diff --check",
    "git status --short"
  ],
  "required_checks": [
    "Goal Engine architecture doc exists",
    "Goal Engine schema and example parse as JSON",
    "No business, database, infra, auth, Docker, deploy, or CI paths changed"
  ],
  "expected_output_files": [
    "docs/release/agent-platform-v3-goal-engine-architecture.md",
    "ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH.md",
    "ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH.json"
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
- ops/agent-orchestrator/goal
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

1. Create docs/release/agent-platform-v3-goal-engine-architecture.md describing Goal Engine current_state, target_state, gap_analysis, roadmap, recommended tasks, and risk scoring.
2. Review ops/agent-orchestrator/goal/goal-engine.schema.json and ops/agent-orchestrator/goal/goal-state.example.json for completeness without changing business code.
3. Create ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH.md summarizing changed files, validation, and remaining approval questions.
4. Record truthful completion in ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH.json via complete-task.mjs when finished.
5. Do not modify apps, packages, database, infra, .github, Docker, deploy, auth, migrations, seeds, or production data.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `test -f docs/release/agent-platform-v3-goal-engine-architecture.md`
- `node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/goal/goal-engine.schema.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/goal/goal-state.example.json','utf8'));"`
- `test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH.md`
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
  --task-id AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH \
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
9. FINALIZE RESULT: `not applicable for worker agent` unless the prompt explicitly delegates main orchestrator finalize responsibility.
