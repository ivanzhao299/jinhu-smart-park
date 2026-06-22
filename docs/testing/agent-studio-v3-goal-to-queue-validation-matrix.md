# Agent Studio V3 Goal-to-Queue Validation Matrix

Task: `AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION`
Batch: `AGENT-PLATFORM-V3-F-GOAL-TO-QUEUE`
Owner: `agent-2`
Date: 2026-06-22

## 1. Scope

This matrix validates the Goal-to-Queue path for the source goal `GOAL-AGENT-STUDIO-98` and goal text `继续把 Agent Studio 提升到 98%`.

It covers:

- goal generation;
- planner output;
- `task.created` events;
- queue read-model rebuild;
- `agent-cycle --dry-run`;
- base gates for audit, typecheck, and doctor diagnostics.

This document is validation planning and evidence guidance only. It does not authorize production deploys, migrations, seeds, cleanup, reset, prune, truncate, database writes, business-code changes, merge, push, or Agent execution.

## 2. Flow Under Test

```text
natural-language goal
-> goal-to-queue dry-run preview
-> generated goal artifact
-> generated planner artifact
-> event-first task.created records
-> compatibility queue read models
-> dispatch status check
-> doctor/audit/typecheck base gates
-> agent-cycle dry-run preview
```

The current batch artifacts are:

| Artifact | Expected location |
|---|---|
| Generated goal | `ops/agent-orchestrator/goal/generated/GOAL-AGENT-STUDIO-98.json` |
| Generated planner output | `ops/agent-orchestrator/planner/generated/PLAN-GOAL-AGENT-STUDIO-98.json` |
| Generated tasks | `ops/agent-orchestrator/queue/task-queue.json` entries with batch `AGENT-PLATFORM-V3-F-GOAL-TO-QUEUE` |
| Task events | `ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-*/**-task.created-*.json` |
| Read models | `ops/agent-orchestrator/queue/task-queue.json`, `task-locks.json`, and `task-results.json` |

## 3. Base Gates

These gates are required before Goal-to-Queue output is considered ready for execution handoff:

| Gate | Command | Required outcome | Writes allowed |
|---|---|---|---|
| Dispatch status | `node ops/agent-orchestrator/scripts/check-dispatch-status.mjs` | Queue, locks, and results parse; task statuses and claim readiness are readable. | No |
| Audit dry-run | `node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run` | DONE task results audit without marking queue entries audited. | No |
| Doctor | `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor` | Health result is GO, CONDITIONAL_GO, or actionable NO_GO; default mode is diagnostic. | No |
| Typecheck | `pnpm typecheck` | Workspace typecheck passes. | No intended writes |

Recommended deeper gates for readiness review:

| Gate | Command | Required outcome | Writes allowed |
|---|---|---|---|
| Read-model drift | `node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run` | Reports whether queue, lock, and result read models differ from events; dry-run writes nothing. | No |
| Goal preview | `node ops/agent-orchestrator/scripts/goal-to-queue.mjs --text "继续把 Agent Studio 提升到 98%" --dry-run` | Prints `goal_id`, `planner_output_id`, task candidates, owners, risks, outputs, and validations. | No |
| Cycle preview | `node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run` | Previews dispatch/runner/commit/integration path without executing Agents, merge, push, deploy, or production operations. | No |

## 4. Validation Matrix

