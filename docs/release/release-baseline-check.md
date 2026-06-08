## JinHu Smart Park 当前可验收基线说明

### 1. 基线来源

| 项 | 值 |
|---|---|
| 仓库 | `jinhu-smart-park` |
| 当前分支 | `chore/release-baseline-check` |
| 当前 commit | `2f9f97a8f8db1106b5129c73dfc8eed22af8a2b2` |
| main 对齐情况 | `HEAD == main == origin/main` |
| 验证日期 | `2026-06-08` |
| 验证方式 | 本地静态检查 + 独立临时库初始化闭环实测 + 隔离 prod compose 运行态验证 |

本次说明用于确认当前 `main` 已形成可进入预发验收的收口基线。

### 2. 已完成的 P0/P1 收口项

| 编号 | 风险项 | 当前状态 | 验证依据 |
|---|---|---|---|
| P0-2 | production seed 初始化闭环 | 已完成 | `db:migrate -> db:seed:prod -> check-init-baseline -> bootstrap-admin -> check-init-baseline` 实测 |
| P0-3 | 首个生产管理员 bootstrap | 已完成 | `scripts/bootstrap-admin.sh` 实测创建成功 |
| P0-4 | 认证 mock 生产收口 | 已完成 | `.env.production.example`、`production.md`、`verify-api-login-dockerexec.sh` 静态确认 |
| P0-5 | 真实幂等控制第一版 | 已完成（第一版） | migration、entity、service、interceptor、5 个接口接入点静态确认 |
| P0-6 | release-smoke CI 门禁 | 已完成 | `.github/workflows/ci.yml` 静态确认 |
| P1-1 | 健康检查分层 | 已完成 | `health.controller.ts`、`prod-healthcheck.sh`、`docker-compose.prod.yml` 静态确认 |
| P1-3 | 本地文件存储收口 | 已完成 | local storage provider、prod compose、production 文档静态确认 |
| P1-4 | 首发菜单白名单 | 已完成 | `apps/web/lib/menu.ts` 与生产文档静态确认 |
| P0-1 | production 环境变量矩阵 | 部分完成 | 模板与文档已补齐，真实生产值仍需人工确认 |
| P1-5 | 脱离 dev seed 的真实验证环境 | 部分完成 | 技术链路已具备，验收流程仍需制度化 |
| P1-2 | migration 机制治理 | 未开始 | 仍是顺序 SQL 执行，未引入执行历史记录 |

### 3. 本次基线验证结果

