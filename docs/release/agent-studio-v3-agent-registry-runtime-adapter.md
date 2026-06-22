# Agent Studio V3 Agent Registry Runtime Adapter

Date: 2026-06-22
Task ID: `AGENT-PLATFORM-V3-F-A4-REGISTRY-RUNTIME-ADAPTER`
Owner: `agent-4`

## Purpose

This design defines the runtime adapter between the Agent Registry and the current natural-language router. It is a compatibility design only. It does not change router code, expand the worker pool, dispatch agents, merge, push, deploy, or grant broader write access.

The adapter goal is to let Goal-to-Queue and future planner/runtime flows consume registry metadata while preserving the current router contract used by:

- `ops/agent-orchestrator/scripts/route-natural-language-task.mjs`
- `ops/agent-orchestrator/scripts/goal-to-queue.mjs`
- `ops/agent-orchestrator/agent-router-rules.json`
- `ops/agent-orchestrator/agent-registry/agent-registry.example.json`

## Current Runtime Facts

The current router smoke tool is still router-rule backed:

- valid owners are hard-coded as `agent-1` through `agent-5`;
- routing reads `ops/agent-orchestrator/agent-router-rules.json`;
- keyword/domain matches use router rules;
- unknown work falls back through `fallback_rules`, currently to `agent-5`;
- the dry-run command writes nothing.

Goal-to-Queue already reads both registry and router data:

- `preferred_owner` is accepted when the owner exists in the registry;
- generated task path boundaries are copied from registry metadata when a preferred owner is valid;
- non-preferred candidates fall back to router keyword matching;
- if no keyword match exists, the bridge falls back to `agent-5` planning.

The registry example covers the same five owners as the router. That owner parity is the key compatibility boundary.

## Adapter Boundary

The adapter should expose a single owner recommendation contract:

| Field | Meaning |
|---|---|
| `owner` | Final queue owner. Must be one of `agent-1` through `agent-5`. |
| `domain` | Selected domain copied from registry or router metadata. |
| `allowed_paths` | Safe default paths for the generated task. |
| `forbidden_paths` | Conservative forbidden paths copied into the generated task. |
| `requires_human_approval` | True when risk, path, production, migration, seed, deploy, auth, CI, Docker, or database scope requires approval. |
| `owner_assignment_reason` | Human-readable explanation of registry validation, router matching, or fallback. |
| `routing_source` | `registry`, `router`, or `router_fallback`. |
| `fallback_used` | Boolean showing whether normal owner matching failed. |
| `compatibility_warnings` | Non-fatal warnings such as registry status mismatch or router priority drift. |

Queue records should keep their current schema and owner identifiers. The adapter must not require task queue consumers to understand a new owner format.

## Resolution Order

The adapter should resolve owners in this order:

1. Parse the task candidate text from title, domain, acceptance criteria, and any explicit planner recommendation.
2. Load the Agent Registry.
3. Validate that registry owners are exactly `agent-1`, `agent-2`, `agent-3`, `agent-4`, and `agent-5`.
4. Load router rules as the compatibility fallback.
5. If the user explicitly names an owner, accept it only when the owner exists and is eligible. If not eligible, stop and report the reason instead of silently rerouting.
6. If a planner template provides `preferred_owner`, accept it when the registry owner exists, is `ACTIVE`, and the task risk/path boundaries remain compatible.
7. If the preferred owner is missing, inactive, or path/risk incompatible, run normal router-compatible scoring and record the fallback reason.
8. Score keyword matches using the same effective keywords as the current router.
9. Score domain matches using registry domains plus the current router domain.
10. Break ties using router-compatible priority semantics while the router remains the compatibility source.
11. If no match remains, apply the current router fallback rule, which routes unknown work to `agent-5` planning.
12. Use registry `fallback_order` only after router compatibility is explicitly promoted, or when router rules are unavailable and the registry has passed validation.
13. If neither registry nor router fallback can provide an eligible owner, mark the candidate blocked with a concrete reason.

This order preserves current dry-run behavior while allowing the registry to become the source of richer metadata.

## Owner Recommendation Rules

The adapter should produce owner recommendations with explicit evidence:

| Scenario | Recommendation behavior | Required explanation |
|---|---|---|
| Preferred owner exists and is `ACTIVE` | Use the preferred owner. | `preferred owner agent-N validated against Agent Registry`. |
| Preferred owner exists but is not eligible | Do not blindly accept it. Run router-compatible fallback for planner templates or block explicit user overrides. | Include status, risk, or path reason. |
| Keyword or domain match exists | Use the matched owner. | List matched keywords/domains and routing source. |
| No match exists | Use current router unknown fallback to `agent-5`. | State `fallback_used=true` and explain that unknown/cross-domain work starts as planning. |
| Registry cannot be loaded or fails parity checks | Use router rules only. | State registry failure and router fallback behavior. |
| Router rules cannot be loaded | Use validated registry fallback order if available. | State that router compatibility source was unavailable. |
| Both registry and router fail | Block the generated task. | State missing owner source and required operator action. |

