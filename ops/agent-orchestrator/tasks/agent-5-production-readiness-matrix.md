# Agent Task: Production Readiness Matrix

## Target Agent
agent-5

## Working Directory
/Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-5

## Branch
agent-5-testing-release

## Task Goal
梳理当前 Jinhu Smart Park 系统投入生产前必须通过的测试矩阵、发布检查项、风险清单和回滚检查项，形成可执行的上线验收文档。

本轮只生成文档和验收清单，不改业务代码。Agent 5 负责测试回归、发布验收和生产稳定性检查，不直接修复业务 service。如发现生产风险或测试缺口，记录根因、影响范围和建议交给对应业务 Agent。

## Strict Boundaries
1. 只生成或更新文档、验收矩阵、发布检查清单，不改业务代码。
2. 不修改 `apps/api/src/modules/**` 业务 service、controller、DTO、entity。
3. 不修改 `apps/web/**` 前端页面或组件。
4. 不新增 migration。
5. 不修改旧 migration。
6. 不修改 auth / RBAC 实现代码。
7. 不修改 CI / Docker / deploy / 短信 / 微信配置。
8. 不提交 secrets、token、密码、真实生产连接信息或真实生产账号。
9. 不执行 merge。
10. 不执行 push。
11. 如 worktree 不 clean，先停止并报告。
12. 如发现上线阻断项，只记录 No-Go 和建议修复点，不在本任务内跨域修复。

## Expected Changed Files
优先选择其中一个文档路径，避免重复产物：

- `docs/release/production-readiness-matrix.md`
- 或 `docs/testing/production-readiness-matrix.md`

如确实需要同步索引，可额外更新：

- `docs/index.md`
- `docs/testing/how-to-run-tests.md`
- `docs/release/production-go-live-checklist.md`

不要修改业务代码、migration、CI、Docker、deploy、auth、短信、微信配置。

## Files To Inspect
- `AGENTS.md`
- `package.json`
- `docs/testing/how-to-run-tests.md`
- `docs/release/production-release-sop.md`
- `docs/release/production-go-live-checklist.md`
- `docs/deployment/production.md`
- `docs/deployment/troubleshooting.md`
- `docs/release/production-migration-execution-policy.md`
- `scripts/e2e/first-release-regression.mjs`
- `scripts/e2e/first-release-auth-health.mjs`
- `scripts/e2e/first-release-menu-whitelist.mjs`
- `scripts/e2e/first-release-files.mjs`
- `scripts/e2e/first-release-users-assets.mjs`
- `scripts/e2e/first-release-workorders.mjs`
- `scripts/e2e/first-release-leasing.mjs`
- `scripts/e2e/first-release-idempotency.mjs`
- `scripts/e2e/s1-smoke.mjs`
- `scripts/e2e/s1-rbac-std-fix-smoke.mjs`
- `scripts/e2e/s2b-smoke.mjs`
- `scripts/e2e/s3a-park-tenant-smoke.mjs`
- `scripts/e2e/s3b-leasing-crm-smoke.mjs`
- `scripts/e2e/s3c-contract-smoke.mjs`
- `scripts/e2e/s3d-payment-smoke.mjs`
- `scripts/e2e/s3d-waiver-smoke.mjs`
- `scripts/e2e/s3d-invoice-smoke.mjs`
- `scripts/e2e/s3e-contract-lifecycle-smoke.mjs`
- `scripts/e2e/s5a-safety-smoke.mjs`
- `scripts/e2e/s5b-emergency-permit-smoke.mjs`
- `scripts/e2e/s9a-iot-device-hub-smoke.mjs`
- `scripts/e2e/s9b-iot-runtime-alert-smoke.mjs`
- `scripts/e2e/s9c-iot-rule-engine-smoke.mjs`
- `scripts/e2e/s9d-iot-scene-center-smoke.mjs`
- `scripts/e2e/s9d1-unified-action-executor-smoke.mjs`
- `scripts/e2e/s9e-energy-meter-monitor-smoke.mjs`
- `scripts/e2e/s9f-energy-billing-tenant-smoke.mjs`
- `scripts/e2e/s9f1-energy-billing-adjustment-reversal-smoke.mjs`
- `scripts/db-migrate.sh`
- `scripts/db-seed-prod.sh`
- `scripts/check-init-baseline.sh`
- `scripts/bootstrap-admin.sh`
- `scripts/prod-healthcheck.sh`
- `scripts/verify-api-login-dockerexec.sh`
- `.github/workflows`

