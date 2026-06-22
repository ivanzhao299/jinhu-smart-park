# Agent Platform V3 Validation Runbook

Task: `AGENT-PLATFORM-V3-A2-GOAL-VALIDATION`
Batch: `AGENT-PLATFORM-V3-ROUND1-20260622`
Owner: `agent-2`
Date: 2026-06-22

## 1. Goal

This runbook gives operators a no-write validation sequence for Agent Platform V3 Goal Engine, Planner Output, Agent Registry, queue generation, router compatibility, Doctor, and `agent-cycle --dry-run` checks.

Use it from the repository root. The default path is diagnostic and no-write. Apply, execute, merge, push, deploy, migration, seed, cleanup, reset, prune, truncate, production data write, and unattended Agent execution are outside this runbook unless separately approved and recorded.

## 2. Baseline Sequence

Run the steps in order. Stop on the first blocker unless the step explicitly says a conditional result is acceptable.

### Step 0: Worktree Boundary Check

```bash
git status --short
```

Expected pass:

- Dirty files match the active task's allowed paths.
- No business code, database, infra, auth, CI, Docker, deploy, environment, migration, seed, or production data path is dirty.

Fail interpretation:

- Any forbidden dirty path is `NO_GO`.
- For an Agent worker task with `allow_commit=false`, uncommitted allowed docs/report/result files are acceptable but must be reported.

### Step 1: Queue And Compatibility JSON Parse

```bash
node -e "const fs=require('fs'); for (const f of ['ops/agent-orchestrator/queue/task-queue.json','ops/agent-orchestrator/queue/task-locks.json','ops/agent-orchestrator/queue/task-results.json']) JSON.parse(fs.readFileSync(f,'utf8')); console.log('queue read models parse');"
```

Expected pass:

- Queue, locks, and results parse successfully before status, doctor, or cycle commands run.

Fail interpretation:

- Invalid JSON is `NO_GO`. Do not dispatch, execute, integrate, or run completion repair implicitly.

### Step 2: V3 Contract JSON Parse

```bash
node -e "const fs=require('fs'); for (const f of ['ops/agent-orchestrator/goal/goal-engine.schema.json','ops/agent-orchestrator/goal/goal-state.example.json','ops/agent-orchestrator/planner/planner-output.schema.json','ops/agent-orchestrator/agent-registry/agent-registry.schema.json','ops/agent-orchestrator/agent-registry/agent-registry.example.json','ops/agent-orchestrator/agent-router-rules.json']) JSON.parse(fs.readFileSync(f,'utf8')); console.log('v3 contracts parse');"
```

Expected pass:

- Goal Engine schema/example, Planner schema, Agent Registry schema/example, and current router rules parse as JSON.

Fail interpretation:

- Any parse error is `NO_GO`. Do not trust generated planner or queue output until fixed.

### Step 3: Goal Engine Structural Check

```bash
node - <<'NODE'
const fs = require("fs");
const goal = JSON.parse(fs.readFileSync("ops/agent-orchestrator/goal/goal-state.example.json", "utf8"));
const supportedStatuses = new Set(["DRAFT", "READY_FOR_REVIEW", "APPROVED", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]);
const supportedAgents = new Set(["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"]);
for (const field of ["goal_id", "goal_title", "goal_text", "current_maturity", "target_maturity", "capability_scores", "gaps", "milestones", "recommended_tasks", "risks", "status"]) {
  if (goal[field] === undefined) throw new Error(`missing goal field: ${field}`);
}
if (goal.goal_text !== "继续把 Agent Studio 提升到 98%") throw new Error("unexpected V3 goal_text");
if (goal.current_maturity < 0 || goal.current_maturity > 100 || goal.target_maturity < 0 || goal.target_maturity > 100) throw new Error("maturity score out of range");
if (goal.target_maturity < goal.current_maturity) throw new Error("target maturity is below current maturity");
if (!supportedStatuses.has(goal.status)) throw new Error(`unsupported goal status: ${goal.status}`);
for (const gap of goal.gaps ?? []) {
  if (!supportedAgents.has(gap.recommended_agent)) throw new Error(`unsupported gap recommended_agent: ${gap.recommended_agent}`);
}
console.log("goal structural check passed");
NODE
```

Expected pass:

