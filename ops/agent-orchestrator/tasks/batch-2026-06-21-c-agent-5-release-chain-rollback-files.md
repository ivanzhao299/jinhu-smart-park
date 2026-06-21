# Agent Task: Batch 2026-06-21-C Release Chain, Rollback, And Files Evidence

## Batch
2026-06-21-C

## Target Agent
agent-5

## Working Directory
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-5

## Branch
agent-5-testing-release

## Priority
P0 production launch readiness

## Source Evidence
- `docs/release/production-readiness-dry-run-report.md` marks migration, production seed, initialization, production health, login verification, backup, rollback, Docker cleanup, and file upload as Not verified.
- `docs/release/production-readiness-matrix.md` marks failures or missing evidence for these items as No-Go.

## Task Goal
Create a release-chain evidence pack covering target-environment readiness, file storage/backup, rollback evidence, and Docker cleanup expectations. Prefer dry-run and documentation evidence unless a local or pre-production target is explicitly approved.

## Allowed Change Scope
1. New or updated release evidence docs under `docs/release/`
2. Optional updates to `docs/release/production-readiness-dry-run-report.md`
3. Optional updates to `docs/deployment/production.md` or `docs/release/production-release-sop.md` only to clarify existing release evidence requirements
4. Test/report scripts under `scripts/e2e/` only if changes are diagnostics-only and do not create new production writes by default

## Forbidden Change Scope
1. No business code changes.
2. No migration creation or migration edits.
3. No seed script behavior changes.
4. No deploy, Docker, CI, or production runtime config changes.
5. No destructive commands: no `db:down`, reset, truncate, cleanup, prune, or deploy without explicit user approval.
6. No production write-path e2e unless the user explicitly confirms target, test account, data marker, and cleanup plan.
7. No secrets, tokens, passwords, or production connection strings.
8. No merge and no push.

## Files To Inspect
- `docs/release/production-readiness-dry-run-report.md`
- `docs/release/production-readiness-matrix.md`
- `docs/release/production-release-sop.md`
- `docs/release/production-go-live-checklist.md`
- `docs/deployment/production.md`
- `scripts/db-migrate.sh`
- `scripts/db-seed-prod.sh`
- `scripts/check-init-baseline.sh`
- `scripts/bootstrap-admin.sh`
- `scripts/prod-healthcheck.sh`
- `scripts/verify-api-login-dockerexec.sh`
- `scripts/e2e/first-release-files.mjs`

## Implementation Requirements
1. Start with:
   ```bash
   git status --short
   git branch --show-current
   git log --oneline -1
   ```
   Stop if the worktree is not clean or the branch is not `agent-5-testing-release`.

2. Build an evidence table with these rows:
   - migration command and target
   - production seed command and `ALLOW_PRODUCTION_SEED=yes`
   - first `db:check:init`
   - `bootstrap-admin`
   - second `db:check:init`
   - `MODE=full pnpm prod:health`
   - `bash scripts/verify-api-login-dockerexec.sh`
   - file upload/download smoke or controlled sampling
   - PostgreSQL backup evidence
   - file backup evidence
   - previous image tag evidence
   - rollback owner and observation window
   - Docker cleanup evidence

3. Do not run target-environment commands unless the user has confirmed the target and safety class. If not confirmed, record them as Not verified with exact command and required approval.

4. For local-only checks, it is acceptable to inspect script existence and dry-run command shape.

5. If file smoke is run, confirm it targets a local or approved pre-production environment and document test data cleanup behavior.

6. Keep the final conclusion conservative: missing target evidence remains No-Go or Conditional-Go, never Go.

## Validation Commands
Minimum safe commands:

```bash
git status --short
test -x scripts/db-migrate.sh
test -x scripts/db-seed-prod.sh
test -x scripts/check-init-baseline.sh
test -x scripts/bootstrap-admin.sh
test -x scripts/prod-healthcheck.sh
test -x scripts/verify-api-login-dockerexec.sh
git status --short
```

Only after explicit local/pre-production safety confirmation:

```bash
node scripts/e2e/first-release-files.mjs
pnpm db:migrate
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
pnpm db:check:init
pnpm db:bootstrap:admin
pnpm db:check:init
MODE=full pnpm prod:health
bash scripts/verify-api-login-dockerexec.sh
```

Do not run `pnpm prod:deploy`, Docker cleanup, destructive cleanup, or production write-path commands without separate user confirmation.

## Commit Permission
Commit is allowed only for release evidence documentation or safe diagnostics. No runtime behavior changes.

Suggested local commit message:

```text
docs(agent-5): add release chain rollback evidence
```

Do not push. Do not merge.

## Final Report Required
1. Worktree status, branch, and HEAD.
2. Changed files.
3. Evidence table with Pass, Fail, Not verified, or Blocked.
4. Commands run and commands intentionally skipped with reasons.
5. Whether any command wrote data.
6. Current Go / Conditional-Go / No-Go effect.
7. Commit hash if a local commit was created.
8. Remaining risks.
9. Explicit statement: no merge and no push performed.

## Agent Passphrase

```text
Agent 5，请在 agent-5-testing-release 分支执行 Batch 2026-06-21-C 发布链、回滚和文件证据任务。目标是补齐 migration、prod seed、init、bootstrap、prod health、container login、文件上传下载、备份、回滚 tag、Docker cleanup 的验收证据。默认只做文档/脚本存在性/命令形态检查；没有用户确认不得跑生产或写入型命令。禁止改业务代码、migration、seed 行为、deploy/Docker/CI/生产配置；可本地提交 docs/release 证据报告，禁止 push，禁止 merge。
```