## Matrix Coverage Requirements
生产就绪矩阵必须覆盖以下域，每个域至少包含：验证目标、主要风险、建议命令、本地/预发/生产适用性、通过标准、No-Go 条件、责任 Agent 或责任域。

1. Auth：密码登录、错误密码失败、JWT、`/auth/login`、`/auth/me`、短信 mock 禁用、微信 mock 禁用。
2. RBAC：权限种子、角色权限、超级管理员、普通角色拒绝、数据权限、幂等写保护。
3. 菜单：首发菜单白名单、隐藏非首发能力、前端路由与 API 权限一致。
4. 租户：租户档案、联系人、资质、租户 360 聚合、数据隔离。
5. 资产：园区、楼栋、楼层、房源、房源状态板、房源详情当前租户、资产统计。
6. 合同：招商线索、报价、合同创建、合同详情、合同生命周期、到期筛选、合同房源。
7. 财务：应收、收款、核销、发票、减免、删除/作废保护、幂等与审计。
8. 工单：创建、流转、租户/房源关联、首发工单回归。
9. 安全：巡检点、巡检任务、隐患创建、整改、复查、租户/房源安全记录、统计。
10. IoT：设备、告警、规则、场景、统一动作执行器、自动创建安全隐患、能耗与计费烟测。
11. 文件上传：MIME/大小限制、上传、下载、业务关联、持久化目录、生产文件备份。
12. 审计日志：关键写操作、状态流转、登录失败、财务保护操作。
13. Migration：前向迁移、checksum、历史记录、重复编号风险、失败即停。
14. Seed：production seed 与 dev seed 隔离、`ALLOW_PRODUCTION_SEED=yes`、首发基线。
15. 部署健康检查：`/health`、`/ready`、Web `/login`、容器状态、磁盘、文件目录、Docker cleanup。

## Suggested Layered Validation Commands

### 必跑
适用：本地和预发必须跑；生产发布窗口只跑环境安全的发布健康检查和登录验证。

```bash
git status --short
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
node scripts/e2e/first-release-auth-health.mjs
node scripts/e2e/first-release-menu-whitelist.mjs
node scripts/e2e/first-release-files.mjs
node scripts/e2e/first-release-users-assets.mjs
node scripts/e2e/first-release-workorders.mjs
node scripts/e2e/first-release-idempotency.mjs
```

目标生产/预生产环境必须跑：

```bash
pnpm db:migrate
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
pnpm db:check:init
pnpm db:bootstrap:admin
pnpm db:check:init
MODE=full pnpm prod:health
bash scripts/verify-api-login-dockerexec.sh
```

### 财务相关必跑
适用：本地和预发必须跑；生产环境只在发布负责人批准的受控测试账号和可清理数据范围内抽样。

```bash
node scripts/e2e/s3c-contract-smoke.mjs
node scripts/e2e/s3d-payment-smoke.mjs
node scripts/e2e/s3d-waiver-smoke.mjs
node scripts/e2e/s3d-invoice-smoke.mjs
node scripts/e2e/s3e-contract-lifecycle-smoke.mjs
node scripts/e2e/first-release-leasing.mjs
node scripts/e2e/first-release-idempotency.mjs
```

### 安全 / IoT 相关必跑
适用：本地和预发必须跑；生产环境对会写入业务数据的脚本默认禁止，除非发布负责人批准并准备清理方案。

