# Agent Platform V2 Round2 Runtime Memory Validation Matrix

Task: `AGENT-PLATFORM-V2-A2-RUNTIME-VALIDATION`
Batch: `AGENT-PLATFORM-V2-ROUND2-20260622`
Owner: `agent-2`
Date: 2026-06-22

## 1. Scope

This matrix defines future validation coverage for Agent Platform V2 Round2:

- V2-C Project Runtime Memory inventories.
- Runtime generator, rebuild, and validate dry-run/apply behavior.
- V2-D Smart E2E Selector explainability and targeted validation selection.

This is a planning artifact only. It does not implement runtime scripts, execute Agents, add business-code tests, modify `apps/**`, `packages/**`, `database/**`, `infra/**`, auth, CI, Docker, deploy, migrations, seeds, or production configuration.

## 2. Test Invariants

All future automated cases must use isolated fixture copies or temporary directories. Tests must not mutate the live orchestrator queue, business source files, database files, production files, or Agent worktrees.

Required invariants:

- `--dry-run` writes nothing and leaves pre/post checksums unchanged.
- `--apply` for runtime memory may write only `ops/agent-orchestrator/runtime/**` in future implementation tasks.
- Runtime inventories are generated metadata, not business truth.
- Malformed inventory input fails before selector output is trusted.
- Baseline checks always remain mandatory: `orchestratorctl doctor`, `audit-all-results --dry-run`, and `pnpm typecheck`.
- Smart E2E selection may narrow e2e/smoke suites, but it must not remove baseline checks.
- Unknown HIGH or CRITICAL risk paths choose conservative validation or require human approval.
- Docs-only e2e skips must be explicit and explainable, not silent.
- No test path performs merge, push, deploy, production migration, production seed, cleanup, reset, prune, truncate, database writes, or real Agent execution.

## 3. Fixture Matrix

| Fixture | Area | Purpose | Required contents |
|---|---|---|---|
| `runtime-empty` | Runtime inventories | Prove missing runtime inventory directory has a clear bootstrap/dry-run response. | No `ops/agent-orchestrator/runtime/` directory. |
| `runtime-valid-minimal` | Runtime inventories | Prove every inventory schema accepts the smallest valid versioned object. | All seven inventory files with `version`, `updated_at`, and empty arrays. |
| `runtime-valid-project-slice` | Runtime inventories | Prove cross-inventory references work for one module. | Module, API route, RBAC permission, workflow state, DB table, and risk mapping for one fixture module. |
| `runtime-malformed-json` | Negative | Prove malformed inventory JSON blocks validation and selector use. | One inventory file with invalid JSON. |
| `runtime-missing-required` | Negative | Prove missing `version` or `updated_at` fails loudly. | Valid JSON missing required root fields. |
| `runtime-duplicate-routes` | Negative | Prove duplicate API route keys are rejected. | `api_inventory.json` with duplicate `method + route` entries. |
| `runtime-duplicate-permissions` | Negative | Prove duplicate RBAC permission keys are rejected. | `rbac_inventory.json` with duplicate `permission` values. |
| `runtime-unknown-risk` | Negative | Prove unknown risk levels are rejected. | `risk_inventory.json` with `risk_level: "SEVERE"` or another unsupported value. |
| `selector-docs-only` | Selector | Prove LOW-risk docs changes keep baseline checks and explain e2e skip. | Changed files only under `docs/**` and no matching HIGH-risk inventory path. |
| `selector-finance` | Selector | Prove finance changes select targeted finance/leasing/payment validations. | Changed files mapped to finance, receivable, payment, invoice, or idempotency risk tags. |
| `selector-rbac` | Selector | Prove RBAC/menu/guard changes select permission visibility checks. | Changed files mapped to RBAC/menu/guard risk tags. |
| `selector-workflow` | Selector | Prove workflow changes select workflow transition/approval checks. | Changed files mapped to workflow state or approver risk tags. |
| `selector-unknown-high-risk` | Negative | Prove unknown high-risk paths do not get skipped. | Changed file outside known modules but matching configured HIGH/CRITICAL path policy. |
| `selector-invalid-rules` | Negative | Prove malformed selector rules fail before output. | Invalid `selector-rules.json` or unknown validation id in a rule. |

