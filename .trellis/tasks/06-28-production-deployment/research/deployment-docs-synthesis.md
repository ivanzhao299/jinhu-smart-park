# Research: 金湖智慧园区首发生产上线统一执行清单 + 差距/矛盾清单

- **Query**: 通读全部生产发布/部署文档，产出统一上线执行清单 + 差距/矛盾清单
- **Scope**: internal（docs/deployment + docs/release + .github/workflows + 少量代码/脚本核对）
- **Date**: 2026-06-28

> 说明：本文基于以下 26 个文档的**实际内容**整理，并用仓库代码/脚本核对了若干关键点。
> 引用格式为 `文件名 §小节` 或 `文件:行`。

## 来源文档清单（均已逐个通读）

部署：
- `docs/deployment/production.md`（671 行，权威部署文档）
- `docs/deployment/troubleshooting.md`

发布：
- `docs/release/production-release-sop.md`（执行 SOP）
- `docs/release/production-rollback-sop.md`（回滚 SOP）
- `docs/release/production-go-live-checklist.md`（值守清单）
- `docs/release/production-go-live-readiness.md`（窗口前 readiness 确认表）
- `docs/release/production-release-params-checklist.md`（参数确认清单）
- `docs/release/production-migration-execution-policy.md`（migration 执行策略）
- `docs/release/migration-history-checksum-design.md`（history/checksum 设计）
- `docs/release/production-readiness-matrix.md`（验收矩阵 + 风险清单）
- `docs/release/release-baseline-check.md`（基线确认，commit `2f9f97a`，2026-06-08）
- `docs/release/pre-release-acceptance-checklist.md` / `-report.md`（预发验收 = 带条件通过）
- `docs/release/pre-release-final-go-validation.md`（Final Go = Go，commit `5b2a729`）
- `docs/release/pre-release-conditional-go-followup.md`（Conditional Go 补验）
- `docs/release/first-release-readiness-checklist.md` / `-gap-analysis.md`
- `docs/release/first-release-target-environment-verification-plan.md` / `-dry-run.md` / `-execution-record.md`（目标环境验证：均为**模板/计划，未执行**）
- `docs/release/production-readiness-dry-run-report.md`（dry-run 结论 = **No-Go**，2026-06-21）
- `docs/release/safety-module-release-readiness-plan.md` / `-full-open-release-acceptance-summary.md`
- `docs/release/rbac-menu-dashboard-permission-release-gate.md`

CI/CD：
- `.github/workflows/deploy-production.yml`
- `.github/workflows/ci.yml`

---

## 1. 统一上线执行序列（去重后有序）

> 文档分散在多份 SOP / matrix，下面把所有步骤合并为一条有序、去重的 go-live 序列。每步标注命令出处。

### 阶段 0 — 前提门槛（不满足任一项即 No-Go）
来源：`production-release-sop.md §2`、`production-go-live-readiness.md §12`、`production-migration-execution-policy.md §5`、`production-readiness-matrix.md §5`

- Final Go 验证已完成（`pre-release-final-go-validation.md`）
- `release-smoke` CI 已通过（注意触发条件，见差距 G7）
- 工程门禁 `pnpm lint` / `typecheck` / `build` / CI `verify` 通过
- 生产环境变量已确认（见第 2 节）
- 发布 commit 已冻结、migration 文件清单已冻结
- 数据库备份方案 + 文件备份方案已确认
- 回滚镜像 tag 已准备（**没有回滚 tag 不允许 Go**，`production-release-params-checklist.md §8`）
- 上线窗口、值守人员、回滚决策人已确认

### 阶段 1 — 发布前备份（强约束：无备份不允许执行 migration）
来源：`production-release-sop.md §5`、`production-migration-execution-policy.md §7`、`production.md §2.2`

- PostgreSQL 备份：
  `pg_dump -h <HOST> -p <PORT> -U <USER> -d <DB> -Fc -f <backup_dir>/jinhu_pg_$(date +%F_%H%M).dump`
