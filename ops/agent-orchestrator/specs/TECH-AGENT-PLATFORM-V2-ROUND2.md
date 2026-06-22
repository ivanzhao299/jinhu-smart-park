# TECH: Agent Platform V2 Round 2

## 1. Technical Objective

Round 2 adds planning for Project Runtime Memory and Smart E2E Selector. The goal is to reduce repeated discovery work for Agents and make validation selection explainable from changed files and runtime inventories.

This document is planning-only. It does not implement scripts, modify business code, run Agents, merge, push, deploy, or perform production operations.

## 2. V2-C Project Runtime Memory

### 2.1 Runtime Directory

Planned directory:

```text
ops/agent-orchestrator/runtime/
```

Planned inventory files:

```text
architecture.json
api_inventory.json
db_inventory.json
module_inventory.json
rbac_inventory.json
workflow_inventory.json
risk_inventory.json
```

### 2.2 Inventory Shapes

`architecture.json`:

```json
{
  "version": 1,
  "updated_at": "ISO-8601",
  "modules": [],
  "dependencies": [],
  "bounded_contexts": []
}
```

`api_inventory.json`:

```json
{
  "version": 1,
  "updated_at": "ISO-8601",
  "routes": [
    {
      "controller": "string",
      "route": "string",
      "method": "GET|POST|PUT|PATCH|DELETE",
      "domain": "string",
      "owner": "agent-1|agent-2|agent-3|agent-4|agent-5"
    }
  ]
}
```

`db_inventory.json`:

```json
{
  "version": 1,
  "updated_at": "ISO-8601",
  "tables": [
    {
      "table": "string",
      "migration_source": "string",
      "owning_module": "string",
      "entity_or_repository": "string",
      "risk_notes": []
    }
  ]
}
```

`module_inventory.json`:

```json
{
  "version": 1,
  "updated_at": "ISO-8601",
  "modules": [
    {
      "module": "string",
      "paths": [],
      "owner": "agent-1|agent-2|agent-3|agent-4|agent-5",
      "domains": [],
      "tests": [],
      "docs": [],
      "risk_tags": []
    }
  ]
}
```

`rbac_inventory.json`:

```json
{
  "version": 1,
  "updated_at": "ISO-8601",
  "entries": [
    {
      "menu": "string",
      "permission": "string",
      "guard": "string",
      "role_mapping": []
    }
  ]
}
```

`workflow_inventory.json`:

```json
{
  "version": 1,
  "updated_at": "ISO-8601",
  "workflows": [
    {
      "workflow": "string",
      "state": "string",
      "transition": "string",
      "approver": "string"
    }
  ]
}
```

`risk_inventory.json`:

```json
{
  "version": 1,
  "updated_at": "ISO-8601",
  "risks": [
    {
      "area": "auth|rbac|db|workflow|finance|payment",
      "paths": [],
      "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
      "required_checks": []
    }
  ]
}
```

### 2.3 Runtime Scripts

Planned scripts:

| Script | Purpose | Dry-run | Apply |
|---|---|---|---|
| `runtime-generator.mjs` | Scan configured project files and produce inventory candidates. | Print planned inventories and gaps. | Write `ops/agent-orchestrator/runtime/*.json`. |
| `runtime-rebuild.mjs` | Rebuild inventories from known sources and existing inventory hints. | Print diff summary. | Write deterministic runtime JSON. |
| `runtime-validate.mjs` | Validate inventory schemas, duplicates, and risk coverage. | Validate without writing. | May write validation report only if explicitly approved in future tasks. |

Rules:

- `--dry-run` is the default and writes nothing.
- `--apply` may write only under `ops/agent-orchestrator/runtime/**`.
- Scripts must not write business paths.
- Scripts must not read or emit secrets.
- Inventory generation must be deterministic enough for reviewable diffs.

### 2.4 Validation Rules

Runtime validation must detect:

- malformed JSON
- missing `version`
- missing `updated_at`
- duplicate API route keys
- duplicate RBAC permission keys
- unknown owner
- unknown risk level
- missing selector coverage for HIGH/CRITICAL risk areas

## 3. V2-D Smart E2E Selector

### 3.1 Planned Files

```text
ops/agent-orchestrator/runtime/selector-rules.json
ops/agent-orchestrator/runtime/validation-matrix.json
ops/agent-orchestrator/scripts/e2e-selector.mjs
```

### 3.2 Selector Rule Shape

`selector-rules.json` should support:

```json
{
  "version": 1,
  "rules": [
    {
      "rule_id": "rbac-change",
      "match": {
        "paths": [],
        "risk_tags": ["rbac"]
      },
      "select": ["rbac-menu-smoke"],
      "reason": "RBAC/menu/guard changes require permission visibility validation"
    }
  ]
}
```

`validation-matrix.json` should support:

```json
{
  "version": 1,
  "baseline": [
    "doctor",
    "audit-all-results --dry-run",
    "pnpm typecheck"
  ],
  "validations": [
    {
      "validation_id": "rbac-menu-smoke",
      "command": "node scripts/e2e/first-release-menu-whitelist.mjs",
      "risk_level": "HIGH",
      "domains": ["rbac", "menu"]
    }
  ]
}
```

### 3.3 Selector CLI

Planned commands:

```bash
node ops/agent-orchestrator/scripts/e2e-selector.mjs --dry-run
node ops/agent-orchestrator/scripts/e2e-selector.mjs --dry-run --explain
node ops/agent-orchestrator/scripts/e2e-selector.mjs --changed-files <file1,file2> --explain
```

Output:

- selected validations
- baseline checks
- reasons
- skipped e2e suites
- risk summary
- human approval flag

### 3.4 Rule Examples

| Input | Expected selection |
|---|---|
| RBAC/menu/guard files | RBAC/menu smoke and permission visibility validation |
| Finance/receivable/payment/invoice files | Finance, leasing, payment, idempotency, audit checks |
| Workflow/state/approver files | Workflow transition and approval checks |
| IoT/safety runtime files | Safety, IoT alert, device, hazard checks |
| Docs-only LOW risk | Baseline only; e2e skipped with explanation |
| Unknown HIGH-risk path | Conservative broad validation or human approval required |

## 4. Agent Task Design

### 4.1 agent-5: Runtime Architecture

Task: `AGENT-PLATFORM-V2-A5-RUNTIME-ARCH`

Expected outputs:

- `docs/release/agent-platform-v2-runtime-memory-architecture.md`
- `ops/agent-orchestrator/specs/TECH-AGENT-PLATFORM-V2-RUNTIME-MEMORY.md`
- `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A5-RUNTIME-ARCH.md`

### 4.2 agent-3: Inventory Generator

Task: `AGENT-PLATFORM-V2-A3-INVENTORY-GENERATOR`

Expected outputs:

- `docs/release/agent-platform-v2-inventory-generator-design.md`
- `docs/testing/agent-platform-v2-inventory-generator-test-plan.md`
- `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A3-INVENTORY-GENERATOR.md`

### 4.3 agent-4: Smart E2E Selector

Task: `AGENT-PLATFORM-V2-A4-E2E-SELECTOR`

Expected outputs:

- `docs/release/agent-platform-v2-smart-e2e-selector-design.md`
- `docs/testing/agent-platform-v2-e2e-selector-test-plan.md`
- `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A4-E2E-SELECTOR.md`

### 4.4 agent-2: Runtime Validation

Task: `AGENT-PLATFORM-V2-A2-RUNTIME-VALIDATION`

Expected outputs:

- `docs/testing/agent-platform-v2-runtime-memory-validation-matrix.md`
- `docs/release/agent-platform-v2-round2-compatibility-test-plan.md`
- `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A2-RUNTIME-VALIDATION.md`

## 5. Verification Strategy

Round 2 planning validation:

```bash
node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/queue/task-queue.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/queue/task-locks.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/queue/task-results.json','utf8'));"
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
git diff --check
pnpm typecheck
```

Future implementation validation:

- `node --check ops/agent-orchestrator/scripts/runtime-generator.mjs`
- `node --check ops/agent-orchestrator/scripts/runtime-rebuild.mjs`
- `node --check ops/agent-orchestrator/scripts/runtime-validate.mjs`
- `node --check ops/agent-orchestrator/scripts/e2e-selector.mjs`
- Runtime JSON schema parse tests.
- Selector explain tests.
- Docs-only e2e skip tests.
- HIGH-risk conservative selection tests.

## 6. Rollout

1. Planning docs and queue tasks.
2. Runtime inventory architecture.
3. Inventory generator/rebuild/validate dry-run.
4. Selector rule/matrix design.
5. Selector dry-run/explain.
6. Agent-cycle integration only after dry-run stability.

## 7. Rollback

- Keep runtime inventories as generated metadata, not business truth.
- If selector output is uncertain, fall back to broader validation.
- Keep baseline doctor/audit/typecheck always enabled.
- Disable selector-driven e2e narrowing if inventory validation fails.