## 4. Runtime Inventory Matrix

| Case | Inventory | Setup | Command under test | Expected result |
|---|---|---|---|---|
| INV-01 | All inventories | `runtime-valid-minimal` | Future `runtime-validate.mjs --dry-run` | Exits 0, prints schema summary, writes nothing. |
| INV-02 | `architecture.json` | Module dependency references known modules. | Future `runtime-validate.mjs --dry-run` | Reports valid module/dependency/bounded-context graph. |
| INV-03 | `api_inventory.json` | Route entries have valid owner, method, route, domain. | Future `runtime-validate.mjs --dry-run` | Accepts route keys and reports route counts by owner/domain. |
| INV-04 | `db_inventory.json` | Table entries map to owning module and migration source string. | Future `runtime-validate.mjs --dry-run` | Accepts DB inventory without modifying database schema. |
| INV-05 | `module_inventory.json` | Module maps paths, owner, domains, docs, tests, and risk tags. | Future `runtime-validate.mjs --dry-run` | Accepts path/test/doc metadata and checks owner/risk enums. |
| INV-06 | `rbac_inventory.json` | Permission entries map menu, permission, guard, role mapping. | Future `runtime-validate.mjs --dry-run` | Accepts unique permission keys and reports RBAC coverage. |
| INV-07 | `workflow_inventory.json` | Workflow entries map state, transition, approver. | Future `runtime-validate.mjs --dry-run` | Accepts workflow transitions and reports workflow coverage. |
| INV-08 | `risk_inventory.json` | Risk areas use `auth`, `rbac`, `db`, `workflow`, `finance`, or `payment`. | Future `runtime-validate.mjs --dry-run` | Accepts `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL` risk levels only. |
| INV-09 | Cross-inventory | A module path appears in module and risk inventories. | Future `runtime-validate.mjs --dry-run --explain` | Reports matched module/risk coverage and missing references. |
| INV-10 | Runtime absent | No runtime directory exists. | Future `runtime-generator.mjs --dry-run` | Prints planned inventory files and gaps; writes nothing. |

## 5. Runtime Command Matrix

| Case | Command | Mode | Setup | Expected result |
|---|---|---|---|---|
| CMD-01 | `runtime-generator.mjs` | `--dry-run` | Current repository or fixture copy. | Prints candidate inventories, gaps, and target paths; no runtime files or timestamps change. |
| CMD-02 | `runtime-generator.mjs` | `--apply` | Isolated fixture copy with approved target runtime directory. | Writes only `ops/agent-orchestrator/runtime/*.json`; deterministic output on repeat. |
| CMD-03 | `runtime-rebuild.mjs` | `--dry-run` | Existing valid runtime fixture. | Prints diff summary between generated candidates and existing inventories; writes nothing. |
| CMD-04 | `runtime-rebuild.mjs` | `--apply` | Isolated fixture copy with stale runtime files. | Rewrites only runtime JSON with deterministic formatting and updated generated metadata. |
| CMD-05 | `runtime-validate.mjs` | `--dry-run` | Valid runtime fixture. | Validates schemas, duplicates, enums, cross-links, and selector coverage; writes nothing. |
| CMD-06 | `runtime-validate.mjs` | `--apply` | Isolated fixture copy. | May write only a future validation report if approved by that implementation task; must not change business files. |
| CMD-07 | All runtime commands | Default mode | No explicit `--apply`. | Behaves as dry-run/no-write. |
| CMD-08 | All runtime commands | Bad flags | Unknown mode or conflicting flags. | Exits non-zero before scanning or writing. |

