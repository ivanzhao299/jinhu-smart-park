# ANKSEN Agent Studio Console MVP Architecture

## 1. Scope

This architecture document defines the first Web Console plan for ANKSEN Agent Studio. It maps existing orchestrator state into a visual console, but does not implement pages or APIs in this round.

The preferred future stack is:

- Next.js App Router
- Shadcn/UI
- Tailwind
- Recharts
- React Query

The first implementation should be read-only and should not create new mutation paths for deploy, production data, queue writes, agent execution, merge, or push.

## 2. High-Level Architecture

```text
Orchestrator files and commands
  -> read-only server adapters
  -> Console API routes
  -> React Query hooks
  -> Console pages and components
```

Source of truth rules:

- Event Store is the task lifecycle source of truth.
- Queue JSON files are compatibility read models.
- Runtime Memory files are durable handoff snapshots.
- Doctor is the live health summary.
- Finalize result is the closeout gate.
- Evolution files are the observer and improvement memory.
- Discovery files are fixture/manual-manifest discovery outputs unless explicitly authorized.

## 3. Route Map

Future App Router route structure:

```text
apps/web/app/agent-studio
|-- page.tsx                         # Dashboard
|-- goals/page.tsx                   # Goal Center
|-- goals/[goalId]/page.tsx
|-- agents/page.tsx                  # Agent Center
|-- queue/page.tsx                   # Queue Center
|-- queue/[taskId]/page.tsx
|-- skills/page.tsx                  # Skill Center
|-- evolution/page.tsx               # Evolution Center
|-- discovery/page.tsx               # Discovery Center
|-- runtime-memory/page.tsx          # Runtime Memory Center
`-- health/page.tsx                  # System Health Center
```

MVP planning only. Do not create these files until the implementation phase is explicitly approved.

## 4. Page Structure

### 4.1 Dashboard

Sections:

- Health summary strip
- Queue and agent metrics
- Goal progress panel
- Evolution risk panel
- Discovery coverage panel
- Runtime Memory handoff panel
- Recent activity table

Primary components:

- `DoctorStatusBadge`
- `MetricGrid`
- `QueueStatusChart`
- `AgentLaneSummary`
- `RecentActivityTable`
- `FinalizeResultPanel`

### 4.2 Goal Center

Sections:

- Goal list
- Current and target state
- Milestones
- Planner outputs
- Generated tasks

Primary components:

- `GoalList`
- `GoalDetailHeader`
- `CapabilityScoreGrid`
- `MilestoneTimeline`
- `PlannerOutputCard`
- `GeneratedTaskTable`

### 4.3 Agent Center

Sections:

- Agent Registry table
- Agent detail drawer
- Recent tasks
- Success and audit metrics

Primary components:

- `AgentRegistryTable`
- `AgentRoleCard`
- `AgentSkillChips`
- `AgentRunLogTable`
- `AgentRiskPolicyPanel`

### 4.4 Queue Center

Sections:

- Status bucket tabs
- Task list
- Task event timeline
- Result and audit detail

Primary components:

- `QueueStatusTabs`
- `TaskTable`
- `TaskDetailPanel`
- `TaskEventTimeline`
- `AuditResultPanel`

### 4.5 Skill Center

Sections:

- Skill Registry
- Router rules
- Runtime mapping
- Example route simulator

Primary components:

- `SkillRegistryTable`
- `SkillRouteRuleList`
- `RuntimeMappingMatrix`
- `SkillRoutePreview`

### 4.6 Evolution Center

Sections:

- Failure patterns
- Improvement backlog
- Learning log
- Top recurring failures

Primary components:

- `FailurePatternTable`
- `ImprovementBacklogTable`
- `LearningLogList`
- `TopRiskPanel`

### 4.7 Discovery Center

Sections:

- Target list
- System map
- API inventory
- Entity map
- Compatibility and replica scores

Primary components:

- `DiscoveryTargetTable`
- `SystemMapTree`
- `ApiInventoryTable`
- `EntityMapTable`
- `ReplicaScoreRadar`

### 4.8 Runtime Memory Center

Sections:

- Platform state
- Memory file index
- Handoff summary
- Handoff smoke status
- Decision log

Primary components:

- `RuntimeMemoryStatus`
- `MemoryFileTable`
- `HandoffSummaryPanel`
- `DecisionLogTable`

### 4.9 System Health Center

Sections:

- Doctor
- Locks
- Event Store
- Queue health
- Audit
- Integration
- Finalize
- Conflict metrics

Primary components:

- `DoctorReportPanel`
- `LockHealthTable`
- `EventStoreHealthPanel`
- `AuditSummaryTable`
- `IntegrationStatusPanel`
- `ConflictMetricChart`

## 5. Component Tree

```text
AgentStudioShell
|-- AgentStudioNav
|-- AgentStudioHeader
|-- HealthBanner
|-- Outlet
|   |-- DashboardPage
|   |-- GoalCenterPage
|   |-- AgentCenterPage
|   |-- QueueCenterPage
|   |-- SkillCenterPage
|   |-- EvolutionCenterPage
|   |-- DiscoveryCenterPage
|   |-- RuntimeMemoryCenterPage
|   `-- SystemHealthCenterPage
`-- DataFreshnessFooter
```

Shared components:

- `StatusBadge`
- `RiskBadge`
- `SourceRef`
- `ValidationCommandList`
- `JsonPreview`
- `EventTimeline`
- `EmptyState`
- `CommandCopyButton`

## 6. Data Source Mapping

| Console area | Primary source | Secondary source | Refresh mode |
| --- | --- | --- | --- |
| Dashboard health | `orchestratorctl doctor --json` | `check-dispatch-status.mjs` | live command adapter |
| Goals | `ops/agent-orchestrator/goal/**` | `ops/agent-orchestrator/planner/**` | file read |
| Planner outputs | `ops/agent-orchestrator/planner/**` | `task-queue.json` | file read |
| Agent Registry | `ops/agent-orchestrator/agent-registry/agent-registry.example.json` | `agent-router-rules.json` | file read |
| Skill Registry | `ops/agent-orchestrator/skills/skill-registry.json` | `skill-router-rules.json` | file read |
| Queue | `ops/agent-orchestrator/events/tasks/**` | `queue/task-queue.json`, `queue/task-locks.json`, `queue/task-results.json` | event projection plus read model |
| Audits | `ops/agent-orchestrator/results/**` | `audit-all-results.mjs --dry-run` | file read plus command adapter |
| Integration | integration reports | `integrate-agent-results.mjs --dry-run` | command adapter |
| Evolution | `ops/agent-orchestrator/evolution/**` | `observe-agent-studio.mjs --dry-run` | file read plus command adapter |
| Discovery | `ops/agent-orchestrator/discovery/**` | discovery scripts dry-run output | file read |
| Runtime Memory | `ops/agent-orchestrator/runtime/**` | `runtime-memory-validate.mjs` | file read plus validation command |
| Finalize | latest finalize command output | `check-status.sh` | command adapter |

## 7. API Design Draft

Future Console API routes should be read-only in MVP.

### 7.1 Health

`GET /api/agent-studio/health`

Response:

- doctor status
- worktree status
- queue counts
- active locks
- event store consistency
- runtime memory validation
- latest finalize result summary

### 7.2 Dashboard

`GET /api/agent-studio/dashboard`

Response:

- health summary
- metrics
- recent activity
- top risks
- next action

### 7.3 Goals

`GET /api/agent-studio/goals`

Response:

- goals
- planner outputs
- generated tasks
- validation plans

### 7.4 Agents

`GET /api/agent-studio/agents`

Response:

- agent registry
- branch status
- recent tasks
- run log summaries
- audit summaries

### 7.5 Queue

`GET /api/agent-studio/queue`

Response:

- status counts
- task list
- active locks
- event/read-model consistency

`GET /api/agent-studio/queue/:taskId`

Response:

- task detail
- event timeline
- result reference
- audit reference
- validation commands

### 7.6 Skills

`GET /api/agent-studio/skills`

Response:

- skill registry
- router rules
- runtime mapping
- examples

### 7.7 Evolution

`GET /api/agent-studio/evolution`

Response:

- failure patterns
- improvement backlog
- learning log
- top recurring failures

### 7.8 Discovery

`GET /api/agent-studio/discovery`

Response:

- targets
- system maps
- API inventories
- entity maps
- compatibility scores
- replica scores

### 7.9 Runtime Memory

`GET /api/agent-studio/runtime-memory`

Response:

- memory file index
- platform state
- handoff summary
- validation result
- decision log

## 8. Data Adapter Rules

1. Prefer file reads for stable JSON and Markdown artifacts.
2. Prefer existing orchestrator scripts for live health summaries.
3. Do not duplicate business logic in frontend components.
4. Treat `queue/*.json` as read models, not source of truth.
5. Normalize all paths before display.
6. Never expose secrets, env files, or production credentials.
7. Never execute apply commands from the MVP Console.

## 9. UX Principles

- Operational first screen, not a landing page.
- Dense but readable layouts for repeated use.
- Status, risk, and next action must be visible before detail.
- Tables need filter, search, and status tabs.
- Details should use drawers or split panes.
- Mobile should retain essential status cards and task detail reading, but the first MVP can prioritize desktop operator workflows.

## 10. Security and Boundary Rules

The Console must enforce:

- Read-only MVP.
- No deploy.
- No production migration, seed, reset, cleanup, or production data writes.
- No hidden merge or push.
- No execution of Agents without explicit future approval flow.
- No access to `.env*` or secrets.
- No mutation of `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, or auth through Console MVP.

## 11. Task Breakdown

### CONSOLE-ARCH

- Owner: agent-5
- Purpose: Console architecture, route map, health model, system boundary, read-only API policy.
- Risk: MEDIUM
- Allowed paths:
  - `docs/release/**`
  - `docs/testing/**`
  - `ops/agent-orchestrator/reports/**`
  - `ops/agent-orchestrator/results/**`
- Forbidden paths:
  - `apps/**`
  - `packages/**`
  - `database/**`
  - `infra/**`
  - `.github/**`
  - Docker, deploy, auth, env files
- Expected output:
  - Console architecture refinement
  - Health and command adapter acceptance notes
- Validation:
  - `git diff --check`
  - `pnpm typecheck`
  - `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor`

### CONSOLE-UI

- Owner: agent-4
- Purpose: Dashboard IA, page layout, Shadcn/UI component plan, responsive operator workflow.
- Risk: MEDIUM
- Allowed paths:
  - `docs/release/**`
  - `docs/testing/**`
  - `ops/agent-orchestrator/reports/**`
  - `ops/agent-orchestrator/results/**`
- Forbidden paths:
  - `apps/**` until implementation is explicitly approved
  - `packages/**`
  - `database/**`
  - `infra/**`
  - `.github/**`
  - Docker, deploy, auth, env files
- Expected output:
  - Console UI blueprint
  - Component acceptance checklist
- Validation:
  - `git diff --check`
  - `pnpm typecheck`

### CONSOLE-DATA

- Owner: agent-3
- Purpose: Data source mapping, read adapters, event/read-model projection plan, freshness indicators.
- Risk: MEDIUM
- Allowed paths:
  - `docs/release/**`
  - `docs/testing/**`
  - `ops/agent-orchestrator/reports/**`
  - `ops/agent-orchestrator/results/**`
- Forbidden paths:
  - `apps/**`
  - `packages/**`
  - `database/**`
  - `infra/**`
  - `.github/**`
  - Docker, deploy, auth, env files
- Expected output:
  - Data adapter map
  - API response contract notes
- Validation:
  - `node ops/agent-orchestrator/scripts/check-dispatch-status.mjs`
  - `git diff --check`
  - `pnpm typecheck`

### CONSOLE-VALIDATION

- Owner: agent-2
- Purpose: Console validation matrix, read-only safety tests, Doctor/Audit/Typecheck acceptance.
- Risk: LOW
- Allowed paths:
  - `docs/release/**`
  - `docs/testing/**`
  - `ops/agent-orchestrator/reports/**`
  - `ops/agent-orchestrator/results/**`
- Forbidden paths:
  - `apps/**`
  - `packages/**`
  - `database/**`
  - `infra/**`
  - `.github/**`
  - Docker, deploy, auth, env files
- Expected output:
  - Console validation runbook
  - Read-only safety checklist
- Validation:
  - `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor`
  - `node ops/agent-orchestrator/scripts/check-dispatch-status.mjs`
  - `git diff --check`
  - `pnpm typecheck`

### CONSOLE-DOCS

- Owner: agent-1
- Purpose: Console user workflow docs, handoff guide, operator glossary.
- Risk: LOW
- Allowed paths:
  - `docs/release/**`
  - `docs/testing/**`
  - `ops/agent-orchestrator/reports/**`
  - `ops/agent-orchestrator/results/**`
- Forbidden paths:
  - `apps/**`
  - `packages/**`
  - `database/**`
  - `infra/**`
  - `.github/**`
  - Docker, deploy, auth, env files
- Expected output:
  - Console user workflow documentation
  - New-window handoff guide for Console operators
- Validation:
  - `git diff --check`
  - `pnpm typecheck`

## 12. Implementation Sequence

1. Approve Console MVP planning outputs.
2. Create Console read-only data contracts.
3. Implement System Health and Runtime Memory centers first because they reduce operator risk.
4. Implement Dashboard shell and shared status components.
5. Add Goal, Agent, Queue, Skill, Evolution, and Discovery centers.
6. Add guarded dry-run command previews only after read-only data views are stable.
7. Defer write operations until approval-gated Console V2.

## 13. Open Questions Before Implementation

1. Should Console live under an internal route such as `/agent-studio`, or behind an admin-only route group?
2. Should the first implementation use local file adapters only, or introduce API routes immediately?
3. Which RBAC permission should govern Console access?
4. Should command output be cached in runtime memory or read live on each request?
5. Should future apply actions be disabled in production builds by default?