| 验证项 | 命令 / 方法 | 结果 | 备注 |
|---|---|---|---|
| Git 基线 | `git branch --show-current` / `git status` / `git log -n 10` | 通过 | 当前在 `chore/release-baseline-check`，且与 `main/origin/main` 对齐，工作区干净 |
| lint | `pnpm lint` | 通过 | 工作区级通过 |
| typecheck | `pnpm typecheck` | 通过 | 首次工作区并行执行出现一次 `apps/web` 失败，单独复跑 `apps/web`、`apps/api` 及工作区后均通过 |
| build | `pnpm build` | 通过 | 工作区级通过 |
| CI verify job | 检查 `.github/workflows/ci.yml` | 通过 | `verify` job 仍执行 install / lint / typecheck / build |
| release-smoke job 存在 | 检查 `.github/workflows/ci.yml` | 通过 | `release-smoke` 仍存在且 `needs: verify` |
| release-smoke 阻断性 | 检查 `.github/workflows/ci.yml` | 通过 | 未设置 `continue-on-error`，失败会阻断 PR |
| release-smoke 覆盖范围 | 检查 `.github/workflows/ci.yml` | 通过 | 覆盖 PostgreSQL、migration、production seed、bootstrap-admin、baseline、API login 验证与日志上传 |
| prod compose 配置展开 | `docker compose -f infra/docker/docker-compose.prod.yml config` | 通过 | 用临时占位值补齐 `POSTGRES_PASSWORD/JWT_SECRET/WEB_ORIGIN` 后可正常展开 |
| 初始化闭环 - migration | `COMPOSE_FILE=... POSTGRES_DB=jinhu_release_baseline_check pnpm db:migrate` | 通过 | 在独立临时库 `jinhu_release_baseline_check` 上完成 |
| 初始化闭环 - production seed | `ALLOW_PRODUCTION_SEED=yes ... pnpm db:seed:prod` | 通过 | 在独立临时库完成 |
| 初始化闭环 - baseline 前态 | `... pnpm db:check:init` | 符合预期 | 首次返回 `FAIL`，原因为 `no bootstrap admin found` |
| 初始化闭环 - bootstrap-admin | `... pnpm db:bootstrap:admin` | 通过 | `bootstrap-admin result: created` |
| 初始化闭环 - baseline 后态 | `... pnpm db:check:init` | 通过 | 返回 `INIT BASELINE RESULT: PASS` |
| `/api/v1/health` | `docker exec jinhu-smart-park-prod-api node -e "fetch(.../health)"` | 通过 | 容器内返回 `200` |
| `/api/v1/ready` | `docker exec jinhu-smart-park-prod-api node -e "fetch(.../ready)"` | 通过 | 容器内返回 `200`，所有 checks 为 `ok` |
| Docker healthcheck | 静态检查 `docker-compose.prod.yml` | 静态确认 | API healthcheck 仍使用 `/api/v1/health` |
| `prod-healthcheck.sh` | `bash -n` + 静态检查 | 通过 | 支持 `MODE=liveness|readiness|full` |
| API login 深度验证脚本 | `bash -n scripts/verify-api-login-dockerexec.sh` + 运行态实测 | 通过 | 隔离 prod compose 环境内返回 `VERIFY RESULT: PASS` |
| 文件存储环境变量 | 检查 `.env.production.example` | 通过 | `FILE_STORAGE_LOCAL_ROOT=/var/lib/jinhu/files` |
| 文件存储 volume | 检查 `docker-compose.prod.yml` | 通过 | API 挂载 `api-files-data:/var/lib/jinhu/files` |
| 文件存储路径防护 | 检查 `local-file-storage.provider.ts` | 通过 | `resolve + relative` root containment guard 存在 |
| 文件存储运维文档 | 检查 `production.md` | 通过 | 已说明备份、恢复、`down -v` 风险、多实例限制 |
| 首发菜单白名单 | 检查 `apps/web/lib/menu.ts` | 通过 | `getDashboardMenus()` 最终返回经过 `filterFirstReleaseMenus()` |
| 非首发菜单默认隐藏 | 检查 `apps/web/lib/menu.ts`、`production.md` | 通过 | 仅白名单路径可见，页面代码未删除 |
| 幂等 migration | 检查 `database/migrations/000136_idempotency_request.sql` | 通过 | `sys_idempotency_request` 表、唯一约束、索引存在 |
| 幂等 service / interceptor | 检查 `IdempotencyService`、`IdempotencyInterceptor` | 通过 | PostgreSQL-backed idempotency 第一版仍在 |
| 幂等 5 接口接入 | 检查 5 个 controller | 通过 | 仅 `POST /work-orders`、`/leasing/contracts`、`/leasing/contracts/:contractId/generate-receivables`、`/leasing/payments`、`/users` 已显式接入 |
| 幂等误接入范围 | 检查 files/workflow 相关 controller | 通过 | 文件上传、状态流转、PATCH/DELETE 未见误接入 |

### 4. 当前仍需人工确认的事项

- production 环境变量真实值
  - `POSTGRES_PASSWORD`
  - `JWT_SECRET`
  - `WEB_ORIGIN`
  - 生产域名和 API 上游
- 首个生产管理员真实创建流程
  - 是否现场人工执行
  - 是否采用固定 SOP
