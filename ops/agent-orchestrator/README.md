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
| `queue/task-results.json` | Compatibility aggregate generated from task result records. |
| `results/<task_id>.json` | Preferred per-task result files written by `complete-task.mjs`. |
| `scripts/orchestratorctl.mjs` | One-click controller for status, reconcile, integrate, validate, and full-cycle flows. |
| `scripts/reconcile-worktrees.mjs` | Backs up runtime dirt and resets only agent branches already included in `origin/main` when `--apply` is used. |
| `scripts/integrate-agent-results.mjs` | Plans or creates integration branches and merges agent candidates by risk. |
| `scripts/reconcile-task-results.mjs` | Regenerates queue/result/lock state from evidence files and result files. |
| `scripts/run-validation-matrix.mjs` | Runs dispatch status, no-write result audit, typecheck, and targeted smoke checks. |
| `scripts/claim-task.mjs` | Lets an agent claim its next READY task. |
| `scripts/complete-task.mjs` | Records an agent result and marks the task DONE or FAILED. |
| `scripts/audit-agent-result.mjs` | Checks changed files against task path boundaries. |
| `scripts/dispatch-ready-agents.mjs` | Central dispatcher that scans READY tasks, checks worktrees, claims one task per agent, and generates runner prompts. |
| `scripts/check-dispatch-status.mjs` | Prints queue status, locks, and agent claim readiness. |
| `scripts/check-agent-runner-env.mjs` | Checks Codex CLI availability, Node version, worktree presence, and active locks without writing files. |
| `scripts/run-claimed-agent-prompts.mjs` | Reads CLAIMED tasks and generated prompts, then writes a plan-first agent execution plan. |
| `scripts/commit-agent-results.mjs` | Reviews dirty agent worktrees after execution, validates task path boundaries, risk-ranks results, and commits LOW/MEDIUM agent outputs. |
| `scripts/audit-all-results.mjs` | Audits all DONE task results with the same path-boundary rules. |
| `prompts/agent-worker-prompt.md` | Template used to generate agent runner prompt files. |
| `runs/` | Generated dispatch reports, per-agent prompt files, and agent run plans. |

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

## 4A. Central Dispatch Flow

The orchestrator can scan the READY queue and prepare agent work in one pass:

```bash
node ops/agent-orchestrator/scripts/dispatch-ready-agents.mjs --dry-run
```

Dry-run mode prints which task each agent would claim, checks the configured worktree paths, and leaves `task-queue.json` and `task-locks.json` unchanged.

When the orchestrator is ready to claim tasks and generate runner material:

```bash
node ops/agent-orchestrator/scripts/dispatch-ready-agents.mjs
```

The dispatcher:

1. Reads `queue/task-queue.json`.
2. Groups READY tasks by `owner`.
3. Selects at most one task per agent, using priority first and `created_at` second.
4. Reads worktree paths from `agents.config.json`.
5. Skips any agent whose worktree is not clean.
6. Skips agents that already have an active lock.
7. Marks selected tasks `CLAIMED`.
8. Writes claim records to `queue/task-locks.json`.
9. Generates one prompt per claimed task under `runs/<task_id>-<agent>.prompt.md`.
10. Writes `runs/dispatch-report.md`.

The dispatcher does not execute business development, e2e, merge, push, deploy, or production data operations.

Check queue and lock status with:

```bash
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
```

This prints READY, CLAIMED, IN_PROGRESS, DONE, FAILED, BLOCKED, and AUDITED tasks, plus active locks and whether each agent can claim another task.

## 4B. Claimed Agent Prompt Runner

After `dispatch-ready-agents.mjs` claims tasks and writes prompt files, the orchestrator can generate a centralized execution plan, or explicitly execute claimed prompts through the Codex CLI.

```bash
node ops/agent-orchestrator/scripts/check-agent-runner-env.mjs
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run
```

`check-agent-runner-env.mjs` is read-only. It checks:

1. Whether the Codex CLI exists.
2. The current Node.js version.
3. Whether main and `agent-1` through `agent-5` worktrees exist and are clean.
4. Whether `task-locks.json` has active locks.

Codex CLI detection uses this order:

1. `CODEX_CLI` environment variable, when set and executable.
2. `codex` found on `PATH`.
3. Codex Desktop bundled CLI at `/Applications/Codex.app/Contents/Resources/codex`.

If none is found, the scripts print `Codex CLI not found`. The runner still writes `agent-run-plan.md`, but marks the plan as `cannot auto-run`.

`run-claimed-agent-prompts.mjs` reads:

```bash
ops/agent-orchestrator/queue/task-locks.json
ops/agent-orchestrator/queue/task-queue.json
ops/agent-orchestrator/agents.config.json
ops/agent-orchestrator/runs/<task_id>-<agent>.prompt.md
```

By default, it is plan-first and does not execute Codex:

```bash
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs
```

or explicitly:

```bash
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run
```

The script writes:

```bash
ops/agent-orchestrator/runs/agent-run-plan.md
```

The plan lists each runnable claimed task, owner, worktree path, prompt file, and a suggested Codex CLI command. When the CLI is detected, the command uses the detected absolute executable path instead of a bare `codex` command. The suggested command is not executed by this version.

Codex CLI flags differ by version. The runner reads:

```bash
codex exec --help
```

and adapts the generated command:

- If `-a` is supported, it adds `-a on-request`.
- Else if `--approval-policy` is supported, it adds `--approval-policy on-request`.
- Else it omits approval flags and records that the current CLI uses its default approval policy.
- If `--sandbox` is supported, it adds `--sandbox workspace-write`.
- Else it omits sandbox flags and records that the current CLI uses its default sandbox policy.

The runner intentionally never emits the legacy `--ask-for-approval` flag because not every Codex CLI version supports it.

Single-flag apply mode is still plan-first and does not run agents:

```bash
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --apply
```

Real execution requires both flags:

```bash
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --apply --execute
```

`--apply --execute` runs claimed tasks serially, never in parallel. Before executing it checks:

1. Codex CLI is detected and executable.
2. Main worktree is clean.
3. Each selected agent worktree is clean.
4. `task-locks.json` has a matching active lock.
5. `task-queue.json` status is `CLAIMED`.
6. The prompt file exists and matches `<task_id>-<agent>.prompt.md`.

Each task writes a log file:

```bash
ops/agent-orchestrator/runs/<task_id>-<agent>.run.log
```

If any Codex command exits non-zero, the runner stops and does not execute later tasks.

If the CLI is missing in execute mode, the runner aborts with:

```text
Codex CLI not found; cannot auto-run agents
```

Current automation layering:

1. Natural-language requirement -> `intake/current-request.md`, REQ, TECH, and `task-queue.json`.
2. `dispatch-ready-agents.mjs` -> automatic claim plus prompt generation.
3. `run-claimed-agent-prompts.mjs --dry-run` -> centralized agent execution plan.
4. `run-claimed-agent-prompts.mjs --apply` -> plan-first confirmation mode, still no execution.
5. `run-claimed-agent-prompts.mjs --apply --execute` -> guarded serial Codex CLI execution of already-CLAIMED tasks only.
6. `commit-agent-results.mjs --dry-run` -> inspect dirty agent worktrees, validate task path boundaries, and classify LOW/MEDIUM/HIGH risk.
7. `commit-agent-results.mjs --apply` -> commit eligible LOW/MEDIUM agent results to each agent branch without merge or push.

The runner does not automatically claim new tasks, merge, push, deploy, run migrations, run seeds, clean production data, or modify main. Those are intentionally kept out of the automated runner so the orchestrator can audit agent results and preserve human gates around release and production operations.

## 4C. Agent Result Commit Step

After Codex agents finish, their files may still be dirty in the agent worktrees. Those files are not merged directly into main. First, the orchestrator can inspect and, when safe, commit them to the corresponding agent branch:

```bash
node ops/agent-orchestrator/scripts/commit-agent-results.mjs --dry-run
node ops/agent-orchestrator/scripts/commit-agent-results.mjs --apply
```

Dry-run mode scans `agent-1` through `agent-5`, resolves the active claimed/done task from `task-locks.json`, `task-results.json`, and `task-queue.json`, validates dirty files against `allowed_paths` and `forbidden_paths`, prints a risk level, and suggests the commit message. It does not commit.

