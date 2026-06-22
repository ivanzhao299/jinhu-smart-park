# Agent Platform V3 Planner Runtime Flow

Task: `AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME`
Batch: `AGENT-PLATFORM-V3-ROUND1-20260622`
Owner: `agent-3`
Date: 2026-06-22

## 1. Scope

This document defines how Agent Platform V3 Planner output is converted into planning artifacts:

- REQ draft
- TECH draft
- task queue draft
- dispatch plan
- validation plan

This is a planning-only runtime flow. It does not execute Agents, claim tasks, write live queue state from planner output, merge, push, deploy, migrate, seed, reset, prune, or modify business code.

## 2. Planner Output Contract

The Planner output contract is defined by:

```text
ops/agent-orchestrator/planner/planner-output.schema.json
```

The schema is strict at the top level and in nested objects through `additionalProperties: false`. A planner result is valid only when it contains the required fields and uses the declared enums for agent ids, priority, risk, and dispatch mode.

Required top-level fields:

| Field | Runtime purpose |
|---|---|
| `version` | Planner output schema version. |
| `planner_output_id` | Stable id for the generated planner artifact. |
| `source_goal_id` | Links the output back to a Goal Engine record. |
| `req_summary` | Source for the REQ draft title, requirement body, and non-goals. |
| `tech_summary` | Source for the TECH draft title, technical body, and non-goals. |
| `tasks` | Candidate task records for a task queue draft. |
| `agent_assignments` | Agent-to-task grouping with assignment rationale. |
| `risk_assessment` | Overall risk, blocked paths, approval requirement, and risk notes. |
| `validation_commands` | Proposed validation commands for the generated plan. |
| `expected_outputs` | Task-linked expected output paths, with optional purpose text when available. |
| `created_at` | ISO date-time timestamp for the planner output. |

Optional top-level field:

| Field | Runtime purpose |
|---|---|
| `dispatch_plan` | Preview of per-task owner and dispatch readiness text. The preview must not claim, lock, or execute tasks. |

The schema describes planner output. It does not authorize live writes, task claims, lock creation, Agent execution, or queue/result/event mutation.

## 3. Runtime Flow

The planning runtime flow is:

```text
Goal Engine output
  -> Planner output JSON
  -> schema parse and validation
  -> REQ draft
  -> TECH draft
  -> task queue draft
  -> dispatch plan
  -> validation plan
  -> dry-run review
  -> human approval gate
  -> separate queue generation or agent-cycle step
```

### 3.1 Parse And Validate Planner Output

The first runtime step parses the planner output JSON and validates it against `planner-output.schema.json`.

Required checks:

- JSON parses without syntax errors.
- Required top-level fields exist.
- `req_summary` and `tech_summary` each contain `title`, `body`, and `non_goals`.
- Every task candidate contains `task_id`, `batch_id`, `source_goal_id`, `title`, `owner`, `owner_assignment_reason`, `domain`, `priority`, `status`, `risk`, `allowed_paths`, `forbidden_paths`, `acceptance`, `validation_commands`, `requires_human_approval`, `expected_output_files`, `created_at`, and `updated_at`.
- Every `owner` and `agent` is one of `agent-1` through `agent-5`.
- Every `priority` is one of `P0`, `P1`, `P2`, or `P3`.
- Every `risk` and `overall_risk` is one of `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.
- Every task candidate status is `READY`, which means queue-ready draft only, not claimed or executing work.
- Every dispatch preview, when present, has a task id, owner, and non-empty mode text.
- No undeclared fields are present.

If validation fails, no downstream draft should be trusted.

### 3.2 Generate REQ Draft

`req_summary` becomes the REQ draft header and requirement narrative:

- `req_summary.title` becomes the REQ title.
- `req_summary.body` becomes the requirement goal and scope body.
- `req_summary.non_goals` becomes the explicit non-goals section.
- `tasks[].acceptance` provides candidate acceptance criteria.
- `risk_assessment.blocked_paths` and `risk_assessment.notes` provide safety constraints and approval warnings.

The REQ draft is a review artifact. It must not mark generated work as approved.

### 3.3 Generate TECH Draft

`tech_summary` becomes the TECH draft header and technical narrative:

- `tech_summary.title` becomes the TECH title.
- `tech_summary.body` becomes the technical design overview.
- `tech_summary.non_goals` becomes implementation non-goals.
- `tasks[].allowed_paths` and `tasks[].forbidden_paths` define path boundaries.
- `tasks[].validation_commands` and top-level `validation_commands` seed the validation strategy.
- `expected_outputs` and `tasks[].expected_output_files` define output contracts.
- `tasks[].owner_assignment_reason` explains the direct owner choice for each task candidate.
- `agent_assignments[].reason` documents the grouped owner assignment rationale.

The TECH draft must keep Planner output subordinate to source truth. It can describe proposed implementation boundaries, but it cannot change application behavior.

### 3.4 Generate Task Queue Draft

Each `tasks[]` item becomes a candidate task queue record.

Direct candidate mapping:

| Planner task field | Task queue draft use |
|---|---|
| `task_id` | Draft task id. |
| `batch_id` | Draft batch id. |
| `source_goal_id` | Link back to the source Goal Engine record. |
| `title` | Draft task title. |
| `owner` | Proposed owner. |
| `owner_assignment_reason` | Human-readable reason for owner selection. |
| `domain` | Routing and ownership domain. |
| `priority` | Queue priority. |
| `status` | Draft status; must remain `READY`. |
| `risk` | Queue risk. |
| `allowed_paths` | Write boundary. |
| `forbidden_paths` | Hard block list. |
| `acceptance` | Acceptance criteria. |
| `validation_commands` | Task-specific validation. |
| `requires_human_approval` | Approval gate flag. |
| `expected_output_files` | Expected deliverables. |
| `created_at` / `updated_at` | Draft timestamps for review and eventual queue compatibility. |

The planner task candidate is not a live queue task by itself. It may carry queue-compatible draft fields, such as batch id, `READY` status, and timestamps, but those fields are review data until a later approved queue-generation step writes event-first queue state.

Because the orchestrator is event-first, any approved future queue write must also create compatible task events, such as `task.created`, so queue, lock, and result read models remain auditable. Planner dry-run must not perform that write.

### 3.5 Generate Dispatch Plan

The dispatch preview comes from two sources:

- `agent_assignments[]` groups candidate task ids by owner and explains assignment rationale.
- `dispatch_plan[]`, when present, gives per-task dispatch mode.

Dispatch preview fields mean:

| Field | Meaning |
|---|---|
| `task_id` | Candidate task being previewed. |
| `owner` | Agent expected to own the future queue task. |
| `mode` | Human-readable readiness text. Current generated output uses `READY only; dispatch later through agent-cycle`. |

The Planner must not call dispatch scripts or create locks. Dispatch remains a separate approved runtime step.

### 3.6 Generate Validation Plan

The validation plan is derived from:

- top-level `validation_commands`
- each `tasks[].validation_commands`
- `expected_outputs`
- `tasks[].expected_output_files`
- `risk_assessment`
- path boundaries in every task candidate

The validation plan must classify commands before execution:

| Command class | Dry-run rule |
|---|---|
| JSON parse, schema parse, file existence, diff checks | Allowed in planner dry-run when they do not write files. |
| Doctor, audit dry-run, route dry-run, agent-cycle dry-run | Allowed only when explicitly requested by the task and confirmed no-write. |
| Queue write, dispatch, task claim, Agent execution | Not allowed in planner dry-run. |
| Migration, seed, deploy, reset, cleanup, prune, merge, push | Not allowed. |
| Business-code tests | Allowed only in a later task that permits business-code validation scope. |

Validation output should prove the planner did not mutate queue, event, lock, result, business, database, auth, CI, Docker, deploy, or production files.

## 4. Dry-Run Planning Boundaries

Planner dry-run may:

- read Goal Engine output
- read planner schema
- read Agent Registry or router metadata when available
- read current queue/task examples for shape awareness
- print a draft plan
- write only explicitly approved planning artifacts under task-allowed paths
- propose commands and output files for later review

Planner dry-run must not:

- write `ops/agent-orchestrator/queue/task-queue.json` from planner output
- write queue locks or aggregate task results
- append task events
- call dispatch scripts
- execute Agents
- mark tasks as claimed, started, completed, failed, audited, or integrated
- modify `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, auth, or environment files
- run production deploy, migration, seed, reset, cleanup, prune, truncate, or data-write operations
- merge or push
- treat `requires_human_approval: true` as approved

Any future implementation that writes queue state from Planner output must be a separate approved task with explicit path permission for queue and event files.

## 5. Review Gates

Planner output can advance only when each gate passes:

| Gate | Required proof |
|---|---|
| Schema gate | Planner output parses and matches the schema. |
| Boundary gate | Every task candidate stays within allowed paths and blocks forbidden paths. |
| Risk gate | HIGH or CRITICAL risk, blocked paths, or production operations require human approval. |
| Artifact gate | REQ, TECH, task queue draft, dispatch plan, and validation plan are generated as drafts only. |
| No-write gate | Dry-run validation proves live queue, event, lock, result, and business paths were not mutated. |
| Approval gate | A human approves before any queue write or dispatch step. |

If any gate fails, the correct outcome is to stop with a failed or blocked draft, not to partially write runtime state.

## 6. Current Schema Review Notes

The current schema supports the V3 planning flow with these constraints:

- `dispatch_plan` is optional, so consumers must tolerate missing dispatch previews and fail closed if dispatch readiness is required.
- Task candidates include queue-compatible draft fields, but the schema restricts status to `READY` so Planner output cannot represent claimed or executing work.
- The schema uses strict objects and enum values, which is appropriate for a planner-to-runtime boundary.
- `validation_commands` are strings; consumers must inspect and classify them before execution.
- `expected_outputs` records task-linked paths, and path-boundary validation remains a runtime responsibility.
- The schema parses as JSON, but syntax parsing alone is not full JSON Schema validation.

## 7. Handoff Rules

Planner output becomes executable work only through a later approved handoff:

1. Human reviews the generated REQ, TECH, queue draft, dispatch plan, validation plan, and risk assessment.
2. Human approves queue generation for the exact scope.
3. Queue-generation tooling writes live queue records and compatible task events.
4. Doctor and read-model checks confirm queue/event consistency.
5. Dispatch or `agent-cycle` runs only after approval and healthy no-write previews.

Until those steps happen, Planner output remains a draft planning artifact.
