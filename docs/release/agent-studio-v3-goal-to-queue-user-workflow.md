# Agent Studio V3 Goal-to-Queue User Workflow

Date: 2026-06-22
Status: user workflow documentation, dry-run first
Task: `AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS`
Related goal: `GOAL-AGENT-STUDIO-98`

## 1. Purpose

This document explains how an operator uses Agent Studio V3 to turn a natural-language goal into reviewed queue candidates and an agent-cycle dry-run.

The example goal is:

```text
继续把 Agent Studio 提升到 98%
```

The workflow is review-first. It does not authorize business code changes, production operations, deploy, migration, seed, cleanup, reset, merge, push, or unattended agent execution.

## 2. Workflow At A Glance

```text
operator enters natural-language goal
-> goal-to-queue dry-run
-> Goal Engine state and Planner output preview
-> task queue candidates with owners, risks, paths, checks, and expected files
-> operator review
-> optional approved queue write in a separate step
-> autonomous-loop dry-run
-> Resident Observer dry-run, agent-cycle dry-run, and doctor review
-> separate approval before any real agent execution
```

The important user promise is that natural language creates reviewable planning evidence before it creates executable work.

## 3. Step 1: Natural-Language Goal Entry

The operator starts with a goal, not a hand-written task list:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs goal-to-queue --text "继续把 Agent Studio 提升到 98%" --dry-run
```

In dry-run mode, the command previews:

- `goal_id` and `planner_output_id`;
- generated task candidates;
- recommended worker owners;
- priority and risk;
- allowed and forbidden paths;
- expected output files;
- validation commands;
- dispatch mode such as `READY only; dispatch later through agent-cycle`.

Dry-run mode must not write goal files, planner files, task events, queue read models, locks, results, reports, run prompts, or evolution files.

## 4. Step 2: Queue Candidate Review

The operator reviews each generated task candidate before any queue write is approved.

Review the following fields:

| Field | User question |
|---|---|
| `task_id` and title | Is this a real step toward the goal? |
| `owner` | Is the task assigned to the correct worker agent lane? |
| `domain` | Does the domain match the work? |
| `priority` and `risk` | Does the risk level match the paths and operations? |
| `allowed_paths` | Are writes limited to the reviewed scope? |
| `forbidden_paths` | Are business, production, auth, deploy, Docker, CI, database, migration, seed, and secret paths blocked? |
| `acceptance` | Can a reviewer tell whether the task is done? |
| `validation_commands` | Are the checks no-write or explicitly approved? |
| `expected_output_files` | Are outputs limited to docs, reports, results, or other approved artifacts? |

For the current V3-F goal, the user-facing workflow task is owned by `agent-1` and is limited to release docs plus orchestrator report/result files.

## 5. Optional Approved Queue Write

If the operator approves the reviewed queue candidates in a separate step, `goal-to-queue --apply` may write the generated Goal Engine artifact, Planner artifact, `task.created` events, compatibility queue read models, and Evolution Center learning entry.

That apply step still does not dispatch agents, claim tasks, execute Codex, merge, push, deploy, run production operations, migrate, seed, reset, prune, clean up runtime state, or write production data.

After queue candidates become READY tasks, agent execution still flows through the existing agent-cycle approval and validation path.

## 6. Step 3: Autonomous-Loop Dry-Run

The operator can preview the full goal-to-agent-cycle review path with:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs autonomous-loop --text "继续把 Agent Studio 提升到 98%" --dry-run
```

The MVP autonomous loop supports dry-run only. It chains:

1. `goal-to-queue --dry-run`
2. `observe --dry-run`
3. `agent-cycle --dry-run`
4. `doctor`

This gives the operator one consolidated preview of:

- how the goal would become task candidates;
- what the Resident Observer sees in the current delivery system;
- whether the agent-cycle plan is healthy enough to proceed later;
- whether doctor reports a blocker.

The autonomous-loop dry-run must not execute worker agents or write generated queue changes.

## 7. Resident Observer Versus Worker Agents

Resident Observer is the Evolution Center monitoring capability. It is not a worker agent and does not create `agent-6`.

| Capability | Worker agents | Resident Observer |
|---|---|---|
| Identity | `agent-1` through `agent-5` | Platform-level Evolution Center capability |
| Primary job | Complete scoped tasks in assigned lanes | Observe health, failures, patterns, and improvement candidates |
| Queue ownership | Owns and claims tasks | Does not own or claim tasks |
| File changes | May modify files inside task `allowed_paths` | Dry-run reads state only; apply records observation artifacts when separately approved |
| Execution role | Runs validation and records task result | Reports findings and suggested improvements |
| User interpretation | A worker responsible for delivery | A monitoring and learning surface, not a delivery lane |

Resident Observer may suggest improvement tasks, but those suggestions remain review-first. They must not enter the queue or agent-cycle execution without explicit approval.

## 8. Worker Agent Lanes

The current orchestrator keeps five worker lanes:

| Agent | User-facing responsibility |
|---|---|
| `agent-1` | Assets, space, tenants, documentation, portal/UI assistance, runtime documentation index |
| `agent-2` | Validation, compatibility, finance, test matrix, doctor/audit/typecheck runbooks |
| `agent-3` | Work orders, safety, IoT, energy, event/read-model consistency |
| `agent-4` | Dashboard, mobile, menus, RBAC, selector and regression acceptance |
| `agent-5` | Testing, release acceptance, production readiness, platform architecture |

Generated tasks should name exactly one worker owner. Resident Observer findings can influence recommended tasks, but they do not replace owner assignment.

## 9. User Safety Rules

Operators should treat these boundaries as product behavior:

- Natural-language intake starts with dry-run planning.
- Dry-run output is evidence, not execution approval.
- Queue writes require separate approval.
- Agent execution requires a reviewed agent-cycle path.
- `autonomous-loop` MVP is dry-run only.
- Resident Observer is not a worker agent.
- High-risk paths and production operations stay blocked unless a separate approved task explicitly allows them.
- Merge and push are never implied by goal entry, queue generation, or autonomous-loop dry-run.

## 10. Completion Evidence

For this workflow task, completion evidence should include:

- this release workflow document;
- the task report at `ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS.md`;
- the result JSON at `ops/agent-orchestrator/results/AGENT-PLATFORM-V3-F-A1-STUDIO-WORKFLOW-DOCS.json`;
- successful dry-run validation for `goal-to-queue` and `autonomous-loop`;
- final `git status --short` showing no business code, production runtime, auth, deploy, Docker, CI, migration, seed, database, or secret-path edits.
