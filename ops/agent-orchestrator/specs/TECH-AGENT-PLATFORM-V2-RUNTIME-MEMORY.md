# TECH: Agent Platform V2 Runtime Memory

## 1. Objective

Project Runtime Memory defines generated orchestrator inventories under:

```text
ops/agent-orchestrator/runtime/
```

The inventories reduce repeated project scans for Agents and future selector logic. They are generated metadata, not business truth. Source code, migrations, shared contracts, release docs, and production-safe configuration rules remain authoritative.

This spec is architecture-level and planning-only. It does not implement scripts, create runtime JSON, modify business code, modify database files, modify auth, CI, Docker, deploy, migration, seed, or production files, run Agents, merge, push, or deploy.

## 2. Runtime Directory Contract

Required inventory files:

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

The directory is safe to rebuild. Consumers must not treat any file in this directory as an application source of truth.

## 3. Common Inventory Envelope

Every inventory file must use a JSON object at the top level.

Required common fields:

| Field | Type | Rule |
|---|---|---|
| `version` | integer | Required. Starts at `1`; consumers must reject unsupported major versions. |
| `updated_at` | string | Required ISO-8601 timestamp. |
| Primary collection | array | Required. The collection name depends on the inventory. |

Optional common field:

| Field | Type | Rule |
|---|---|---|
| `meta` | object | Generator metadata only. May include `generator`, `mode`, `source_revision`, `source_count`, `warning_count`, and non-secret warnings. |

Compatibility rules:

1. Required fields listed in this spec are required for `version: 1`.
2. Additional per-entry fields are allowed only when consumers ignore unknown fields safely.
3. Implementation-specific global data should live under `meta`, not beside the primary collection.
4. Inventory entries should include source references when available.
5. Empty arrays are valid during bootstrap, but validation must warn when high-risk areas have no coverage.

## 4. architecture.json

Purpose: model modules, dependencies, and bounded contexts.

Required shape:

```json
{
  "version": 1,
  "updated_at": "2026-06-22T00:00:00.000Z",
  "modules": [
    {
      "module": "leasing",
      "bounded_context": "operations-commercial",
      "paths": ["apps/api/src/modules/leasing"],
      "owner": "agent-2",
      "risk_tags": ["finance", "payment"]
    }
  ],
  "dependencies": [
    {
      "from_module": "leasing",
      "to_module": "auth",
      "kind": "guard",
      "reason": "protected financial write routes"
    }
  ],
  "bounded_contexts": [
    {
      "context": "operations-commercial",
      "domains": ["leasing", "finance"],
      "owner": "agent-2"
    }
  ]
}
```

Entry contract:

| Collection | Required fields | Validation notes |
|---|---|---|
| `modules` | `module`, `paths`, `owner`, `risk_tags` | `paths` must be an array. `owner` must be a known agent id. |
| `dependencies` | `from_module`, `to_module`, `kind`, `reason` | Referenced modules should exist in `modules` or produce a warning. |
| `bounded_contexts` | `context`, `domains`, `owner` | `domains` must be an array. |

## 5. api_inventory.json

Purpose: model controllers, routes, methods, domains, and owners.

Required shape:

```json
{
  "version": 1,
  "updated_at": "2026-06-22T00:00:00.000Z",
  "routes": [
    {
      "controller": "LeasingReceivablesController",
      "route": "/leasing/receivables/:id",
      "method": "DELETE",
      "domain": "leasing-finance",
      "owner": "agent-2",
      "module": "leasing",
      "permissions": ["leasing:receivables:delete"],
      "risk_tags": ["finance", "payment"]
    }
  ]
}
```

Entry contract:

| Field | Type | Rule |
|---|---|---|
| `controller` | string | Required controller class or source name. |
| `route` | string | Required normalized route path. |
| `method` | string | Required HTTP method: `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. |
| `domain` | string | Required functional domain. |
| `owner` | string | Required known agent id. |
| `module` | string | Recommended module id for selector joins. |
| `permissions` | string array | Recommended permission keys. |
| `risk_tags` | string array | Recommended risk tags. |

Validation requirements:

- duplicate `method + route` keys fail unless the generator marks an explicit framework alias
- unknown methods fail
- unknown owners fail
- missing permission references on known protected routes warn or fail based on risk level

## 6. db_inventory.json

Purpose: model database inventory without changing database schema.

Required shape:

```json
{
  "version": 1,
  "updated_at": "2026-06-22T00:00:00.000Z",
  "tables": [
    {
      "table": "leasing_receivables",
      "migration_source": "database/migrations/000000_example.sql",
      "owning_module": "leasing",
      "entity_or_repository": "apps/api/src/modules/leasing",
      "risk_notes": ["financial auditability"]
    }
  ]
}
```

Entry contract:

| Field | Type | Rule |
|---|---|---|
| `table` | string | Required table or view name. |
| `migration_source` | string | Required source migration path or `"unknown"` during bootstrap. |
| `owning_module` | string | Required module id. |
| `entity_or_repository` | string | Required source reference or `"unknown"`. |
| `risk_notes` | string array | Required, may be empty. |

Validation requirements:

- duplicate table names warn or fail depending on source ambiguity
- migration sources are references only and must not be modified by runtime scripts
- unknown financial, auth, RBAC, or workflow tables must produce conservative risk warnings

## 7. module_inventory.json

Purpose: map modules to paths, owners, risks, tests, and docs.

Required shape:

```json
{
  "version": 1,
  "updated_at": "2026-06-22T00:00:00.000Z",
  "modules": [
    {
      "module": "leasing",
      "paths": ["apps/api/src/modules/leasing", "apps/web/app/leasing"],
      "owner": "agent-2",
      "domains": ["leasing-finance"],
      "tests": ["node scripts/e2e/first-release-leasing.mjs"],
      "docs": ["docs/release/production-readiness-matrix.md"],
      "risk_tags": ["finance", "payment", "idempotency"]
    }
  ]
}
```

Entry contract:

| Field | Type | Rule |
|---|---|---|
| `module` | string | Required stable module id. |
| `paths` | string array | Required source path prefixes. |
| `owner` | string | Required known agent id. |
| `domains` | string array | Required functional domains. |
| `tests` | string array | Required validation commands or script paths, may be empty. |
| `docs` | string array | Required documentation references, may be empty. |
| `risk_tags` | string array | Required risk tags, may be empty only for low-risk docs-only modules. |

Validation requirements:

- overlapping path prefixes must be deterministic, with longest-prefix ownership preferred
- unknown owner fails
- missing tests on high-risk modules fails or blocks selector narrowing

## 8. rbac_inventory.json

Purpose: model menu, permission, guard, and role mapping.

Required shape:

```json
{
  "version": 1,
  "updated_at": "2026-06-22T00:00:00.000Z",
  "entries": [
    {
      "menu": "leasing.receivables",
      "permission": "leasing:receivables:read",
      "guard": "JwtAuthGuard/RbacGuard",
      "role_mapping": ["platform_admin", "park_operator"],
      "module": "leasing",
      "risk_tags": ["rbac", "finance"]
    }
  ]
}
```

Entry contract:

| Field | Type | Rule |
|---|---|---|
| `menu` | string | Required menu key or `"none"` when route-only. |
| `permission` | string | Required permission key. |
| `guard` | string | Required guard or guard chain reference. |
| `role_mapping` | string array | Required roles or role sources, may be empty only with a warning. |
| `module` | string | Recommended module id. |
| `risk_tags` | string array | Recommended risk tags. |

Validation requirements:

- duplicate permission keys fail unless aliases are explicitly marked
- missing guard on protected modules fails or warns as high risk
- RBAC entries touching finance, payment, auth, or admin menus must select RBAC/menu validation

## 9. workflow_inventory.json

Purpose: model workflows, states, transitions, and approvers.

Required shape:

```json
{
  "version": 1,
  "updated_at": "2026-06-22T00:00:00.000Z",
  "workflows": [
    {
      "workflow": "work_order",
      "state": "pending_assignment",
      "transition": "assign",
      "approver": "dispatcher",
      "from_state": "created",
      "to_state": "assigned",
      "module": "workorders",
      "risk_tags": ["workflow"]
    }
  ]
}
```

Entry contract:

| Field | Type | Rule |
|---|---|---|
| `workflow` | string | Required workflow id. |
| `state` | string | Required state involved in the transition. |
| `transition` | string | Required transition/action id. |
| `approver` | string | Required approver role, actor, or `"system"`. |
| `from_state` | string | Recommended source state. |
| `to_state` | string | Recommended target state. |
| `module` | string | Recommended owning module. |
| `risk_tags` | string array | Recommended risk tags. |

Validation requirements:

- duplicate workflow transition keys warn or fail depending on whether transitions are intentional aliases
- missing approver on approval workflows fails
- unknown workflow modules block selector narrowing for workflow changes

## 10. risk_inventory.json

Purpose: model auth, RBAC, DB, workflow, finance, payment, and risk levels.

Required shape:

```json
{
  "version": 1,
  "updated_at": "2026-06-22T00:00:00.000Z",
  "risks": [
    {
      "area": "finance",
      "paths": ["apps/api/src/modules/leasing"],
      "risk_level": "HIGH",
      "required_checks": [
        "node scripts/e2e/first-release-leasing.mjs",
        "node scripts/e2e/first-release-idempotency.mjs"
      ],
      "modules": ["leasing"],
      "human_approval_required": false
    }
  ]
}
```

Entry contract:

| Field | Type | Rule |
|---|---|---|
| `area` | string | Required canonical area. Initial canonical values: `auth`, `rbac`, `db`, `workflow`, `finance`, `payment`. |
| `paths` | string array | Required path prefixes. |
| `risk_level` | string | Required `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`. |
| `required_checks` | string array | Required commands or validation ids, may be empty only for `LOW`. |
| `modules` | string array | Recommended module ids. |
| `human_approval_required` | boolean | Recommended explicit approval flag. |

Validation requirements:

- unknown risk levels fail
- unknown canonical areas warn unless future specs extend the allowed list
- `HIGH` and `CRITICAL` entries require at least one check
- missing risk coverage for auth, RBAC, DB, workflow, finance, or payment blocks selector narrowing

## 11. Generated Metadata Rules

Runtime memory reduces repeated scans by caching relationships, but it cannot approve behavior.

Rules:

1. Inventory generation may read source files needed to classify modules and risks.
2. Inventory generation must not read or persist secrets, production credentials, or local environment override values.
3. Generated entries should include source references when practical.
4. Inventory conflicts with source files must be treated as stale inventory.
5. Runtime-memory consumers must inspect relevant source files before editing behavior.
6. Runtime-memory consumers must fall back to broad validation when inventories are missing, invalid, stale, or incomplete.
7. Business behavior changes cannot be made by editing runtime JSON alone.

## 12. runtime-generator.mjs Responsibilities

Planned purpose: scan configured project sources and produce inventory candidates.

Dry-run responsibilities:

- default to no-write mode
- parse configured source locations
- print candidate inventory additions, removals, conflicts, and gaps
- report unknown owners, unknown risk tags, duplicate routes, duplicate permissions, and missing high-risk checks
- avoid reading or printing secrets

Apply responsibilities:

- require explicit `--apply`
- write only `ops/agent-orchestrator/runtime/*.json`
- preserve deterministic ordering for reviewable diffs
- fail before writing if target paths escape the runtime directory
- avoid business-code, database, auth, CI, Docker, deploy, migration, seed, and production-file writes

## 13. runtime-rebuild.mjs Responsibilities

Planned purpose: rebuild runtime inventories deterministically from project sources.

Dry-run responsibilities:

- compute rebuilt inventory output in memory
- compare rebuilt output to existing runtime inventories when present
- print diff summaries and stale inventory warnings
- write nothing

Apply responsibilities:

- require explicit `--apply`
- replace inventory files only under `ops/agent-orchestrator/runtime/**`
- use deterministic ordering
- fail on malformed existing inventories unless a documented `--force` is added by a future task
- never use runtime JSON as the only source for business facts

## 14. runtime-validate.mjs Responsibilities

Planned purpose: validate runtime inventories before Agents or selectors rely on them.

Dry-run responsibilities:

- parse every required inventory JSON file
- validate common envelope fields
- validate required primary arrays and per-entry fields
- detect duplicate API route keys
- detect duplicate RBAC permission keys
- detect unknown owners
- detect unknown risk levels
- detect missing selector coverage for high-risk areas
- write nothing

Apply responsibilities:

- apply-mode writes are not required for architecture acceptance
- if future tasks approve a validation report, writes must stay under `ops/agent-orchestrator/runtime/**`
- validation must never modify business source files

## 15. Consumer Safety Contract

Consumers must handle runtime memory as a cache with explicit failure modes.

Required consumer behavior:

- if `runtime-validate` fails, do not use inventories for selector narrowing
- keep baseline doctor, audit, and typecheck checks
- for unknown changed paths, select conservative validations or require human approval
- for docs-only low-risk changes, allow e2e skip only with explicit explanation
- for auth, RBAC, DB, workflow, finance, and payment changes, require relevant targeted checks

## 16. Acceptance Mapping

| Acceptance item | Coverage |
|---|---|
| Defines architecture under `ops/agent-orchestrator/runtime` | Sections 2 through 4 define the planned directory and runtime memory role. |
| Specifies all seven inventory contracts | Sections 4 through 10 define `architecture.json`, `api_inventory.json`, `db_inventory.json`, `module_inventory.json`, `rbac_inventory.json`, `workflow_inventory.json`, and `risk_inventory.json`. |
| Keeps metadata separate from business truth | Sections 1, 2, 11, and 15 define generated-metadata safety rules. |
| Documents generator/rebuild/validate responsibilities | Sections 12 through 14 define dry-run and apply responsibilities. |
| Avoids business-code and production changes | Sections 1, 2, 12, 13, and 14 state no business, database, infra, auth, CI, Docker, deploy, migration, seed, or production writes. |
