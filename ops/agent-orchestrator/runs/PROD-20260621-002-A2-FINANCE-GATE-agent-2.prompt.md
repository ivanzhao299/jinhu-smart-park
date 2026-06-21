# Agent Worker Prompt

You are `agent-2` (`leasing-finance`) for Jinhu Smart Park.

Role: 招商、合同、应收、收款、发票、减免

Working directory:

```text
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-2
```

Branch:

```text
agent-2-leasing-finance
```

## Current Task

- Task ID: `PROD-20260621-002-A2-FINANCE-GATE`
- Batch ID: `PROD-EVIDENCE-20260621-002`
- Title: Contract finance receivable payment invoice and audit release check plan
- Domain: leasing-finance-release
- Priority: P1
- Risk: HIGH
- Prompt file: `ops/agent-orchestrator/runs/PROD-20260621-002-A2-FINANCE-GATE-agent-2.prompt.md`

Read the task details from:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Task JSON snapshot:

```json
{
  "task_id": "PROD-20260621-002-A2-FINANCE-GATE",
  "batch_id": "PROD-EVIDENCE-20260621-002",
  "title": "Contract finance receivable payment invoice and audit release check plan",
  "owner": "agent-2",
  "domain": "leasing-finance-release",
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
    "Creates a finance release check plan for contracts, receivables, payments, invoices, waivers, financial summaries, idempotency, delete/void protections, and audit-log sampling.",
    "Classifies checks as local/pre-production full execution, production read-only sampling, or production write-path requiring approval.",
    "Documents required test data marker, cleanup expectations, audit evidence fields, and finance owner sign-off.",
    "Records No-Go rules for duplicate receivable/payment, unsafe financial delete, missing audit log, invoice/waiver failure, or idempotency conflict behavior failure.",
    "Does not modify financial service code, DTOs, entities, migrations, seeds, auth, CI, Docker, deploy, or production env files."
  ],
  "validation_commands": [
    "git status --short",
    "pnpm typecheck",
    "node --check scripts/e2e/s3c-contract-smoke.mjs",
    "node --check scripts/e2e/s3d-payment-smoke.mjs",
    "node --check scripts/e2e/s3d-waiver-smoke.mjs",
    "node --check scripts/e2e/s3d-invoice-smoke.mjs",
    "node --check scripts/e2e/first-release-leasing.mjs",
    "git diff --check",
    "git status --short"
  ],
  "requires_human_approval": true,
  "created_at": "2026-06-21T18:37:00+08:00",
  "updated_at": "2026-06-21T13:36:01.171Z"
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

1. Creates a finance release check plan for contracts, receivables, payments, invoices, waivers, financial summaries, idempotency, delete/void protections, and audit-log sampling.
2. Classifies checks as local/pre-production full execution, production read-only sampling, or production write-path requiring approval.
3. Documents required test data marker, cleanup expectations, audit evidence fields, and finance owner sign-off.
4. Records No-Go rules for duplicate receivable/payment, unsafe financial delete, missing audit log, invoice/waiver failure, or idempotency conflict behavior failure.
5. Does not modify financial service code, DTOs, entities, migrations, seeds, auth, CI, Docker, deploy, or production env files.

## Validation Commands

Run the task's applicable validation commands. If a command is unsafe for the current environment, skip it and record the reason.

- `git status --short`
- `pnpm typecheck`
- `node --check scripts/e2e/s3c-contract-smoke.mjs`
- `node --check scripts/e2e/s3d-payment-smoke.mjs`
- `node --check scripts/e2e/s3d-waiver-smoke.mjs`
- `node --check scripts/e2e/s3d-invoice-smoke.mjs`
- `node --check scripts/e2e/first-release-leasing.mjs`
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
  --task-id PROD-20260621-002-A2-FINANCE-GATE \
  --agent agent-2 \
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