For the current validation input, `route-natural-language-task.mjs --text "continue Agent Studio to 98" --dry-run` semantics are equivalent to the observed command with the Chinese text: no keyword match, low confidence, fallback to `agent-5` planning. Generated Goal-to-Queue tasks can still use `preferred_owner` when the template explicitly assigns an owner and the registry validates that owner.

## Router And Registry Field Mapping

| Runtime need | Router field today | Registry field |
|---|---|---|
| Owner id | `agents` object key | `agents[].agent_id` |
| Primary domain | `agents.<id>.domain` | `agents[].domains[0]` or selected domain |
| Role summary | `responsibility` | `role` |
| Keywords | `keywords` | `keywords` |
| Allowed output paths | `allowed_paths` | `allowed_paths` |
| Forbidden paths | `default_forbidden_paths` plus task overrides | `forbidden_paths` |
| Router tie-break | `fallback_priority` | Compatibility adapter must preserve router semantics until migration completes. |
| Unknown fallback | `fallback_rules[]` | `fallback_order` only after promotion or router outage. |
| Availability | Not modeled | `status` |
| Auto-assignment risk guard | Not modeled | `risk_limit` |
| Parallel capacity | Not modeled | `max_parallel_tasks` |

The compatibility adapter should not treat registry `allowed_paths` as permission to modify forbidden business, database, auth, CI, Docker, deploy, environment, migration, seed, or production paths.

## No Worker Pool Expansion

This design intentionally keeps the worker pool fixed:

- only `agent-1` through `agent-5` are routable;
- registry entries outside that set are invalid for automatic routing;
- the adapter must not create new worktrees, workers, owners, lanes, branches, or dispatch capacity;
- `max_parallel_tasks` is an eligibility guard for the existing owners, not a mechanism to add new agents;
- a future dynamic pool may change registry metadata, but adding `agent-6` or any non-current owner requires a separate approved platform task.

## Compatibility Checks

Before promoting a runtime adapter, run no-write checks that prove:

1. Registry and router owner sets match exactly.
2. Every router domain appears in the corresponding registry agent domains.
3. Every router owner has registry keywords, allowed paths, forbidden paths, risk limit, status, priority, and fallback order.
4. Unknown route behavior still selects `agent-5` through router fallback while router rules are the compatibility source.
5. Planner `preferred_owner` behavior records whether the owner came from registry validation or fallback.
6. Generated task records preserve current queue fields and do not introduce new owner ids.
7. Restricted path scope still forces human approval or blocking.

## Migration Shape

| Phase | Runtime behavior | Exit criteria |
|---|---|---|
| 0 | Document adapter contract. Keep router rules as active compatibility source. | Design, report, and result artifacts exist. |
| 1 | Add no-write adapter dry-run behind a separate approved script change. | Adapter output matches current router dry-run for known fixtures. |
| 2 | Add Doctor validation for registry/router owner parity, status, and fallback safety. | Doctor reports parity drift without modifying queue or event files. |
| 3 | Let Goal-to-Queue call the adapter for owner recommendation. | Generated tasks explain registry validation and fallback reasons. |
| 4 | Let planner and dispatcher honor registry status and `max_parallel_tasks`. | Paused or disabled owners are skipped or blocked without queue corruption. |
| 5 | Promote registry as source of truth. | Router rules become generated compatibility output or documented legacy fallback. |

## Acceptance Mapping

| Acceptance item | Design answer |
|---|---|
| Agent Registry and router rules have a compatible runtime adapter design. | The adapter preserves current router owner ids, fallback behavior, queue fields, and path/risk gates while adding registry metadata. |
| Owner recommendations explain registry and fallback behavior. | `owner_assignment_reason`, `routing_source`, `fallback_used`, and `compatibility_warnings` explain each assignment. |
| No worker agent pool expansion is introduced. | The routable owner set remains exactly `agent-1` through `agent-5`; extra registry owners are invalid until separately approved. |

## Remaining Risks

- Current runtime code does not yet provide a shared adapter function; the design is ready for a future implementation task.
- Doctor currently reports `NO_GO` in this workspace because other agent worktrees contain dirty files; this blocks safe execution of `orchestratorctl doctor` without triggering self-repair.
- Router and Goal-to-Queue use related but not identical tie-break logic today. A future implementation should normalize tie-break behavior to the router compatibility semantics before switching the registry into the active route path.
