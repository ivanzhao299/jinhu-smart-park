# Agent Platform V2 Inventory Generator Design

Task: `AGENT-PLATFORM-V2-A3-INVENTORY-GENERATOR`
Batch: `AGENT-PLATFORM-V2-ROUND2-20260622`
Owner: `agent-3`
Date: 2026-06-22

## 1. Goal

Design the future runtime inventory generator, rebuild, and validation commands for Agent Platform V2 Project Runtime Memory.

The runtime inventories reduce repeated repository scanning by giving Agents and selector logic a generated, validated view of project architecture, API, database, module, RBAC, workflow, and risk metadata.

This document is planning-only. It does not implement `runtime-generator.mjs`, `runtime-rebuild.mjs`, `runtime-validate.mjs`, create `ops/agent-orchestrator/runtime/**`, modify business code, change database schema, change auth/CI/Docker/deploy/runtime configuration, run Agents, merge, push, deploy, seed, migrate, clean up, reset, or write production data.

## 2. Planned Commands

All commands default to `--dry-run` when neither `--dry-run` nor `--apply` is provided.

| Command | Primary responsibility | Dry-run behavior | Apply behavior |
|---|---|---|---|
| `runtime-generator.mjs` | Discover source inputs and produce inventory candidates plus gap reports. | Parse source inputs, print candidate counts, conflicts, missing mappings, and planned writes. Writes nothing. | Write only validated inventory files under `ops/agent-orchestrator/runtime/**` after full validation. |
| `runtime-rebuild.mjs` | Rebuild deterministic runtime inventories from configured source inputs, existing generated inventories, and approved hints. | Build the complete in-memory materialization, compare with existing runtime files if present, and print a stable diff summary. Writes nothing. | Replace runtime inventory JSON only when the staged full set validates. |
| `runtime-validate.mjs` | Validate existing or staged runtime inventories before Agent or selector use. | Parse and validate without writing. Exit non-zero on malformed JSON, schema failures, duplicate conflicts, unknown owners, unknown risks, or missing HIGH/CRITICAL coverage. | Future apply mode may write a validation report only if a later task explicitly approves that output path. It must not mutate inventory files. |

## 3. Inventory Outputs

The planned runtime directory remains:

```text
ops/agent-orchestrator/runtime/
├── architecture.json
├── api_inventory.json
├── db_inventory.json
├── module_inventory.json
├── rbac_inventory.json
├── workflow_inventory.json
└── risk_inventory.json
```

The baseline JSON shapes are defined in `ops/agent-orchestrator/specs/TECH-AGENT-PLATFORM-V2-ROUND2.md`. Future implementation should keep those required fields stable. Additional generator metadata, if needed, should be additive and namespaced, for example `_meta.source_hash`, so existing readers can ignore it.

## 4. Source Input Mapping

Future implementation should use a source allowlist. It may read project source files needed for inventory discovery, but it must never read `.env*`, private credentials, build artifacts, dependency caches, production secrets, or external services.