- 文件存储宿主机备份路径
  - 当前已固定容器内路径与 named volume
  - 是否继续使用 named volume，还是改 bind mount，仍需运维拍板
- 预发 / 生产验证流程制度化
  - `check-init-baseline`
  - `bootstrap-admin`
  - `verify-api-login`
  - `/health` `/ready`
  - 文件上传下载验证
  - 幂等重放验证
- release-smoke 最近一次 GitHub 远端执行结果
  - 当前环境无法直接查看 GitHub Actions 历史
  - 需在 GitHub 页面人工确认最近一次 main / PR 运行状态
- migration 执行历史机制
  - 当前仍未治理
  - 本轮只确认现状，不在此阶段修复

### 5. 当前不建议继续大改的范围

在进入预发验收前，不建议继续大改以下范围：

- 认证主流程
- permission guard
- module guard
- 工单状态机
- 合同状态机
- production seed SQL
- migration 执行机制
- 文件上传对象存储改造
- 幂等扩展到更多接口

当前这些范围已经形成收口中的基线；此时继续扩改，会明显抬高预发前的不确定性。

### 6. 发现的问题

#### P1
- `pnpm typecheck` 在第一次工作区并行执行时出现过一次 `apps/web` 失败，但单独复跑和整体复跑均通过。
  - 当前判断：更像并行执行下的瞬时问题，不足以判定为稳定阻断。
  - 建议：预发阶段再次关注 CI 中是否稳定复现。

#### P1
- migration 文件编号存在重复前缀现象，例如本地执行日志显示：
  - `000136_idempotency_request.sql`
  - `000136_s9f_energy_billing_allocation.sql`
  - 当前顺序 SQL 执行仍可跑通，但这属于 migration 治理不足的信号。
  - 该问题归属于 `P1-2 migration 机制治理`，本轮只记录，不修复。

#### P2
- 当前 WSL 宿主机进程对容器映射端口的直连仍有环境限制。
  - 现象：宿主机 `curl http://127.0.0.1:3101/...` 失败。
  - 替代路径：容器内请求 `/api/v1/health`、`/api/v1/ready` 与 `verify-api-login-dockerexec.sh` 已通过。
  - 判断：不影响当前基线结论，但预发环境建议按真实接入方式再补一轮宿主机侧验证。

### 7. 当前 main 是否可作为预发验收基线

结论：**可以，带条件通过。**

判断依据：

- 当前 `main` 已完成关键 P0 主线收口：
  - production seed 初始化闭环
  - bootstrap-admin
  - 认证 mock 生产收口
  - 真实幂等控制第一版
  - release-smoke CI 门禁
- P1 中健康检查分层、本地文件存储收口、首发菜单白名单也已形成稳定基线。
- 最关键的初始化闭环已在独立临时库上完成前后态实测：
  - 无 admin 时 `FAIL`
  - `bootstrap-admin` 后 `PASS`

仍需注意：

- 真实生产环境变量值尚未最终拍板
- 预发 / 生产验收流程还需要制度化
- migration 执行历史机制仍未治理
- 宿主机侧直连容器映射端口仍受当前 WSL 环境限制

因此更准确的口径是：

> 当前 `main` 已具备进入预发验收和上线准备的基线条件，但仍需补齐环境真实值确认与验收流程制度化。

### 8. 下一阶段建议

建议下一阶段进入以下工作：

1. 预发环境完整验收
   - 初始化闭环
   - `/health` `/ready`
   - `verify-api-login`
   - 文件上传下载与重启后可用性
   - 幂等重放验证

2. 上线 SOP 编写
   - 部署步骤
   - 初始化步骤
   - 验收步骤
   - 值守检查清单
   - 禁止操作清单

3. 备份 / 恢复 / 回滚演练
   - PostgreSQL
   - `api-files-data`
   - 恢复后抽样验证

4. `P1-2 migration` 机制治理设计
   - 执行记录表
   - 执行状态追踪
   - 失败可回溯
   - 重复执行保护
