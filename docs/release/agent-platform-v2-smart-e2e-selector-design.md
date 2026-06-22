# Agent Platform V2 Smart E2E Selector Design

Task: `AGENT-PLATFORM-V2-A4-E2E-SELECTOR`
Batch: `AGENT-PLATFORM-V2-ROUND2-20260622`
Owner: `agent-4`
Date: 2026-06-22

## 1. Scope

This document designs the future Smart E2E Selector for Agent Platform V2-D. It is a planning artifact only. It does not implement `selector-rules.json`, `validation-matrix.json`, `e2e-selector.mjs`, business code, database changes, deployment logic, CI, Docker, auth, seed, migration, or production behavior.

The selector will map changed files plus runtime inventories to the smallest safe validation set. It must never remove the baseline checks:

- `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor`
- `node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run`
- `pnpm typecheck`

## 2. Goals

- Accept changed files from CLI input or a local git diff provider.
- Read generated runtime inventories for modules and risks.
- Select targeted validations for RBAC, finance, workflow, IoT/safety, and unknown high-risk changes.
- Allow low-risk docs-only changes to skip E2E suites with an explicit reason.
- Explain every selected and skipped validation.
- Fall back conservatively when the selector cannot prove a change is low risk.

## 3. Non-Goals

- No selector implementation in this task.
- No runtime inventory generation in this task.
- No mutation of `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, auth, migration, seed, or production files.
- No Agent execution, merge, push, deploy, production migration, production seed, cleanup, reset, prune, or production data write.

## 4. Planned Files

Future implementation tasks may add:

```text
ops/agent-orchestrator/runtime/selector-rules.json
ops/agent-orchestrator/runtime/validation-matrix.json
ops/agent-orchestrator/scripts/e2e-selector.mjs
```

This planning task only creates the release design, testing plan, and task report.

## 5. Inputs

### 5.1 Changed Files

The selector input is a normalized list of repo-relative paths:

```json
{
  "changed_files": [
    "apps/web/app/(dashboard)/system/roles/page.tsx",
    "packages/shared/src/permissions.ts"
  ]
}
```

Future CLI sources:

- `--changed-files <comma-separated-paths>` for orchestrator-provided paths.
- Optional `--changed-files-from <path>` for newline-delimited fixture inputs.
- Default local mode may read git diff output, but it must report which diff source was used.

Normalization rules:

- Reject absolute paths and paths escaping the repository.
- Convert path separators to `/`.
- De-duplicate and sort for stable output.
- Preserve original paths in explanation output.

### 5.2 Runtime Inventories

Minimum required inventories:

- `ops/agent-orchestrator/runtime/risk_inventory.json`
- `ops/agent-orchestrator/runtime/module_inventory.json`

Optional enrichment inventories:

- `ops/agent-orchestrator/runtime/rbac_inventory.json`
- `ops/agent-orchestrator/runtime/workflow_inventory.json`
- `ops/agent-orchestrator/runtime/api_inventory.json`

The selector must fail closed if required inventories are missing, malformed, stale, or fail runtime validation. Fail closed means selecting broad validation or requiring human approval instead of silently skipping checks.

### 5.3 Selector Rules

`selector-rules.json` defines how changed files and inventory hits map to validation IDs. It should be deterministic, reviewable, and data-only.

Proposed shape:

```json
{
  "version": 1,
  "defaults": {
    "unknown_risk_level": "HIGH",
    "docs_only_risk_level": "LOW",
    "unknown_high_risk_strategy": "select-conservative-and-require-human"
  },
  "rules": [
    {
      "rule_id": "rbac-change",
      "description": "RBAC, menu, guard, role, or permission changes require permission visibility validation.",
      "match": {
        "paths": [
          "apps/api/src/**/guards/**",
          "apps/api/src/**/roles/**",
          "apps/web/**/menu/**",
          "packages/shared/**/permission*"
        ],
        "risk_tags": ["rbac", "permission", "menu"],
        "module_tags": ["rbac", "system"]
      },
      "select": ["rbac-menu-smoke", "rbac-standard-smoke"],
      "risk_level": "HIGH",
      "reason": "RBAC/menu changes can hide or expose protected operations."
    }
  ]
}
```

Required rule fields:

| Field | Purpose |
|---|---|
| `rule_id` | Stable explanation and fixture key. |
| `description` | Human-readable rule purpose. |
| `match.paths` | Glob patterns for direct path matching. |
| `match.risk_tags` | Risk inventory tags that trigger the rule. |
| `match.module_tags` | Module inventory tags that trigger the rule. |
| `select` | Validation IDs from `validation-matrix.json`. |
| `risk_level` | Selector-level risk assigned by the rule. |
| `reason` | Explanation attached to selected validations. |

Optional fields:

| Field | Purpose |
|---|---|
| `require_all_paths_low_risk` | Allow docs-only skip only when every changed path is low risk. |
| `human_approval_required` | Force explicit approval for sensitive or unknown high-risk changes. |
| `fallback_select` | Conservative validations when inventories cannot classify a path. |
| `skip_when` | Conditions that explain why a validation is not needed. |

## 6. Validation Matrix

`validation-matrix.json` defines baseline checks and selectable validation commands. Baseline checks must always be present, even when no E2E validation is selected.

Proposed shape:

```json
{
  "version": 1,
  "baseline": [
    {
      "validation_id": "orchestrator-doctor",
      "command": "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
      "always": true,
      "reason": "Orchestrator health must remain valid for every task."
    },
    {
      "validation_id": "orchestrator-audit-dry-run",
      "command": "node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run",
      "always": true,
      "reason": "Result audit compatibility must remain safe and no-write."
    },
    {
      "validation_id": "workspace-typecheck",
      "command": "pnpm typecheck",
      "always": true,
      "reason": "Workspace TypeScript contracts must remain valid."
    }
  ],
  "validations": [
    {
      "validation_id": "rbac-menu-smoke",
      "command": "node scripts/e2e/first-release-menu-whitelist.mjs",
      "domains": ["rbac", "menu"],
      "risk_level": "HIGH",
      "requires_services": ["api"],
      "default_skip_reason": "No RBAC, menu, permission, or guard change was detected."
    }
  ]
}
```

Recommended validation IDs:

| Validation ID | Command | Primary selection reason |
|---|---|---|
| `rbac-menu-smoke` | `node scripts/e2e/first-release-menu-whitelist.mjs` | Menu whitelist, permission, role, and visibility changes. |
| `rbac-standard-smoke` | `node scripts/e2e/s1-rbac-std-fix-smoke.mjs` | RBAC standardization or permission contract changes. |
| `finance-leasing-regression` | `node scripts/e2e/first-release-leasing.mjs` | Leasing, receivable, contract, invoice, payment, or waiver changes. |
| `finance-payment-smoke` | `node scripts/e2e/s3d-payment-smoke.mjs` | Payment application, payment reversal, or payment status changes. |
| `finance-idempotency-regression` | `node scripts/e2e/first-release-idempotency.mjs` | Retryable financial write or duplicate-prevention changes. |
| `workflow-workorders-regression` | `node scripts/e2e/first-release-workorders.mjs` | Workflow state, transition, approver, work order, or ticket lifecycle changes. |
| `iot-safety-smoke` | `node scripts/e2e/s5a-safety-smoke.mjs` | Safety, hazard, inspection, emergency, or safety access changes. |
| `iot-runtime-alert-smoke` | `node scripts/e2e/s9b-iot-runtime-alert-smoke.mjs` | IoT alert runtime, device event, or rule trigger changes. |
| `full-first-release-regression` | `node scripts/e2e/first-release-regression.mjs` | Unknown high-risk paths, inventory failure, or broad fallback. |

## 7. Selection Algorithm

The future `e2e-selector.mjs` should follow this order:

1. Parse CLI options and load changed files.
2. Normalize and validate changed file paths.
3. Load `selector-rules.json`, `validation-matrix.json`, `risk_inventory.json`, and `module_inventory.json`.
4. Validate versions, required fields, unknown validation IDs, duplicate IDs, and unsupported risk levels.
5. Build per-file facts from path rules and inventories.
6. Always add baseline checks.
7. Match selector rules against path, risk, and module facts.
8. Union selected validation IDs and de-duplicate by `validation_id`.
9. Add reasons, matched rules, matched files, and risk summary to every selected validation.
10. Add explicit skipped validations with their default or rule-specific skip reasons.
11. If every changed file is low-risk docs-only, keep baseline only and explain E2E skip.
12. If any changed file is unknown and potentially high risk, select `full-first-release-regression` and set `human_approval_required: true`.
13. Emit stable JSON by default and optional text explanation with `--explain`.
14. Exit non-zero on malformed input, malformed rules, missing required inventories, or internal validation failure.

Precedence rules:

- Baseline checks are unconditional.
- Unknown high-risk fallback beats docs-only skip.
- Higher risk wins when multiple rules match one file.
- The selector may only skip E2E when all changed files are known low-risk docs-only.
- Duplicate commands are emitted once with combined reasons.

## 8. CLI Contract

Planned commands:

```bash
node ops/agent-orchestrator/scripts/e2e-selector.mjs --dry-run
node ops/agent-orchestrator/scripts/e2e-selector.mjs --dry-run --explain
node ops/agent-orchestrator/scripts/e2e-selector.mjs --changed-files docs/release/example.md --explain
```

Behavior:

- `--dry-run` is no-write and should be the default.
- `--explain` prints rule matches, skipped rules, selected validations, and fallback decisions.
- `--changed-files` overrides local git diff discovery.
- Selector output must be deterministic across repeated runs.
- The selector must not launch validation commands; it only selects and explains them.
- The selector must not read secrets or emit credentials.

Proposed exit codes:

| Code | Meaning |
|---|---|
| `0` | Selection completed. Human approval may still be required in the output. |
| `2` | Invalid CLI input or invalid changed file path. |
| `3` | Malformed rules, matrix, or inventory data. |
| `4` | Selector cannot safely classify required validation without human review. |

## 9. Output Contract

Default JSON output:

```json
{
  "schema_version": 1,
  "mode": "dry-run",
  "changed_files": ["apps/web/app/(dashboard)/system/roles/page.tsx"],
  "baseline_checks": [
    {
      "validation_id": "orchestrator-doctor",
      "command": "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
      "reason": "Baseline check is always required."
    },
    {
      "validation_id": "orchestrator-audit-dry-run",
      "command": "node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run",
      "reason": "Baseline check is always required."
    },
    {
      "validation_id": "workspace-typecheck",
      "command": "pnpm typecheck",
      "reason": "Baseline check is always required."
    }
  ],
  "selected_validations": [
    {
      "validation_id": "rbac-menu-smoke",
      "command": "node scripts/e2e/first-release-menu-whitelist.mjs",
      "risk_level": "HIGH",
      "matched_rules": ["rbac-change"],
      "matched_files": ["apps/web/app/(dashboard)/system/roles/page.tsx"],
      "reasons": ["RBAC/menu changes can hide or expose protected operations."]
    }
  ],
  "skipped_validations": [
    {
      "validation_id": "finance-leasing-regression",
      "reason": "No finance, receivable, payment, invoice, or waiver change was detected."
    }
  ],
  "risk_summary": {
    "highest_risk": "HIGH",
    "risk_tags": ["rbac"],
    "unknown_files": []
  },
  "human_approval_required": false
}
```

## 10. Required Selection Examples

| Scenario | Example changed files | Expected output |
|---|---|---|
| RBAC | `apps/api/src/modules/auth/guards/roles.guard.ts`, `packages/shared/src/permissions.ts` | Baseline plus `rbac-menu-smoke` and `rbac-standard-smoke`; reasons mention guard and permission contract changes. |
| Finance | `apps/api/src/modules/leasing/receivables.service.ts`, `apps/api/src/modules/leasing/payments.service.ts` | Baseline plus `finance-leasing-regression`, `finance-payment-smoke`, and `finance-idempotency-regression`; reasons mention financial auditability and retry safety. |
| Workflow | `apps/api/src/modules/work-orders/workflow.service.ts` | Baseline plus `workflow-workorders-regression`; reasons mention state transition and approval coverage. |
| IoT/safety | `apps/api/src/modules/safety/hazards.service.ts`, `apps/api/src/modules/iot/runtime-alert.service.ts` | Baseline plus `iot-safety-smoke` and `iot-runtime-alert-smoke`; reasons mention safety and device alert runtime. |
| Unknown high-risk | `apps/api/src/modules/unknown-critical/handler.ts` | Baseline plus `full-first-release-regression`; `human_approval_required: true`; reason says the file is not covered by inventories. |
| Low-risk docs-only | `docs/release/example-plan.md`, `docs/testing/example-test-plan.md` | Baseline only; every E2E validation appears in `skipped_validations` with a docs-only low-risk reason. |

## 11. Safety Guardrails

- Selector narrowing is advisory until runtime inventory validation is stable.
- If rules or inventories are invalid, the selector must not produce a narrow pass list.
- Unknown high-risk paths require broad validation or human approval.
- Low-risk docs-only skip is valid only when all changed files are known low-risk docs paths.
- Baseline doctor, audit dry-run, and typecheck cannot be disabled by any rule.
- Future integration with `agent-cycle` must keep dry-run no-write behavior and must not execute Agents, merge, push, deploy, or run production operations.

## 12. Rollout

1. Land this design and the selector test plan.
2. Implement runtime inventory generation and validation in separate approved tasks.
3. Add `selector-rules.json` and `validation-matrix.json` with fixture tests.
4. Add `e2e-selector.mjs --dry-run --explain` without command execution.
5. Wire selector output into validation planning only after fixtures prove conservative fallback behavior.
6. Keep `full-first-release-regression` fallback available until selector coverage is audited.

## 13. Rollback

- Disable selector-driven E2E narrowing and run the broader validation matrix.
- Continue to run baseline doctor, audit dry-run, and typecheck.
- Treat invalid runtime inventories as a selector failure, not as permission to skip checks.
- Keep rules and matrix data reviewable so a bad selector rule can be reverted without touching business code.
