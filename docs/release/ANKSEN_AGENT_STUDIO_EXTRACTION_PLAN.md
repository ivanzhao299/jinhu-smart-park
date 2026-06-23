# ANKSEN Agent Studio Extraction Plan

## 1. Decision

Recommendation: extract ANKSEN Agent Studio into an independent platform repository.

Recommended repository name:

```text
anksen-agent-studio
```

The current `ops/agent-orchestrator` has grown beyond a project-local helper. It now contains a reusable platform:

- Goal Engine
- Planner Agent
- Agent Registry
- Skill Router
- Event Store
- Queue and read-model projection
- Agent runner
- Audit, integration, finalize, self-repair, and doctor
- Resident Observer and Evolution Planner
- Runtime Memory Center
- Legacy Discovery and Replica Engine
- Planned Agent Studio Console

These capabilities are generic enough to support multiple software delivery projects, not only `jinhu-smart-park`.

## 2. Why Extract

### 2.1 Platform/Product Boundary

`jinhu-smart-park` is a smart-park SaaS business repository. ANKSEN Agent Studio is becoming a delivery platform. Keeping both in one repository creates three risks:

1. Platform work pollutes business release history.
2. Console implementation pressure may push non-business UI into `apps/web`.
3. Agent Studio cannot be reused for other ANKSEN projects without copying project-specific files.

### 2.2 Operational Boundary

The orchestrator already controls multiple worktrees, Codex CLI execution, queue state, event store, runtime memory, and finalization. These are platform operations and should not be coupled to the business app deployment lifecycle.

### 2.3 Safety Boundary

Extracting the platform makes frozen boundaries clearer:

- Business repo owns business code, migrations, seeds, deployment, and domain docs.
- Platform repo owns orchestration, agent execution, console, skill routing, runtime memory, discovery, evolution, and adapters.
- Project adapters define what a platform instance is allowed to read or write inside a business repo.

## 3. Extraction Strategy

Use a staged extraction, not a big-bang file move.

```text
Phase 0: Freeze new Console work inside jinhu-smart-park
Phase 1: Create anksen-agent-studio repository skeleton
Phase 2: Move generic platform code and docs
Phase 3: Add project adapter for jinhu-smart-park
Phase 4: Run both in compatibility mode
Phase 5: Deprecate project-local platform scripts
```

This plan does not create the repository, move files, deploy, or modify business code.

## 4. Keep In jinhu-smart-park

The business repository should retain project-specific state, evidence, and safety gates.

### 4.1 Business Application

Keep:

- `apps/api/**`
- `apps/web/**`
- `packages/**`
- `database/**`
- `infra/**`
- `.github/**`
- Docker, deploy, auth, env examples, production scripts
- Business release docs
- Business testing docs

### 4.2 Project-Specific Agent Studio State

Keep or gradually rename into a project adapter state directory:

- Project-specific task history for `jinhu-smart-park`
- Project-specific event history
- Project-specific queue read models
- Project-specific results and reports
- Project-specific runtime memory snapshots
- Project-specific discovery fixtures for this app
- Project-specific release, readiness, and trial-launch evidence

Recommended future location:

```text
ops/agent-studio-project/
  project.config.json
  events/
  queue/
  results/
  reports/
  runtime/
  discovery/
```

Do not rename this directory during extraction Phase 1. Keep compatibility until the external platform CLI can read the current `ops/agent-orchestrator` layout.

### 4.3 Thin Adapter Scripts

Eventually keep only small wrappers such as:

```text
ops/agent-studio/
  project.config.json
  README.md
  run.sh
```

These wrappers should call `anksen-agent-studio` instead of embedding platform logic.

## 5. Move To anksen-agent-studio

The independent platform repository should own reusable platform code, schemas, documentation, Console UI, and adapters.

### 5.1 Platform Core

Move:

- Goal Engine schemas and logic
- Planner Agent schemas and logic
- Event store utilities
- Queue read-model projection logic
- Doctor, finalize, self-repair, daemon, autonomous-loop orchestration
- Agent runner logic
- Audit and integration engines
- Project adapter interfaces

Target package:

```text
packages/orchestrator-core/
```

### 5.2 Runtime Adapters

Move:

- Codex CLI runner adapter
- Filesystem adapter
- Git/worktree adapter
- Command execution adapter
- Future Claude Code, browser, and hosted-runner adapters

Target package:

```text
packages/runtime-adapters/
```

### 5.3 Skill Router

Move:

- `skill-registry.json`
- `skill-router-rules.json`
- skill routing engine
- skill route smoke tooling

Target package:

```text
packages/skill-router/
```

### 5.4 Evolution Center

Move:

- Resident Observer runtime
- Evolution Planner
- Failure pattern schemas
- Improvement backlog schema
- Learning log schema
- Conflict metrics model

Target package:

```text
packages/evolution-center/
```

### 5.5 Discovery Engine

Move:

- Legacy discovery engine
- Browser discovery engine
- API discovery engine
- Schema inference
- Entity mapper
- Replica planner
- Compatibility scorer
- Replica scorer

Target package:

```text
packages/discovery-engine/
```

### 5.6 Console

Move planned Console implementation into:

```text
apps/console/
```

The Console should consume platform APIs and project adapter data, not `jinhu-smart-park` business routes.

## 6. Proposed New Repository Structure

```text
anksen-agent-studio/
  apps/
    console/
      app/
      components/
      lib/
      package.json
  packages/
    orchestrator-core/
      src/
      schemas/
      package.json
    runtime-adapters/
      src/
      codex/
      git/
      filesystem/
      package.json
    skill-router/
      src/
      registry/
      rules/
      package.json
    evolution-center/
      src/
      schemas/
      patterns/
      package.json
    discovery-engine/
      src/
      schemas/
      fixtures/
      package.json
  docs/
    architecture/
    release/
    runbooks/
    security/
  examples/
    jinhu-smart-park/
      project.config.example.json
      adapter-notes.md
      sample-runtime-memory/
  package.json
  pnpm-workspace.yaml
  README.md
```

## 7. Invocation Model Between Repositories

### 7.1 Near-Term Compatibility Mode

`jinhu-smart-park` keeps current files. The external platform CLI is pointed at the project root:

```bash
anksen-agent-studio doctor --project /path/to/jinhu-smart-park
anksen-agent-studio finalize --project /path/to/jinhu-smart-park --apply
anksen-agent-studio agent-cycle --project /path/to/jinhu-smart-park --dry-run
```

The platform reads:

- `ops/agent-orchestrator/agents.config.json`
- `ops/agent-orchestrator/events/**`
- `ops/agent-orchestrator/queue/**`
- `ops/agent-orchestrator/results/**`
- `ops/agent-orchestrator/runtime/**`

The platform writes only approved project-state paths during apply flows.

### 7.2 Future Project Adapter Mode

The business repo owns a small adapter config:

```json
{
  "project_id": "jinhu-smart-park",
  "project_root": ".",
  "state_dir": "ops/agent-studio-project",
  "worktrees": {
    "main": ".",
    "agent-1": "../jinhu-smart-park-agent-1",
    "agent-2": "../jinhu-smart-park-agent-2",
    "agent-3": "../jinhu-smart-park-agent-3",
    "agent-4": "../jinhu-smart-park-agent-4",
    "agent-5": "../jinhu-smart-park-agent-5"
  },
  "frozen_paths": [
    "apps/**",
    "packages/**",
    "database/**",
    "infra/**",
    ".github/**",
    "Dockerfile",
    "Dockerfile.*",
    "docker-compose*",
    "deploy/**",
    "auth/**",
    ".env",
    ".env.*"
  ]
}
```

### 7.3 Console Invocation

The Console should support multiple project workspaces:

```text
Console
  -> Platform API
  -> Project Adapter
  -> jinhu-smart-park filesystem/git/events/runtime state
```

MVP Console should remain read-only until project adapter permissions are stable.

## 8. Migration Scope

### 8.1 Move First

Move in the first extraction implementation:

- Pure schemas
- Pure libraries
- Script logic that can accept `--project`
- Console planning docs
- Skill registry defaults
- Discovery and evolution engines
- Runtime Memory builder/reader/validator logic

### 8.2 Move Later

Move after compatibility tests:

- Existing task event history
- Existing run logs
- Existing project runtime memory
- Existing project results and reports

