# Production Readiness Dry-Run Report

## 1. Dry-Run Scope And Time

- Dry-run time: 2026-06-21 11:56:13 CST.
- Worktree: `/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-5`.
- Branch: `agent-5-testing-release`.
- Commit under check: `ed6a0cf chore(orchestrator): add production readiness dry run task`.
- Scope: first production readiness dry-run based on `docs/release/production-readiness-matrix.md`.
- Boundaries observed: no business code changes, no production deploy, no production config changes, no migration edits, no seed edits, no cleanup or destructive data commands.
- Environment confirmation: this run used the local agent-5 worktree. `first-release-auth-health.mjs` targeted its default local API base, `http://localhost:3001/api/v1`. No production target was configured or modified.

## 2. Command Results

| Command | Result | Writes Data | Notes |
|---|---|---:|---|
| `git status --short` | Pass | No | Worktree was clean before report generation. |
| `git branch --show-current` | Pass | No | Branch was `agent-5-testing-release`. |
| `git log --oneline -1` | Pass | No | HEAD was `ed6a0cf`. |
| `node --version` | Pass | No | Node.js `v24.15.0`. |
| `pnpm --version` | Pass | No | pnpm `9.12.0`. |
| `pnpm typecheck` | Fail | No | Failed before type analysis because `node_modules` is missing and `tsc` was not found. |
| `node scripts/e2e/first-release-menu-whitelist.mjs` | Pass | No | Static menu whitelist regression completed successfully. |
| `node scripts/e2e/first-release-auth-health.mjs` | Fail | Local API requests only | `/health`, `/ready`, password login, `/auth/me`, and wrong-password rejection passed; mobile send-code and WeChat authorize unexpectedly succeeded. |
| Script existence check for first-release, safety, migration, seed, bootstrap, and health scripts | Pass | No | Required scripts inspected in the task were present. |

Commands intentionally not run:

- `pnpm lint`: skipped after `pnpm typecheck` failed due missing dependencies; it would not provide a valid release gate without installing dependencies.
- `pnpm build`: skipped because typecheck failed and build can write build artifacts outside the allowed report paths.
- `pnpm test:e2e` and `node scripts/e2e/first-release-regression.mjs`: skipped because auth smoke already produced No-Go, and full e2e can create test data.
- `node scripts/e2e/first-release-files.mjs`, `first-release-users-assets.mjs`, `first-release-workorders.mjs`, `first-release-idempotency.mjs`, `first-release-leasing.mjs`: skipped because they can exercise write paths and local test-data safety was not explicitly confirmed for this run.
- `pnpm db:migrate`, `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`, `pnpm db:check:init`, `pnpm db:bootstrap:admin`: skipped because this was not a target environment release-window execution.
- `MODE=full pnpm prod:health` and `bash scripts/verify-api-login-dockerexec.sh`: skipped because no production or pre-production deployment target was selected for this dry-run.
- `pnpm prod:deploy`, Docker cleanup, seed-dev, database down/reset, and smoke cleanup: prohibited by this task.

## 3. Passed Checks

- Agent 5 worktree entry checks passed: clean worktree, expected branch, and HEAD recorded.
- Required dry-run source documents and scripts were present, including production readiness matrix, first-release runner, auth health, menu whitelist, files, users/assets, workorders, idempotency, leasing, safety access, S9D1 unified action executor, migration, seed, init baseline, bootstrap admin, and production health scripts.
- Menu whitelist regression passed:
  - Legacy `FIRST_RELEASE_MENU_PATHS` and `FIRST_RELEASE_MENU_PATH_SET` compatibility checks remain available.
  - Dashboard runtime menu no longer uses the first-release whitelist gate.
  - Required paths such as `/dashboard`, `/system/users`, `/assets/unit-status-board`, `/assets/statistics`, `/leasing/contracts`, `/leasing/receivables`, `/leasing/payments`, `/workorders`, `/operations/terminal`, and safety paths were present.
  - Expanded menu definitions for IoT, energy, robots, video security, safety emergency/work permits, leasing leads, refunds, and invoices were present.