- The example goal tracks current state, target state, gap analysis, roadmap/milestones, recommended tasks, risks, and a valid status.

Fail interpretation:

- Missing fields, invalid maturity scores, invalid status, or unsupported recommended agents are `NO_GO`.

### Step 4: Planner Output Contract Check

```bash
node - <<'NODE'
const fs = require("fs");
const schema = JSON.parse(fs.readFileSync("ops/agent-orchestrator/planner/planner-output.schema.json", "utf8"));
const required = new Set(schema.required ?? []);
for (const field of ["source_goal_id", "req_summary", "tech_summary", "tasks", "agent_assignments", "risk_assessment", "validation_commands", "expected_outputs"]) {
  if (!required.has(field)) throw new Error(`planner schema does not require ${field}`);
}
const taskRequired = new Set(schema.$defs?.taskCandidate?.required ?? []);
for (const field of ["task_id", "owner", "domain", "priority", "risk", "allowed_paths", "forbidden_paths", "acceptance", "validation_commands", "requires_human_approval", "expected_output_files"]) {
  if (!taskRequired.has(field)) throw new Error(`planner task candidate does not require ${field}`);
}
console.log("planner contract check passed");
NODE
```

Expected pass:

- Planner schema requires REQ, TECH, task candidates, owner assignments, risk assessment, validation commands, and expected outputs.
- Task candidates require owner, risk, path boundaries, acceptance, validation, approval, and output fields.

Fail interpretation:

- Missing contract fields are `NO_GO`; generated tasks must not enter the live queue.

Optional future draft check:

```bash
PLANNER_OUTPUT=path/to/planner-output.json node - <<'NODE'
const fs = require("fs");
const file = process.env.PLANNER_OUTPUT;
if (!file) throw new Error("set PLANNER_OUTPUT to a planner output draft");
const output = JSON.parse(fs.readFileSync(file, "utf8"));
for (const field of ["source_goal_id", "req_summary", "tech_summary", "tasks", "agent_assignments", "risk_assessment", "validation_commands", "expected_outputs"]) {
  if (output[field] === undefined) throw new Error(`missing planner output field: ${field}`);
}
for (const task of output.tasks ?? []) {
  for (const field of ["task_id", "owner", "risk", "allowed_paths", "forbidden_paths", "acceptance", "validation_commands", "requires_human_approval", "expected_output_files"]) {
    if (task[field] === undefined) throw new Error(`task ${task.task_id ?? "(unknown)"} missing ${field}`);
  }
}
console.log("planner output draft structural check passed");
NODE
```

Expected pass:

- The draft is structurally complete and remains a draft. This command does not write queue, events, prompts, reports, or logs.

### Step 5: Agent Registry And Router Compatibility Check

```bash
node - <<'NODE'
const fs = require("fs");
const registry = JSON.parse(fs.readFileSync("ops/agent-orchestrator/agent-registry/agent-registry.example.json", "utf8"));
const router = JSON.parse(fs.readFileSync("ops/agent-orchestrator/agent-router-rules.json", "utf8"));
const registryAgents = registry.agents ?? [];
const registryIds = registryAgents.map((agent) => agent.agent_id);
const routerIds = Object.keys(router.agents ?? {});
const expected = ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"];
for (const id of expected) {
  if (!registryIds.includes(id)) throw new Error(`registry missing ${id}`);
  if (!routerIds.includes(id)) throw new Error(`router missing ${id}`);
}
if (new Set(registryIds).size !== registryIds.length) throw new Error("registry has duplicate agent_id values");
for (const agent of registryAgents) {
  if (!["ACTIVE", "PAUSED", "MAINTENANCE", "DISABLED"].includes(agent.status)) throw new Error(`unsupported status for ${agent.agent_id}`);
  if (!Array.isArray(agent.allowed_paths) || agent.allowed_paths.length === 0) throw new Error(`${agent.agent_id} missing allowed paths`);
  const forbidden = (agent.forbidden_paths ?? []).join(" ");
  for (const token of ["apps/**", "packages/**", "database/**", "infra/**", ".github/**", "deploy/**", "auth/**", ".env"]) {
    if (!forbidden.includes(token)) throw new Error(`${agent.agent_id} missing forbidden token ${token}`);
  }
}
console.log("registry/router compatibility check passed");
NODE
```

