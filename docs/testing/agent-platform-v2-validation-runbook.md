# Agent Platform V2 Validation Runbook

Task: `AGENT-PLATFORM-V2-A2-VALIDATION-RUNBOOK`
Batch: `AGENT-PLATFORM-V2-RESOURCE-READINESS-20260622`
Owner: `agent-2`
Date: 2026-06-22

## 1. Scope

This runbook defines the standard validation order for Agent Platform V2 queue, event, audit, and workspace readiness checks.

Use it from the repository root. The default path is diagnostic and no-write. Apply-capable commands are called out explicitly and must not be used as a hidden repair step during Agent task execution.

This runbook does not authorize merge, push, production deploy, production migration, production seed, database reset, Docker cleanup, destructive cleanup, or production data operations.

## 2. Baseline Sequence

Run the sequence in this order when validating an Agent Platform V2 task or readiness batch.

### Step 0: Worktree Boundary Check

```bash
git status --short
```

Expected:

- Only files allowed by the active task are dirty.
- No business code, database, infra, auth, CI, Docker, deploy, environment, migration, seed, or production data path is dirty unless the active task explicitly allows it and approval is recorded.
- If this is an Agent worker task with `allow_commit=false`, leave the changes uncommitted for orchestrator commit handling.

### Step 1: Doctor Orientation

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
```

Expected:

- Doctor exits and prints a `GO`, `CONDITIONAL_GO`, or `NO_GO` summary.
- Findings are grouped by `git`, `queue`, `locks`, `runner`, `integration`, and `validation`.
- Default doctor remains diagnostic. It does not run Agents, merge, push, deploy, migrate, seed, reset, prune, or clean up production resources.
- Default doctor checks `check-dispatch-status.mjs` and `audit-all-results.mjs --dry-run`; `pnpm typecheck` is intentionally skipped unless `doctor --deep` is requested.

Allowed follow-up:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor --json
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor --fix-dry-run
```

Use `doctor --fix-apply` only when the operator has reviewed the printed LOW-risk repair list. It must not be used to fix business code, HIGH-risk changes, merge conflicts, pushes, deploys, production migrations, production seeds, database resets, or cleanup.

### Step 2: Event Read-Model Drift Check

```bash
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run
```

Expected:

- The command validates task, lock, result, and audit events.
- The command reports whether compatibility read models would change.
- No queue JSON, lock JSON, result JSON, event file, report, prompt, run log, or timestamp changes in dry-run mode.

If dry-run reports drift:

- Inspect whether the drift is expected from recent `complete-task.mjs`, dispatch, audit, or integration events.
- Treat corrupt events, duplicate conflicting event IDs, duplicate active locks, or unsupported event schemas as blockers.
- Run apply only as an explicit orchestrator repair or materialization step:

```bash
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --apply
```

Apply mode writes compatibility queue, lock, and result read models from events. Do not hide this write inside a worker task unless the task explicitly requires completion recording or read-model repair.

### Step 3: Dispatch Status Check

```bash
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
```

Expected:

- Queue, lock, and result state parse successfully.
- READY, CLAIMED, DONE, FAILED, BLOCKED, and AUDITED counts are visible.
- Each CLAIMED task has the expected active owner and lock.
- DONE and AUDITED tasks do not still appear claimable.
- The command writes nothing.

Stop if status output shows duplicate active locks, CLAIMED tasks without locks, DONE tasks with stale locks, missing result evidence, corrupt events, or unreadable queue JSON.

### Step 4: Audit Dry-Run

```bash
node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
```

Expected:

- Every DONE result is checked against task ownership and allowed-path boundaries.
- The command prints `AUDIT_PASS` or `AUDIT_FAIL` per result.
- Dry-run remains no-write and does not mark tasks AUDITED.

If audit fails:

- Do not integrate the task.
- Record the failing task, changed file, and failure reason.
- Open a follow-up task or request human review.

Only the explicit apply path writes audit events and materializes AUDITED status:

```bash
node ops/agent-orchestrator/scripts/audit-all-results.mjs --apply
```

Use apply only when the operator intends to move passing DONE tasks into AUDITED state.

### Step 5: Whitespace Gate

```bash
git diff --check
```

Expected:

- No trailing whitespace, whitespace-at-end-of-file, or patch-format errors.
- Failure is a local fix requirement before typecheck or readiness sign-off.

### Step 6: Typecheck Gate

```bash
pnpm typecheck
```

Expected:

- Workspace typecheck passes.
- Failure blocks readiness, even when doctor and audit dry-run pass.
- If dependencies are unavailable in the current checkout, record the command as blocked with the exact missing dependency reason and rerun in an environment with dependencies installed.

Doctor's default run is not a substitute for this command because default doctor skips typecheck. Use `doctor --deep` only when the operator wants doctor to include slower verification.

### Step 7: Final Status Snapshot

```bash
git status --short
```

Expected:

- Dirty files match the task's intended outputs and any explicit orchestrator completion bookkeeping.
- No forbidden business, database, infra, auth, CI, Docker, deploy, migration, seed, production config, or production data path is dirty.
- If completion was recorded through `complete-task.mjs`, the result JSON and generated compatibility read-model files are visible as orchestrator bookkeeping.

## 3. Pass, Conditional, And Stop Rules

| Outcome | Required evidence |
|---|---|
| Pass | Doctor has no blocker, read-model dry-run has no unexpected drift, dispatch status parses, audit dry-run passes or has no DONE tasks to audit, `git diff --check` passes, and `pnpm typecheck` passes. |
| Conditional | Doctor reports unrelated dirty Agent worktrees or expected in-progress task files, but no queue/event corruption, forbidden path change, audit failure, whitespace failure, or typecheck failure exists. Record the condition and owner. |
| Stop | Corrupt event, duplicate conflicting event, duplicate active lock, forbidden path change, failed audit, unreadable queue JSON, `git diff --check` failure, or `pnpm typecheck` failure. |

## 4. Command Safety Summary

| Command | Default write behavior | Notes |
|---|---|---|
| `orchestratorctl.mjs doctor` | No write | Diagnostics only; default skips typecheck. |
| `orchestratorctl.mjs doctor --fix-dry-run` | No write | Prints LOW-risk repair plan. |
| `orchestratorctl.mjs doctor --fix-apply` | Writes narrow LOW-risk repairs | Requires operator review first. |
| `rebuild-queue-read-model.mjs --dry-run` | No write | Preferred drift check. |
| `rebuild-queue-read-model.mjs --apply` | Writes generated read models | Use only for explicit repair/materialization. |
| `check-dispatch-status.mjs` | No write | Status and compatibility parser check. |
| `audit-all-results.mjs --dry-run` | No write | Preferred audit gate. |
| `audit-all-results.mjs --apply` | Writes audit events and read models | Use only to mark passing results AUDITED. |
| `git diff --check` | No write | Whitespace gate. |
| `pnpm typecheck` | No write to source | Workspace type gate; dependency/cache behavior depends on local environment. |

## 5. Required Evidence Fields

For each validation run, record:

- Task ID, batch ID, branch, Agent, and timestamp.
- Exact commands run and whether each was Pass, Fail, Blocked, or Skipped.
- Doctor summary and any BLOCKER/ERROR findings.
- Read-model dry-run drift summary.
- Dispatch status counts for READY, CLAIMED, DONE, FAILED, BLOCKED, and AUDITED.
- Audit dry-run result count and failure reasons, if any.
- `git diff --check` result.
- `pnpm typecheck` result or exact blocked reason.
- Final dirty-file list and confirmation that merge, push, deploy, production operations, destructive cleanup, migrations, and seeds were not run.