- 文件目录/volume 备份（与 DB 同一时间窗口）：
  `rsync -a --delete <FILE_STORAGE_LOCAL_ROOT>/ <backup_dir>/jinhu_files/`
- 备份校验（存在/大小/抽样可恢复）；记录负责人
- 严禁 `docker compose down -v`

### 阶段 2 — 镜像准备
来源：`production-release-sop.md §6-7.1`、`deploy-production.yml`

- 确认 API / Web 发布 tag + 上一个可回滚 tag
- `docker pull <API_IMAGE_TAG>` / `docker pull <WEB_IMAGE_TAG>`
- **注意差距 G1**：compose 文件实际是 `build:`（本地构建），不是 `image:`/`pull` 模式。

### 阶段 3 — compose 校验 + 启动 DB
来源：`production-release-sop.md §7.2-7.3`、`production-migration-execution-policy.md §8.1-8.2`

- `docker compose -f infra/docker/docker-compose.prod.yml config`
- `docker compose -f infra/docker/docker-compose.prod.yml up -d postgres`

### 阶段 4 — 初始化闭环（顺序固定）
来源：`production.md §3`、`production-release-sop.md §7.4-7.8`、`production-migration-execution-policy.md §8`、`production-readiness-matrix.md §3.1`

1. migration：
   `COMPOSE_FILE=... POSTGRES_DB=... POSTGRES_USER=... POSTGRES_PASSWORD=... pnpm db:migrate`
2. production seed（首次/需要时）：
   `... ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`
3. `check-init-baseline`（首管未建时预期 FAIL，原因 `no bootstrap admin found`）：
   `TENANT_ID=10000001 PARK_ID=20000001 FILE_STORAGE_LOCAL_ROOT=... AUTH_SMS_CODE_VISIBLE=false AUTH_WECHAT_MOCK_ENABLED=false pnpm db:check:init`
4. bootstrap-admin（首管未建时）：
   `TENANT_ID=... PARK_ID=... ADMIN_USERNAME=... ADMIN_PASSWORD=... ADMIN_NAME=... ROLE_CODE=SUPER_ADMIN pnpm db:bootstrap:admin`
5. 再次 `check-init-baseline`（预期 PASS 或非阻断 WARN）
- migration 失败即停：**不继续 seed / 不启动 API/Web**（`production-migration-execution-policy.md §10`）
- `000146_auth_password_lockout.sql` 必须已应用，否则密码失败锁定不可用（`production.md §1.1.2`）

### 阶段 5 — 启动 API / Web
来源：`production-release-sop.md §7.9`
- `docker compose -f infra/docker/docker-compose.prod.yml up -d api web`

### 阶段 6 — 发布后验证
来源：`production-release-sop.md §7.10-8`、`production.md §4`、`production-readiness-matrix.md §4(部署健康)`

- `/api/v1/health`（liveness）：`curl -i http://127.0.0.1:<API_PORT>/api/v1/health`
- `/api/v1/ready`（readiness，校验 SELECT1/默认 tenant/park/module 授权/首管/工单字典）
- `verify-api-login`：
  `POSTGRES_CTN=... API_CTN=... POSTGRES_DB=... ADMIN_PASSWORD=... bash scripts/verify-api-login-dockerexec.sh`
  （该脚本同时验证：核心 schema/基线、首管存在/幂等、容器内登录、`/auth/me`、SMS 禁用、WeChat mock 拒绝）
- Web `/login`（可用 `MODE=full pnpm prod:health` 一次覆盖 health+ready+login）
- 文件上传/下载抽样（`POST /api/v1/files` → `GET /api/v1/files/<id>/download`）
- 幂等重复请求抽样（同 key 同 body → 复用；同 key 不同 body → 409）
- 首发菜单白名单浏览器核对
- 错误密码失败、短信/微信 mock 禁用确认
- 部署脚本默认还会：health 后 prune 停止容器与无用镜像（`PRUNE_DOCKER_AFTER_DEPLOY=yes`）