Expected pass:

- Registry and router both cover `agent-1` through `agent-5`.
- Agent IDs are unique.
- Registry records keep conservative path boundaries and valid statuses.

Fail interpretation:

- Missing or duplicate owners, invalid statuses, or weak forbidden path rules are `NO_GO`.

### Step 6: V3 Queue Generation Check

```bash
node - <<'NODE'
const fs = require("fs");
const queue = JSON.parse(fs.readFileSync("ops/agent-orchestrator/queue/task-queue.json", "utf8"));
const tasks = (queue.tasks ?? []).filter((task) => String(task.task_id ?? "").startsWith("AGENT-PLATFORM-V3-"));
if (tasks.length !== 5) throw new Error(`expected 5 V3 tasks, found ${tasks.length}`);
for (const task of tasks) {
  for (const field of ["task_id", "owner", "priority", "risk", "allowed_paths", "forbidden_paths", "acceptance", "validation_commands", "expected_output_files"]) {
    if (task[field] === undefined) throw new Error(`${task.task_id} missing ${field}`);
  }
  if (!["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"].includes(task.owner)) throw new Error(`${task.task_id} has unsupported owner ${task.owner}`);
  const allowed = (task.allowed_paths ?? []).join(" ");
  for (const forbiddenAllowed of ["apps", "packages", "database", "infra", ".github", "Dockerfile", "deploy", "auth", ".env"]) {
    if (allowed.includes(forbiddenAllowed)) throw new Error(`${task.task_id} allowed_paths include forbidden scope ${forbiddenAllowed}`);
  }
}
console.log(`v3 queue generation check passed for ${tasks.length} tasks`);
NODE
```

Expected pass:

- Exactly five V3 tasks exist.
- Each task has complete ownership, risk, boundaries, acceptance, validation commands, and expected outputs.
- V3 tasks remain docs/orchestrator-planning scoped unless separately approved.

Fail interpretation:

- Missing tasks, unsupported owners, missing boundaries, or forbidden allowed paths are `NO_GO`.

### Step 7: Event/Read-Model Drift Check

```bash
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run
```

Expected pass:

- Event store validates.
- Compatibility queue, lock, and result read models have no unexpected drift.
- Dry-run writes nothing.

Fail interpretation:

- Corrupt events, duplicate conflicting events, duplicate active locks, unsupported schemas, or unexpected drift are `NO_GO`.
- Apply repair requires explicit operator intent:

```bash
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --apply
```

Do not run apply inside an Agent worker task unless the task explicitly authorizes read-model repair.

### Step 8: Dispatch Status Check

```bash
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
```

Expected pass:

- Queue, locks, and results parse.
- READY, CLAIMED, DONE, FAILED, BLOCKED, and AUDITED counts are visible.
- CLAIMED tasks have matching active locks.

Fail interpretation:

- Duplicate active locks, CLAIMED tasks without locks, stale locks, missing results, or unreadable queue state are `NO_GO`.

### Step 9: Router Compatibility Smoke

```bash
node ops/agent-orchestrator/scripts/route-natural-language-task.mjs --text "继续把 Agent Studio 提升到 98%" --dry-run
```

Expected pass:

- The command exits 0, prints selected owner, matched domains/keywords, confidence, fallback status, and all matches.
- It writes nothing.

Fail interpretation:

- Missing `--dry-run`, missing route output, unsupported owner, or command failure is `NO_GO`.
- Low-confidence fallback can be `CONDITIONAL_GO` only if the operator records why fallback ownership is acceptable.

### Step 10: Doctor

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
```

Expected pass:

- Doctor reports `GO` or `CONDITIONAL_GO` with no blocker.
- Findings are actionable and grouped by area.
- Default doctor remains diagnostic and no-write.

Fail interpretation:

- `NO_GO`, queue/event corruption, forbidden dirty paths, failed audit, duplicate locks, or unsafe integration state blocks readiness.

Optional JSON evidence:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor --json
```

Optional release-depth check:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor --deep
```

Use `doctor --deep` when the operator wants doctor to include the slower typecheck gate. Otherwise run `pnpm typecheck` explicitly later.

### Step 11: Agent-Cycle Dry-Run

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
```

Expected pass:

- Prints precheck context.
- Runs dispatch dry-run, runner dry-run/no-write, commit dry-run, integrate dry-run, and validation plan.
- Reports dry-run/conditional outcome.
- Does not execute Agents, commit, merge, push, deploy, migrate, seed, reset, clean up, or write production data.

Fail interpretation:

- Any dry-run mutation or execution attempt is `NO_GO`.
- Precheck blockers are `NO_GO` unless they are unrelated allowed uncommitted worker files and the operator records them as conditional.

### Step 12: Patch Hygiene And Type Safety

```bash
git diff --check
pnpm typecheck
```

Expected pass:

- `git diff --check` reports no whitespace or patch hygiene errors.
- `pnpm typecheck` passes in an environment with dependencies installed.

Fail interpretation:

- Whitespace failure is a local fix requirement.
- Typecheck failure blocks readiness. If dependencies are unavailable, record the exact blocked reason and rerun in a prepared environment.

### Step 13: Final Status Snapshot

```bash
git status --short
```

Expected pass:

- Dirty files match the active task outputs and expected completion bookkeeping.
- No forbidden path is dirty.
- If `complete-task.mjs` was run, result JSON and orchestrator event/read-model bookkeeping are visible and explained.

## 3. Outcome Rules

| Outcome | Required evidence |
|---|---|
| GO | All JSON parse and structural checks pass; V3 queue has five bounded tasks; event/read-model dry-run has no unexpected drift; router smoke passes; doctor has no blocker; `agent-cycle --dry-run` writes nothing; `git diff --check` and `pnpm typecheck` pass. |
| CONDITIONAL_GO | Only explained non-blocking conditions remain, such as expected uncommitted worker docs/results or unrelated in-progress Agent worktrees. Owner and next action are recorded. |
| NO_GO | Any malformed JSON, missing required field, invalid owner/status/risk, forbidden path, queue/event corruption, duplicate active lock, router/registry mismatch, doctor blocker, dry-run mutation, whitespace failure, or typecheck failure remains. |

## 4. Command Safety Summary

| Command | Default write behavior | Notes |
|---|---|---|
| `git status --short` | No write | Establishes dirty-file boundary. |
| `node -e ... JSON.parse(...)` | No write | Parse-only contract checks. |
| Inline structural `node - <<'NODE'` checks | No write | Local assertions only; no generated files. |
| `rebuild-queue-read-model.mjs --dry-run` | No write | Drift check. |
| `rebuild-queue-read-model.mjs --apply` | Writes read models | Explicit repair/materialization only. |
| `check-dispatch-status.mjs` | No write | Queue/lock/result status check. |
| `route-natural-language-task.mjs --dry-run` | No write | Router smoke only. |
| `orchestratorctl.mjs doctor` | No write | Default skips typecheck. |
| `orchestratorctl.mjs doctor --deep` | No source write | Includes typecheck. |
| `orchestratorctl.mjs agent-cycle --dry-run` | No write | Runs read-only pipeline plan. |
| `git diff --check` | No write | Whitespace gate. |
| `pnpm typecheck` | No source write | Workspace type gate; dependency/cache behavior depends on environment. |

## 5. Evidence Record Template

Record these fields for each V3 validation run:

| Field | Required value |
|---|---|
| Task or batch | Task ID, batch ID, branch, Agent, and timestamp. |
| Goal status | Goal JSON parse result, maturity scores, goal status, and gap/recommended-agent summary. |
| Planner status | Planner schema check result and any planner draft path checked. |
| Registry status | Registry/router owner comparison and path-boundary result. |
| Queue status | V3 task count and status summary. |
| Event/read-model status | Dry-run drift result and any blockers. |
| Router smoke | Selected owner, confidence, fallback status, and reason. |
| Doctor | GO/CONDITIONAL_GO/NO_GO plus blocker summary. |
| Agent-cycle dry-run | Whether dispatch, runner, commit, integrate, and validation plan were previewed without writes. |
| Hygiene/type safety | `git diff --check` and `pnpm typecheck` result or exact blocked reason. |
| Final dirty files | `git status --short` output and allowed/forbidden path review. |
| Prohibited operations | Explicit confirmation that no merge, push, deploy, production operation, migration, seed, reset, prune, destructive cleanup, or Agent execution occurred unless separately approved and recorded. |
