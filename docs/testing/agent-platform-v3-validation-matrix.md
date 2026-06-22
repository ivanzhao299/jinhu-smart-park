# Agent Platform V3 Validation Matrix

Task: `AGENT-PLATFORM-V3-A2-GOAL-VALIDATION`
Batch: `AGENT-PLATFORM-V3-ROUND1-20260622`
Owner: `agent-2`
Date: 2026-06-22

## 1. Scope

This matrix defines validation coverage for Agent Platform V3 planning artifacts:

- Goal Engine state and example output.
- Planner Output contract and dry-run planning behavior.
- Agent Registry records and compatibility with current router rules.
- V3 task queue generation and event/read-model consistency.
- Natural-language router compatibility.
- Doctor diagnostics.
- `agent-cycle --dry-run` no-write preview.

This is a documentation and validation planning artifact only. It does not modify validation scripts, business code, database objects, infrastructure, auth, CI, Docker, deploy files, environment files, migrations, seeds, or production data.

## 2. Test Invariants

All future automated cases must run against the repository root or isolated fixture copies. Apply-capable commands must be explicitly selected by the operator and must not be hidden inside a validation check.

Required invariants:

- Goal, planner, registry, queue, lock, and result JSON must parse before any downstream command is trusted.
- Schema/example checks must fail closed on malformed JSON, missing required fields, invalid risk values, invalid owners, invalid statuses, duplicate task IDs, or out-of-range maturity scores.
- Planner output is a draft until approved. Validation must not dispatch tasks, execute Agents, merge, push, deploy, migrate, seed, reset, clean up, prune, truncate, or write production data.
- Queue generation must preserve task boundaries: every generated task has owner, risk, allowed paths, forbidden paths, acceptance criteria, validation commands, and expected outputs.
- Router and future registry-backed routing must agree on supported owners and conservative fallback behavior.
- `doctor` and `agent-cycle --dry-run` are diagnostic/no-write gates unless a later human-approved task explicitly expands scope.
- Dry-run commands must leave queue JSON, events, reports, prompts, run logs, and timestamps unchanged.

## 3. Artifact Matrix

| Artifact | Area | Required proof |
|---|---|---|
| `ops/agent-orchestrator/goal/goal-engine.schema.json` | Goal Engine | JSON parses; required fields cover goal identity, maturity, capability scores, gaps, milestones, recommended tasks, risks, status, and timestamps. |
| `ops/agent-orchestrator/goal/goal-state.example.json` | Goal Engine | JSON parses; goal text is `继续把 Agent Studio 提升到 98%`; current and target maturity are numeric and ordered; status is valid. |
| `ops/agent-orchestrator/planner/planner-output.schema.json` | Planner Output | JSON parses; required task candidate fields cover owner, domain, risk, path boundaries, acceptance, validation, approval, and outputs. |
| Future planner output draft | Planner Output | Draft validates against the schema contract and remains non-executing until approval. |
| `ops/agent-orchestrator/agent-registry/agent-registry.schema.json` | Agent Registry | JSON parses; records require agent id, role, domains, keywords, allowed/forbidden paths, risk limit, status, priority, and fallback order. |
| `ops/agent-orchestrator/agent-registry/agent-registry.example.json` | Agent Registry | JSON parses; includes active records for `agent-1` through `agent-5`; each record has conservative forbidden paths. |
| `ops/agent-orchestrator/agent-router-rules.json` | Router compatibility | JSON parses; current router remains usable while registry adoption is staged. |
| `ops/agent-orchestrator/queue/task-queue.json` | Queue generation | JSON parses; contains the V3 task set with allowed/forbidden paths and validation commands. |
| `ops/agent-orchestrator/events/tasks/**` | Queue generation | Event/read-model dry-run reports no unexpected drift for generated V3 task state. |

## 4. Core Capability Matrix

