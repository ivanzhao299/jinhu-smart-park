# Execution Plan

## 1. Activate and reproduce

- [ ] Activate this existing Trellis child task and load API coding guidance.
- [ ] Inspect the exact scheduler/resolver code and migrated column definitions.
- [ ] Add a focused PostgreSQL 16 regression that reproduces the pre-fix parameter typing failure through the complete reconciliation flow.

## 2. Minimal fix

- [ ] Add explicit schema-matching casts to every ambiguous positional bind in the scheduler and five housing resolver queries.
- [ ] Preserve all tenant/park predicates, cursor semantics, runtime-control behavior, transactions, and projection idempotency.
- [ ] Update mock/unit assertions only where needed to freeze the SQL/parameter contract.

## 3. Product verification and delivery

- [ ] Run targeted unit tests and the focused freshly migrated PostgreSQL test (same-topic environment retry maximum two).
- [ ] Run API lint/typecheck/build and Trellis quality checks in proportion to the diff.
- [ ] Update the raw-query spec only if the real reproduction reveals a new reusable inference rule.
- [ ] Commit, push only `codex/fix-housing-task-reconciliation-420`, open a PR with `Closes #420`, complete Codex review (maximum three rounds), required CI, squash merge, and capture merged-main CI and Deploy Production success.
- [ ] Confirm Issue #420 closed; fast-forward the RBAC worktree, delete the merged branch, prune, and create the fresh evidence branch.

## 4. Isolated housing final retest

- [ ] Create a new RUN_ID, verify unused ports, hand-write isolated compose/env, migrate, production seed, bootstrap admin, baseline, health, and fixture UI linkage.
- [ ] Enable and verify `approval.enforce` only through the #414 non-production entry.
- [ ] Reconcile billing/repair/purchase/lease/handover and save DB proof of correct task projections with no parameter-type/runtime-unavailable error.
- [ ] Execute deposit refund via lease deposit receivable → checkout/termination → full or net refund and assert ledger/audit rows.
- [ ] Execute C02: no approver gives HTTP 409 with a visible modal error; configured approver submits successfully and `housing/tasks?requestId=` deep link opens.
- [ ] Spot-check dashboard KPI against the new facts on desktop and phone-width where applicable.
- [ ] Save screenshots and manifest under `/tmp/jinhu-housing-final-<RUN_ID>/screenshots/`.
- [ ] Log fixture-scoped residual before/after counts for party, identity, approval, outbox, workorder, file DB rows and physical files; use precise DELETE only and require zero.
- [ ] Log out, run compose down with identical parameters, and verify ports are free.

## 5. Evidence report and archive

- [ ] Add `docs/uat/housing-final-retest-uat-<RUN_ID>.md` with #420, deposit, C02, dashboard, evidence manifest, and residual matrices; exclude secrets.
- [ ] Deliver the evidence PR through review/CI/squash merge and merged-main CI plus Deploy Production.
- [ ] Archive the six fix children and housing parent UAT only if every required case passes; otherwise retain failed tasks and list residual gaps.
- [ ] Report changed files, commands/results, skipped checks/reasons, remaining risks, campaign status for #408/#409/#410/#413/#414/#420, all three UAT rounds, and archive state.

## Validation commands

- `git diff --check`
- targeted Node tests for property-task reconciliation and housing adapters
- focused PostgreSQL spec with `PROPERTY_TASK_PG_GATE_REQUIRED=1` and a freshly migrated PostgreSQL 16 URL
- `pnpm --filter @jinhu/api lint`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/api build`
- PR required checks; merged-main CI and Deploy Production

## Risk and rollback points

- Do not edit migrations or broaden scope predicates to solve inference.
- Stop after two same-topic PostgreSQL environment failures and report the evidence.
- Do not touch HR files, production data, other users' containers, or the primary Chrome profile.
- Do not use `TRUNCATE CASCADE`; cleanup targets must be fixture-specific and recoverable from the manifest.