Apply mode commits only LOW and MEDIUM risk dirty worktrees. HIGH risk blocks the whole commit step. Queue bookkeeping files and the per-task result JSON are treated as orchestrator system files for task-boundary checks, while still contributing to risk classification.

Risk classes:

- `LOW`: `docs/**`, `ops/agent-orchestrator/reports/**`, `ops/agent-orchestrator/results/**`.
- `MEDIUM`: `ops/agent-orchestrator/queue/**`, `ops/agent-orchestrator/scripts/**`, `docs/testing/**`, `scripts/e2e/**`.
- `HIGH`: `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, auth, or deploy related paths.

## 4D. Agent Runner Prompt Files

Generated prompt files are based on:

```bash
ops/agent-orchestrator/prompts/agent-worker-prompt.md
```

Each prompt tells the agent to:

1. Identify itself and its worktree.
2. Read task details from `task-queue.json`.
3. Follow `allowed_paths` and `forbidden_paths`.
4. Run the task's `validation_commands`.
5. Record completion with `complete-task.mjs`.
6. Create a local commit when the task allows it.
7. Avoid merge and push.
8. Report changed files, commands, checks, commit hash, and risks.

## 4E. One-Click Controller

`orchestratorctl.mjs` is the high-level entrypoint for the main control window.

Status is read-only:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs status
```

It prints main and agent worktree branch, HEAD, clean state, ahead/behind, runtime dirt, and non-runtime dirt.

Reconcile is dry-run by default:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs reconcile --dry-run
```

It identifies runtime directories such as `storage/`, `.next/`, `coverage/`, and `tmp/`, and reports which agent branches are already included in `origin/main`.

Apply mode is explicit:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs reconcile --apply
```

Apply mode backs up runtime directories to `/tmp/jinhu-orchestrator-backup/<agent>/<timestamp>/`, aborts on non-runtime dirt, and resets only agent worktrees whose HEAD is already an ancestor of `origin/main`.