## 6. Smart Selector Matrix

| Case | Input changed files | Expected baseline | Expected selected e2e/smoke | Explainability requirement |
|---|---|---|---|---|
| SEL-01 docs only | `docs/release/example.md` | Doctor, audit dry-run, typecheck. | None. | Output says docs-only LOW-risk and lists skipped e2e suites. |
| SEL-02 orchestrator docs/specs | `ops/agent-orchestrator/specs/example.md` | Doctor, audit dry-run, typecheck. | Orchestrator validation only if selector rules mark it required. | Output lists matched docs/spec rule and why business e2e is skipped. |
| SEL-03 RBAC/menu/guard | RBAC/menu/permission/guard mapped paths. | Doctor, audit dry-run, typecheck. | RBAC/menu smoke and permission visibility validation. | Output names rule id, inventory source, matched path, and selected validation ids. |
| SEL-04 finance/leasing/payment | Receivable, payment, invoice, leasing, or idempotency mapped paths. | Doctor, audit dry-run, typecheck. | Finance/leasing/payment/idempotency/audit checks. | Output cites finance/payment risk tags and selected first-release finance scripts. |
| SEL-05 workflow | Workflow state, transition, approval, or approver mapped paths. | Doctor, audit dry-run, typecheck. | Workflow transition and approval smoke checks. | Output cites workflow inventory entries and selected validation ids. |
| SEL-06 API route | API route/controller mapped paths. | Doctor, audit dry-run, typecheck. | Domain-specific API smoke or snapshot checks when configured. | Output cites route/domain/owner from `api_inventory.json`. |
| SEL-07 DB risk | DB entity, migration-adjacent metadata, or repository mapped path. | Doctor, audit dry-run, typecheck. | DB/schema/snapshot checks or human approval if HIGH/CRITICAL. | Output cites DB inventory and risk inventory mapping. |
| SEL-08 unknown HIGH-risk | File matches HIGH/CRITICAL risk policy but no module inventory entry. | Doctor, audit dry-run, typecheck. | Conservative broad validation or human approval requirement. | Output says path is unknown but high risk, and e2e must not be skipped. |
| SEL-09 no changes | Empty changed-files set. | Doctor, audit dry-run, typecheck. | None unless current queue state requires orchestrator checks. | Output says no changed files and lists baseline checks. |
| SEL-10 malformed runtime | Any changed files with malformed runtime inventory. | Doctor, audit dry-run, typecheck. | Conservative broad validation or fail closed. | Output reports inventory validation failure before selector trust. |

## 7. Compatibility Matrix

| Case | Setup | Required proof |
|---|---|---|
| COMPAT-01 baseline mandatory | Any selector input. | Output always includes doctor, audit dry-run, and typecheck. |
| COMPAT-02 targeted e2e | Known LOW/MEDIUM module change. | Selector adds only validations mapped by rules/inventories plus baseline. |
| COMPAT-03 conservative fallback | Unknown HIGH/CRITICAL path. | Selector chooses broad validation or requires human approval; no docs-only skip. |
| COMPAT-04 docs-only skip | LOW-risk docs-only change. | Selector keeps baseline and records explicit skip reasons for e2e suites. |
| COMPAT-05 current doctor | Existing `orchestratorctl.mjs doctor`. | Current doctor remains runnable before future selector integration. |
| COMPAT-06 current audit | Existing `audit-all-results.mjs --dry-run`. | Future selector cannot mark audit optional. |
| COMPAT-07 current typecheck | Existing `pnpm typecheck`. | Future selector cannot mark typecheck optional. |
| COMPAT-08 dry cycle | Existing `orchestratorctl.mjs agent-cycle --dry-run`. | Agent-cycle remains no-agent/no-push/no-deploy and does not depend on runtime inventories until integration is implemented. |

## 8. Negative Matrix

