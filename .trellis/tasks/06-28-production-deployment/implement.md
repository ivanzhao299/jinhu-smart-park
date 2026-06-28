# 首发生产部署 Runbook（执行计划)

图例:【我】= 可在本/预发环境执行;【发布负责人】= 需生产凭据/主机,必须人工执行。

## 阶段 0 — 发布候选冻结
- [ ] 【发布负责人】确定 release candidate commit(本分支合入 main 后的发布 commit),范围冻结,仅接受 blocker 修复。
- [ ] 【我】`git status --short` clean;记录 commit hash。

## 阶段 1 — 工程门禁(本地/CI)
- [x] 【我】`pnpm lint` → PASS
- [x] 【我】`pnpm typecheck` → PASS
- [x] 【我】`pnpm build` → PASS
- [ ] 【发布负责人】CI `verify` + `release-smoke` 在 release candidate 上绿。

## 阶段 2 — 生产初始化预演(全新库,生产 seed)
顺序(对应 `docs/release` 基线):
```
pnpm db:migrate
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
pnpm db:check:init           # 可能 WARN(bootstrap 前)
pnpm db:bootstrap:admin      # ADMIN_PASSWORD 强密码,非默认,保密
pnpm db:check:init           # 应 PASS/WARN
bash scripts/verify-api-login-dockerexec.sh
```
- [x] 【我】migrate:150 个迁移在全新库无错应用(123 表)。
- [x] 【我】production core seed(000001_s1_production_core.sql)无错应用。
- [ ] 【我/发布负责人】check-init 基线 + bootstrap-admin + 登录验证(预发完整跑)。

## 阶段 3 — 全量回归(生产 auth 姿态)
前置:API 以 `AUTH_SMS_FIXED_CODE=`、`AUTH_SMS_CODE_VISIBLE=false`、`AUTH_WECHAT_MOCK_ENABLED=false` 运行。
```
node scripts/e2e/first-release-regression.mjs
pnpm test:e2e
# 财务/安全/IoT 专项见 production-readiness-matrix §3
```
- [x] 【我】menu-whitelist → PASS
- [x] 【我】auth-health → PASS(生产姿态 NODE_ENV=production;F1 假阳性已澄清,见 prd F1)。
- [x] 【我】idempotency(13)/ files(10)/ users-assets(43)/ workorders(21)/ leasing(200)→ 全 PASS。
- [x] 【我】`first-release-regression` 完整跑 → **exit 0,全绿**。

## 阶段 4 — Go / No-Go
- [ ] 工程门禁绿 + 初始化序列 PASS + 回归无未关闭 P0 + 备份/回滚就绪 + auth 姿态核验。
- [ ] F1 关闭(实现禁用或口径接受)。

## 阶段 5 — 生产割接【发布负责人】
前置(目标环境核验):
- [ ] `.env.production`:`JWT_SECRET`(非默认强值)、`POSTGRES_*`、`WEB_ORIGIN`、`FILE_STORAGE_LOCAL_ROOT`、端口。
- [ ] auth mock 三项关闭;`AUTH_REFRESH_COOKIE_SECURE=true`。
- [ ] DB + 文件目录**备份**完成;上一版镜像 tag 记录;回滚负责人确认。
执行:
- [ ] GitHub Actions「Deploy Production」`workflow_dispatch`(mode=auto/full),或主机 `PRUNE_DOCKER_AFTER_DEPLOY=yes pnpm prod:deploy && pnpm prod:health`。
- [ ] 部署后 Docker cleanup 执行并记录。

## 阶段 6 — 发布后验证【发布负责人 + 我协助判读】
- [ ] `MODE=full pnpm prod:health`(/health /ready)、Web `/login`、密码登录、文件受控上传下载、核心只读抽样。
- [ ] 观察期值守,无 P0。

## 回滚（任一 No-Go 触发)
- [ ] 切回上一版 API/Web 镜像;如 migration/seed 不兼容,按备份恢复 DB/文件(见 `production-rollback-sop.md`)。