| Inventory | Source inputs | Extraction intent | Required validation |
|---|---|---|---|
| `architecture.json` | Workspace manifests, app/package roots, Nest modules, frontend route groups, shared package exports, existing Round 2 specs. | Identify modules, bounded contexts, package/app ownership, and dependency edges. | Unique module names, valid dependency endpoints, stable bounded-context names, no dependency on forbidden secret/config files. |
| `api_inventory.json` | API controllers, route decorators, HTTP method decorators, module ownership hints, API docs and smoke scripts. | Map controller, route, method, domain, and owner. | Unique normalized route key, known owner, known domain/module mapping, no duplicate method+route conflict. |
| `db_inventory.json` | Migration filenames/content, entity/repository files, database docs, production-safe seed documentation. | Map table, migration source, owning module, entity/repository reference, and risk notes without connecting to a database. | Unique table key, migration source path present, owning module exists, no schema-changing side effect. |
| `module_inventory.json` | App/package directory map, API modules, frontend sections, shared contracts, e2e scripts, release/testing docs, orchestrator task ownership. | Map module paths to owners, domains, tests, docs, and risk tags. | Unique module key, every path covered by one primary module or an explicit shared module, tests/docs paths exist or are marked as planned. |
| `rbac_inventory.json` | Permission constants, guard/decorator usage, menu whitelist logic, production-safe seed references, RBAC docs and smoke scripts. | Map menu, permission, guard, and role mappings. | Unique permission key, known guard names, no menu/permission orphan, valid owner/domain reference. |
| `workflow_inventory.json` | State enums, transition functions, approval/approver configuration, workflow docs, workflow smoke scripts. | Map workflow, state, transition, and approver. | Unique workflow transition key, source/target state presence, known approver role or explicit manual approver marker. |
| `risk_inventory.json` | AGENTS rules, release docs, testing docs, module inventory, path globs, validation matrix, financial/idempotency/auth/RBAC rules. | Map risk area, paths, risk level, and required checks. | Known area and risk level, every HIGH/CRITICAL risk has at least one required check, forbidden paths require human approval markers. |

## 5. Deterministic Rebuild Contract

Inventory rebuild must be deterministic enough for reviewable diffs:

- Traverse input paths in normalized POSIX lexical order.
- Normalize path separators to `/`.
- Normalize route keys as `METHOD route`, with route slashes collapsed and trailing slash removed except for `/`.
- Normalize owners to `agent-1` through `agent-5`.
- Normalize risk levels to `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.
- Sort object arrays by their stable identity keys.
- Write JSON with a fixed indentation style and a trailing newline.
- Preserve existing `updated_at` when the generated semantic content is unchanged.
- Change `updated_at` only when semantic content changes.
- Build all inventories in memory before any apply write.
- Validate the full staged inventory set before replacing any existing file.

Recommended stable identity keys:

| Inventory | Identity key |
|---|---|
| `architecture.json` modules | `module` |
| `architecture.json` dependencies | `from + "->" + to + ":" + type` |
| `architecture.json` bounded contexts | `context` |
| `api_inventory.json` routes | `method + " " + route` |
| `db_inventory.json` tables | lower-case `table` |
| `module_inventory.json` modules | `module` |
| `rbac_inventory.json` entries | `permission` |
| `workflow_inventory.json` workflows | `workflow + ":" + state + ":" + transition` |
| `risk_inventory.json` risks | `area + ":" + sorted(paths).join(",")` |

## 6. Duplicate And Conflict Handling

The generator must distinguish harmless duplicate evidence from conflicting inventory facts.

| Case | Required behavior |
|---|---|
| Same identity key, same normalized payload, different source evidence | Collapse to one inventory entry and retain source references if supported. Dry-run prints an informational duplicate-evidence count. |
| Same identity key, different normalized payload | Fatal duplicate conflict. Exit non-zero before writes and list every source path that contributed to the conflict. |
| Duplicate API method+route with different controller/domain/owner | Fatal conflict. Agents and selector logic must not consume the generated inventory. |
| Duplicate RBAC permission with different menu/guard/role mapping | Fatal conflict. |
| Duplicate DB table with different owning module or migration source | Fatal conflict unless an approved hint explicitly marks shared ownership. |
| Duplicate workflow transition with different approver/state meaning | Fatal conflict. |
| Duplicate risk path with different risk level | Fatal conflict; choose conservative `CRITICAL` only through a later approved policy, not silently. |

Duplicate detection must run against the full staged inventory set, not per-file partial output, so cross-inventory conflicts are caught before materialization.

## 7. Malformed JSON And Invalid Input Handling

Malformed JSON is always fatal when reading existing runtime inventories, approved hints, selector rules, validation matrices, or future runtime source manifests.

Required behavior:

- Report the file path and parse failure location when available.
- Do not fall back to stale inventories after malformed JSON.
- Do not partially write valid files when one inventory or hint file is malformed.
- Treat missing `version`, unsupported `version`, missing `updated_at`, unknown owner, unknown risk level, and invalid required-check references as validation failures.
- Keep stdout/stderr free of secrets and large source excerpts.

## 8. Dry-Run No-Write Requirements

Dry-run is the safety default and must be demonstrably no-write:

- No inventory file writes.
- No validation report writes.
- No directory creation.
- No timestamp updates.
- No prompt, queue, lock, result, git, branch, merge, push, deploy, database, Docker, seed, migration, cleanup, reset, truncate, prune, or production operation.
- Output is limited to stdout/stderr summaries and process exit status.

Tests should prove no-write behavior with pre/post checksums of `ops/agent-orchestrator/runtime/**` and other orchestrator bookkeeping files.

## 9. Materialization Design

Future apply mode should materialize as an all-or-nothing transaction:

1. Discover source inputs from the allowlist.
2. Parse source files and existing approved hints.
3. Build normalized candidate records in memory.
4. Deduplicate identical evidence and fail on conflicts.
5. Construct all seven inventories in memory.
6. Validate schemas, cross references, risk coverage, and selector readiness.
7. Render canonical JSON strings.
8. Compare with existing runtime files.
9. If no semantic diff exists, write nothing.
10. If changes exist, write temporary files under the runtime directory and atomically replace target files.

Apply mode may write only under `ops/agent-orchestrator/runtime/**` in the future implementation task. This planning task intentionally does not create that directory or any runtime script.

## 10. Validation Before Use

Agents and selector logic should consume runtime inventories only after `runtime-validate.mjs --dry-run` exits successfully for the current runtime directory.

Validation gate requirements:

- All seven inventory files parse as JSON.
- Every file has supported `version` and valid `updated_at`.
- Required arrays exist and contain normalized objects.
- Owners are known Agents.
- Risk areas and levels are known.
- Duplicate identity keys are absent.
- `api_inventory.json`, `rbac_inventory.json`, `workflow_inventory.json`, and `db_inventory.json` entries map to a known module or explicit shared module.
- Every HIGH/CRITICAL `risk_inventory.json` entry has required checks.
- Required checks referenced by risks exist in the validation matrix when selector integration is enabled.

If validation fails, the selector must fall back to conservative validation, and Agents must treat runtime memory as unavailable rather than trusting stale or partial inventories.

## 11. Selector And Agent Consumption

The generated inventories support two consumers:

| Consumer | Runtime inputs | Required behavior |
|---|---|---|
| Agent prompts and task planning | `architecture.json`, `module_inventory.json`, optional API/DB/RBAC/workflow inventories relevant to the task domain. | Include only validated inventory summaries. If validation fails, prompt should say runtime memory unavailable and require normal repository inspection. |
| Smart E2E selector | `module_inventory.json`, `risk_inventory.json`, and optional API/RBAC/workflow inventories. | Select baseline checks always, then add focused checks from validated module/risk mappings. If validation fails or a changed file is unknown HIGH-risk, select broader validation or require human approval. |

Runtime inventory is operational metadata, not business truth. It must never override source code, migrations, auth rules, financial safeguards, production seed rules, or release procedures.

## 12. Rollout And Rollback

Rollout should remain staged:

1. Land planning docs.
2. Implement scripts behind dry-run defaults.
3. Add fixture validation for malformed JSON, duplicates, and no-write dry-run.
4. Enable apply writes only to `ops/agent-orchestrator/runtime/**`.
5. Gate Agent/selector consumption on `runtime-validate.mjs --dry-run`.

Rollback is simple while runtime inventories are generated metadata:

- Ignore or remove invalid runtime inventory files after human review.
- Re-run rebuild from source inputs once scripts exist.
- Disable selector narrowing and use baseline plus broad validation if inventories are missing or invalid.
