# REQ: Agent Platform V3

## 1. Requirement Goal

Agent Platform V3 upgrades the Agent Orchestrator from an automatic task execution platform into a goal-driven software factory platform.

The system must be able to take a natural-language goal such as:

```text
继续把 Agent Studio 提升到 98%
```

and produce structured planning artifacts:

- current state
- target state
- gap analysis
- required capabilities
- roadmap
- task candidates
- recommended agents
- REQ / TECH / Task Queue draft
- validation plan

This requirement is planning-only in this round. It does not execute Agents, modify business code, merge, push, deploy, or perform production operations.

## 2. Scope

### V3-A Goal Engine

The Goal Engine must define a structured goal state that supports:

- `goal_id`
- `goal_title`
- `goal_text`
- `current_maturity`
- `target_maturity`
- `capability_scores`
- `gaps`
- `milestones`
- `recommended_tasks`
- `risks`
- `status`

Required files:

- `ops/agent-orchestrator/goal/goal-engine.schema.json`
- `ops/agent-orchestrator/goal/goal-state.example.json`

### V3-B Planner Agent

The Planner Agent must define structured planner output that can generate:

- REQ
- TECH
- Task Queue
- Dispatch Plan
- Validation Plan

Planner output must include:

- `source_goal_id`
- `req_summary`
- `tech_summary`
- `tasks`
- `agent_assignments`
- `risk_assessment`
- `validation_commands`
- `expected_outputs`

Required file:

- `ops/agent-orchestrator/planner/planner-output.schema.json`

### V3-C Agent Registry

The Agent Registry must stop relying only on hard-coded `agent-1` through `agent-5` assumptions.

Each agent record must include:

- `agent_id`
- `display_name`
- `role`
- `domains`
- `keywords`
- `allowed_paths`
- `forbidden_paths`
- `max_parallel_tasks`
- `risk_limit`
- `status`
- `priority`
- `fallback_order`

Required files:

- `ops/agent-orchestrator/agent-registry/agent-registry.schema.json`
- `ops/agent-orchestrator/agent-registry/agent-registry.example.json`

### V3-D Autonomous Loop V1

The daemon must be planned to support an approval-gated loop:

1. Read a goal.
2. Call or simulate Planner.
3. Generate task drafts.
4. Run dry-run review.
5. Wait for human approval.
6. After approval, enter `agent-cycle`.

This round does not enable unattended real execution.

## 3. Functional Requirements

1. The V3 plan must define Goal Engine, Planner Agent, Agent Registry, natural-language goal planning, progress/gap analysis, and Autonomous Loop V1.
2. Goal Engine schema must represent maturity, capability scores, gaps, milestones, recommended tasks, and risks.
3. Goal state example must show the goal `继续把 Agent Studio 提升到 98%`.
4. Planner output schema must represent generated REQ/TECH summaries, task queue candidates, agent assignments, risks, validations, and expected outputs.
5. Agent Registry schema must define dynamic agent lane metadata.
6. Agent Registry example must convert current `agent-1` through `agent-5` roles into registry records.
7. Task queue must contain five V3 READY tasks.
8. Every V3 task must include `task_id`, `owner`, `priority`, `risk`, `allowed_paths`, `forbidden_paths`, acceptance criteria, validation commands, and expected output files.
9. V3 tasks must not allow business-code changes.
10. `parallel-task-board.md` must show V3 task ownership and current dispatch expectations.

## 4. Agent Task Split

| Agent | Task ID | Responsibility |
|---|---|---|
| agent-5 | `AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH` | Goal Engine architecture and schema |
| agent-3 | `AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME` | Planner output schema and planning runtime flow |
| agent-4 | `AGENT-PLATFORM-V3-A4-AGENT-REGISTRY` | Agent Registry and dynamic Agent Pool design |
| agent-2 | `AGENT-PLATFORM-V3-A2-GOAL-VALIDATION` | Goal / Planner / Registry validation matrix |
| agent-1 | `AGENT-PLATFORM-V3-A1-PRODUCT-DOCS` | ANKSEN Agent Studio productization and V3 user flow documentation |

## 5. Non-Goals

This round does not:

- modify `apps/**`
- modify `packages/**`
- modify `database/**`
- modify `infra/**`
- modify `.github/**`
- modify Docker, deploy, or auth files
- add migrations
- run Agents
- merge
- push
- deploy
- run production migration, seed, cleanup, reset, or production data writes

## 6. Acceptance Criteria

1. `docs/release/AGENT_PLATFORM_V3_PLAN.md` exists.
2. `REQ-AGENT-PLATFORM-V3.md` and `TECH-AGENT-PLATFORM-V3.md` exist.
3. Goal Engine, Agent Registry, and Planner schemas/examples parse as JSON.
4. `task-queue.json` contains five V3 READY tasks.
5. Queue/event read model remains consistent.
6. `parallel-task-board.md` lists V3 ownership and expected outputs.
7. `check-dispatch-status` passes.
8. `doctor` passes or reports only expected non-blocking warnings.
9. `agent-cycle --dry-run` runs and does not execute Agents.
10. Natural-language routing dry-run for `继续把 Agent Studio 提升到 98%` runs.
11. `git diff --check` passes.
12. `pnpm typecheck` passes.

## 7. Human Approval Requirements

Human approval remains mandatory for:

- `apps/**`
- `packages/**`
- `database/**`
- `infra/**`
- `.github/**`
- Docker, deploy, auth
- production deploy
- production migration
- production seed
- cleanup, reset, destructive operation
- production data writes
- merge and push
- executing generated V3 plans that expand beyond approved low-risk orchestrator/doc scope