- Local auth smoke partially passed:
  - `GET /health` returned 200.
  - `GET /ready` returned 200.
  - Password login returned 200 and an access token.
  - `GET /auth/me` returned 200.
  - Wrong password was rejected with 401.

## 4. Failed Or Blocked Checks

| Item | Status | Evidence | Impact | Owner |
|---|---|---|---|---|
| Typecheck gate | Blocked / Fail | `pnpm typecheck` failed with `tsc: command not found` and pnpm warned that `node_modules` is missing. | Release gate is not proven. Matrix marks typecheck failure as No-Go. | Agent 5 / release owner |
| SMS auth exposure | Blocker | `POST /auth/mobile/send-code` unexpectedly returned HTTP 200 and included mock-code style response data. | Production requires SMS mock/fixed-code paths disabled unless explicitly enabled by a production-safe change. | Auth owner / Agent 5 |
| WeChat auth mock exposure | Blocker | `POST /auth/wechat/authorize` unexpectedly returned HTTP 200 with a mock-style authorization URL. | Production requires WeChat mock disabled unless explicitly enabled by a production-safe change. | Auth owner / Agent 5 |
| Full e2e / first-release regression | Not verified | Skipped after No-Go blockers and because write-path safety was not explicitly confirmed. | Functional release readiness remains incomplete. | Agent 5 |
| Migration / seed / initialization | Not verified | Target environment migration, production seed, `db:check:init`, and `bootstrap-admin` were not run. | Target environment release chain is unproven. | Release owner / database owner |
| Production health / login verification | Not verified | `MODE=full pnpm prod:health` and container login verification were not run. | Cannot declare target environment readiness. | Ops / Agent 5 |
| Backup and rollback evidence | Not verified | DB backup, file backup, previous image tag, and rollback responsibility were not checked in this dry-run. | Rollback readiness is unproven. | Release owner / ops |
| Docker cleanup evidence | Not verified | No deploy occurred; post-deploy Docker cleanup was not applicable in this run. | Must still be proven during production deployment. | Ops |

## 5. Domain Assessment

| Domain | Evidence This Run | Status | Required Before Production | Owner |
|---|---|---|---|---|
| Auth | Health, readiness, password login, `/auth/me`, and wrong-password rejection passed; SMS send-code and WeChat authorize unexpectedly succeeded. | Blocker | Disable or intentionally gate SMS/WeChat mock paths; rerun auth health; verify production auth env values. | Auth owner / Agent 5 |
| RBAC | Only indirectly covered by login and menu source checks. | Not verified | Run RBAC smoke and role/data-permission checks in local or pre-production test environment. | Agent 4 / Agent 5 |
| Menu whitelist | `first-release-menu-whitelist.mjs` passed. | Pass | Repeat in CI/pre-production and include production manual menu sampling. | Agent 4 / Agent 5 |
| Tenants and assets | Scripts exist; no tenant/assets smoke was run. | Not verified | Run `first-release-users-assets.mjs` and relevant S2/S3A smoke in safe test environment. | Agent 1 / Agent 5 |
| Contracts and finance | Scripts exist; no leasing or finance smoke was run. | Not verified / High risk | Run leasing, contract lifecycle, payment, waiver, invoice, idempotency, and audit checks in safe test environment. | Agent 2 / Agent 5 |
| Workorders | Script exists; no workorder smoke was run. | Not verified | Run `first-release-workorders.mjs` and S5-related cross-checks where applicable. | Agent 3 / Agent 5 |
| Safety and IoT | Safety access and S9D1 scripts exist; not run. | Not verified / High risk | Run safety access, S5A/S5B, S9A-S9F1, especially S9D1 unified action executor, in safe test environment. | Agent 3 / Agent 5 |
| File upload | File regression script exists; not run. | Not verified / High risk | Run files smoke in safe test environment and verify production file volume/backup. | Agent 5 / ops |
| Audit logs | No audit inspection was run. | Not verified / High risk | After write-path smoke, sample audit logs for auth failure, financial protection, status transitions, and critical writes. | Agent 5 / business owners |
| Migration | Scripts exist; migration not run. | Not verified | Run target environment migration with backup and checksum/history evidence. | Database owner / Agent 5 |
| Seed and initialization | Scripts exist; production seed and bootstrap were not run. | Not verified | Run production seed with `ALLOW_PRODUCTION_SEED=yes`, `db:check:init`, `bootstrap-admin`, then `db:check:init` again in target environment. | Release owner |
| Deployment health | Production health script exists; not run. | Not verified | Run `MODE=full pnpm prod:health` and container login verification after deploy. | Ops / Agent 5 |
| Rollback readiness | Not checked. | Not verified / High risk | Record DB backup, file backup, previous image tags, rollback owner, and rollback validation plan. | Release owner / ops |
| Docker cleanup | Not applicable because no deploy occurred. | Not verified | Production deployment must run post-health Docker cleanup or document failure/skip reason. | Ops |