### 阶段 7 — 观察期
来源：`production-go-live-checklist.md §5`、`production-release-sop.md §10`
- 15/30/60 分钟检查：API/Web 日志、5xx、登录错误、DB 连接、文件上传下载、幂等 409 是否异常、磁盘空间、`postgres` 与 `api-files-data` volume

### 阶段 8 — 收口
来源：`production-release-sop.md §11`、`production-migration-execution-policy.md §9/§13`
- 归档 migration 执行日志、确认备份仍保留、无 dev seed 污染
- 填写上线完成确认表 + Go/Rollback 决策记录
- 确认 Docker cleanup 已执行（失败/跳过必须在报告显式说明）

---

## 2. 环境变量 / 密钥必填清单

> 汇总自 `production.md §1/§1.1`、`production-release-sop.md §4`、`production-release-params-checklist.md §4`、`production-go-live-readiness.md §5`、`ci.yml` release-smoke env、`pre-release-acceptance-checklist.md §4`。

### 必填核心
| 变量 | 要求 / 生产值 |
|---|---|
| `NODE_ENV` | `production` |
| `APP_ENV` | `production`（或运维约定；预发为 `pre-release/staging`，禁止 `development`）|
| `APP_PORT` | API 端口（params-checklist 列必填；production.md 主清单未列）|
| `API_PREFIX` | 默认 `api/v1`（params-checklist 列必填）|
| `POSTGRES_HOST` | 由运维填写 |
| `POSTGRES_PORT` | 由运维填写 |
| `POSTGRES_DB` | 由运维填写 |
| `POSTGRES_USER` | 由运维填写 |
| `POSTGRES_PASSWORD` | 强密码，不入库 |
| `JWT_SECRET` | 长随机值，非默认，不入库 |
| `WEB_ORIGIN` | 浏览器可见生产域名；与 CORS 对齐 |
| `FILE_STORAGE_LOCAL_ROOT` | `/var/lib/jinhu/files`（须与 compose 挂载一致）|

### 认证 mock 三项（首发必须禁用，否则 bootstrap fail-fast / No-Go）
| 变量 | 必须值 |
|---|---|
| `AUTH_SMS_FIXED_CODE` | **必须为空** |
| `AUTH_SMS_CODE_VISIBLE` | **`false`** |
| `AUTH_WECHAT_MOCK_ENABLED` | **`false`** |

### 反向代理 / 部署绑定相关（条件必填，`production.md §5`）
- `API_PUBLISHED_HOST`（默认 `127.0.0.1`，trust-proxy 开启时须绑回环/私网）
- `APP_TRUST_PROXY`（反代后必须显式设置，如 `1`）
- 端口覆盖：`API_PUBLISHED_PORT` / `WEB_PUBLISHED_PORT` / `POSTGRES_PUBLISHED_PORT`

### bootstrap-admin 变量（`production.md §3`）
- 必填：`ADMIN_USERNAME` `ADMIN_PASSWORD` `ADMIN_NAME`；可选：`ADMIN_EMAIL` `ADMIN_PHONE`
- 默认：`TENANT_ID=10000001` `PARK_ID=20000001` `ROLE_CODE=SUPER_ADMIN` `ALLOW_PASSWORD_RESET=no`
- 禁弱密码（如 `Jinhu@123456`）；不打印明文/hash

### 有默认值、生产可调（非"必须确认"但应知晓）
- 密码锁定：`AUTH_PASSWORD_LOCKOUT_*`（默认开启，依赖 `000146` migration）
- 刷新 cookie：`AUTH_REFRESH_COOKIE_*`、`AUTH_REFRESH_TOKEN_BODY_COMPAT=true`、`AUTH_COOKIE_ORIGIN_CHECK_ENABLED=true`、`AUTH_ALLOWED_ORIGINS`（空时回退 `WEB_ORIGIN`）
- 认证限流：大量 `AUTH_RATE_LIMIT_*`（默认登录 60/min；`AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED=false`）
- 幂等清理：`IDEMPOTENCY_CLEANUP_*`
- migration：`MIGRATION_BASELINE_ON_NONEMPTY_DB`（默认开启自动 baseline）

