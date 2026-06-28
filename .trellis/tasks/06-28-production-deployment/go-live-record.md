# 首发生产上线 — 统一执行记录与 Go/No-Go

> 本文合并:① 本沙箱可执行的预生产验证证据(全绿);② 全部 26 份发布/部署文档综述
> (见 `research/deployment-docs-synthesis.md`);③ 代码核实修正。
> 真实生产割接(docker-compose.prod + 镜像 + SSH + 生产密钥)无法在本环境执行,按 SOP
> 交付发布负责人/运维。

## A. 已完成的预生产验证(本沙箱,全绿)

环境:本机 PostgreSQL 16(替代 docker,因出口策略拦截镜像)+ API + Web;
API 以 `NODE_ENV=production` 运行(生产 auth 姿态)。

| 验证 | 命令 | 结果 |
|---|---|---|
| 工程门禁 | `pnpm lint` / `pnpm typecheck` / `pnpm build` | ✅ 全绿 |
| 全新库迁移 | 150 个迁移直连 psql 应用 | ✅ 123 表,无错 |
| 生产核心 seed | `000001_s1_production_core.sql` | ✅ 无错 |
| 首发回归 | `node scripts/e2e/first-release-regression.mjs` | ✅ exit 0(menu/auth-health/idempotency/files/users-assets/workorders/leasing) |
| 全量冒烟矩阵 | `pnpm test:e2e`(S1/S1-RBAC/S2b/S3a-e 财务/S5a/S5b 安全) | ✅ exit 0 |
| Auth 生产姿态 | send-code/wechat-authorize/mobile-login/wechat-callback | ✅ 均 400 拒绝;密码登录 200 |

> 说明:test:e2e 中多处 DB 断言走 `docker compose exec postgres psql`,本环境用原生 PG,
> 已用 PATH shim 将其转发到本机 psql,使断言可执行;不改仓库任何文件。

## B. 统一上线执行序列(8 阶段,详见 research 综述)

1. **前提门槛**:Final Go、release-smoke CI 绿、生产变量确认、备份方案、回滚 tag、窗口、值守。
2. **发布前备份**(DB + 文件同窗口;禁 `docker compose down -v`)。
3. **镜像/构建准备**(见差距 G1/G2)。
4. **compose 校验 + 启动 DB**。
5. **初始化闭环**:migrate → seed:prod(`ALLOW_PRODUCTION_SEED=yes`)→ check-init(可 FAIL/WARN)→ bootstrap-admin(强密码)→ check-init(PASS)。
6. **启动 API/Web**。
7. **发布后验证**:`/health` `/ready` verify-api-login `/login` `/auth/me` 错误密码 mock禁用 文件上传下载 幂等抽样 首发菜单。
8. **观察期(15/30/60min)+ 收口**:日志归档 + Docker cleanup + 上线确认表签字。

## C. 必填生产变量(上线前逐项核验)

`NODE_ENV=production`、`APP_ENV=production`、`POSTGRES_HOST/PORT/DB/USER/PASSWORD`、
`JWT_SECRET`(强随机非默认)、`WEB_ORIGIN`、`FILE_STORAGE_LOCAL_ROOT`(建议 `/var/lib/jinhu/files`)、
`AUTH_SMS_FIXED_CODE=`(空)、`AUTH_SMS_CODE_VISIBLE=false`、`AUTH_WECHAT_MOCK_ENABLED=false`、
`AUTH_REFRESH_COOKIE_SECURE=true`(HTTPS)。`.env.production.example` 在仓库根可作模板
(rsync 部署时被正确排除,不随源码上传)。

## D. 关键差距 / 决策项(上线前必须处理)

| # | 差距 | 核实 | 影响 | 建议 |
|---|---|---|---|---|
| G1/G2 | compose.prod 为 `build:` 模式、无 `image:`;但 SOP/回滚围绕"镜像 tag 拉取/切换",`API_IMAGE/WEB_IMAGE` 实际不生效 | 已核实 | **回滚按镜像 tag 切换不可行**——实际是 rsync 源码 + 本地构建,回滚需 git revert + 重建 | 决策:统一回滚口径为"切回上一版源码 commit + 重建",或为 compose 引入镜像仓库 |
| G3 | 首发菜单白名单 `filterFirstReleaseMenus()` 定义但**全仓库无调用**;侧边栏仅按权限/模块过滤 | 已核实 | 二期菜单是否隐藏仅靠 seed 不授模块;白名单兜底未生效 | 决策:① 将 `filterFirstReleaseMenus` 接入 `AppSidebar`(需先确认 `FIRST_RELEASE_MENU_PATHS` 覆盖全部当前开放菜单,含 `/safety/my-inspect-tasks`);或 ② 明确以"seed 不授二期模块"为唯一控制并更新文档 |
| G4 | 重复迁移编号 `000136`(两文件) | 已核实 | 排序/审计混淆风险,P1 未治理 | 上线前在发布记录标注;迁移清单冻结时复核 |
| G5 | Final Go(06-08)=Go 与 dry-run(06-21)=No-Go 结论相反 | 文档 | 权威结论冲突 | 以最新目标环境验证为准重新裁决 |
| G6 | 目标环境验证三文档均为模板,execution-record 全 `NOT_RUN`;gap-analysis 13 项 P0 仍待验证 | 文档 | 真实目标环境从未跑过 | 在预发/目标环境执行 §B 全序列并记录 |
| G7 | `release-smoke` 默认不在普通 PR 跑(需 label/手动) | 文档 | "CI 通过"需指明具体 run | 发布候选上手动触发并记录 run 链接 |
| G11 | `/safety/my-inspect-tasks`:readiness-plan 标"暂缓",但 SOP/代码白名单已开放,仅本地证据 | 文档 | 安全现场入口开放口径不一致 | 确认开放决定并统一文档;staging 验收补齐 |

## E. 回滚红线(来自 rollback-sop)

- 禁 `docker compose down -v`;无备份不执行 migration;migration 失败即停;禁生产跑 dev seed。
- 触发条件:`/ready` 失败、登录失败、P0、财务写异常、文件上传失败、5xx 激增。
- 数据回滚:若 migration/seed 与旧代码不兼容,按备份恢复 DB/文件(注意 G1/G2:应用回滚为源码 commit 回退 + 重建,非镜像切换)。

## F. Go / No-Go 现状

- **工程与功能维度:GO**——门禁 + 首发回归 + 全量冒烟矩阵全绿,auth 生产姿态正确。
- **未关闭(目标环境/决策项):** G1/G2 回滚口径、G3 菜单白名单、G5/G6 目标环境验证、G7 release-smoke 取证、G9 SOP 占位、G11 安全入口口径。这些为真实上线 No-Go 项,需发布负责人处理,部分(G3)可由开发先行修复。

## G. 范围

首发=密码登录 + 总览/系统/资产/招商租赁核心/工单/安全巡检隐患核心 + 单机文件 + 5 接口幂等。
二期(不上线)=对象存储、IoT/能耗/视频/机器人、安全应急/作业许可、招商非核心、全量状态流转/幂等。
