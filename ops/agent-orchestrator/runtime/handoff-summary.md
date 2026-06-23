# Runtime Memory Handoff Summary

Generated at: 2026-06-23T07:29:03.437Z

## Current State
- Branch: main
- Head: 38275f5 chore(orchestrator): accept external task proposal
- Working tree clean at build time: yes
- Queue: READY 1, CLAIMED 0, DONE 0, BLOCKED 4
- Active locks: 0
- Event store: 175 task events across 42 tasks

## What To Read First
1. `ops/agent-orchestrator/runtime/platform-state.json`
2. `ops/agent-orchestrator/runtime/agent-memory.json`
3. `ops/agent-orchestrator/runtime/skill-memory.json`
4. `ops/agent-orchestrator/runtime/roadmap-memory.json`
5. `ops/agent-orchestrator/runtime/decision-log.json`

## Platform Modules
- ops/agent-orchestrator/scripts/orchestratorctl.mjs
- ops/agent-orchestrator/events/
- ops/agent-orchestrator/queue/
- ops/agent-orchestrator/goal/
- ops/agent-orchestrator/planner/
- ops/agent-orchestrator/evolution/
- ops/agent-orchestrator/discovery/
- ops/agent-orchestrator/skills/
- ops/agent-orchestrator/runtime/

## Agent Roles
- agent-1: Agent 1 - Runtime Docs and Portal — Assets, documentation, portal/UI assistance, Runtime documentation index.
- agent-2: Agent 2 - Validation and Compatibility — Validation, compatibility, finance, test matrix, Doctor/Audit/Typecheck runbooks.
- agent-3: Agent 3 - Runtime Planner and Ops Data — IoT, safety, work order, energy, runtime data, read-model consistency, and planner runtime flow.
- agent-4: Agent 4 - UI, Registry, RBAC and Selector — Frontend, UI/UX, dashboard, mobile, menus, RBAC, Agent Registry, smart selector, and regression acceptance.
- agent-5: Agent 5 - Planning, Release and Platform — Fallback planning, release acceptance, production readiness, orchestrator platform architecture, and Goal Engine ownership.

## Skill Runtime Surface
- code_development: Code Development via codex-cli
- document_generation: Document Generation via documents
- spreadsheet_analysis: Spreadsheet Analysis via spreadsheets
- slide_generation: Slide Generation via presentations
- image_generation: Image Generation via imagegen
- pdf_processing: PDF Processing via pdf
- web_research: Web Research via web-search
- data_integration: Data Integration via codex-cli
- legacy_discovery: Legacy System Discovery via codex-cli
- schema_inference: Schema Inference via codex-cli
- replica_planning: Replica Planning via codex-cli
- data_migration_mapping: Data Migration Mapping via codex-cli
- browser_discovery: Browser Runtime Discovery via codex-cli
- api_discovery: API Discovery via codex-cli
- entity_mapping: Entity Mapping via codex-cli
- replica_scoring: Replica Scoring via codex-cli
- validation_testing: Validation and Testing via codex-cli
- evolution_observer: Evolution Observer via resident-observer

## Roadmap
- Current stage: V3-G P0 complete; Runtime Memory Center MVP in progress
- Next target: Use runtime memory as first-read context for new Codex-Orchestrator windows.
- V2 Event-first Queue and Parallel 2
- V3 Goal Engine / Planner / Agent Registry
- V3-E Resident Observer / Evolution Center
- V3-F Goal to Queue closed loop
- V3-G Legacy Discovery / Replica Engine
- Runtime Memory Center

## Discovery / Replica State
- Targets: 2
- Artifacts: 9
- Discovery is fixture/manual manifest only unless explicitly authorized.
- No real external crawling is part of Runtime Memory build.
- Replica planning remains dry-run and requires human approval before migration/business code.

## Evolution Center
- Patterns: 5
- Open improvements: 7
- Resolved improvements: 1
- Learning entries: 11

## Guardrails
- No deploy without explicit approval.
- No production migration/seed/reset/cleanup.
- No apps/packages/database/infra/.github/Docker/deploy/auth changes from memory build.
- No FINALIZE RESULT, no DONE.

## Standard Commands
- `node ops/agent-orchestrator/scripts/runtime-memory-read.mjs --summary`
- `node ops/agent-orchestrator/scripts/runtime-memory-validate.mjs`
- `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor`
- `node ops/agent-orchestrator/scripts/orchestratorctl.mjs finalize --apply`

## Next Action
Use Runtime Memory as the first context source in a new Codex-Orchestrator window, then run `doctor` before any task execution.