---

## 3. Go / No-Go 条件合集（跨文档去重）

来源：`production-release-sop.md §9`、`production-go-live-readiness.md §12`、`production-release-params-checklist.md §12`、`production-readiness-matrix.md §6`、`production-migration-execution-policy.md §15`、`pre-release-acceptance-checklist.md §16`。

### Go（全部满足）
- 初始化闭环通过（migration → seed → bootstrap-admin → 两次 check-init）
- `/health`、`/ready`、登录、`verify-api-login` 通过
- `release-smoke` 通过；`lint/typecheck/build/verify` 通过
- 安全核心菜单开放前 `node scripts/e2e/s5a-safety-smoke.mjs` 通过
- 文件存储持久化验证通过；幂等关键接口验证通过
- 发布镜像 tag + **回滚镜像 tag** 已确认；DB 备份 + 文件备份已完成
- 生产 auth mock 三项关闭；首发菜单白名单正确（非首发不误开放）
- migration 清单冻结、无未评估的重复编号、执行日志路径已确认
- 无 P0 阻断；观察期/回滚决策人/值守明确

### No-Go（任一命中）
- migration 失败 / checksum 冲突 / history 异常 / 重复编号未评估
- `check-init-baseline` / `/ready` / 登录 / auth smoke 失败
- `AUTH_SMS_FIXED_CODE` 非空 / `AUTH_SMS_CODE_VISIBLE` 非 false / `AUTH_WECHAT_MOCK_ENABLED` 非 false
- 文件上传下载失败 / 持久化目录或备份缺失
- 幂等重复写入
- production seed 失败 / 误跑 dev seed / 缺 `ALLOW_PRODUCTION_SEED=yes`
- 数据库备份缺失 / 文件备份缺失 / **回滚 tag 缺失** / 回滚决策人未确认
- 任一真实密钥缺失或被写入仓库
- 首发菜单白名单失败、非首发菜单误开放
- 财务删除/作废保护、收款核销、发票、减免回归失败
- 部署后 Docker cleanup 未执行/失败且未记录

---

## 4. 回滚步骤（来自 rollback-sop）

来源：`production-rollback-sop.md`，补充 `production.md §7`、`migration-history-checksum-design.md §13`。

### 触发条件
`/ready` 持续失败、登录失败、API 大量 5xx、文件上传下载失败、关键业务阻断、幂等重复写入、migration 异常、业务判定 No-Go。

### 原则
优先回滚应用镜像；**不删 DB volume、不删 `api-files-data` volume、禁 `docker compose down -v`**；migration 回滚必须人工确认；文件数据默认保留。

### 应用镜像回滚
```bash
export API_IMAGE=<ROLLBACK_API_IMAGE_TAG>
export WEB_IMAGE=<ROLLBACK_WEB_IMAGE_TAG>
docker compose -f infra/docker/docker-compose.prod.yml config
docker compose -f infra/docker/docker-compose.prod.yml up -d api web
docker compose -f infra/docker/docker-compose.prod.yml ps
```
> 注意差距 G2：rollback-sop 用 `API_IMAGE/WEB_IMAGE` 环境变量切镜像，但 compose 是 `build:` 模式且未声明 `image:` 字段（见差距）。

### 回滚后验证
`/api/v1/health`、`/api/v1/ready`、Web `/login`、`/auth/login`、`/auth/me`、文件下载、核心页面抽样。