```bash
node scripts/e2e/s5a-safety-smoke.mjs
node scripts/e2e/s5b-emergency-permit-smoke.mjs
node scripts/e2e/safety-module-access-smoke.mjs
node scripts/e2e/s9a-iot-device-hub-smoke.mjs
node scripts/e2e/s9b-iot-runtime-alert-smoke.mjs
node scripts/e2e/s9c-iot-rule-engine-smoke.mjs
node scripts/e2e/s9d-iot-scene-center-smoke.mjs
node scripts/e2e/s9d1-unified-action-executor-smoke.mjs
node scripts/e2e/s9e-energy-meter-monitor-smoke.mjs
node scripts/e2e/s9f-energy-billing-tenant-smoke.mjs
node scripts/e2e/s9f1-energy-billing-adjustment-reversal-smoke.mjs
```

### 发布前完整回归
适用：本地和预发完整跑；生产只跑 release smoke、健康检查、登录、文件和只读/受控抽样。

```bash
pnpm check:s1
node scripts/e2e/first-release-regression.mjs
pnpm test:e2e
node scripts/e2e/s9a-iot-device-hub-smoke.mjs
node scripts/e2e/s9b-iot-runtime-alert-smoke.mjs
node scripts/e2e/s9c-iot-rule-engine-smoke.mjs
node scripts/e2e/s9d-iot-scene-center-smoke.mjs
node scripts/e2e/s9d1-unified-action-executor-smoke.mjs
node scripts/e2e/s9e-energy-meter-monitor-smoke.mjs
node scripts/e2e/s9f-energy-billing-tenant-smoke.mjs
node scripts/e2e/s9f1-energy-billing-adjustment-reversal-smoke.mjs
```

## Environment Applicability Requirements
矩阵必须明确每个检查项可运行环境：

- 本地：允许运行 `lint`、`typecheck`、`build`、本地 Docker 数据库 smoke、会创建测试数据的 e2e。
- 预发：必须尽量贴近生产跑完整发布链路、完整 first-release regression、财务/安全/IoT 写入型 smoke。
- 生产：默认只允许 release smoke、健康检查、登录验证、只读查询、文件存储受控抽样、幂等受控抽样。任何会创建或修改业务数据的 e2e 必须有发布负责人确认、测试账号、测试数据标识和清理方案。

## Required No-Go Items
文档必须明确以下上线前禁止项：

1. `git status --short` 不 clean 且未说明原因时禁止上线。
2. `pnpm typecheck` 未通过时禁止上线。
3. `pnpm lint` 或 `pnpm build` 未通过时禁止上线。
4. migration 失败、checksum 冲突、历史状态异常、重复编号未评估时禁止上线。
5. production seed 失败或误跑 dev seed 时禁止上线。
6. `pnpm db:check:init` 失败且未被明确接受为上线前置状态时禁止上线。
7. `bootstrap-admin` 失败或首个管理员无法登录时禁止上线。
8. auth smoke 失败、错误密码未被拒绝、JWT 或 `/auth/me` 异常时禁止上线。
9. `AUTH_SMS_FIXED_CODE` 非空、`AUTH_SMS_CODE_VISIBLE` 非 `false`、`AUTH_WECHAT_MOCK_ENABLED` 非 `false` 时禁止上线。
10. release smoke 或 `/ready` 失败时禁止上线。
11. 首发菜单白名单失败、非首发菜单误开放时禁止上线。
12. 文件上传/下载/持久化目录验证失败时禁止上线。
13. 财务删除/作废保护、收款核销、发票、减免或幂等回归失败时禁止上线。
14. 安全隐患、工单、IoT 自动隐患可见性回归失败时禁止上线相关模块。
15. 数据库备份、文件备份、回滚镜像 tag、回滚责任人缺失时禁止上线。
16. 部署后 Docker cleanup 未执行或失败且未记录处理方案时禁止宣告发布完成。

## Risk List Requirements
风险清单至少覆盖：

