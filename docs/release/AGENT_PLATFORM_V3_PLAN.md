# Agent Platform V3 Plan

## 1. Goal

Agent Platform V3 upgrades the Agent Orchestrator from an automatic task execution platform into a goal-driven software factory platform.

The target capability is:

```text
Natural-language goal
-> Goal Engine
-> Planner Agent
-> REQ / TECH / Task Queue
-> Agent dispatch and execution
-> Progress and gap analysis
-> Human-approved autonomous loop
```

This planning round does not implement business features, execute Agents, merge, push, deploy, run production migration, run production seed, run cleanup, reset data, or perform production operations.

## 2. Current Baseline

Completed platform foundations:

- Agent Router Rules for natural-language domain routing to `agent-1` through `agent-5`.
- Stable agent formation and lane ownership.
- Event-first dispatch, complete, audit, integration, and reconcile foundation.
- Real guarded `--parallel 2` execution.
- Doctor diagnostics, daemon watcher, auto-commit, integration planning, validation matrix, and natural-language routing smoke test.
- Event store and compatibility read model consistency for queue, locks, and results.

Remaining gap:

The platform can execute known tasks, but it does not yet reason from a top-level goal such as `继续把 Agent Studio 提升到 98%`. It needs a Goal Engine, a Planner Agent contract, an Agent Registry, and an approval-gated autonomous loop.

## 3. V3 Scope

| Track | Capability | Purpose |
|---|---|---|
| V3-A | Goal Engine | Convert a natural-language goal into current state, target state, gaps, roadmap, risks, and task candidates. |
| V3-B | Planner Agent | Convert Goal Engine output into REQ, TECH, Task Queue, Dispatch Plan, and Validation Plan. |
| V3-C | Agent Registry | Replace hard-coded `agent-1` to `agent-5` ownership with a registry-backed dynamic agent pool. |
| V3-D | Autonomous Loop V1 | Let daemon read goals, call planner, generate draft tasks, run dry-run review, wait for human approval, then enter agent-cycle. |

## 4. Non-Goals

V3 planning does not:

- Modify `apps/**`.
- Modify `packages/**`.
- Modify `database/**`.
- Modify `infra/**`.
- Modify `.github/**`.
- Modify Docker, deploy, auth, migration, seed, or production configuration.
- Execute Agents.
- Merge, push, deploy, or run production operations.
- Open unattended autonomous execution.
- Bypass human approval for generated tasks, merge, push, deploy, production data writes, or high-risk paths.

## 5. V3-A Goal Engine

### 5.1 Objective

The Goal Engine accepts a natural-language target, for example:

```text
继续把 Agent Studio 提升到 98%
```

It produces a structured goal state:

- `current_state`
- `target_state`
- `gap_analysis`
- `required_capabilities`
- `roadmap`
- `task_candidates`
- `risk_level`
- `recommended_agents`

### 5.2 Planned Files

```text
ops/agent-orchestrator/goal/goal-engine.schema.json
ops/agent-orchestrator/goal/goal-state.example.json
```

### 5.3 Goal State Contract

The Goal Engine state includes:

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

### 5.4 Maturity Model

Goal maturity should be represented as an auditable score, not as a vague label. The first version uses capability scores for:

- task orchestration
- natural-language routing
- event-first queue
- parallel runner
- planner automation
- validation automation
- integration automation
- release gate automation
- observability and doctor diagnostics
- autonomous loop readiness

## 6. V3-B Planner Agent

### 6.1 Objective

The Planner Agent consumes Goal Engine output and creates:

- REQ
- TECH
- Task Queue
- Dispatch Plan
- Validation Plan

Planner output is a structured artifact, not free-form prose.

### 6.2 Planned File

```text
ops/agent-orchestrator/planner/planner-output.schema.json
```

### 6.3 Planner Output Contract

Planner output includes:

- `source_goal_id`
- `req_summary`
- `tech_summary`
- `tasks`
- `agent_assignments`
- `risk_assessment`
- `validation_commands`
- `expected_outputs`

