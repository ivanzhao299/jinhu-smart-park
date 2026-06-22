# Agent Platform V2 Runtime Docs Index Checklist

Task: `AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX`
Batch: `AGENT-PLATFORM-V2-RESOURCE-READINESS-20260622`
Owner: `agent-1`
Date: 2026-06-22

## 1. Scope

This checklist verifies that Agent Platform V2 runtime documentation, task reports, and result artifacts are discoverable from stable paths.

It is low-risk and documentation-only. It must not run Agents, merge, push, deploy, migrate, seed, reset, prune, truncate, clean production data, modify business code, or change auth, CI, Docker, deploy, database, migration, seed, production configuration, SMS, or WeChat behavior.

## 2. Preconditions

- Work from the repository root.
- Keep writes limited to `docs/release`, `docs/testing`, `ops/agent-orchestrator/reports`, and `ops/agent-orchestrator/results`.
- Treat `docs/release/agent-platform-v2-runtime-docs-index.md` as the release-facing index.
- Treat this file as the checklist for discoverability verification.
- Treat task reports under `ops/agent-orchestrator/reports` and result JSON under `ops/agent-orchestrator/results` as orchestrator evidence, not business behavior.

## 3. Required File Checks

| Check | Command | Expected result |
|---|---|---|
| Release index exists | `test -f docs/release/agent-platform-v2-runtime-docs-index.md` | Exits 0. |
| Testing checklist exists | `test -f docs/testing/agent-platform-v2-runtime-docs-index-checklist.md` | Exits 0. |
| Task report exists | `test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.md` | Exits 0. |
| Task result exists after completion recording | `test -f ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.json` | Exits 0 after `complete-task.mjs` is run. |

## 4. Discoverability Checklist

| Area | Verification | Pass condition |
|---|---|---|
| Release docs | `find docs/release -maxdepth 1 -type f -name 'agent-platform-v2-*.md' | sort` | Output includes the runtime docs index and the existing compatibility, read-model, event-sourcing, runtime-memory, inventory-generator, parallel-runner, and selector docs. |
| Testing docs | `find docs/testing -maxdepth 1 -type f -name 'agent-platform-v2-*.md' | sort` | Output includes the runtime docs index checklist and the existing validation, read-model, event-sourcing, runtime-memory, inventory-generator, parallel-runner, selector, and smoke checklist docs. |
| Reports | `find ops/agent-orchestrator/reports -maxdepth 1 -type f -name 'AGENT-PLATFORM-V2*.md' | sort` | Output includes the A1 report and existing A2 through A5 runtime reports. |
| Results | `find ops/agent-orchestrator/results -maxdepth 1 -type f -name 'AGENT-PLATFORM-V2*.json' | sort` | Output includes the A1 result after completion and existing A2 through A5 runtime results. |
| Cross-links | Review `docs/release/agent-platform-v2-runtime-docs-index.md`. | Each runtime area links to owner, release doc, testing doc, report, and result artifact when present. |
| Low-risk boundary | Review changed files with `git status --short`. | Changed files are limited to the allowed docs, reports, results, and any orchestrator bookkeeping produced by `complete-task.mjs`. |

## 5. Content Checklist

- [ ] The release index identifies `agent-1` through `agent-5` ownership.
- [ ] The release index maps compatibility, read model, parallel runner, event sourcing, runtime memory, inventory generator, runtime validation, Smart E2E selector, and smoke checklist artifacts.
- [ ] The release index states that runtime inventories are generated metadata, not business truth.
- [ ] The release index keeps source code, migrations, release procedures, and production configuration as authoritative.
- [ ] The release index preserves the baseline validation rule: orchestrator doctor, audit dry-run, and typecheck remain mandatory.
- [ ] The checklist uses read-only discovery commands except for the required completion recording step.
- [ ] The checklist explicitly forbids deploy, merge, push, production migration, production seed, cleanup, reset, prune, truncate, and production data writes.
- [ ] The task report records changed files, commands, passed checks, skipped checks, commit hash state, and remaining risks.
- [ ] The result JSON is created by `complete-task.mjs` with truthful status, changed files, commands run, passed checks, failed checks, and notes.

## 6. Safe Command Set

These commands are safe for this low-risk documentation task:

```bash
git status --short
test -f docs/release/agent-platform-v2-runtime-docs-index.md
test -f docs/testing/agent-platform-v2-runtime-docs-index-checklist.md
test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.md
find docs/release -maxdepth 1 -type f -name 'agent-platform-v2-*.md' | sort
find docs/testing -maxdepth 1 -type f -name 'agent-platform-v2-*.md' | sort
find ops/agent-orchestrator/reports -maxdepth 1 -type f -name 'AGENT-PLATFORM-V2*.md' | sort
find ops/agent-orchestrator/results -maxdepth 1 -type f -name 'AGENT-PLATFORM-V2*.json' | sort
git diff --check
git status --short
```

Completion recording is allowed only for this task result:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs \
  --task-id AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX \
  --agent agent-1 \
  --status DONE \
  --commit-hash "" \
  --changed-files docs/release/agent-platform-v2-runtime-docs-index.md,docs/testing/agent-platform-v2-runtime-docs-index-checklist.md,ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.md,ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.json \
  --commands-run "git status --short,test -f docs/release/agent-platform-v2-runtime-docs-index.md,test -f docs/testing/agent-platform-v2-runtime-docs-index-checklist.md,test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.md,git diff --check,git status --short" \
  --passed-checks "Required docs and report files exist,git diff --check passes,No business database infra auth Docker deploy CI migration seed production config or production data paths changed" \
  --failed-checks "" \
  --notes "Documentation-only runtime docs index completed."
```

## 7. Explicitly Unsafe For This Task

Do not run:

- `pnpm prod:deploy`
- `pnpm db:migrate`
- `pnpm db:seed:prod`
- `pnpm db:seed:dev`
- `pnpm db:down`
- Docker prune or cleanup commands
- Database reset, truncate, or destructive cleanup commands
- Agent execution commands that dispatch workers
- Merge or push commands
- Commands that edit `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker files, deploy files, auth files, `.env*`, migrations, seeds, production configuration, or production data

## 8. Pass Criteria

This checklist passes when:

1. The release index, testing checklist, and task report files exist.
2. The result JSON exists after `complete-task.mjs` records completion.
3. `git diff --check` passes.
4. `git status --short` shows no business, database, infra, auth, CI, Docker, deploy, migration, seed, production configuration, or production data path changes.
5. Any skipped checks or script side effects are reported truthfully.