### 数据库 / 文件回滚
- 无自动 down migration；以数据库备份恢复为主。
- schema 已变且旧镜像不兼容时，必须先评估 DB 恢复，不能只回镜像。
- 文件 volume 默认不回滚；误删/损坏时用文件备份恢复后抽样下载。
- 恢复顺序（`production.md §2.2`）：先恢复 PostgreSQL → 再恢复文件目录/volume → 保持路径等于 `FILE_STORAGE_LOCAL_ROOT` → 抽样下载验证。

---

## 5. 差距 / 矛盾清单（重点）

> 标注 [代码核对] 的为本次用仓库实际文件验证过的硬事实。

### G1 — compose 是 build 模式，文档却用 pull/tag 口径 [代码核对]
- `infra/docker/docker-compose.prod.yml` 中 `api`/`web` 均为 `build:`（`context: ../..`，`Dockerfile.api`/`Dockerfile.web`），**没有 `image:` 字段**；只有 `postgres: image: postgres:16-alpine`。
- 但 `production-release-sop.md §7.1` 让运维 `docker pull <API_IMAGE_TAG>`，`production-release-params-checklist.md §8` / `production-go-live-readiness.md §8` 大量围绕"镜像 tag/镜像仓库/拉取权限"。
- 实际部署链路（`deploy-production.yml` 第 135 行 + `prod:deploy`）是 **rsync 源码 → 远端 `pnpm prod:deploy` 本地构建**，没有镜像仓库。
- **矛盾**：文档假设有镜像仓库 + tag 拉取，代码假设本地 build。"回滚 tag""镜像拉取验证"等门槛与现状不一致，需统一口径。

### G2 — 回滚靠 `API_IMAGE/WEB_IMAGE` 切 tag，但 compose 不消费该变量 [代码核对]
- `production-rollback-sop.md §4` 通过 `export API_IMAGE=... WEB_IMAGE=...` + `compose up -d api web` 回滚。
- compose 服务无 `image:`，回滚镜像 tag 无处生效。真实可行的回滚更接近 `production.md §7` 的 `git checkout <tag> && pnpm prod:deploy`（重新 build）。
- **矛盾**：两份回滚口径（镜像 tag 切换 vs git checkout 重建）并存且其一与 compose 不兼容。

### G3 — Dashboard 菜单未经过首发白名单过滤（文档说已过滤）[代码核对]
- `release-baseline-check.md` 第 59 行 & `pre-release-acceptance-report.md §4.7` 声称："`getDashboardMenus()` 最终返回经过 `filterFirstReleaseMenus()`"。
- 实际 `apps/web/lib/menu.ts:281` 的 `getDashboardMenus()` 返回 `mergeWithDashboardMenus(menus)` 或 `dashboardMenus`，**未调用 `filterFirstReleaseMenus()`**。
- `production-readiness-dry-run-report.md` 第 43 行已自相印证："Dashboard runtime menu **no longer uses** the first-release whitelist gate"。
- **矛盾/风险**：首发菜单白名单是否在运行时真正生效，文档之间互相打架；需确认隐藏靠的是后端菜单树/权限还是前端过滤。

### G4 — migration 重复编号 000136 真实存在 [代码核对]
- `database/migrations/` 下确有 `000136_idempotency_request.sql` 与 `000136_s9f_energy_billing_allocation.sql`。
- 多份文档（`production-migration-execution-policy.md §3`、`migration-history-checksum-design.md §1`、`release-baseline-check.md §6`）已记录但归为 `P1-2`，**至今未治理**。运行时须靠"文件名 + checksum + 顺序"判断，不能只看前缀。
- 风险：重复编号 + 自动 baseline 逻辑（非空库首次接入会把所有文件标记 succeeded）叠加时，排序/审计仍易混。

