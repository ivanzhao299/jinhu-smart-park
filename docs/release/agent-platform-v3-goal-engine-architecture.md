# Agent Platform V3 Goal Engine Architecture

## 1. Purpose

This document defines the V3-A Goal Engine architecture for the Agent Orchestrator planning layer.

The Goal Engine turns a natural-language goal, such as `继续把 Agent Studio 提升到 98%`, into a structured goal state that downstream planner, registry, queue, and validation components can review before any agent execution starts.

This is a planning-only contract. It does not modify business code, database schema, infrastructure, auth, CI, Docker, deploy, migrations, seeds, or production data.

## 2. Current State

The current Agent Orchestrator baseline is task-first and event-first:

- Natural-language routing can map work to the current five agent lanes.
- Queue, lock, result, audit, integration, and reconciliation read models exist.
- Doctor diagnostics, guarded parallel execution, daemon observation, dry-run agent-cycle, and validation matrix foundations exist.
- V3 planning specs already define Goal Engine, Planner Agent, Agent Registry, and an approval-gated autonomous loop.

The current gap is that the platform can execute and validate known tasks, but it does not yet treat a top-level goal as the durable planning source of truth. The goal `继续把 Agent Studio 提升到 98%` still needs explicit current state, target state, gap analysis, roadmap, recommended tasks, and risk scoring before the planner can safely draft queue work.

## 3. Target State

The target Goal Engine state is a durable JSON artifact validated by `ops/agent-orchestrator/goal/goal-engine.schema.json` and demonstrated by `ops/agent-orchestrator/goal/goal-state.example.json`.

The target contract supports:

- `goal_id`: Stable identifier for the business or platform goal.
- `goal_title`: Human-readable title.
- `goal_text`: Original natural-language goal text.
- `current_maturity`: Current maturity score from 0 to 100.
- `target_maturity`: Desired maturity score from 0 to 100.
- `current_state`: Narrative summary of current platform capability.
- `target_state`: Narrative summary of the desired platform capability.
- `capability_scores`: Capability-level current score, target score, evidence, gap summary, and risk level.
- `gaps`: Actionable missing capabilities with owner recommendation, priority, risk, and approval requirement.
- `milestones`: Roadmap checkpoints with target maturity and exit criteria.
- `recommended_tasks`: Candidate tasks the planner can convert into queue entries after review.
- `risks`: Goal-level risks and mitigations.
- `status`: Goal lifecycle state.
- `created_at` and `updated_at`: Audit timestamps.

The target planning flow is:

```text
natural-language goal
-> Goal Engine state
-> Planner output draft
-> REQ / TECH / task queue draft
-> registry or router owner assignment
-> dry-run validation
-> human approval
-> agent-cycle
```

## 4. Gap Analysis

| Area | Current representation | Target representation | Gap | Risk |
|---|---|---|---|---|
| Current and target state | Example has `current_state` and `target_state`; schema defines them as optional strings. | Goal records should consistently carry both fields for planner context. | Decide whether to make both fields required once consumers depend on them. | MEDIUM |
| Gap analysis | Schema uses `gaps[]` with impact, owner, priority, risk, and approval requirement. | Planner can convert gaps into scoped task candidates. | Need a future planner rule that maps every P0/P1 gap to a task candidate or explicit deferral. | MEDIUM |
| Roadmap | Schema uses `milestones[]` with `target_maturity` and `exit_criteria`. | Roadmap should be explainable as ordered maturity checkpoints. | Keep `milestones` as the canonical roadmap field or add a named `roadmap` alias in a future schema version. | LOW |
| Recommended tasks | Example lists the P0 structural tasks for Goal Engine, Planner, and Agent Registry. | Recommended tasks can seed the planner and queue generator. | Decide whether `recommended_tasks` must mirror all V3 queue tasks or only the top Goal Engine candidates. | MEDIUM |
| Risk scoring | Schema uses enum levels `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL` across capabilities, gaps, tasks, and risks. | Risk should support deterministic ordering and approval gates. | Define whether enum risk is enough for V3 or whether V4 needs numeric scoring or weighted aggregation. | MEDIUM |
| Approval boundary | Gaps include `required_approval`; TECH spec requires human approval before execution. | Generated tasks remain dry-run until approved. | Future autonomous loop must persist approval state before queue writes or agent-cycle execution. | HIGH |

## 5. Roadmap

### V3-M1: Contracts Reviewed, Target Maturity 96

Exit criteria:

- Goal Engine schema exists and parses as JSON.
- Goal state example exists and parses as JSON.
- Planner output schema exists.
- Agent Registry schema and example exist.
- V3 task queue entries are generated and route to owners.

### V3-M2: Approval-Gated Goal Loop Planned, Target Maturity 98

Exit criteria:

- Daemon loop plan includes the human approval boundary.
- Validation matrix covers goal, planner, registry, queue, doctor, and dry-run agent-cycle artifacts.
- Generated task candidates can be routed through the registry or current router rules.
- High-risk paths, production operations, merge, and push remain blocked without explicit approval.