Integration planning is read-only:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs integrate --dry-run
```

It lists each agent branch with commits not in `origin/main`, changed files, and a risk class:

- `LOW`: `docs/**`, `ops/agent-orchestrator/reports/**`, or `ops/agent-orchestrator/results/**`.
- `MEDIUM`: queue bookkeeping, orchestrator scripts, `docs/testing/**`, or `scripts/e2e/**`.
- `HIGH`: `apps/api`, `apps/web`, `packages`, `database`, `infra`, auth, CI, Docker, or deploy paths.

Integration apply never merges back to main or pushes:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs integrate --apply
```

It creates an `integration/orchestrator-auto-YYYYMMDD-HHMMSS` branch from the current clean `main`, attempts agent merges in `agent-2 -> agent-3 -> agent-4 -> agent-5` order, preserves the integration branch version for queue JSON conflicts, calls `reconcile-task-results.mjs`, and aborts on business-code conflicts.

Current integration apply behavior:

1. Requires the main worktree to be clean and on `main`.
2. Requires candidate agent worktrees to be clean.
3. Refuses HIGH-risk candidates; these require human review because they may alter business code, schema, infra, auth, CI, Docker, or deploy behavior.
4. Creates `integration/orchestrator-auto-YYYYMMDD-HHMMSS` from current `main`.
5. Merges agent branches in `agent-2 -> agent-3 -> agent-4 -> agent-5` order.
6. Allows automatic conflict handling only for queue bookkeeping files:
   - `ops/agent-orchestrator/queue/task-queue.json`
   - `ops/agent-orchestrator/queue/task-locks.json`
   - `ops/agent-orchestrator/queue/task-results.json`
7. For queue bookkeeping conflicts, keeps the current integration branch version first, then runs `reconcile-task-results.mjs --apply` to rebuild queue state from merged result evidence.
8. Stops on any non-bookkeeping conflict.
9. After all agent merges, runs `check-dispatch-status.mjs`, `audit-all-results.mjs --dry-run`, and `pnpm typecheck`.
10. Writes `ops/agent-orchestrator/reports/integration-auto-YYYYMMDD-HHMMSS.md`.

After review, an integration branch can be brought back to main with:

```bash
git checkout main
git merge --ff-only integration/orchestrator-auto-YYYYMMDD-HHMMSS
git push origin main
```

Validation runs the non-writing audit path:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs validate
```

It runs:

```bash
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
pnpm typecheck
```

If `scripts/e2e/s5b-emergency-permit-smoke.mjs` changed in the current branch, it also runs:

```bash
node scripts/e2e/s5b-emergency-permit-smoke.mjs
```

Full-cycle dry-run plans the whole flow without writes:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs full-cycle --dry-run
```

Full-cycle apply performs reconcile, integration, and validation, then only suggests that a human may consider merge/push:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs full-cycle --apply
```

Agent-cycle is the guarded one-command pipeline for dispatching, running, auditing, integrating, validating, and optionally pushing agent work:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --apply
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --apply --push
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --apply --execute
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --apply --execute --push
```

Mode behavior:

- `--dry-run` runs only read-only planning commands. It does not update `runs/agent-run-plan.md`, does not dispatch, does not execute Codex, does not merge, and does not push.
- `--apply` does not execute Codex agents, but it may integrate already-committed LOW/MEDIUM agent results into a validated integration branch. It does not push.
- `--apply --push` may integrate already-committed LOW/MEDIUM agent results, validate the integration branch, fast-forward main, push `origin/main`, and sync agents.
- `--apply --execute` may run already-CLAIMED prompts through the Codex CLI serially, commit eligible LOW/MEDIUM dirty agent results to their agent branches, reject HIGH-risk changes, create an integration branch for LOW/MEDIUM changes, and run validation. It does not push.
- `--apply --execute --push` may push committed main changes, sync agent worktrees, dispatch claimable READY tasks, commit dispatch state, execute claimed prompts serially, commit eligible agent results, integrate LOW/MEDIUM results, validate, fast-forward main from the integration branch, push `origin/main`, and sync agents again.

Agent-cycle preflight checks main cleanliness, agent worktree cleanliness, JSON parseability for queue/locks/results, Codex CLI availability, active locks, and main ahead/behind state. Agent runtime dirt under `storage/`, `.next/`, `coverage/`, or `tmp/` can be backed up by the reconcile step; non-runtime dirt stops the pipeline. HIGH-risk changes under `apps/api`, `apps/web`, `packages`, `database`, `infra`, auth, CI, Docker, or deploy paths are never auto-integrated.

If `main` is ahead of `origin/main` and `--push` is not present, agent-cycle stops before steps that require remote synchronization and prints the required next action. The command never runs production deploy, production migration, production seed, database reset, cleanup, destructive file operations, or unattended production operations.

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
- `agent_changed_files`
- `orchestrator_changed_files`
- `commands_run`
- `passed_checks`
- `failed_checks`
- `notes`

The script writes the preferred per-task result file:

```bash
ops/agent-orchestrator/results/<task_id>.json
```

It also updates `queue/task-results.json` for backward compatibility and updates the task status to `DONE` or `FAILED`. It does not merge or push.

`complete-task.mjs` separates changed files into:

- `agent_changed_files`: files the agent actually changed for task evidence or implementation.
- `orchestrator_changed_files`: system bookkeeping files maintained by the queue workflow.

The current bookkeeping files are:

- `ops/agent-orchestrator/queue/task-queue.json`
- `ops/agent-orchestrator/queue/task-locks.json`
- `ops/agent-orchestrator/queue/task-results.json`

Historical records may still have these files in `changed_files`; audit scripts ignore them for task path-boundary checks.

`task-results.json` should be treated as a generated aggregate. When agent branches conflict on queue JSON files, the orchestrator should preserve the integration branch version and run:

```bash
node ops/agent-orchestrator/scripts/reconcile-task-results.mjs --apply
```

## 6. Orchestrator Audit Flow

The orchestrator audits a completed task by task id:

```bash
node ops/agent-orchestrator/scripts/audit-agent-result.mjs TASK_ID
```

The audit checks:

1. Every real agent-changed file is inside the task's `allowed_paths`.
2. No real agent-changed file matches the task's `forbidden_paths`.
3. Queue bookkeeping files are ignored for task path-boundary checks because they are maintained by the orchestrator workflow.

If the audit passes, the script prints `AUDIT_PASS` and marks the task `AUDITED`.

If the audit fails, the script prints `AUDIT_FAIL` and each reason. Failed audits should become follow-up tasks or manual review items.

To audit every DONE task result in one pass:

```bash
node ops/agent-orchestrator/scripts/audit-all-results.mjs
```

This reuses the same path-boundary logic as `audit-agent-result.mjs` and prints `AUDIT_PASS` or `AUDIT_FAIL` for each DONE task.

By default it is no-write and does not modify `task-queue.json`. `--dry-run` and `--no-write` are aliases for the default behavior.

Only this explicit mode writes `AUDITED` status back to the queue:

```bash
node ops/agent-orchestrator/scripts/audit-all-results.mjs --write
```

## 7. Merge Gate After Audit

After `AUDIT_PASS`, the orchestrator may inspect merge readiness with the existing scripts:

```bash
./ops/agent-orchestrator/check-status.sh
./ops/agent-orchestrator/check-merge-candidate.sh agent-2
pnpm typecheck
```

Run relevant e2e commands based on the task domain. Do not suggest push if `pnpm typecheck` or relevant e2e fails.

Only after human confirmation should the orchestrator run merge and push commands.

Full high-level flow:

1. Capture the user's natural-language request in `intake/current-request.md`.
2. Generate REQ / TECH specs under `specs/`.
3. Generate READY tasks in `queue/task-queue.json`.
4. Run `dispatch-ready-agents.mjs --dry-run` to preview dispatch.
5. Run `dispatch-ready-agents.mjs` only when it is acceptable to claim tasks.
6. Run `run-claimed-agent-prompts.mjs --dry-run` to generate `runs/agent-run-plan.md`.
7. Either use the plan to start each agent manually, or run `run-claimed-agent-prompts.mjs --apply --execute` for guarded serial Codex CLI execution.
8. After execution, inspect each agent worktree with `commit-agent-results.mjs --dry-run`; then use `commit-agent-results.mjs --apply` to create agent branch commits when risk is LOW/MEDIUM.
9. Agents complete work and record results with `complete-task.mjs`.
10. Run `audit-all-results.mjs`.
11. For passing tasks, run `check-merge-candidate.sh`, `orchestratorctl.mjs integrate --dry-run`, `pnpm typecheck`, and relevant e2e.
12. Ask for human confirmation before merge or push unless using the explicit guarded `agent-cycle --apply --execute --push` path.

One-click high-level flow:

1. Generate REQ / TECH / task queue from natural language.
2. Preview dispatch or integration with dry-run commands.
3. Run `orchestratorctl.mjs full-cycle --dry-run` for a no-write plan.
4. Run `orchestratorctl.mjs full-cycle --apply` only when the operator accepts runtime backup/reset and integration branch creation.
5. For agent execution, run `orchestratorctl.mjs agent-cycle --dry-run` first.
6. Run `orchestratorctl.mjs agent-cycle --apply` to integrate already-committed agent results without running Codex.
7. Run `orchestratorctl.mjs agent-cycle --apply --execute` only when Codex agent execution is intended.
8. Run `orchestratorctl.mjs agent-cycle --apply --push` or `orchestratorctl.mjs agent-cycle --apply --execute --push` only when automatic main push and final agent sync are explicitly approved.
9. Review the integration branch and validation output before accepting any release decision.

## 8. Actions Requiring Human Confirmation

These actions require explicit human confirmation or an explicit guarded flag:

- `git merge`
- `git push`
- production deploy
- production data writes
- production seed, cleanup, reset, or destructive database operations
- migration creation
- old migration edits
- auth, CI, Docker, deploy, SMS, or WeChat runtime configuration changes

The task queue can mark these with `requires_human_approval: true`.

`orchestratorctl.mjs agent-cycle --apply --execute --push` is the only orchestrator path that may push `main`, and only after preflight, agent execution, LOW/MEDIUM integration, and validation pass. It still does not deploy or run production data operations.

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
- `run-claimed-agent-prompts.mjs --apply --execute` can execute Codex agents serially, but it still does not merge, push, deploy, mutate queue state, or run production operations by itself.
- `commit-agent-results.mjs --apply` commits only eligible LOW/MEDIUM dirty agent outputs. It does not merge or push.
- `orchestratorctl.mjs agent-cycle --apply --execute --push` can push `main` after validation, but deploy and production operations remain outside this automation.