- migration 前向不可逆、checksum 冲突、历史记录失败状态。
- production seed 与 dev seed 混用。
- 首发菜单和权限不一致导致不可见或越权。
- 财务数据作废、删除、幂等和审计缺口。
- IoT 自动动作创建工单/隐患后不可见或重复创建。
- 文件上传本地目录、volume、备份和权限缺口。
- 认证 mock 配置误启用。
- 生产 smoke 创建测试数据后未清理。
- 目标环境和本地 fixture 不一致导致回归脚本假阳性或假阴性。
- 回滚只能回镜像但数据库已迁移时的恢复风险。

## Rollback Checklist Requirements
回滚检查项至少覆盖：

1. 回滚触发条件：`/ready` 失败、登录失败、关键业务 P0、财务写入异常、文件上传失败、数据库连接异常、5xx 激增。
2. 回滚前确认：数据库备份可用、文件备份可用、上一版 API/Web 镜像 tag 可用、当前 migration 状态已记录。
3. 应用回滚：切回上一版镜像并执行 `MODE=full pnpm prod:health`。
4. 数据回滚：如 migration 或 seed 已写入不可兼容数据，必须由数据库负责人确认是否恢复备份。
5. 文件回滚：如文件目录或 volume 被写入错误文件，按文件备份恢复并抽样下载验证。
6. 回滚后验证：auth、RBAC、菜单、文件、核心财务只读查询、工单/安全只读查询、审计日志。
7. 回滚结论：记录触发原因、恢复范围、数据一致性、遗留风险、再次发布条件。

## Implementation Requirements
1. 开始前执行：
   ```bash
   git status --short
   git branch --show-current
   ```
   若 worktree 不 clean 或分支不是 `agent-5-testing-release`，停止并报告。

2. 只梳理文档和验收清单，不修改业务实现。

3. 产物必须包含：
   - 生产就绪测试矩阵。
   - 发布前检查清单。
   - 风险清单。
   - 回滚检查清单。
   - 分层验证命令：必跑、财务相关必跑、安全/IoT 相关必跑、发布前完整回归。
   - 本地、预发、生产各环境可跑/不可跑说明。
   - No-Go 禁止项。

4. 若发现现有命令或文档互相冲突，只记录冲突和建议，不在本任务中改脚本。

5. 完成后运行文档级检查：
   ```bash
   git diff --check
   ```

6. 如只改 markdown，`pnpm typecheck` 可记录为未运行并说明原因；如同步了脚本或 package 配置，则必须跑 `pnpm typecheck`。

## Validation Commands
最低要求：

```bash
git status --short
git branch --show-current
git diff --check
git status --short
```

如 Agent 5 判断需要验证命令存在性，可补充：

```bash
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts).sort().join('\n'))"
ls -1 scripts/e2e
```

## Commit Message
如文档完成且验证通过，可在 Agent 5 分支本地提交：

```text
docs(agent-5): add production readiness matrix
```

不 push。不 merge。

## Final Report Required
1. Changed files.
2. Implementation summary.
3. Matrix coverage summary.
4. Layered validation commands documented.
5. Local / preprod / production applicability summary.
6. No-Go items documented.
7. Rollback checklist summary.
8. Validation commands run.
9. Validation results.
10. Commit hash, if a local commit was created.
11. Skipped checks and reasons.
12. Remaining risks.
13. Explicit statement: no merge and no push performed.

## Agent 5 Task Passphrase

```text
Agent 5，请在 /Users/mac/Documents/Codex/2026-05-13/monorepo-next-js-app-router-react/jinhu-smart-park-agent-5 的 agent-5-testing-release 分支执行生产就绪矩阵梳理任务。

目标：只生成文档和验收清单，梳理投入生产前必须通过的测试矩阵、发布检查项、风险清单和回滚检查项，覆盖 auth、RBAC、菜单、租户、资产、合同、财务、工单、安全、IoT、文件上传、审计日志、migration、seed、部署健康检查。

边界：不改业务代码；不新增 migration；不修改旧 migration；不修改 service、前端页面、auth/CI/Docker/deploy/短信/微信配置；不 push；不 merge。必须明确必跑、财务相关必跑、安全/IoT 相关必跑、发布前完整回归四层命令，并标注本地、预发、生产可运行性和上线前 No-Go 禁止项。
```
