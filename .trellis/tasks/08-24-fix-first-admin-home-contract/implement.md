# Implementation plan

1. Comment on Issue #348 with the authority predicate, fallback, routing matrix, and no-migration rationale.
2. Create `codex/tenant-bootstrap-admin-landing` from verified `origin/main` and activate this task.
3. Add the optional shared field and build shared.
4. Derive and emit the boolean in `getCurrentUserContext` using one tenant lookup and existing role links.
5. Add focused API tests for pointer, legacy fallback, later admin, ordinary user, and target-park role behavior.
6. Update desktop routing priority and add desktop/mobile Web tests.
7. Run shared build, API focused spec/typecheck, Web typecheck/lint/auth-routing gate.
8. Run Trellis quality review, inspect diff/status, update task records, commit, and push only the authorized branch.
9. Create a `Closes #348` PR; iterate `@codex review` at most three rounds with green gates.
10. Squash merge, monitor main CI and Deploy Production, and capture health/cleanup evidence.
11. Confirm Issue closure; fast-forward baseline, delete merged feature branches local/remote, prune, create `codex/main-post-bootstrap-landing`, and archive/update Trellis records.

## Risk and stop points

- Return to planning if code evidence contradicts the predicate.
- Do not add a migration/seed without separate justification in the issue.
- Retry the same failing condition at most twice; on the third occurrence stop and report partial completion.
- Do not merge without green focused validation, CI, and review; do not finish cleanup without successful deploy health and Docker cleanup.

## Validation evidence

- `pnpm --filter @jinhu/shared build` — passed.
- UsersService focused spec — 13/13 passed.
- `pnpm --filter @jinhu/api typecheck` — passed.
- `pnpm --filter @jinhu/web typecheck` — passed.
- `pnpm --filter @jinhu/web lint` — passed.
- `pnpm --filter @jinhu/web test:unit:auth-routing` — 42/42 passed.
- Browser inspection skipped: this task changes a pure routing decision and response contract, not rendered UI; no browser result is claimed.