## 6. High Risks

- Auth mock exposure: local auth health showed SMS send-code and WeChat authorize paths succeeding. If this reflects production configuration or behavior, it is a release-blocking security risk.
- Typecheck gate unavailable: dependency installation is missing in the agent-5 worktree, so the typecheck release gate did not run. A green menu check cannot compensate for an unavailable typecheck gate.
- Financial, file, safety, IoT, audit, and rollback checks remain unverified. These are first-release production risk areas in the readiness matrix.
- Target environment release chain is unverified: no migration, production seed, initialization, production health, or container login verification evidence was produced.
- Full regression coverage gap remains: the matrix already notes that `first-release-regression.mjs` does not include S9 IoT / energy specialized smoke scripts.

## 7. Required Follow-Ups Before Production

1. Install dependencies or use a prepared CI/pre-production runner, then rerun `pnpm typecheck`.
2. Investigate why local `POST /auth/mobile/send-code` and `POST /auth/wechat/authorize` succeeded. Confirm production values keep `AUTH_SMS_FIXED_CODE` empty, `AUTH_SMS_CODE_VISIBLE=false`, and `AUTH_WECHAT_MOCK_ENABLED=false`.
3. Rerun `node scripts/e2e/first-release-auth-health.mjs` after auth configuration is corrected or production-safe behavior is confirmed.
4. Run `pnpm lint`, `pnpm build`, `pnpm test:e2e`, and `node scripts/e2e/first-release-regression.mjs` in a safe local or pre-production environment.
5. Run first-release files, users/assets, workorders, idempotency, and leasing checks in an environment where test data creation and cleanup are approved.
6. Run safety and IoT smoke coverage, including `safety-module-access-smoke.mjs` and S9A-S9F1, with emphasis on S9D1 unified action executor visibility and duplicate-prevention behavior.
7. Execute target environment release chain in the approved window: migration, production seed, init baseline, bootstrap admin, init baseline again, production health, and container login verification.
8. Record DB backup, file backup, rollback image tags, rollback owner, observation window, and Docker cleanup result.

## 8. Matrix Coverage Gap

The dry-run covered only a small subset of `docs/release/production-readiness-matrix.md`:

- Covered: worktree state, script presence, menu whitelist static regression, partial local auth/health smoke.
- Failed: typecheck gate, auth disabled-path checks.
- Not covered: lint, build, full e2e, first-release regression, finance smoke, files smoke, tenant/assets smoke, workorders smoke, safety smoke, IoT/energy smoke, audit sampling, migration, production seed, initialization, production health, backup, rollback, Docker cleanup.

Because production release chain, regression coverage, and rollback evidence remain unverified, this dry-run cannot support a Go or Conditional Go recommendation.

## 9. Conclusion

**No-Go.**

Reasons:

1. `pnpm typecheck` did not pass.
2. Auth health found release-blocking behavior: SMS send-code and WeChat authorize endpoints unexpectedly succeeded.
3. Required target environment checks were not run: migration, production seed, initialization, production health, login verification, backup, rollback, and Docker cleanup evidence.
4. Full first-release regression and high-risk domain smoke checks remain unverified.

Do not push or release until the blockers above are closed and the required follow-up checks produce passing evidence.