These are project evidence and should not move until the platform has an import/export story.

### 8.3 Do Not Move

Do not move:

- Smart-park business source code
- Migrations
- Seeds
- Production deployment scripts
- Business docs that describe Jinhu Smart Park release readiness
- Project-specific audit evidence unless exported through a controlled archival process

## 9. Compatibility Plan

### 9.1 Phase 1: External CLI Reads Existing Layout

The new platform should first support the current layout directly:

```text
ops/agent-orchestrator/
```

No immediate project-state move is required.

### 9.2 Phase 2: Dual-Path Adapter

Add support for both:

```text
ops/agent-orchestrator/
ops/agent-studio-project/
```

### 9.3 Phase 3: Project State Rename

After successful dry-runs and finalize cycles, rename project state to `ops/agent-studio-project`.

### 9.4 Phase 4: Remove Embedded Platform Logic

Remove or deprecate copied scripts in `jinhu-smart-park` only after the external CLI proves equivalent behavior for:

- doctor
- check-dispatch-status
- goal-to-queue
- agent-cycle
- audit-all-results
- integrate-agent-results
- runtime-memory-build/read/validate
- finalize

## 10. Data Ownership

| Data | Owner after extraction | Notes |
| --- | --- | --- |
| Platform code | `anksen-agent-studio` | Reusable product code |
| Console code | `anksen-agent-studio` | Multi-project console |
| Agent registry defaults | `anksen-agent-studio` | Can be overridden by project adapter |
| Skill registry defaults | `anksen-agent-studio` | Can be extended per project |
| Project queue/event state | `jinhu-smart-park` initially | Move only through export/import |
| Project runtime memory | `jinhu-smart-park` initially | It is project evidence |
| Business release docs | `jinhu-smart-park` | Business-owned |
| Production scripts | `jinhu-smart-park` | Not platform-owned |

## 11. Safety Rules

Extraction must not:

- Modify `apps/**`.
- Modify `packages/**`.
- Modify `database/**`.
- Modify `infra/**`.
- Modify `.github/**`.
- Modify Docker, deploy, auth, env, migration, seed, or production files.
- Execute Agent tasks.
- Deploy.
- Run production migration, seed, reset, or cleanup.
- Move audit evidence without an explicit archival plan.

## 12. Validation Requirements Before Real Extraction

Before moving code, create a dry-run validation matrix:

1. External CLI can read a fixture project.
2. External CLI can read current `jinhu-smart-park` state with `--project`.
3. `doctor` output matches current local script output.
4. `check-dispatch-status` output matches current local script output.
5. Runtime Memory validate remains PASS.
6. Event/read-model consistency remains PASS.
7. No business paths are modified.
8. Finalize remains PASS in the business repo.

## 13. Recommended Execution Steps

1. Stop new Agent Studio Console implementation inside `jinhu-smart-park`.
2. Create a new empty `anksen-agent-studio` repository.
3. Scaffold pnpm workspace with the proposed structure.
4. Copy only generic schemas and pure utility code first.
5. Introduce `--project <path>` as a first-class platform CLI option.
6. Add a `jinhu-smart-park` example adapter.
7. Run parity tests against current project state.
8. Move Console implementation into `apps/console`.
9. Keep `jinhu-smart-park` wrappers until platform CLI reaches feature parity.
10. Only then plan project-state cleanup or rename.

## 14. Open Questions

1. Should `anksen-agent-studio` be private first, then published internally as packages?
2. Should project adapters live in each business repo or in the platform repo as workspace definitions?
3. Should historical run logs stay in business repositories permanently?
4. Should the Console support local filesystem adapters only at first, or also remote project agents?
5. Should `agent-1` through `agent-5` remain default lanes, or become project-defined from day one?

## 15. Conclusion

`ops/agent-orchestrator` should be extracted into `anksen-agent-studio`, but the extraction should start with platform code and compatibility adapters, not with project evidence migration.

The safest model is:

```text
anksen-agent-studio = reusable platform, console, engines, adapters
jinhu-smart-park = business code, project state, audit evidence, thin adapter
```

This keeps ANKSEN Agent Studio productizable while preserving the audit trail and release safety of the Jinhu Smart Park business repository.