| Case | Area | Command or check | Setup | Expected result |
|---|---|---|---|---|
| GOAL-01 | Goal Engine JSON | Parse goal schema and example. | Current repository. | Exits 0; both JSON files parse. |
| GOAL-02 | Goal maturity | Inspect `current_maturity`, `target_maturity`, and `status`. | Current goal example. | Scores are 0-100, target is greater than or equal to current, and status is one of the schema statuses. |
| GOAL-03 | Goal gap coverage | Inspect `capability_scores`, `gaps`, `milestones`, `recommended_tasks`, and `risks`. | Current goal example. | Each list exists; each gap references a capability and recommends a supported agent. |
| GOAL-04 | Goal negative fixture | Malformed or incomplete goal example. | Future fixture copy. | Validation exits non-zero before planner or queue checks use the goal. |
| PLAN-01 | Planner schema JSON | Parse planner output schema. | Current repository. | Exits 0; required planner sections are present. |
| PLAN-02 | Planner task candidate contract | Inspect schema required fields for generated task candidates. | Current planner schema. | Owner, risk, path boundary, acceptance, validation, approval, and expected-output fields are required. |
| PLAN-03 | Planner draft no-write | Validate a future planner output draft. | Future draft path passed by operator. | Draft parses and validates without writing queue, events, prompts, reports, or run logs. |
| PLAN-04 | Planner risk gates | Planner output includes HIGH/CRITICAL or forbidden paths. | Future negative fixture. | Output requires human approval and cannot be promoted to execution-ready queue tasks automatically. |
| REG-01 | Registry JSON | Parse registry schema and example. | Current repository. | Exits 0; both JSON files parse. |
| REG-02 | Registry lane coverage | Inspect registry example agent IDs and statuses. | Current registry example. | `agent-1` through `agent-5` exist exactly once and are not unknown owners. |
| REG-03 | Registry path boundaries | Inspect each registry record. | Current registry example. | Allowed paths are explicit; forbidden paths include business, database, infra, CI, Docker, deploy, auth, and env patterns. |
| REG-04 | Registry/router compatibility | Compare registry agents with current router agents. | Current registry and router rules. | Supported owners match; fallback remains conservative while router rules are the active source. |
| QUEUE-01 | Queue JSON parse | Parse queue, locks, and results JSON. | Current repository. | Exits 0; compatibility read models parse before status checks. |
| QUEUE-02 | V3 task generation | Inspect V3 tasks in `task-queue.json`. | Current queue. | Five V3 tasks exist; every task has owner, risk, boundaries, acceptance, validation commands, and expected output files. |
| QUEUE-03 | Event/read-model consistency | `rebuild-queue-read-model.mjs --dry-run`. | Current repository. | Exits 0 and reports no unexpected drift; writes nothing. |
| QUEUE-04 | Forbidden path guard | Inspect V3 task allowed and forbidden paths. | Current queue. | No V3 task allows business, database, infra, auth, CI, Docker, deploy, env, migration, seed, or production data paths unless explicitly approved. |
| ROUTE-01 | Natural-language router smoke | `route-natural-language-task.mjs --text "继续把 Agent Studio 提升到 98%" --dry-run`. | Current router rules. | Exits 0; prints selected owner, matched domains/keywords, confidence, and fallback status; writes nothing. |
| ROUTE-02 | Registry migration compatibility | Compare registry domains/keywords to router rules. | Current registry and router rules. | No current router owner is missing from registry; registry adoption can fall back to router rules. |
| ROUTE-03 | Unknown-domain fallback | Future route fixture with no keyword match. | Current router or future registry router. | Routes to conservative fallback owner and does not generate execution-ready tasks automatically. |
| DOCTOR-01 | Doctor diagnostics | `orchestratorctl.mjs doctor`. | Current repository. | Exits with GO/CONDITIONAL_GO or actionable NO_GO; default remains diagnostic and no-write. |
| DOCTOR-02 | Doctor JSON | `orchestratorctl.mjs doctor --json`. | Current repository. | JSON output parses; findings are grouped by area for operator decisions. |
| DOCTOR-03 | Deep doctor | `orchestratorctl.mjs doctor --deep`. | Release readiness environment. | Includes typecheck; failure blocks readiness. Use only when slower validation is intended. |
| CYCLE-01 | Agent cycle dry-run | `orchestratorctl.mjs agent-cycle --dry-run`. | Current repository. | Runs dispatch dry-run, runner dry-run/no-write, commit dry-run, integrate dry-run, and validation plan; executes no Agents. |
| CYCLE-02 | Dry-run no-write | Pre/post status and checksums around `agent-cycle --dry-run`. | Future fixture or clean repo. | No queue, event, prompt, report, result, run log, or timestamp mutation occurs. |
| CYCLE-03 | Apply/execute guard | `agent-cycle --apply --execute --precheck-only` in a controlled operator run. | Human-approved preflight only. | Stops on dirty worktrees, missing Codex, unsafe paths, or unapproved execution prerequisites before running Agents. |

## 5. Negative Matrix

