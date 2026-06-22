# Agent Platform V3 Agent Registry Design

Date: 2026-06-22
Task ID: `AGENT-PLATFORM-V3-A4-AGENT-REGISTRY`
Owner: `agent-4`

## Purpose

Agent Platform V3 introduces an Agent Registry so the orchestrator can build a dynamic Agent Pool instead of relying only on static router rules. The registry is a planning and routing contract for `agent-1` through `agent-5`; it does not grant broader write permissions, execute agents, merge branches, push, deploy, or modify production data.

The current compatibility rule is conservative:

1. `ops/agent-orchestrator/agent-router-rules.json` remains the current router compatibility source.
2. `ops/agent-orchestrator/agent-registry/agent-registry.example.json` is the future source for dynamic pool metadata.
3. Planner and router changes should read the registry when present and valid, then fall back to the existing router rules when registry data is missing or invalid.
4. Queue entries must continue to use the existing owner identifiers, path boundary fields, risk fields, validation commands, and human approval flags.

## Inputs Reviewed

| File | Role |
|---|---|
| `ops/agent-orchestrator/agent-registry/agent-registry.schema.json` | Draft 2020-12 JSON schema for registry files. |
| `ops/agent-orchestrator/agent-registry/agent-registry.example.json` | Example registry covering `agent-1` through `agent-5`. |
| `ops/agent-orchestrator/agent-router-rules.json` | Current natural-language router compatibility rules. |
| `ops/agent-orchestrator/specs/TECH-AGENT-PLATFORM-V3.md` | V3 architecture and migration direction. |

## Registry Contract

The registry root contains:

| Field | Meaning |
|---|---|
| `version` | Registry schema version. Version `1` is the current draft. |
| `updated_at` | ISO date-time for the registry content snapshot. |
| `agents` | Dynamic Agent Pool entries. Each entry describes one routable agent. |

Each agent entry contains:

| Field | Meaning |
|---|---|
| `agent_id` | Stable queue owner id. Current supported ids are `agent-1` through `agent-5`. |
| `display_name` | Human-readable label for reports and dashboards. |
| `role` | Short capability summary. |
| `domains` | Machine-readable ownership domains used by planner and route compatibility checks. |
| `keywords` | Natural-language routing hints. English and Chinese keywords can coexist. |
| `allowed_paths` | Default safe output paths for generated tasks. These are not permission to modify forbidden business paths. |
| `forbidden_paths` | Default forbidden path patterns copied into generated tasks unless narrowed further. |
| `max_parallel_tasks` | Maximum active tasks the dispatcher may assign to this agent in one cycle. |
| `risk_limit` | Highest risk level eligible for automatic assignment without stronger approval gates. |
| `status` | Runtime availability state. See status model below. |
| `priority` | Agent-specific ranking hint for exact domain/keyword matches. |
| `fallback_order` | Deterministic fallback rank. Lower numbers are tried earlier. |

The current schema validates field shape and enum values. A later hardening pass should add uniqueness constraints for `agent_id`, `priority`, and `fallback_order` if the selected schema validator supports draft 2020-12 `uniqueItems` plus semantic post-checks.

## Agent Coverage Review

The example registry covers all current agents:

| Agent | Registry role | Key domains | Status | Fallback order | Router compatibility |
|---|---|---|---|---:|---|
| `agent-1` | Runtime Docs and Portal | `asset-docs-portal-runtime-index`, `runtime-documentation`, `product-docs` | `ACTIVE` | 4 | Matches docs, portal, copy, index, asset/tenant documentation routing. |
| `agent-2` | Validation and Compatibility | `validation-compat-finance-test-matrix`, `goal-validation`, `regression-runbooks` | `ACTIVE` | 3 | Matches validation, typecheck, audit, compatibility, finance, and runbook routing. |
| `agent-3` | Runtime Planner and Ops Data | `ops-iot-safety-work-order-energy-runtime-data`, `planner-runtime`, `read-model` | `ACTIVE` | 5 | Matches IoT, safety, work order, energy, runtime data, and read-model routing. |
| `agent-4` | UI, Registry, RBAC and Selector | `frontend-ui-ux-dashboard-mobile-rbac-selector`, `agent-registry`, `dynamic-agent-pool` | `ACTIVE` | 2 | Matches frontend, dashboard, mobile, menu, RBAC, selector, registry, and dynamic agent pool routing. |
| `agent-5` | Planning, Release and Platform | `planning-release-platform-gates`, `goal-engine`, `platform-architecture` | `ACTIVE` | 1 | Matches unknown-domain fallback, planning, release, production readiness, platform architecture, and goal-engine routing. |

This preserves the existing queue owner set and keeps `agent-4` responsible for registry and dynamic pool design without opening UI implementation paths.

## Status Model

Registry status controls assignment eligibility:

