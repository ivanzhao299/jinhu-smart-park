# Agent Orchestrator

This directory contains the file-driven orchestration layer for the Jinhu Smart Park multi-agent workflow.

The first version turns a natural-language request into a persistent intake file, a REQ / TECH spec, a task queue, agent claims, agent completion results, and an orchestrator audit step. It does not merge, push, deploy, or modify production data automatically.

## Directory Map

| Path | Purpose |
|---|---|
| `intake/REQUEST_TEMPLATE.md` | Template for capturing the user's natural-language request. |
| `intake/current-request.md` | Current request intake file. Keep the raw request and interpreted scope here. |
| `specs/SPEC_TEMPLATE.md` | Template for REQ / TECH decomposition before queue generation. |
| `queue/task-queue.schema.json` | JSON schema for task queue entries. |
| `queue/task-queue.json` | Current task pool. Agents claim READY tasks from here. |
| `queue/task-locks.json` | Claim records written by `claim-task.mjs`. |
| `queue/task-results.json` | Completion records written by `complete-task.mjs`. |
| `scripts/claim-task.mjs` | Lets an agent claim its next READY task. |
| `scripts/complete-task.mjs` | Records an agent result and marks the task DONE or FAILED. |
| `scripts/audit-agent-result.mjs` | Checks changed files against task path boundaries. |

## 1. Intake: Natural Language To Current Request

When the user gives a natural-language requirement, the orchestrator copies the raw request into:

```bash
ops/agent-orchestrator/intake/current-request.md
```

Use `ops/agent-orchestrator/intake/REQUEST_TEMPLATE.md` as the shape. Preserve the original user wording, then add interpreted goal, scope, out-of-scope items, safety constraints, required artifacts, acceptance criteria, and any human approval requirements.

Never write secrets, passwords, tokens, production connection strings, or real production account details into intake files.

## 2. Planning: REQ / TECH

The orchestrator turns `current-request.md` into a REQ / TECH spec using:

```bash
ops/agent-orchestrator/specs/SPEC_TEMPLATE.md
```

REQ captures user-facing requirements, constraints, non-goals, and acceptance criteria.

TECH maps the work to domains and agents, records allowed and forbidden paths, lists validation commands, and defines stop conditions.

## 3. Queue Generation

The orchestrator writes tasks into:

```bash
ops/agent-orchestrator/queue/task-queue.json
```

Each task must follow `task-queue.schema.json` and include at least:

- `task_id`
- `batch_id`
- `title`
- `owner`
- `domain`
- `priority`
- `status`
- `risk`
- `allowed_paths`
- `forbidden_paths`
- `acceptance`
- `validation_commands`
- `requires_human_approval`
- `created_at`
- `updated_at`

Initial status for claimable work is `READY`. Supported owners are `agent-1` through `agent-5`.

## 4. Agent Claim Flow

Each agent claims the highest-priority READY task assigned to itself:

```bash
node ops/agent-orchestrator/scripts/claim-task.mjs agent-2
```

The script:

1. Reads `queue/task-queue.json`.
2. Finds the highest-priority READY task for that agent.
3. Marks the task `CLAIMED`.
4. Appends a lock record to `queue/task-locks.json`.
5. Prints the claimed task summary.

If no task is available, it prints:

```text
No READY task for agent-x
```

## 5. Agent Completion Flow

When an agent finishes, it records the result:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs \
  --task-id TASK_ID \
  --agent agent-2 \
  --status DONE \
  --commit-hash abc123 \
  --changed-files docs/release/example.md \
  --commands-run "pnpm typecheck" \
  --passed-checks "pnpm typecheck" \
  --notes "Completed with docs-only changes."
```

For richer results, write a JSON file and pass it with `--result`:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs --result /path/to/result.json
```

The result JSON supports:

- `task_id`
- `agent`
- `status`
- `commit_hash`
- `changed_files`
- `commands_run`
- `passed_checks`
- `failed_checks`
- `notes`

The script appends to `queue/task-results.json` and updates the task status to `DONE` or `FAILED`. It does not merge or push.

## 6. Orchestrator Audit Flow

The orchestrator audits a completed task by task id:

```bash
node ops/agent-orchestrator/scripts/audit-agent-result.mjs TASK_ID
```

The audit checks:

1. Every changed file is inside the task's `allowed_paths`.
2. No changed file matches the task's `forbidden_paths`.

If the audit passes, the script prints `AUDIT_PASS` and marks the task `AUDITED`.

If the audit fails, the script prints `AUDIT_FAIL` and each reason. Failed audits should become follow-up tasks or manual review items.

## 7. Merge Gate After Audit

After `AUDIT_PASS`, the orchestrator may inspect merge readiness with the existing scripts:

```bash
./ops/agent-orchestrator/check-status.sh
./ops/agent-orchestrator/check-merge-candidate.sh agent-2
pnpm typecheck
```

Run relevant e2e commands based on the task domain. Do not suggest push if `pnpm typecheck` or relevant e2e fails.

Only after human confirmation should the orchestrator run merge and push commands.

## 8. Actions Requiring Human Confirmation

These actions are never automatic:

- `git merge`
- `git push`
- production deploy
- production data writes
- production seed, cleanup, reset, or destructive database operations
- migration creation
- old migration edits
- auth, CI, Docker, deploy, SMS, or WeChat runtime configuration changes

The task queue can mark these with `requires_human_approval: true`.

## 9. Agent Ownership

| Agent | Domain |
|---|---|
| `agent-1` | Assets, units, tenants, space relationships |
| `agent-2` | Leasing, contracts, receivables, payments, invoices, waivers |
| `agent-3` | Workorders, safety, IoT, energy, unified action executor |
| `agent-4` | Dashboard, mobile, menus, RBAC, regression acceptance |
| `agent-5` | Testing, release acceptance, production readiness |

## 10. First-Version Limits

- The queue is file-based and assumes one writer at a time.
- Locking is advisory and recorded in `task-locks.json`.
- Schema validation is documented but not enforced by the scripts yet.
- Audit checks path boundaries only; command results and semantic quality still require orchestrator review.
- Merge, push, deploy, and production operations remain manual approval gates.
