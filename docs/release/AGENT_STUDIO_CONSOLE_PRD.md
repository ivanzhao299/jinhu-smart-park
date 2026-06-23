# ANKSEN Agent Studio Console MVP PRD

## 1. Purpose

ANKSEN Agent Studio already has the core backend automation foundations:

- Goal Engine
- Planner Agent
- Agent Registry
- Skill Router
- Event Store
- Queue
- Audit
- Integration
- Finalize
- Resident Observer
- Evolution Planner
- Runtime Memory Center
- Legacy Discovery and Replica Engine

The next product step is a Web Console that lets a project owner see, inspect, and operate these capabilities without reading long terminal logs or raw JSON files.

This round is a planning round. It does not implement frontend pages, backend controllers, business code, production deployment, production operations, migration, seed, reset, or cleanup.

## 2. Product Goals

1. Provide one visual operating surface for the Agent Studio software factory.
2. Make the current Doctor, queue, event store, runtime memory, and evolution state easy to inspect.
3. Let a project owner trace the path from natural-language goal to planner output, task queue, agent execution, audit, integration, and finalize.
4. Prepare a console IA and architecture that can later be implemented in Next.js App Router with Shadcn/UI, Tailwind, Recharts, and React Query.
5. Keep all production and business-code boundaries explicit before any implementation starts.

## 3. Non-Goals

The Console MVP planning round does not:

- Modify `apps/**`.
- Modify `packages/**`.
- Modify `database/**`.
- Modify `infra/**`.
- Modify `.github/**`.
- Modify Docker, deploy, auth, migration, seed, production config, or production data.
- Execute Agents.
- Deploy.
- Run production operations.
- Create migrations.
- Create a real frontend route.
- Expose write operations without a future approval gate.

## 4. Users

### 4.1 Project Owner

Needs a concise view of whether the software factory is GO, CONDITIONAL_GO, or NO_GO, what work is queued, what agents are active, and what the recommended next action is.

### 4.2 Orchestrator Operator

Needs drill-down into Doctor, queue, event store, audit, integration, finalize, runtime memory, and evolution backlog. This user can decide whether to run dry-run or apply commands outside the Console.

### 4.3 Agent Reviewer

Needs to inspect recent agent tasks, run logs, result artifacts, audits, risk level, and integration status.

## 5. Information Architecture

