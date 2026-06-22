# Agent Studio V3 Planner Output Validation

Task: `AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION`
Batch: `AGENT-PLATFORM-V3-F-GOAL-TO-QUEUE`
Owner: `agent-3`
Date: 2026-06-22

## Scope

This checklist validates the current Goal-to-Queue Planner output for `GOAL-AGENT-STUDIO-98`.

It covers:

- required planner output fields;
- required task candidate fields;
- owner assignment explanations;
- expected output file declarations;
- dry-run behavior that must not write queue, event, lock, result, prompt, business, deployment, or environment files.

It does not execute Agents, merge, push, deploy, run migrations, run seeds, reset data, prune resources, or modify business code.

## Planner Contract Check

Run from the repository root:

```bash
node ops/agent-orchestrator/planner/validate-planner-output.mjs
```

The validator reads:

```text
ops/agent-orchestrator/planner/planner-output.schema.json
ops/agent-orchestrator/planner/generated/PLAN-GOAL-AGENT-STUDIO-98.json
```

Pass criteria:

- top-level planner fields include `version`, `planner_output_id`, `source_goal_id`, `req_summary`, `tech_summary`, `tasks`, `agent_assignments`, `risk_assessment`, `validation_commands`, `expected_outputs`, and `created_at`;
- each task candidate includes `task_id`, `batch_id`, `source_goal_id`, `title`, `owner`, `owner_assignment_reason`, `domain`, `priority`, `status`, `risk`, `allowed_paths`, `forbidden_paths`, `acceptance`, `validation_commands`, `requires_human_approval`, `expected_output_files`, `created_at`, and `updated_at`;
- every task candidate has `status: READY`;
- every owner is one of `agent-1` through `agent-5`;
- every assignment references known task ids and matches each task's owner;
- every `expected_outputs[]` item references a known task id and a path listed in that task's `expected_output_files`;
- expected output paths are inside the task candidate's `allowed_paths` and outside `forbidden_paths`;
- validation commands do not contain write-risk operations such as `--apply`, production deploy, migration, seed, cleanup, reset, prune, merge, push, or `complete-task.mjs` without an explicit dry-run boundary;
- no undeclared fields appear in strict planner objects.

## Owner Assignment Explanation

The runtime must expose both per-task and grouped owner rationale.

Per-task field:

```text
tasks[].owner_assignment_reason
```

Grouped field:

```text
agent_assignments[].reason
```

For the current generated plan, the expected per-task owner explanations are Registry-backed preferred-owner checks:

| Task | Owner | Required explanation shape |
|---|---|---|
| `AGENT-PLATFORM-V3-F-A5-GOAL-CLI-HARDENING` | `agent-5` | Preferred owner validated against Agent Registry. |
| `AGENT-PLATFORM-V3-F-A3-PLANNER-OUTPUT-VALIDATION` | `agent-3` | Preferred owner validated against Agent Registry. |
| `AGENT-PLATFORM-V3-F-A4-REGISTRY-RUNTIME-ADAPTER` | `agent-4` | Preferred owner validated against Agent Registry. |
| `AGENT-PLATFORM-V3-F-A2-GOAL-QUEUE-VALIDATION` | `agent-2` | Preferred owner validated against Agent Registry. |
| `AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS` | `agent-1` | Preferred owner validated against Agent Registry. |

If a future task has no valid preferred owner, the planner must record the router keyword or fallback reason before the task candidate can be reviewed.

## Expected Output Explanation

The runtime must expose expected outputs in two places:

```text
tasks[].expected_output_files
expected_outputs[]
```

Pass criteria:

- every task candidate lists at least one expected output file;
- every listed output file has a matching top-level `expected_outputs[]` item with the same `task_id` and `path`;
- every expected output path is under that task's allowed path boundary;
- no expected output path is under `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, auth, or environment paths unless a later approved task explicitly allows it.

## Dry-Run No-Write Check

Run the task validation command:

```bash
node ops/agent-orchestrator/scripts/goal-to-queue.mjs --text "继续把 Agent Studio 提升到 98%" --dry-run
```

Pass criteria:

- output shows `mode: dry-run`;
- output prints `planner_output_id: PLAN-GOAL-AGENT-STUDIO-98`;
- output prints task candidates with owner reason, expected files, and validation commands;
- output ends with the explicit dry-run statement that no goal, planner, event, queue, lock, result, or evolution files were modified.

Confirm no unexpected write by comparing `git status --short` before and after the dry-run. Only this task's approved planner, docs, report, result, and commit-related changes may appear.

## Dispatch Status Check

Run:

```bash
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
```

Pass criteria:

- the command exits 0;
- dispatch status can be inspected without claiming, locking, or executing tasks;
- no production, database, deploy, auth, Docker, or business-code operation is run.

## Failure Handling

Treat any of these outcomes as a failed validation:

- missing required planner or task candidate field;
- missing owner assignment reason;
- unknown owner;
- expected output path outside allowed boundaries;
- expected output path under forbidden boundaries;
- dry-run command mutates queue, event, lock, result, prompt, business, deployment, or environment files;
- dispatch status command claims, locks, executes, merges, pushes, or runs production operations.

On failure, stop and report the exact failed check. Do not promote Planner output into live queue work.