| Status | Assignment behavior | Existing task behavior |
|---|---|---|
| `ACTIVE` | Eligible for planner recommendations, automatic dispatch, and fallback selection. | Existing claimed or in-progress work may continue normally. |
| `PAUSED` | Excluded from new automatic assignments. Manual assignment requires a recorded reason. | Existing claimed work should either finish or be reassigned by the orchestrator. |
| `MAINTENANCE` | Excluded from routine work. Eligible only for explicitly approved maintenance or self-repair tasks. | Existing work should be treated as blocked unless the maintenance owner confirms continuation. |
| `DISABLED` | Not eligible for new assignment, fallback, or dispatch. | Existing work must not continue automatically; create a reassignment or blocked record. |

Status is a planner and dispatcher guard, not an authorization bypass. A task that touches forbidden or production-sensitive paths still needs explicit approval even when the selected agent is `ACTIVE`.

## Dynamic Pool Selection

Dynamic Agent Pool routing should use this order:

1. Load and parse `agent-registry.example.json` or the approved live registry path.
2. Validate the registry against `agent-registry.schema.json`.
3. Filter agents to `status = ACTIVE` for ordinary automatic assignment.
4. Filter by risk limit, using order `LOW < MEDIUM < HIGH < CRITICAL`.
5. Score explicit agent mention first. If the explicitly mentioned agent is unavailable, stop and report the status rather than silently rerouting.
6. Score keyword matches from `keywords`.
7. Score domain matches from `domains`.
8. Apply task-specific path compatibility against `allowed_paths` and `forbidden_paths`.
9. Break exact-match ties by `priority`.
10. If no exact match remains, use `fallback_order` ascending.
11. If no eligible fallback exists, mark the draft task or planner output as blocked with a concrete reason.

The current example fallback order is:

```text
agent-5 -> agent-4 -> agent-2 -> agent-1 -> agent-3
```

This keeps platform planning as the first unknown-domain fallback, gives registry/UI/RBAC work the next fallback slot, and keeps specialized validation, documentation, and ops data roles available after that.

## Router Compatibility

The existing router uses this selection order:

```text
explicit_agent_mention -> keyword_match -> domain_match -> fallback_rules -> fallback_priority
```

The registry-compatible router should preserve this behavior while replacing hard-coded agent metadata with registry entries:

| Router field today | Registry field |
|---|---|
| `agents.<agent>.domain` | First or selected value from `domains`. |
| `agents.<agent>.responsibility` | `role`. |
| `agents.<agent>.keywords` | `keywords`. |
| `agents.<agent>.allowed_paths` | `allowed_paths`. |
| `default_forbidden_paths` plus agent overrides | `forbidden_paths`. |
| `fallback_priority` | Compatibility-only ranking until fully migrated. |
| Not present | `status`, `risk_limit`, `max_parallel_tasks`, `fallback_order`. |

Compatibility requirements:

- Do not change generated queue owner ids. They must remain `agent-1` through `agent-5`.
- Do not infer permission to modify `apps`, `packages`, `database`, `infra`, CI, Docker, deploy, auth, environment, migration, seed, or production paths from registry ownership.
- Preserve `requires_human_approval=true` for tasks that expand into restricted code, release, production, migration, seed, deploy, cleanup, or database behavior.
- Preserve existing task queue schema fields so `claim-task.mjs`, dispatch, result recording, audit, and integration continue to work.
- Keep the old router rules as a fallback until registry-to-router parity is validated by a dry-run matrix.

## Migration Plan

| Phase | Change | Write scope | Exit criteria |
|---|---|---|---|
| 0 | Keep router rules as source of truth and publish registry design/checklist. | Documentation and registry examples only. | Registry JSON parses and covers `agent-1` through `agent-5`. |
| 1 | Add read-only registry validation to Doctor or a dedicated check. | Orchestrator scripts only after approval. | Invalid status, missing agent, duplicate id, and path drift are reported. |
| 2 | Add registry-to-router dry-run adapter. | Orchestrator scripts only after approval. | Adapter output matches current router choices for known examples. |
| 3 | Planner reads registry first and falls back to router rules. | Planner/orchestrator only after approval. | Planner output owner/domain/path decisions match route compatibility checks. |
| 4 | Dispatcher respects registry status and `max_parallel_tasks`. | Dispatcher/orchestrator only after approval. | Paused/maintenance/disabled agents are skipped without queue corruption. |
| 5 | Promote approved live registry as source of truth. | Registry and orchestrator only after approval. | Router rules become generated compatibility output or documented legacy fallback. |

## Remaining Migration Questions

1. Which file becomes the live registry path: the current example file, a new `agent-registry.json`, or an event/read-model generated file?
2. Should `fallback_order` replace `fallback_priority`, or should both remain during a longer compatibility window?
3. Should paused or maintenance agents keep active locks, or should the orchestrator automatically mark their tasks blocked?
4. Should schema validation enforce unique agent ids and fallback ranks directly, or should semantic checks live in Doctor?
5. Should `max_parallel_tasks` account for claimed tasks only, or claimed plus in-progress plus blocked tasks owned by the same agent?
6. How should registry status changes be recorded in the event store so dispatcher and Doctor can explain historical routing decisions?