```text
Agent Studio Console
|-- Dashboard
|-- Goal Center
|-- Agent Center
|-- Queue Center
|-- Skill Center
|-- Evolution Center
|-- Discovery Center
|-- Runtime Memory Center
`-- System Health Center
```

## 6. Dashboard MVP

The Dashboard is the first screen. It should avoid a marketing hero and show operational status immediately.

### 6.1 Dashboard Cards

- Doctor status: GO / CONDITIONAL_GO / NO_GO
- Goal count and latest goal
- Agent availability and branch sync state
- Queue status: READY, CLAIMED, DONE, FAILED, AUDITED, BLOCKED
- Evolution backlog: open, resolved, top risk
- Discovery coverage: targets, maps, inventories, scores
- Runtime Memory status: validation, generated_at, source fingerprint state
- Recent activity: latest task events, run logs, audits, finalize result

### 6.2 Dashboard Metrics

- Active locks
- Candidate agent branches
- Event count
- Audit pass count
- Integration candidate count
- Open improvements
- Runtime memory validation status

### 6.3 Dashboard Acceptance

- A project owner can understand the current state in under one minute.
- The dashboard clearly states whether execution is currently safe.
- The dashboard links to detailed centers without requiring terminal output.

## 7. Goal Center

Goal Center shows the path from natural-language goal to executable plan.

### 7.1 Content

- Goals
- Current state
- Target state
- Maturity score
- Capability gaps
- Milestones
- Planner outputs
- Generated tasks
- Validation plan
- Risk assessment

### 7.2 Primary Views

- Goal list
- Goal detail
- Planner output detail
- Generated task table
- Goal progress timeline

### 7.3 MVP Behavior

MVP is read-only. A future phase may add a guarded `goal-to-queue --dry-run` launcher and an approval-gated `--apply` action.

## 8. Agent Center

Agent Center visualizes agent formation and performance.

### 8.1 Content

- Agent Registry
- Agent role
- Branch and worktree status
- Preferred runtime
- Supported skills
- Risk limit
- Current status
- Recent tasks
- Run log status
- Success rate
- Audit outcomes

### 8.2 Agent Lanes

| Agent | Console domain |
| --- | --- |
| agent-1 | Runtime docs, product docs, portal support, documentation index |
| agent-2 | Validation, compatibility, audit, typecheck, test matrix |
| agent-3 | Runtime planner, ops data, event/read-model consistency |
| agent-4 | UI, registry, RBAC, selector, frontend design acceptance |
| agent-5 | Platform architecture, release gates, Goal Engine, fallback planning |

## 9. Queue Center

Queue Center shows task state across queue read models and event store.

### 9.1 Status Buckets

- READY
- CLAIMED
- IN_PROGRESS
- DONE
- FAILED
- BLOCKED
- AUDITED

### 9.2 Task Detail

- `task_id`
- Owner
- Skill type
- Runtime
- Priority
- Risk
- Status
- Allowed paths
- Forbidden paths
- Acceptance criteria
- Validation commands
- Related event files
- Result artifact
- Audit result

### 9.3 MVP Behavior

MVP is read-only and should explain that queue JSON is a compatibility read model while the event store is the source of truth.

## 10. Skill Center

Skill Center shows how natural-language tasks become skill and runtime selections.

### 10.1 Content

- Skill Registry
- Skill route rules
- Runtime mapping
- Task type mapping
- Required inputs
- Expected outputs
- Validation commands
- Risk level
- Default agent or agent-router fallback

### 10.2 Skills

The first console release should display all current skill types:

- `code_development`
- `document_generation`
- `spreadsheet_analysis`
- `slide_generation`
- `image_generation`
- `pdf_processing`
- `web_research`
- `data_integration`
- `legacy_discovery`
- `schema_inference`
- `replica_planning`
- `data_migration_mapping`
- `browser_discovery`
- `api_discovery`
- `entity_mapping`
- `replica_scoring`
- `validation_testing`
- `evolution_observer`

## 11. Evolution Center

Evolution Center is the Resident Observer surface.

### 11.1 Content

- Failure patterns
- Improvement backlog
- Learning log
- Open improvements
- Resolved improvements
- Top risks
- Recurring failures
- Auto-fix eligibility
- Owner recommendations

### 11.2 MVP Behavior

MVP is read-only. Creating real improvement tasks remains an explicit approval flow.

## 12. Discovery Center

Discovery Center visualizes Legacy Discovery and Replica Engine output.

### 12.1 Content

- Discovery targets
- System maps
- Browser page inventory
- Menu inventory
- UI inventory
- API inventory
- Entity maps
- Schema inference
- Compatibility scores
- Replica scores
- Risk notes
- Authorization status

### 12.2 Safety

The Console must prominently show whether a discovery target is fixture-only, manually provided, or explicitly authorized. MVP must not perform real crawling.

## 13. Runtime Memory Center

Runtime Memory Center shows durable project context for new controller handoff.

### 13.1 Content

- Platform state
- Architecture memory
- Agent memory
- Skill memory
- Goal memory
- Evolution memory
- Discovery memory
- Roadmap memory
- Decision log
- Handoff summary
- Handoff smoke report

### 13.2 MVP Behavior

MVP should answer: can a new Orchestrator window safely resume from Runtime Memory?

## 14. System Health Center

System Health Center makes operational safety visible.

### 14.1 Content

- Doctor
- Locks
- Queue health
- Event store health
- Audit
- Integration status
- Finalize result
- Conflict metrics
- Codex CLI status
- Worktree sync state

### 14.2 Health States

- GO: safe to continue with approved workflow.
- CONDITIONAL_GO: safe only after the listed next action, usually push/sync or low-risk cleanup.
- NO_GO: blocked until the listed issue is resolved.

## 15. MVP Requirements

### 15.1 Read-Only First

The first Console implementation should be read-only. Any later write action must require explicit operator approval and should call existing orchestrator scripts rather than inventing new state mutation paths.

### 15.2 Data Freshness

Every center should display:

- Source file or command
- Generated timestamp where available
- Whether data is a snapshot or live command output
- Last validation result

### 15.3 Frozen Boundaries

Console implementation must not weaken existing restrictions:

- No unattended deploy.
- No production migration, seed, reset, or cleanup.
- No hidden push or merge.
- No high-risk path automation without explicit approval.

## 16. Success Criteria

Console MVP planning is complete when:

1. PRD and Architecture documents are committed.
2. Page structure and component tree are defined.
3. Data sources are mapped.
4. API design is drafted.
5. Agent task breakdown is defined.
6. `doctor`, `check-dispatch-status`, `git diff --check`, `pnpm typecheck`, and `finalize --apply` pass.

