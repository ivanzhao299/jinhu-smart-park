# Agent 4 RBAC, Menu, And Dashboard Evidence

Task: `TRIAL-20260621-001-A4-RBAC-MENU`
Batch: `TRIAL-20260621-001`
Agent: `agent-4`
Branch: `agent-4-dashboard-mobile-rbac`
Run time: 2026-06-21 14:01:06 CST

## Scope

This task collected release evidence for RBAC, role/module permission behavior, first-release menu visibility, dashboard menu visibility, and idempotency write protection. It did not modify business application code, migrations, seeds, auth, CI, Docker, deploy, or production configuration.

The API checks targeted the local API base already reachable on this worktree:

- `s1-rbac-std-fix-smoke.mjs`: `http://127.0.0.1:3001/api/v1`
- `first-release-idempotency.mjs`: `http://localhost:3001/api/v1`

`first-release-idempotency.mjs` creates local regression-marked user and work-order data. No production target was configured or used.

## Command Evidence

| Command | Result | Evidence |
|---|---|---|
| `git status --short` | Pass | Only task claim metadata was modified before validation: `ops/agent-orchestrator/queue/task-locks.json` and `ops/agent-orchestrator/queue/task-queue.json`. |
| `pnpm typecheck` | Pass | Workspace typecheck completed for `packages/shared`, `packages/ui`, `apps/api`, and `apps/web`. |
| `node scripts/e2e/s1-rbac-std-fix-smoke.mjs` | Pass | Admin login and `/users/me` passed; disabling `ai` removed it from `enabled_modules`; disabling `asset` made `/assets/statistics` return HTTP 403; modules were restored. |
| `node scripts/e2e/first-release-menu-whitelist.mjs` | Pass | Static menu contract retained `FIRST_RELEASE_MENU_PATHS` and `FIRST_RELEASE_MENU_PATH_SET`; `/dashboard` and required first-release paths were present; expanded menu definitions such as IoT, energy, robots, video security, leasing leads, refunds, invoices, safety emergency, and work permits were present. |
| `node scripts/e2e/first-release-idempotency.mjs` | Pass | Login passed; `POST /users` and `POST /work-orders` rejected missing idempotency keys with HTTP 400, replayed same-key requests, and returned HTTP 409 for same-key conflicts. |
| `git status --short` | Pass | Still only task queue claim metadata was modified before evidence report creation. |

## Production Readiness Matrix Mapping

| Matrix domain | Relevant matrix row | Automated result | Production gate meaning |
|---|---|---|---|
| RBAC | `RBAC` row in `docs/release/production-readiness-matrix.md` | Pass for local module authorization and guard behavior through `s1-rbac-std-fix-smoke.mjs`; pass for idempotency write protection through `first-release-idempotency.mjs`. | No Agent 4 RBAC command failure was found. Production still requires login-based, read-only role sampling with approved accounts. |
| Role permissions | `RBAC` and `菜单` rows | Pass for admin context, tenant/park scope, enabled module visibility, module disable/restore, and backend module guard denial. | Ordinary role and no-permission browser sampling still requires human approval in the target environment. |
| First-release menu | `菜单` row | Pass for static compatibility checks and first-release path presence. | This does not by itself prove target-environment browser menu visibility. Production requires manual left-menu sampling. |
| Dashboard visibility | `菜单` row and dashboard entry in first-release path set | Pass for `/dashboard` presence in `FIRST_RELEASE_MENU_PATHS`. | Target Web login and dashboard render must still be sampled manually in production or pre-production. |
| Idempotency | `RBAC` row and matrix idempotency risk notes | Pass for `/users` and `/work-orders` local replay/conflict semantics. | Production write-path idempotency sampling must not run without approval, test data marker, and cleanup plan. |

## No-Go And Conditional Items

No Agent 4 validation command failed in this run.

The production Go gate is still not fully closed by this task alone:

- Browser-level production menu sampling was not run.
- Ordinary role / no-permission browser and direct-route sampling was not run.
- Dashboard render was not inspected in a target browser session.
- The menu script explicitly checks that the runtime dashboard menu no longer uses the legacy first-release whitelist gate. If launch policy still requires non-first-release menus to be hidden by runtime whitelist filtering, open a follow-up implementation task instead of treating this evidence run as sufficient.
- Broader production launch blockers owned outside Agent 4, such as auth mock-disabled evidence, release-chain evidence, rollback evidence, and full regression gates, remain outside this task.

## Required Production Manual Sampling

These checks require human approval and target-environment credentials before execution:

| Sampling item | Suggested method | Pass condition | No-Go condition |
|---|---|---|---|
| Admin dashboard | Log in through Web and open `/dashboard`. | Dashboard loads without auth loop or blank page. | Login succeeds but dashboard fails to render. |
| Admin menu | Inspect left navigation after login. | Required trial-launch menu entries are visible according to the approved launch policy. | Required menu is missing, or disallowed menu is visible against the approved launch policy. |
| Ordinary role menu | Log in with an approved limited role. | Only role-authorized menus are visible. | Ordinary role sees admin-only or module-disabled menus. |
| Direct route denial | Try direct URL access for a menu/API the role lacks. | Page or API is denied with the expected auth/permission behavior. | Unauthorized route or API succeeds. |
| Production idempotency sample | Only with explicit approval, test marker, and cleanup plan. | Missing key, replay, and conflict semantics match local regression. | Duplicate write, missing-key success, or conflict not detected. |

## Follow-Up Recommendation

If the approved trial-launch policy still requires runtime hiding for IoT, energy, robots, video security, leasing expansion paths, refunds, invoices, safety emergency, or work permits, create a follow-up Agent 4 task to add or restore a browser/runtime menu visibility regression. This task intentionally did not change `apps/web` or any application code.