### G5 — 总体 Go/No-Go 结论彼此冲突，需明确"当前真实状态"
- `pre-release-final-go-validation.md`（2026-06-08，commit `5b2a729`）结论 **Go**。
- `production-readiness-dry-run-report.md`（2026-06-21，commit `ed6a0cf`，agent-5 worktree）结论 **No-Go**，原因：typecheck 因缺 `node_modules` 跑不起来、SMS send-code / WeChat authorize 在本地 API 意外返回 200、目标环境发布链路全部未跑。
- **矛盾**：两份最权威的"是否可发"结论方向相反，且时间更晚的是 No-Go。注意 dry-run 的 No-Go 多为"环境未装依赖 / 本地 API 运行态配置"问题，但 auth mock 暴露若反映真实配置则是发布阻断级；需在目标环境用正确 env 复测后再裁决。

### G6 — 目标环境验证从未真正执行
- `first-release-target-environment-verification-plan.md` / `-dry-run.md` / `-execution-record.md` 全部是**模板/计划**，execution-record 的 P0 总表全为 `NOT_RUN`。
- `gap-analysis.md §5` 列出的 13 项 P0（目标环境 env 核验、migration、seed、bootstrap、auth smoke、文件存储、备份/回滚、发布后 smoke 等）均处"待验证"。
- **差距**：上线前这些 P0 必须在真实目标环境执行并记录，否则不应 Go。

### G7 — release-smoke 默认不在普通 PR 跑，"CI 通过"含义需澄清
- `ci.yml` 第 64 行：`release-smoke` 仅在 `workflow_dispatch` 或 PR 带 `run-release-smoke` label 时触发。
- 多份 SOP 把"`release-smoke` 通过"列为前提；若发布 commit 的 PR 未打 label，则没有自动 release-smoke 证据。`release-baseline-check.md §4` 也注明"无法直接查看 GitHub Actions 历史，需人工确认最近一次运行"。
- **差距**：需明确"release-smoke 通过"指哪一次运行（手动触发 or labeled PR），并留存证据。

### G8 — `.env.production.example` 与 `.env.production` 在本仓库不存在 [代码核对]
- 文档反复要求 `cp .env.production.example .env.production`，但 `deploy-production.yml` rsync 时 `--exclude='.env.*'`，且本地未找到模板文件（仅 baseline-check 静态引用）。
- **差距**：模板文件是否随源码分发存疑；运维首部署时若无模板，必填项核对（第 2 节）会缺少 single source of truth。建议确认模板实际位置。

### G9 — 占位未填（`<待填写>` / `<待确认>`）的硬阻断项尚未落实
以下文档大量占位，上线前必须由人填写，否则等价 No-Go：
- `production-release-sop.md §3`（角色分工全 `<待填写>`）、`§6`（镜像 tag 全 `<待填写>`）、`§11`（完成确认表）
- `production-rollback-sop.md §3`（当前/回滚 tag、备份位置全 `<待填写>`）
- `production-go-live-checklist.md`（全表 `<待填写>`）
- `production-go-live-readiness.md`（域名/env/备份/人员/签字几乎全 `<待确认>`）
- `production-release-params-checklist.md`（同上）
- `production-migration-execution-policy.md §6`（migration 清单冻结表 `<待填写>`）

### G10 — 文件单机存储 / 备份的固有限制
- 首发单机本地存储（`production.md §2.2`、`troubleshooting.md §5`）：仅支持单 API 实例；多实例需共享文件系统，否则横向扩展须等对象存储设计。
- 删除为 DB 软删，不在线物理删文件；物理清理留待离线任务。
- 备份须与 PostgreSQL 同时间窗口；恢复后须抽样下载验证。
- 风险点：`docker compose down -v` 会同时毁掉 DB 数据与上传文件 —— 所有文档反复强调禁止。

