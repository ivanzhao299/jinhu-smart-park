# Agent Platform V2 Inventory Generator Test Plan

Task: `AGENT-PLATFORM-V2-A3-INVENTORY-GENERATOR`
Batch: `AGENT-PLATFORM-V2-ROUND2-20260622`
Owner: `agent-3`
Date: 2026-06-22

## 1. Scope

This plan defines current planning validation and future implementation tests for `runtime-generator.mjs`, `runtime-rebuild.mjs`, and `runtime-validate.mjs`.

This task is documentation-only. It does not implement scripts, create runtime inventory files, modify app/package/database/infra/auth/CI/Docker/deploy files, run production operations, execute Agents, merge, or push.

## 2. Test Invariants

Future automated tests must preserve these invariants:

- `--dry-run` is the default and writes nothing.
- `--apply` writes only under `ops/agent-orchestrator/runtime/**`.
- Malformed JSON fails before writes.
- Duplicate conflicting identity keys fail before writes.
- Rebuilding unchanged inputs produces no semantic diff and no timestamp churn.
- Generated JSON is canonical, stable, and parseable by current Node.js tooling.
- Runtime inventory validation must pass before Agents or selector logic consume generated inventories.
- Tests must use isolated fixtures or temporary directories for apply behavior.
- No test performs merge, push, deploy, production migration, production seed, Docker cleanup, database reset, truncate, prune, production data writes, or real Agent execution.

## 3. Current Planning Validation

The current documentation task should run:

```bash
git status --short
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
pnpm typecheck
git diff --check
git status --short
```

Expected:

- Only the expected planning files are changed.
- Dispatch status remains compatible with current queue JSON.
- Doctor and agent-cycle dry-run do not execute Agents, merge, push, deploy, or run production operations.
- Typecheck passes.
- `git diff --check` passes.

## 4. Future Fixture Matrix

| Fixture | Purpose | Required contents |
|---|---|---|
| `empty-runtime` | Prove dry-run can report planned inventory creation without writes. | No runtime directory or empty temp runtime directory. |
| `valid-minimal-source` | Prove all seven inventories can be generated from minimal source fixtures. | One module, one route, one table, one RBAC entry, one workflow transition, one risk entry. |
| `duplicate-same-evidence` | Prove identical duplicate evidence collapses safely. | Two source files describing the same normalized route/permission/module with identical payload. |
| `duplicate-conflict` | Prove conflicting duplicates fail. | Same route/permission/table/workflow/risk identity with different owner/domain/risk/check payload. |
| `malformed-existing-runtime` | Prove malformed JSON blocks validation and rebuild comparison. | Existing runtime JSON with invalid syntax. |
| `missing-required-fields` | Prove schema validation catches incomplete inventories. | Runtime JSON missing `version`, `updated_at`, or required arrays. |
| `unknown-owner-risk` | Prove owner and risk enums are strict. | Owner outside `agent-1` to `agent-5`; risk level outside `LOW` to `CRITICAL`. |
| `high-risk-no-checks` | Prove selector readiness requires coverage. | HIGH/CRITICAL risk entries without `required_checks`. |
| `deterministic-rebuild` | Prove repeated rebuilds are stable. | Same fixture inputs read in shuffled filesystem order. |
| `apply-atomicity` | Prove apply does not partially write after late validation failure. | Valid staged files plus one cross-reference failure discovered after render. |

## 5. Runtime Generator Cases

| Case | Command | Setup | Expected result |
|---|---|---|---|
| GEN-01 dry-run default | `runtime-generator.mjs` | Valid minimal source fixture. | Exits 0, prints planned inventory counts and gaps, writes nothing. |
| GEN-02 explicit dry-run | `runtime-generator.mjs --dry-run` | Valid minimal source fixture. | Same as default; pre/post checksums match. |
| GEN-03 apply valid | `runtime-generator.mjs --apply` | Isolated fixture runtime directory. | Writes the seven runtime JSON files only after validation. |
| GEN-04 no secret reads | `runtime-generator.mjs --dry-run` | Fixture containing `.env`, `.env.production`, and unrelated secret-like files. | Files are skipped by allowlist; output does not print secret values. |
| GEN-05 source gap report | `runtime-generator.mjs --dry-run` | Module with API route but no owner/risk hint. | Exits non-zero or reports blocking gap according to future policy; writes nothing. |

## 6. Runtime Rebuild Cases