### 6.4 Planning Rules

The Planner must:

1. Read `agent-router-rules.json` or the future `agent-registry`.
2. Assign every task owner from the router or registry.
3. Mark high-risk scope with `requires_human_approval=true`.
4. Generate no real development task unless the user has approved the generated plan.
5. Keep generated queue drafts dry-run until approval.

## 7. V3-C Agent Registry

### 7.1 Objective

The Agent Registry makes agent routing data dynamic rather than hard-coded in scripts.

### 7.2 Planned Files

```text
ops/agent-orchestrator/agent-registry/agent-registry.schema.json
ops/agent-orchestrator/agent-registry/agent-registry.example.json
```

### 7.3 Registry Contract

Each agent record includes:

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

### 7.4 Compatibility

The registry example must include the current five lanes:

- `agent-1`: assets, documentation, portal/UI assistance, Runtime documentation index.
- `agent-2`: validation, compatibility, finance, test matrix, Doctor/Audit/Typecheck runbooks.
- `agent-3`: IoT, safety, work order, energy, runtime data, read-model consistency.
- `agent-4`: frontend, UI/UX, dashboard, mobile, RBAC, menu, smart selector.
- `agent-5`: planning, release, platform architecture, production readiness, fallback.

## 8. V3-D Autonomous Loop V1

### 8.1 Objective

Daemon should move from observation to approval-gated goal progress.

### 8.2 Loop Design

```text
read goal
-> evaluate current goal state
-> call planner
-> generate draft REQ / TECH / task queue
-> dry-run route and validation
-> wait for human approve
-> run agent-cycle after approval
```

### 8.3 Safety Rules

Autonomous Loop V1 remains approval-gated:

- No unattended production deploy.
- No unattended migration, seed, reset, cleanup, backup restore, or production data write.
- No automatic merge or push without explicit approval.
- No automatic high-risk path handling.
- No agent execution from a generated plan until the user approves the plan.

## 9. V3 Task Split

| Task ID | Agent | Track | Priority | Risk | Purpose |
|---|---|---|---|---|---|
| `AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH` | agent-5 | V3-A | P0 | MEDIUM | Goal Engine architecture and schema. |
| `AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME` | agent-3 | V3-B | P0 | MEDIUM | Planner output schema and planning runtime flow. |
| `AGENT-PLATFORM-V3-A4-AGENT-REGISTRY` | agent-4 | V3-C | P0 | MEDIUM | Agent Registry and dynamic Agent Pool design. |
| `AGENT-PLATFORM-V3-A2-GOAL-VALIDATION` | agent-2 | V3-A/B/C | P1 | MEDIUM | Goal, planner, and registry validation matrix. |
| `AGENT-PLATFORM-V3-A1-PRODUCT-DOCS` | agent-1 | V3-D | P1 | LOW | ANKSEN Agent Studio productization and V3 user flow docs. |

## 10. Acceptance Gates

This planning round is complete when:

1. V3 plan, REQ, and TECH documents exist.
2. Goal, planner, and agent-registry schemas/examples parse as JSON.
3. `task-queue.json` contains five V3 READY tasks.
4. `parallel-task-board.md` lists V3 ownership and expected outputs.
5. Queue, locks, and results JSON parse.
6. `check-dispatch-status` passes.
7. `doctor` runs.
8. `agent-cycle --dry-run` previews V3 claim order without executing Agents.
9. Natural-language route smoke for `继续把 Agent Studio 提升到 98%` runs.
10. `git diff --check` and `pnpm typecheck` pass.

## 11. Human Approval Before Implementation

Human approval is required before:

- turning V3 draft tasks into actual agent execution if scope expands beyond docs/orchestrator planning;
- modifying scripts that affect execution semantics;
- changing `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, or auth;
- merge, push, deploy, production migration, seed, cleanup, reset, or production data operations.
