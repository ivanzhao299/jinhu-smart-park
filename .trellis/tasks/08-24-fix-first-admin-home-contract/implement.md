# Implementation plan

1. Comment on Issue #348 and PR #359 with the pointer-only authority predicate, backfill rule, and routing matrix.
2. Create `codex/tenant-bootstrap-admin-landing` from verified `origin/main` and activate this task.
3. Add the optional shared field and build shared.
4. Add forward-only migration `000252_tenant_bootstrap_admin_pointer_backfill.sql` after synchronizing the latest main migration sequence.
5. Derive and emit the boolean in `getCurrentUserContext` using one tenant lookup and exact pointer equality; add focused tests for pointer hit/NULL/other/cross-tenant cases.
6. Update desktop routing priority and add desktop/mobile Web tests.
7. Run shared build, API focused spec/typecheck, Web typecheck/lint/auth-routing gate.
8. Run Trellis quality review, inspect diff/status, update task records, commit, and push only the authorized branch.
9. Create a `Closes #348` PR; iterate `@codex review` at most three rounds with green gates.
10. Squash merge, monitor main CI and Deploy Production, and capture health/cleanup evidence.
11. Confirm Issue closure; fast-forward baseline, delete merged feature branches local/remote, prune, create `codex/main-post-bootstrap-landing`, and archive/update Trellis records.

## Risk and stop points

- Return to planning if code evidence contradicts the predicate.
- Migration failure stops seed, merge, and deploy; do not alter an already successful migration.
- Retry the same failing condition at most twice; on the third occurrence stop and report partial completion.
- Do not merge without green focused validation, CI, and review; do not finish cleanup without successful deploy health and Docker cleanup.

## Validation evidence

- `pnpm --filter @jinhu/shared build` — passed.
- UsersService focused spec — 12/12 passed with pointer-only identity cases.
- `pnpm --filter @jinhu/api typecheck` — passed.
- `pnpm --filter @jinhu/web typecheck` — passed.
- `pnpm --filter @jinhu/web lint` — passed.
- `pnpm --filter @jinhu/web test:unit:auth-routing` — 42/42 passed.
- `node scripts/e2e/migration-prerequisite-contract.mjs` — passed.
- Isolated PostgreSQL 16 formal runner — 243/243 migrations and 8/8 prerequisites passed through `000252`, 0 failures (before the final `role_scope='tenant'` tightening).
- Final `000252` SQL on isolated PostgreSQL 16 — deterministic earliest-time/UUID tie-break, tenant-wide cross-park role reuse, zero-candidate NULL, replay stability, and corrupt-tenant preflight rollback passed.
- Browser inspection skipped: this task changes a pure routing decision and response contract, not rendered UI; no browser result is claimed.