| Case | Command | Setup | Expected result |
|---|---|---|---|
| REBUILD-01 dry-run diff | `runtime-rebuild.mjs --dry-run` | Existing valid runtime differs from source fixture. | Prints stable diff summary and planned writes; writes nothing. |
| REBUILD-02 unchanged apply | `runtime-rebuild.mjs --apply` | Existing runtime semantically matches source fixture. | Exits 0 and writes nothing, including no `updated_at` churn. |
| REBUILD-03 changed apply | `runtime-rebuild.mjs --apply` | Source fixture adds one route and one risk. | Writes canonical JSON under runtime directory after full validation. |
| REBUILD-04 deterministic ordering | `runtime-rebuild.mjs --apply` | Same files presented in different filesystem order. | Generated JSON is byte-for-byte identical. |
| REBUILD-05 atomic failure | `runtime-rebuild.mjs --apply` | Staged set has one invalid cross-reference. | Exits non-zero and leaves previous runtime files unchanged. |

## 7. Runtime Validate Cases

| Case | Command | Setup | Expected result |
|---|---|---|---|
| VALIDATE-01 valid inventories | `runtime-validate.mjs --dry-run` | Complete valid seven-file runtime fixture. | Exits 0 and prints validation summary. |
| VALIDATE-02 malformed JSON | `runtime-validate.mjs --dry-run` | One invalid JSON file. | Exits non-zero, reports file path and parse location when available, writes nothing. |
| VALIDATE-03 missing metadata | `runtime-validate.mjs --dry-run` | Missing `version` or `updated_at`. | Exits non-zero with schema failure. |
| VALIDATE-04 duplicate API route | `runtime-validate.mjs --dry-run` | Two `method route` identities with different payload. | Exits non-zero before Agents or selector use. |
| VALIDATE-05 duplicate RBAC permission | `runtime-validate.mjs --dry-run` | Same permission with different guard/menu mapping. | Exits non-zero. |
| VALIDATE-06 unknown owner | `runtime-validate.mjs --dry-run` | Owner not in known Agent list. | Exits non-zero. |
| VALIDATE-07 unknown risk level | `runtime-validate.mjs --dry-run` | Risk level outside allowed enum. | Exits non-zero. |
| VALIDATE-08 HIGH risk without checks | `runtime-validate.mjs --dry-run` | HIGH/CRITICAL risk entry has no checks. | Exits non-zero and selector must not use narrowing. |
| VALIDATE-09 cross-inventory orphan | `runtime-validate.mjs --dry-run` | API/RBAC/workflow entry references unknown module. | Exits non-zero. |

## 8. Source Mapping Coverage

Future tests should assert each inventory receives data from expected source classes:

| Inventory | Coverage proof |
|---|---|
| `architecture.json` | Module roots, dependency edges, and bounded contexts are discovered and sorted. |
| `api_inventory.json` | Controller, route, method, domain, and owner are discovered and duplicate checked. |
| `db_inventory.json` | Table, migration source, owning module, entity/repository, and risk notes are discovered without database connection. |
| `module_inventory.json` | Module paths, owners, domains, tests, docs, and risk tags are connected. |
| `rbac_inventory.json` | Menu, permission, guard, and role mapping are connected. |
| `workflow_inventory.json` | Workflow, state, transition, and approver are connected. |
| `risk_inventory.json` | Area, paths, risk level, and required checks are connected to selector validation. |

## 9. Agent And Selector Gate Tests

Before generated inventories are consumed:

| Case | Setup | Expected result |
|---|---|---|
| GATE-01 valid runtime | `runtime-validate.mjs --dry-run` exits 0. | Agent prompt and selector may read validated inventory summaries. |
| GATE-02 invalid runtime | Malformed JSON or duplicate conflict. | Agent prompt marks runtime memory unavailable; selector falls back to conservative validation. |
| GATE-03 missing risk coverage | HIGH/CRITICAL risk without checks. | Selector narrowing is disabled and broader validation or human approval is required. |
| GATE-04 stale partial runtime | Fewer than seven inventories exist. | Validation fails; consumers must not use partial data. |

## 10. No-Write Verification Method

For every dry-run case, tests should capture checksums before and after:

```bash
find ops/agent-orchestrator/runtime ops/agent-orchestrator/queue ops/agent-orchestrator/runs ops/agent-orchestrator/reports -type f -print0 \
  | sort -z \
  | xargs -0 shasum
```

The exact checksum helper may change in implementation, but dry-run tests must prove no inventory, queue, lock, result, run, prompt, report, git, production, database, Docker, or deploy state was modified.

## 11. Pass Criteria

The inventory generator suite passes when:

- Dry-run is no-write by checksum.
- Apply writes only the future runtime directory and only after validation.
- Malformed JSON and schema errors fail loudly.
- Duplicate conflicts fail before materialization.
- Repeated rebuilds of unchanged inputs create no diff.
- All seven inventories have source mapping coverage.
- Agent and selector consumption is blocked unless validation succeeds.