### Future Implementation Roadmap

1. Keep `goal-engine.schema.json` and `goal-state.example.json` as the V3-A planning contract.
2. Add planner output generation that consumes Goal Engine state without writing live queue tasks by default.
3. Add registry-compatible owner assignment with fallback to current router rules.
4. Add validation that checks required goal fields, schema parse, recommended task owner validity, risk-level validity, and approval requirements.
5. Add approval persistence before daemon-generated queue writes.
6. Only after approval persistence is stable, allow `agent-cycle` to consume generated tasks.

## 6. Recommended Tasks

| Task | Owner | Priority | Risk | Purpose |
|---|---|---|---|---|
| `AGENT-PLATFORM-V3-A5-GOAL-ENGINE-ARCH` | agent-5 | P0 | MEDIUM | Document Goal Engine architecture and schema review. |
| `AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME` | agent-3 | P0 | MEDIUM | Define planner output schema and dry-run planning runtime flow. |
| `AGENT-PLATFORM-V3-A4-AGENT-REGISTRY` | agent-4 | P0 | MEDIUM | Define registry-backed agent pool metadata and router compatibility. |
| `AGENT-PLATFORM-V3-A2-GOAL-VALIDATION` | agent-2 | P1 | MEDIUM | Define validation matrix for goal, planner, registry, queue, doctor, and dry-run checks. |
| `AGENT-PLATFORM-V3-A1-PRODUCT-DOCS` | agent-1 | P1 | LOW | Document operator-facing V3 natural-language goal flow and productization notes. |

## 7. Risk Scoring

V3 should treat risk as ordered, approval-relevant metadata:

| Level | Score | Meaning | Required handling |
|---|---:|---|---|
| LOW | 1 | Documentation or low-blast-radius planning change. | Normal review. |
| MEDIUM | 2 | Orchestrator planning or schema change that affects future generated work. | Validate schema/artifacts and record remaining approval questions. |
| HIGH | 3 | Autonomous loop, production-adjacent, or high-blast-radius generated scope. | Human approval required before execution or live queue writes. |
| CRITICAL | 4 | Destructive, production data, deploy, migration, seed, auth, merge, or push risk. | Block unless explicitly authorized by a separate approved task. |

Aggregate goal risk should be the maximum risk level across:

- capability scores;
- gaps;
- recommended tasks;
- explicit risks;
- requested paths and operations.

For the current V3 example, the task-level Goal Engine architecture work is `MEDIUM`, while autonomous-loop overreach and generated-task scope risks are `HIGH`. That means the architecture task can complete as planning-only work, but execution from generated tasks must stay approval-gated.

## 8. Schema and Example Review

Reviewed files:

- `ops/agent-orchestrator/goal/goal-engine.schema.json`
- `ops/agent-orchestrator/goal/goal-state.example.json`

Completeness findings:

- The schema covers the required V3 Goal Engine core fields: goal identity, natural-language text, maturity scores, capability scores, gaps, milestones, recommended tasks, risks, lifecycle status, and timestamps.
- The example demonstrates the required goal text `继续把 Agent Studio 提升到 98%`.
- `capability_scores[]` includes evidence and gap summaries, which gives the planner enough context to explain why tasks are recommended.
- `gaps[]` includes recommended owner, priority, risk level, and approval requirement, which supports planner and validation follow-up.
- `milestones[]` functions as the roadmap representation for V3.
- `risks[]` captures goal-level risk and mitigation.

Review notes:

- `current_state` and `target_state` are present in the example and useful for planner context, but they are optional in the schema. Keep this flexible for V3 planning unless downstream consumers start requiring them.
- There is no explicit `gap_analysis` object; the contract represents gap analysis through `capability_scores[]` and `gaps[]`.
- There is no explicit `roadmap` field; the contract represents roadmap through `milestones[]`.
- Risk scoring is enum-based, not numeric. This is sufficient for V3 approval gates if all consumers use the ordered mapping in this document.
- The example `recommended_tasks[]` lists the P0 structural tasks and does not mirror every V3 queue task. This is acceptable if recommended tasks are top candidates rather than a full queue snapshot.

## 9. Approval Questions

Before V3 moves from planning to implementation, owners should decide:

1. Should `current_state` and `target_state` become required in schema version 2?
2. Should `milestones` remain the canonical roadmap field, or should a separate `roadmap` object be introduced?
3. Should `recommended_tasks` list all generated queue candidates or only top Goal Engine recommendations?
4. Should risk stay enum-only for V3, or should a numeric `risk_score` be added for deterministic sorting?
5. Where should the autonomous loop persist human approval state before writing live queue tasks?

## 10. Safety Boundaries

This architecture keeps V3-A inside docs and orchestrator planning metadata. It does not authorize:

- business code changes under `apps/**` or `packages/**`;
- database, migration, seed, infra, CI, Docker, deploy, auth, SMS, or WeChat configuration changes;
- production deploy, production migration, production seed, cleanup, reset, truncate, prune, backup restore, or production data writes;
- merge or push;
- unattended agent execution from generated plans.
