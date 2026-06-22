# Agent Platform V3 Agent Registry Checklist

Date: 2026-06-22
Task ID: `AGENT-PLATFORM-V3-A4-AGENT-REGISTRY`

## Purpose

This checklist verifies that the Agent Platform V3 registry can coexist with the current router, queue, dispatch, and result-recording workflow. It is read-only by default and must not modify business code, production configuration, migrations, seeds, Docker, deploy scripts, CI, auth, or environment files.

## Preconditions

Run checks from the repository root.

Required files:

- `ops/agent-orchestrator/agent-registry/agent-registry.schema.json`
- `ops/agent-orchestrator/agent-registry/agent-registry.example.json`
- `ops/agent-orchestrator/agent-router-rules.json`
- `ops/agent-orchestrator/queue/task-queue.json`

## Required Validation Commands

These are the task-level validation commands:

```bash
git status --short
test -f docs/release/agent-platform-v3-agent-registry-design.md
test -f docs/testing/agent-platform-v3-agent-registry-checklist.md
node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.schema.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.example.json','utf8'));"
test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.md
git diff --check
git status --short
```

Pass criteria:

- Required design, checklist, report, and result files exist.
- Registry schema and example parse as JSON.
- `git diff --check` reports no whitespace errors.
- `git status --short` shows only expected files under the task's allowed paths.

## Registry Coverage Checks

Use this read-only check to confirm `agent-1` through `agent-5` coverage:

```bash
node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.example.json','utf8')); const ids=r.agents.map(a=>a.agent_id).sort(); const expected=['agent-1','agent-2','agent-3','agent-4','agent-5']; if (JSON.stringify(ids)!==JSON.stringify(expected)) throw new Error('agent coverage mismatch: '+ids.join(',')); for (const a of r.agents) { for (const k of ['domains','keywords','allowed_paths','forbidden_paths']) if (!Array.isArray(a[k]) || a[k].length===0) throw new Error(a.agent_id+' missing '+k); } console.log('registry coverage ok:', ids.join(','));"
```

Pass criteria:

- Exactly five registry agents are present.
- Agent ids are `agent-1`, `agent-2`, `agent-3`, `agent-4`, and `agent-5`.
- Each agent has non-empty domains, keywords, allowed paths, forbidden paths, status, risk limit, priority, and fallback order.

## Router Compatibility Checks

Use this read-only check to compare registry coverage with the current router owner set:

```bash
node -e "const fs=require('fs'); const registry=JSON.parse(fs.readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.example.json','utf8')); const router=JSON.parse(fs.readFileSync('ops/agent-orchestrator/agent-router-rules.json','utf8')); const registryIds=registry.agents.map(a=>a.agent_id).sort(); const routerIds=Object.keys(router.agents).sort(); if (JSON.stringify(registryIds)!==JSON.stringify(routerIds)) throw new Error('router/registry owner mismatch: registry='+registryIds.join(',')+' router='+routerIds.join(',')); for (const a of registry.agents) { const route=router.agents[a.agent_id]; if (!route) throw new Error('missing router agent '+a.agent_id); if (!a.domains.includes(route.domain)) throw new Error(a.agent_id+' registry domains do not include router domain '+route.domain); } console.log('router compatibility ok:', registryIds.join(','));"
```

Pass criteria:

- Router and registry expose the same owner ids.
- Each current router domain appears in the matching registry agent's `domains`.
- Router fallback rules can still choose an existing owner.

## Status And Fallback Scenario Checks

These checks can be performed by reviewing a temporary copy of the registry or by a future dry-run validator. Do not edit the committed registry to simulate scenarios.

| Scenario | Expected result |
|---|---|
| All agents `ACTIVE` | Exact keyword/domain routes select the matching owner; unknown work falls back by `fallback_order`. |
| Primary owner `PAUSED` | Automatic assignment skips that owner and reports the status or selects an approved fallback. |
| Primary owner `MAINTENANCE` | Routine tasks are not assigned; maintenance tasks require explicit approval. |
| Primary owner `DISABLED` | Task is blocked or manually reassigned with a recorded reason. |
| Task risk exceeds `risk_limit` | Task requires human approval and must not auto-dispatch. |
| No eligible fallback exists | Planner marks the task blocked with a concrete reason. |

## Path Boundary Checks

Before marking registry work done:

1. Run `git status --short`.
2. Confirm changed files are only under:
   - `docs/release`
   - `docs/testing`
   - `ops/agent-orchestrator/agent-registry`
   - `ops/agent-orchestrator/reports`
   - `ops/agent-orchestrator/results`
3. Confirm no changed paths are under:
   - `apps`
   - `packages`
   - `database`
   - `infra`
   - `.github`
   - `Dockerfile`
   - `docker-compose.yml`
   - `docker-compose.yaml`
   - `deploy`
   - `auth`
   - `.env`
   - `.env.local`
   - `.env.production`
   - `.env.production.local`

Fail the task if any forbidden path changed.

## Route Compatibility Matrix

| Input category | Expected owner | Registry evidence |
|---|---|---|
| Runtime docs, product docs, portal copy, assets, tenants | `agent-1` | `agent-1.domains` and keywords include docs, portal, asset, tenant terms. |
| Validation, typecheck, audit, compatibility, finance runbook | `agent-2` | `agent-2.domains` and keywords include validation, audit, finance, runbook terms. |
| IoT, safety, work order, energy, runtime data, read-model | `agent-3` | `agent-3.domains` and keywords include IoT, safety, work-order, energy, read-model terms. |
| Frontend, dashboard, mobile, RBAC, menu, selector, registry | `agent-4` | `agent-4.domains` and keywords include frontend, mobile, RBAC, selector, registry terms. |
| Unknown, planning, release, platform architecture, goal engine | `agent-5` | `agent-5.domains` and keywords include planning, release, platform, goal terms. |

## Evidence Template

| Check | Command or review | Result | Evidence |
|---|---|---|---|
| Registry JSON parse | `node -e ...JSON.parse...` | `<PASS/FAIL>` | `<terminal summary>` |
| Agent coverage | Coverage command above | `<PASS/FAIL>` | `<agent ids>` |
| Router compatibility | Compatibility command above | `<PASS/FAIL>` | `<matching owners/domains>` |
| Path boundary | `git status --short` | `<PASS/FAIL>` | `<changed files>` |
| Whitespace | `git diff --check` | `<PASS/FAIL>` | `<terminal summary>` |

## Stop Conditions

Stop and report `FAILED` if:

- registry JSON does not parse;
- `agent-1` through `agent-5` are not all present;
- router and registry owner ids diverge;
- registry path boundaries suggest modifying forbidden business, database, auth, CI, Docker, deploy, or environment paths without explicit approval;
- any validation command fails and cannot be fixed inside the allowed paths.