| Case | Area | Validation | Pass criteria | Failure handling |
|---|---|---|---|---|
| GQ-01 | Goal generation | Parse `GOAL-AGENT-STUDIO-98.json`. | JSON parses; `goal_id` is `GOAL-AGENT-STUDIO-98`; goal text matches the requested natural-language goal. | Stop before planner or queue checks use the goal. |
| GQ-02 | Goal maturity | Inspect `current_maturity`, `target_maturity`, capability scores, gaps, milestones, and risks. | Maturity scores are 0-100; target is greater than or equal to current; gap/risk fields explain goal-to-queue and autonomous-loop work. | Treat as invalid goal state; regenerate or repair through an approved task. |
| GQ-03 | Goal recommended tasks | Inspect `recommended_tasks[]`. | Includes the five `AGENT-PLATFORM-V3-F-*` task ids, owners `agent-1` through `agent-5`, priority, risk, and expected output text. | Block queue handoff until task candidates are complete. |
| PLAN-01 | Planner output | Parse `PLAN-GOAL-AGENT-STUDIO-98.json`. | JSON parses; `planner_output_id` is `PLAN-GOAL-AGENT-STUDIO-98`; `source_goal_id` points to `GOAL-AGENT-STUDIO-98`. | Stop before queue/event validation. |
| PLAN-02 | Planner summaries | Inspect `req_summary` and `tech_summary`. | Both summaries include non-goals for no Agent execution, no deploy/production operation, no business-code change, no dispatch/claim, and no merge/push. | Require planner repair before execution handoff. |
| PLAN-03 | Planner task candidates | Inspect `tasks[]`. | Every task has `task_id`, owner, domain, priority, risk, allowed paths, forbidden paths, acceptance, validation commands, expected outputs, batch id, source goal id, and approval flag. | Reject malformed candidates before they become queue state. |
| PLAN-04 | Owner assignment | Inspect owner and `owner_assignment_reason`. | Owners are known `agent-1` through `agent-5`; reasons cite Agent Registry validation or conservative routing. | Block dispatch because ownership is ambiguous. |
| PLAN-05 | Boundary preservation | Inspect allowed and forbidden paths for every candidate. | Generated tasks keep forbidden paths for `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, auth, and env patterns unless a later approved task explicitly expands scope. | Treat as unsafe generated scope and fail the matrix. |
| EVT-01 | Task-created event presence | Check `ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V3-F-*/*task.created*.json`. | One `task.created` event exists for each generated batch task. | Rebuild is not trusted; require explicit event repair. |
| EVT-02 | Event source linkage | Inspect each `task.created` event metadata. | Events contain `source_goal_id=GOAL-AGENT-STUDIO-98`, `planner_output_id=PLAN-GOAL-AGENT-STUDIO-98`, and a `goal-to-queue:*` idempotency key. | Fail event lineage validation. |
| EVT-03 | Event snapshot | Inspect `metadata.task_snapshot`. | Snapshot contains the same owner, status, boundaries, validation commands, and expected outputs as planner/queue task state. | Fail with event/read-model drift. |
| RM-01 | Read-model parse | Run dispatch status or parse queue/lock/result JSON directly. | Compatibility read models parse and expose queue statuses, locks, and results. | Stop; do not run agent-cycle previews. |
| RM-02 | Read-model rebuild | Run `rebuild-queue-read-model.mjs --dry-run`. | Command exits 0 and reports changed flags; no compatibility JSON is written in dry-run mode. | If drift is unexpected, require explicit repair plan before apply. |
| RM-03 | Queue projection | Inspect V3-F queue tasks. | Generated tasks are present in `task-queue.json`; current statuses reflect lifecycle events such as READY, CLAIMED, DONE, or FAILED. | Fail projection consistency. |
| CYCLE-01 | Agent-cycle dry-run | Run `orchestratorctl.mjs agent-cycle --dry-run` after base gates. | Dry-run exits without Agent execution, merge, push, deploy, production operation, migration, seed, cleanup, reset, prune, or queue mutation. | Treat as NO_GO for execution handoff. |
| CYCLE-02 | No-write evidence | Compare `git status --short` before and after dry-run checks. | Only current task documentation/report/result and expected completion bookkeeping appear. | Investigate any unexpected runtime or business-path writes. |
| BASE-01 | Audit gate | Run `audit-all-results.mjs --dry-run`. | DONE results audit without writing task audit events or changing queue status. | Fix result metadata or changed-file boundaries before handoff. |
| BASE-02 | Doctor gate | Run `orchestratorctl.mjs doctor`. | Reports actionable health; dirty worktree findings are explainable and not hidden execution. | Resolve blockers before execution. |
| BASE-03 | Typecheck gate | Run `pnpm typecheck`. | Typecheck passes. | Mark task or handoff as failed until fixed. |

## 5. Negative Matrix

| Case | Risk covered | Setup | Expected result |
|---|---|---|---|
| NEG-01 | Missing generated goal | Remove or rename the generated goal in a fixture copy. | Goal validation fails before planner checks. |
| NEG-02 | Planner/source mismatch | Planner output references a different `source_goal_id`. | Planner validation fails and queue handoff is blocked. |
| NEG-03 | Missing task boundary | Candidate lacks `allowed_paths`, `forbidden_paths`, validation commands, or expected outputs. | Planner task candidate validation fails. |
| NEG-04 | Forbidden path allowed | Candidate allows business, database, auth, CI, Docker, deploy, env, migration, seed, or production data paths without explicit approval. | Boundary validation fails. |
| NEG-05 | Missing `task.created` | Queue task exists without a matching event in a fixture copy. | Event/read-model validation fails. |
| NEG-06 | Event lineage drift | Event metadata lacks the goal id, planner id, or idempotency key. | Event source validation fails. |
| NEG-07 | Read-model drift | Rebuild dry-run reports unexpected queue/lock/result differences. | Operator must run an approved repair path before execution. |
| NEG-08 | Audit failure | DONE result changed files exceed task allowed paths. | Audit dry-run exits non-zero; task remains unaudited. |
| NEG-09 | Doctor blocker | Doctor reports corrupt queue, duplicate locks, unsafe dirty files, or failed scripts. | Execution handoff is NO_GO. |
| NEG-10 | Agent-cycle mutation | `agent-cycle --dry-run` mutates queue, events, prompts, reports, results, logs, timestamps, or business paths. | Dry-run safety fails; do not execute Agents. |

## 6. Suggested Command Bundle

Run from the repository root for a no-write review:

```bash
git status --short
node ops/agent-orchestrator/scripts/goal-to-queue.mjs --text "继续把 Agent Studio 提升到 98%" --dry-run
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run
node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
pnpm typecheck
git diff --check
git status --short
```

The task-local required commands are narrower:

```bash
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
pnpm typecheck
```

## 7. Pass Criteria

The Goal-to-Queue validation path is `GO` when:

- generated goal and planner artifacts parse and link to each other;
- generated planner tasks include owners, risks, path boundaries, acceptance criteria, validation commands, and expected outputs;
- every generated task has a `task.created` event with goal/planner lineage;
- read-model rebuild dry-run is understood and does not write files;
- dispatch status, audit dry-run, doctor, and typecheck gates pass or produce only explained non-blocking conditions;
- `agent-cycle --dry-run` does not execute Agents and does not write queue, event, result, business, database, auth, CI, Docker, deploy, env, production, merge, or push state.

The path is `NO_GO` when any artifact is malformed, event lineage is missing, read-model drift is unexplained, audit/typecheck/doctor has blockers, or a dry-run mutates files unexpectedly.
