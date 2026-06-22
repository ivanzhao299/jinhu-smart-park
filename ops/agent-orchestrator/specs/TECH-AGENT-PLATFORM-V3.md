# TECH: Agent Platform V3

## 1. Technical Objective

Agent Platform V3 introduces a goal-driven planning layer above the existing event-first Agent Orchestrator.

The platform already supports queue, dispatch, event-first completion, audit, integration, doctor diagnostics, natural-language routing dry-run, and guarded parallel execution. V3 adds structured goal state, planner output, dynamic agent registry, and an approval-gated autonomous loop.

This document is planning-only. It does not implement business code, run Agents, merge, push, deploy, or perform production operations.

## 2. Architecture Overview

```text
goal input
  -> Goal Engine
  -> goal-state.json
  -> Planner Agent
  -> planner-output.json
  -> REQ / TECH / task queue draft
  -> router / registry owner assignment
  -> dry-run validation
  -> human approval
  -> agent-cycle
```

## 3. V3-A Goal Engine

### 3.1 Planned Directory

```text
ops/agent-orchestrator/goal/
├── goal-engine.schema.json
└── goal-state.example.json
```

### 3.2 Goal State Shape

The goal state is a structured JSON object:

```json
{
  "version": 1,
  "goal_id": "GOAL-AGENT-STUDIO-98",
  "goal_title": "Raise Agent Studio maturity to 98%",
  "goal_text": "继续把 Agent Studio 提升到 98%",
  "current_maturity": 95,
  "target_maturity": 98,
  "capability_scores": [],
  "gaps": [],
  "milestones": [],
  "recommended_tasks": [],
  "risks": [],
  "status": "DRAFT"
}
```

### 3.3 Status Values

Goal status:

- `DRAFT`
- `READY_FOR_REVIEW`
- `APPROVED`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`
- `CANCELLED`

### 3.4 Capability Score

Each capability score should include:

- `capability_id`
- `name`
- `current_score`
- `target_score`
- `evidence`
- `gap_summary`
- `risk_level`

### 3.5 Gap

Each gap should include:

- `gap_id`
- `capability_id`
- `summary`
- `impact`
- `recommended_agent`
- `priority`
- `risk_level`
- `required_approval`

## 4. V3-B Planner Agent

### 4.1 Planned Directory

```text
ops/agent-orchestrator/planner/
└── planner-output.schema.json
```

### 4.2 Planner Output Shape

Planner output is generated from a source goal:

```json
{
  "version": 1,
  "source_goal_id": "GOAL-AGENT-STUDIO-98",
  "req_summary": {},
  "tech_summary": {},
  "tasks": [],
  "agent_assignments": [],
  "risk_assessment": {},
  "validation_commands": [],
  "expected_outputs": []
}
```

### 4.3 Planner Responsibilities

The Planner must:

1. Read Goal Engine output.
2. Read Agent Router Rules or Agent Registry.
3. Produce REQ and TECH summaries.
4. Generate task candidates with owner, risk, allowed paths, forbidden paths, and validation commands.
5. Generate a dispatch plan without claiming tasks.
6. Generate a validation plan that includes doctor, audit, typecheck, and selected target checks.
7. Mark tasks that require human approval.
8. Refuse to generate execution-ready tasks for forbidden or production operations without explicit approval.

### 4.4 Planner Dry-Run Rule

Planner output is a draft until approved. Draft generation must not:

- write live queue tasks unless the user requested queue generation;
- dispatch tasks;
- execute Agents;
- merge, push, deploy, run migration, run seed, or write production data.

## 5. V3-C Agent Registry

### 5.1 Planned Directory

```text
ops/agent-orchestrator/agent-registry/
├── agent-registry.schema.json
└── agent-registry.example.json
```

### 5.2 Registry Record Shape

Each registry entry includes:

```json
{
  "agent_id": "agent-1",
  "display_name": "Agent 1 - Runtime Docs and Portal",
  "role": "Assets, docs, portal/UI assistance, Runtime documentation index",
  "domains": [],
  "keywords": [],
  "allowed_paths": [],
  "forbidden_paths": [],
  "max_parallel_tasks": 1,
  "risk_limit": "MEDIUM",
  "status": "ACTIVE",
  "priority": 40,
  "fallback_order": 4
}
```

### 5.3 Registry Status Values

- `ACTIVE`
- `PAUSED`
- `MAINTENANCE`
- `DISABLED`

### 5.4 Migration Strategy

V3 should migrate in phases:

1. Keep `agent-router-rules.json` as the current source of truth.
2. Introduce `agent-registry.example.json` as the future source of truth.
3. Add a later adapter that can build router rules from registry data.
4. Update planner to read registry when available, falling back to router rules.
5. Update dispatch only after planner/queue owner generation is stable.

## 6. V3-D Autonomous Loop V1

### 6.1 Daemon Planning Flow

Autonomous Loop V1 is approval-gated:

```text
daemon tick
-> read active goal
-> build goal state
-> run planner dry-run
-> write draft artifacts only if explicitly approved
-> wait for human approval
-> call agent-cycle after approval
```

### 6.2 Loop State

Future daemon state should track:

- active goal id
- planner draft id
- approval status
- last gap analysis
- last generated task candidates
- last validation result
- next action
- blocker reason

### 6.3 Safety Gates

Autonomous Loop V1 must stop on:

- non-runtime dirty worktree
- HIGH risk unapproved path
- production deploy/migration/seed/reset/cleanup request
- merge or push without explicit approval
- missing owner assignment
- missing validation plan
- stale lock or inconsistent read model

## 7. Task Queue Integration

V3 planning creates five READY tasks in `task-queue.json`.

Because the orchestrator is event-first, queue generation must also create compatible `task.created` events so Doctor can verify that queue, locks, and results read models remain consistent.

## 8. Validation Strategy

Required validation commands:

```bash
node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/queue/task-queue.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/queue/task-locks.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/queue/task-results.json','utf8'));"
node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/goal/goal-engine.schema.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/goal/goal-state.example.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.schema.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.example.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/planner/planner-output.schema.json','utf8'));"
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
node ops/agent-orchestrator/scripts/route-natural-language-task.mjs --text "继续把 Agent Studio 提升到 98%" --dry-run
git diff --check
pnpm typecheck
```

## 9. Implementation Guardrails

Do not modify:

- `apps/**`
- `packages/**`
- `database/**`
- `infra/**`
- `.github/**`
- Docker
- deploy
- auth

Do not execute Agents, merge, push, deploy, run production migration, run production seed, cleanup, reset, or perform production data operations.
