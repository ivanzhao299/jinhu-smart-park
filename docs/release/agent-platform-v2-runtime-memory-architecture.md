# Agent Platform V2 Runtime Memory Architecture

## 1. Purpose

Project Runtime Memory is the Round 2 V2-C architecture for generated project inventories under:

```text
ops/agent-orchestrator/runtime/
```

The purpose is to reduce repeated full-project scans by Agents before each task. Agents, dispatch diagnostics, and future validation selectors can read a compact set of generated inventories instead of rediscovering modules, routes, database ownership, RBAC contracts, workflow states, and risk areas from scratch.

Runtime memory is operational metadata. It is not business truth. The current application code, database migrations, seed rules, release docs, and production configuration remain authoritative.

## 2. Scope And Guardrails

This architecture is planning-only. It does not create runtime inventory files, add runtime scripts, change business code, modify database schema, update production configuration, run Agents, merge, push, deploy, seed, migrate, reset, or perform cleanup.

Hard boundaries:

| Area | Runtime Memory Rule |
|---|---|
| Business code | Read-only source for future generators; never changed by this architecture task. |
| Database | Inventories may reference migrations and entities; they never alter schema or migration history. |
| Auth, RBAC, finance, payment | Inventories may mark risk and required checks; they never relax checks. |
| Production configuration | Runtime memory must not read, persist, or emit secrets or environment override values. |
| Validation | Selector narrowing is allowed only when runtime inventories validate; otherwise fall back to broader checks. |

## 3. Runtime Directory

Planned inventory directory:

```text
ops/agent-orchestrator/runtime/
|-- architecture.json
|-- api_inventory.json
|-- db_inventory.json
|-- module_inventory.json
|-- rbac_inventory.json
|-- workflow_inventory.json
`-- risk_inventory.json
```

The directory is generated metadata owned by orchestrator tooling. Generated files should be deterministic, reviewable, and safe to delete and rebuild from project sources.

## 4. Architecture Overview

The runtime memory flow is:

```text
Project sources
  -> runtime-generator / runtime-rebuild
  -> ops/agent-orchestrator/runtime/*.json
  -> runtime-validate
  -> Agents, doctor diagnostics, and future Smart E2E Selector
```

Generation sources include source files, migration filenames, shared permission contracts, release/test docs, and orchestrator task metadata. A generated inventory entry should preserve source references so reviewers can trace a runtime-memory claim back to the real source.

Consumers must treat inventory content as a cached map, not an authority. If the map conflicts with source code or validation fails, consumers must trust source code and select broader validation.

## 5. Inventory Contracts

All inventory files share these top-level expectations:

| Field | Requirement |
|---|---|
| `version` | Required integer schema version, starting at `1`. |
| `updated_at` | Required ISO-8601 timestamp for the generated inventory. |
| Primary array | Required array named by the inventory, such as `routes`, `tables`, or `risks`. Empty arrays are valid during bootstrap. |
| `meta` | Optional object for generator name, mode, source revision, source counts, and non-secret warnings. |

Additional implementation-specific metadata should be placed under `meta` so consumers can keep stable parsing for the primary contracts.

### architecture.json

Purpose: describe project modules, dependencies, and bounded contexts.

Required primary arrays:

- `modules`
- `dependencies`
- `bounded_contexts`

Minimum entry responsibilities:

- identify module or bounded-context name
- map source paths to owning domain or agent
- describe dependency direction and dependency type
- include risk tags or source references when known

### api_inventory.json

Purpose: describe API route ownership and validation impact.

Required primary array: `routes`

Each route entry must model:

- `controller`
- `route`
- `method`
- `domain`
- `owner`

Recommended fields include route key, source references, required permissions, tests, docs, and risk tags. Duplicate `method + route` keys must be validation failures unless explicitly documented as intentional framework aliases.

### db_inventory.json

Purpose: describe database ownership without changing database schema.

Required primary array: `tables`

Each table entry must model:

- `table`
- `migration_source`
- `owning_module`
- `entity_or_repository`
- `risk_notes`

Migration references are evidence only. Updating this inventory must never be treated as adding, deleting, renaming, or modifying a real table.

### module_inventory.json

Purpose: map modules to paths, owners, risks, tests, and docs.

Required primary array: `modules`

Each module entry must model:

- `module`
- `paths`
- `owner`
- `domains`
- `tests`
- `docs`
- `risk_tags`

This inventory is the main bridge from changed files to affected domains. Unknown or unmapped changed paths should be handled conservatively.

### rbac_inventory.json

Purpose: map menus, permissions, guards, and role coverage.

Required primary array: `entries`

Each RBAC entry must model:

- `menu`
- `permission`
- `guard`
- `role_mapping`

Duplicate permission keys and unmapped guards must be validation failures or explicit warnings that block selector narrowing.

### workflow_inventory.json

Purpose: map workflow states, transitions, and approval responsibilities.

Required primary array: `workflows`

Each workflow entry must model:

- `workflow`
- `state`
- `transition`
- `approver`

Recommended fields include `from_state`, `to_state`, guard requirements, tests, docs, and source references.

### risk_inventory.json

Purpose: map risk areas to paths, risk levels, and required checks.

Required primary array: `risks`

Each risk entry must model:

- `area`
- `paths`
- `risk_level`
- `required_checks`

Canonical areas include `auth`, `rbac`, `db`, `workflow`, `finance`, and `payment`. Risk levels are `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL`. Unknown levels must fail validation.

## 6. Reducing Repeated Scans

Runtime memory reduces repeated scanning by giving Agents compact answers to common discovery questions:

| Repeated Question | Inventory Used |
|---|---|
| Which module owns this path? | `module_inventory.json` |
| Which routes are affected by this controller or domain? | `api_inventory.json` |
| Which tables and migrations are in scope? | `db_inventory.json` |
| Which permissions, guards, or menus are relevant? | `rbac_inventory.json` |
| Which workflow states or transitions are impacted? | `workflow_inventory.json` |
| Which validation checks are required for this risk? | `risk_inventory.json` |
| Which bounded context depends on another? | `architecture.json` |

Agents should still inspect the precise source files they modify. Runtime memory shortens orientation, but it does not replace reading the code or docs that own a specific behavior.

## 7. Generated Metadata, Not Business Truth

Runtime memory must remain subordinate to source truth:

1. A generated inventory entry is a pointer to a real source, not a new source of behavior.
2. Business changes require edits to application, package, database, or documentation sources through normal task approval.
3. Updating runtime memory alone must not create, remove, or approve API routes, permissions, roles, workflow transitions, database tables, financial rules, or release gates.
4. If source files and inventory disagree, the source files win and runtime validation should fail or warn.
5. If inventory validation fails, selector-driven narrowing must be disabled and validation must fall back to baseline plus conservative domain checks.

This keeps runtime memory useful as a cache while preserving auditability and release safety.

## 8. Runtime Script Responsibilities

Planned scripts:

| Script | Dry-run responsibility | Apply responsibility |
|---|---|---|
| `runtime-generator.mjs` | Scan configured project sources, print candidate inventory changes, gaps, duplicates, and warnings without writing. | Write generated inventory JSON only under `ops/agent-orchestrator/runtime/**`. |
| `runtime-rebuild.mjs` | Reconstruct all inventories from known sources and print deterministic diff summaries without writing. | Replace runtime inventory JSON with deterministic rebuilt output only under `ops/agent-orchestrator/runtime/**`. |
| `runtime-validate.mjs` | Parse and validate inventories without writing; fail on malformed JSON, missing required fields, duplicates, unknown owners, unknown risk levels, or missing high-risk coverage. | Apply-mode writes are not required by this architecture. If future tasks allow a validation report, it must be limited to `ops/agent-orchestrator/runtime/**`. |

Common script rules:

- `--dry-run` must be the default and must not write files.
- `--apply` must require an explicit flag and may write only generated runtime-memory files.
- Scripts must not write business paths.
- Scripts must not read or emit secrets.
- Output ordering must be deterministic enough for reviewable diffs.
- Validation failures must be loud enough to block consumers from relying on stale or malformed inventories.

## 9. Consumer Responsibilities

Agents and future selector logic may use runtime inventories for orientation and validation selection, but they must:

- keep doctor, audit, and typecheck baselines
- explain why a validation was selected or skipped
- treat unknown paths and high-risk gaps conservatively
- inspect relevant source files before modifying behavior
- stop relying on runtime inventories when `runtime-validate` fails

## 10. Rollout And Rollback

Recommended rollout:

1. Land architecture and contracts.
2. Design generator, rebuild, and validate behavior.
3. Implement dry-run first.
4. Add apply writes limited to `ops/agent-orchestrator/runtime/**`.
5. Add Smart E2E Selector consumption only after inventory validation is stable.

Rollback is simple: disable runtime inventory consumers, delete or ignore generated files, and return to direct source scanning with baseline validation. Because runtime memory is generated metadata, rollback must not require business-code, migration, seed, auth, CI, Docker, deploy, or production configuration changes.