### G11 — 安全模块"开放范围"在文档间口径漂移
- `safety-module-release-readiness-plan.md §7` 第一阶段**暂缓** `/safety/my-inspect-tasks`（理由：现场角色权限/接口待适配）。
- 但 `production.md §1.2` 与 `pre-release-acceptance-checklist.md §8` 已把 `/safety/my-inspect-tasks` 列入首发可见白名单，`production-release-sop.md §9` 也把它纳入 Go 条件；`apps/web/lib/menu.ts:113` 已在 `FIRST_RELEASE_MENU_PATHS` 中 [代码核对]。
- `safety-module-full-open-release-acceptance-summary.md` 结论：full-open 仅"本地开发证据已接受"，**staging/test release-grade 证据仍 Pending**；生产仅可只读，禁止 fixture/写入。
- **矛盾**：plan 暂缓 vs 实际白名单/SOP/代码已开放；以及"安全全开放"尚未取得 staging 级验收即被部分纳入首发。

### G12 — SSH keepalive 参数：文档与 workflow 一致（无矛盾，记录确认）[代码核对]
- `production-release-sop.md §7` 声明使用 `ServerAliveInterval=30 / ServerAliveCountMax=20 / TCPKeepAlive=yes / ConnectTimeout=30`。
- `deploy-production.yml` 第 69、107 行 `SSH_OPTS` 完全一致。此项**无差距**，可在清单中直接引用。

### G13 — compose 依赖链已按健康检查串联（确认项）[代码核对]
- compose 中 `api depends_on postgres: condition: service_healthy`，`web depends_on api: condition: service_healthy`；`api-files-data` named volume 挂载到 `/var/lib/jinhu/files`，与 `FILE_STORAGE_LOCAL_ROOT` 默认值一致。此项与文档一致。

---

## 6. 首发 vs 二期范围确认

来源：`production.md §1.1/§1.2`、`production-release-sop.md §1`、`pre-release-acceptance-checklist.md §2/§8`、`pre-release-final-go-validation.md §4`。

### 明确在首发范围
- 登录方式：**仅账号密码**（SMS 验证码、WeChat 扫码均禁用）
- 菜单模块：总览(Dashboard)、系统管理、资产管理、招商租赁核心项、工单管理、**安全巡检与隐患整改核心菜单**
- 文件存储：单机本地存储（认证 API 下载，无公开静态目录）
- 幂等：仅 5 个接口接入（`POST /users`、`/work-orders`、`/leasing/contracts`、`/leasing/contracts/:id/generate-receivables`、`/leasing/payments`）

### 明确不在首发（二期/暂缓）
- 对象存储 / CDN / 跨主机存储 / 多实例
- IoT / 能耗 / 视频安防 / 机器人（`/iot/* /energy/* /robots/* /admin/video-security/*`）
- 安全应急、作业许可（`/safety/emergency-* /safety/emergencies /safety/work-permits`）—— 即非"巡检+隐患整改核心"的安全扩展
- 招商租赁非首发项：线索、公海池、漏斗、合同变更、退租结算、退款、欠费账龄、豁免、发票
- 系统管理扩展：数据权限、字段权限、编码规则、文件中心、附件中心
- 全量状态流转、全量幂等覆盖
- migration 框架治理（`P1-2`，仍 forward-only + 备份恢复）
- 多浏览器多 origin CORS（当前 CORS 仅用 `WEB_ORIGIN`）

> 备注：隐藏菜单不代表页面代码删除；直接访问非首发 URL 第一版保持现状（`production.md §1.2`）。非首发模块需单独验收才能加回白名单。

---

## 7. 关键运维红线（汇总，便于值守速查）

- 严禁 `docker compose down -v`（毁 DB + 文件）。
- 无 DB 备份不得执行 migration；migration 失败立即停，保留现场，不继续 seed/启动。
- 不修改已执行的历史 SQL 后直接重跑；checksum 不一致会 fail-fast。
- 生产严禁 dev seed（`scripts/db-seed-dev.sh` 对 production/staging/shared 有防护）。
- auth mock 三项必须禁用，否则 API bootstrap fail-fast。
- 回滚只回镜像 ≠ 数据回滚；schema 变更需先评估 DB 恢复。