| Case | Risk covered | Setup | Expected result |
|---|---|---|---|
| NEG-01 malformed goal JSON | Corrupt goal input | Invalid JSON in goal schema or example. | Parse command exits non-zero; planner and queue checks are not trusted. |
| NEG-02 invalid maturity | Bad goal scoring | `current_maturity` or `target_maturity` outside 0-100, or target below current. | Validation exits non-zero with the offending field. |
| NEG-03 unsupported goal status | Contract drift | Goal status outside the schema enum. | Validation exits non-zero. |
| NEG-04 planner task missing boundaries | Unsafe generated task | Planner task lacks `allowed_paths`, `forbidden_paths`, risk, validation commands, or approval flag. | Draft is rejected before queue generation. |
| NEG-05 unapproved high-risk planner task | Approval bypass | Planner task touches forbidden or production-sensitive paths without approval. | Draft remains blocked and cannot enter queue as executable work. |
| NEG-06 registry missing current agent | Routing regression | Registry omits one of `agent-1` through `agent-5`. | Registry compatibility check exits non-zero. |
| NEG-07 registry duplicate agent | Ambiguous owner | Registry contains duplicate `agent_id`. | Registry compatibility check exits non-zero. |
| NEG-08 router/registry mismatch | Owner drift | Router has an owner absent from registry or vice versa. | Compatibility check reports mismatch; staged registry migration blocks. |
| NEG-09 malformed queue JSON | Queue corruption | `task-queue.json`, locks, or results is invalid JSON. | Queue parse and doctor fail before routing or cycle checks. |
| NEG-10 V3 task boundary failure | Forbidden path change | V3 task allows `apps/**`, `packages/**`, `database/**`, `infra/**`, CI, Docker, deploy, auth, env, migration, seed, or production data paths. | Queue generation check fails and task requires human review. |
| NEG-11 read-model drift | Event/read-model inconsistency | Events and compatibility JSON disagree unexpectedly. | Dry-run reports drift; apply requires explicit orchestrator repair intent. |
| NEG-12 router missing dry-run | Safety regression | Natural-language route command is run without `--dry-run`. | Command exits non-zero and writes nothing. |
| NEG-13 doctor NO_GO | Platform health blocker | Doctor reports corrupt queue, duplicate locks, forbidden dirty files, or failed audit. | Release readiness stops until fixed by explicit task or operator repair. |
| NEG-14 agent-cycle mutation | Dry-run safety regression | `agent-cycle --dry-run` mutates queue, events, prompts, reports, logs, or timestamps. | Dry-run validation fails; do not execute Agents. |

## 6. Required Command Set

Current V3 validation should use this no-write baseline:

```bash
git status --short
node -e "const fs=require('fs'); for (const f of ['ops/agent-orchestrator/queue/task-queue.json','ops/agent-orchestrator/queue/task-locks.json','ops/agent-orchestrator/queue/task-results.json']) JSON.parse(fs.readFileSync(f,'utf8'));"
node -e "const fs=require('fs'); for (const f of ['ops/agent-orchestrator/goal/goal-engine.schema.json','ops/agent-orchestrator/goal/goal-state.example.json','ops/agent-orchestrator/planner/planner-output.schema.json','ops/agent-orchestrator/agent-registry/agent-registry.schema.json','ops/agent-orchestrator/agent-registry/agent-registry.example.json','ops/agent-orchestrator/agent-router-rules.json']) JSON.parse(fs.readFileSync(f,'utf8'));"
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
node ops/agent-orchestrator/scripts/route-natural-language-task.mjs --text "继续把 Agent Studio 提升到 98%" --dry-run
git diff --check
pnpm typecheck
git status --short
```

Task-local documentation validation for `AGENT-PLATFORM-V3-A2-GOAL-VALIDATION` is intentionally narrower and uses the commands assigned in the task prompt.

## 7. Pass Criteria

V3 validation passes when:

- Goal Engine schema and example parse and satisfy the structural checks in this matrix.
- Planner schema parses and generated planner drafts remain dry-run until human approval.
- Agent Registry schema and example parse and cover the current five agent lanes.
- Router and registry owner sets remain compatible during the staged migration.
- V3 queue tasks exist with complete boundaries, validation commands, and expected outputs.
- Event/read-model dry-run shows no unexpected drift.
- `doctor` has no blocker.
- `agent-cycle --dry-run` previews the pipeline without executing Agents or writing files.
- `git diff --check` passes.
- `pnpm typecheck` passes in the readiness environment.

V3 validation is `CONDITIONAL_GO` only when all blockers are absent and remaining issues are explained non-mutating conditions, such as expected uncommitted documentation files in an Agent worker task.

V3 validation is `NO_GO` when any parse error, boundary failure, queue/event corruption, router/registry mismatch, doctor blocker, dry-run mutation, whitespace failure, or typecheck failure remains.