| Case | Risk covered | Setup | Expected result |
|---|---|---|---|
| NEG-01 malformed inventory JSON | Corrupt runtime metadata | Invalid JSON in any runtime inventory. | Validation exits non-zero, prints file path, writes nothing, selector fails closed. |
| NEG-02 missing root fields | Schema drift | Missing `version` or `updated_at`. | Validation exits non-zero before selector uses the inventory. |
| NEG-03 duplicate routes | API ambiguity | Duplicate `method + route` keys in `api_inventory.json`. | Validation exits non-zero and reports duplicate route keys. |
| NEG-04 duplicate permissions | RBAC ambiguity | Duplicate `permission` keys in `rbac_inventory.json`. | Validation exits non-zero and reports duplicate permissions. |
| NEG-05 unknown risk level | Unsafe classification | `risk_level` outside `LOW|MEDIUM|HIGH|CRITICAL`. | Validation exits non-zero and selector does not treat the path as low risk. |
| NEG-06 unknown high-risk path | Unsafe narrowing | HIGH/CRITICAL path cannot be mapped to a known module. | Selector requires broad validation or human approval; e2e is not skipped. |
| NEG-07 docs-only skip bug | Over-skipping | Docs-only change also matches a HIGH/CRITICAL risk path. | Selector must not use docs-only skip; explanation identifies the high-risk match. |
| NEG-08 unknown validation id | Selector config drift | Rule selects a validation id missing from `validation-matrix.json`. | Selector exits non-zero and reports missing validation id. |
| NEG-09 unknown owner | Agent ownership drift | Inventory owner outside `agent-1` through `agent-5`. | Runtime validation exits non-zero. |
| NEG-10 dry-run mutation | Safety regression | Any dry-run command over fixture. | Pre/post checksums match for runtime, queue, reports, run plans, and timestamps. |
| NEG-11 apply out of bounds | Boundary regression | Runtime apply attempts to write outside `ops/agent-orchestrator/runtime/**`. | Command exits non-zero before write. |
| NEG-12 malformed changed-files input | CLI validation | Selector receives malformed changed-files payload. | Selector exits non-zero with usage guidance and writes nothing. |

## 9. Regression Strategy

Future implementation should add tests in stages:

1. Add syntax checks for runtime and selector scripts.
2. Add JSON schema or structured parser tests for all runtime inventory files.
3. Add fixture-based dry-run no-write tests with checksum assertions.
4. Add fixture-based apply tests only inside temporary runtime directories.
5. Add selector explain tests for docs-only, RBAC, finance, workflow, DB, and unknown high-risk changes.
6. Integrate selector output into validation planning only after baseline doctor, audit, and typecheck are proven mandatory in automated tests.
7. Keep business-code e2e scripts unchanged in the planning phase; selector tests should verify command selection, reasons, and skip decisions rather than execute product workflows.

Future implementation validation should include:

```bash
node --check ops/agent-orchestrator/scripts/runtime-generator.mjs
node --check ops/agent-orchestrator/scripts/runtime-rebuild.mjs
node --check ops/agent-orchestrator/scripts/runtime-validate.mjs
node --check ops/agent-orchestrator/scripts/e2e-selector.mjs
node ops/agent-orchestrator/scripts/runtime-generator.mjs --dry-run
node ops/agent-orchestrator/scripts/runtime-rebuild.mjs --dry-run
node ops/agent-orchestrator/scripts/runtime-validate.mjs --dry-run
node ops/agent-orchestrator/scripts/e2e-selector.mjs --dry-run --explain
node ops/agent-orchestrator/scripts/e2e-selector.mjs --changed-files docs/release/example.md --explain
```

## 10. Current Task Validation

For this planning task, run:

```bash
git status --short
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
pnpm typecheck
git diff --check
git status --short
```

These commands validate current orchestrator compatibility and repository health. They do not execute Agents, create runtime inventories, run production operations, or prove future runtime script behavior until those scripts are implemented.
