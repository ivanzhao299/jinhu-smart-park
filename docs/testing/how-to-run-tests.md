# JinHu Smart Park 测试运行手册

本手册用于说明当前仓库内最常用的工程门禁、首发回归入口和常见排查方式。

## 1. 工程门禁

常用基础门禁：

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
```

说明：

- `lint` 用于静态质量检查
- `typecheck` 用于类型校验
- `build` 用于 API 和 Web 构建验证
- `test:unit` 递归运行 API 单测，并运行楼层布局、安全管理和系统管理前端逻辑单测

## 2. 首发核心回归包

统一入口：

```bash
node scripts/e2e/first-release-regression.mjs
```

运行前置条件：

- API 已启动
- 数据库已完成 migration
- `production seed` 已执行
- `bootstrap-admin` 已完成
- 管理员账号可登录

说明：

- runner 只负责串行执行现有首发回归脚本
- runner 不负责启动 API 或数据库

生产或预生产 Go / No-Go 判断请同时参考 [生产验收矩阵与风险清单](../release/production-readiness-matrix.md)。该矩阵按必跑、财务相关必跑、安全 / IoT 相关必跑、发布前完整回归分层列出命令，并标注本地、预发、生产环境适用性。

## 3. 单独执行回归脚本

可按需单独运行：

```bash
node scripts/e2e/first-release-auth-health.mjs
node scripts/e2e/first-release-idempotency.mjs
node scripts/e2e/first-release-menu-whitelist.mjs
node scripts/e2e/first-release-files.mjs
node scripts/e2e/first-release-users-assets.mjs
node scripts/e2e/first-release-workorders.mjs
node scripts/e2e/first-release-leasing.mjs
```

RBAC, first-release menu, dashboard visibility, denied-route, and permission consistency release checks are defined in [rbac-menu-dashboard-permission-release-checks.md](./rbac-menu-dashboard-permission-release-checks.md). Production use is read-only by default and requires release-owner approval before browser sampling.

## 4. 环境变量

回归脚本主要使用以下环境变量：

- `API_BASE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `TEST_RUN_ID`
- `IDEMPOTENCY_KEY_PREFIX`
- `TENANT_ID`
- `PARK_ID`

说明：

- 不要在文档或脚本中写入真实生产密码
- 若未提供 `TEST_RUN_ID`，统一 runner 会自动生成
- 若未提供 `IDEMPOTENCY_KEY_PREFIX`，统一 runner 会默认使用 `first-release-regression`

## 5. CI 门禁

当前 CI 仍以以下门禁为主：

- `verify`
- `release-smoke`

说明：

- `release-smoke` 负责校验 migration、production seed、bootstrap-admin、基线检查、健康检查和登录验证
- 当前 `first-release regression runner` 尚未纳入 CI
- 如未来要接入 CI，建议单独提交 PR 评估稳定性、耗时和环境依赖

## 6. 常见失败排查

常见问题与排查方向：

- API 未启动：
  - 检查 `API_BASE_URL`
  - 检查 API 端口是否已监听
- 管理员账号不存在：
  - 检查 `bootstrap-admin` 是否已执行
  - 检查 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 是否正确
- 数据库未初始化：
  - 检查 migration 是否已执行
  - 检查 `production seed` 是否已执行
- `/ready` 失败：
  - 检查数据库连通性
  - 检查文件存储目录
  - 检查基线初始化状态
- `idempotency key conflict`：
  - 更换 `TEST_RUN_ID`
  - 检查是否重复使用相同 `X-Idempotency-Key`
- 文件上传失败：
  - 检查 `FILE_STORAGE_LOCAL_ROOT`
  - 检查目录写权限
  - 检查文件大小或 MIME 限制
- migration checksum conflict：
  - 检查 migration 文件是否被变更
  - 参考 [../release/production-migration-execution-policy.md](../release/production-migration-execution-policy.md)
  - 参考 [../release/migration-history-checksum-design.md](../release/migration-history-checksum-design.md)
- migration prerequisite：
  - 运行 `pnpm test:e2e:migration-prerequisites` 检查 `000175` / `000189` / `000194` / `000200` 不变、
    最小角色/模块目录边界、`000194` insert-only runtime-control 收敛、双 history 原子写入和权限修复矩阵
  - 空库执行 `pnpm db:migrate` 后，确认两张 history 表中的
    `prerequisite:000064_s3e_checkout_effective.sql:001_core_role_templates.sql`
    与 `prerequisite:000189_property_b_module_rbac_definitions.sql:001_asset_module.sql`
    均为 `succeeded`
  - prerequisite 失败或 running 时不得继续目标 migration
  - Release Smoke 运行 `scripts/e2e/verify-000194-runtime-control-retry.sh`：先迁移到 `000193`，再写入
    production-shaped assignment/seed，证明空 runtime-control 集合会被只读门禁识别、由新 prerequisite
    补齐，unchanged failed `000194` 重试成功；随后必须继续执行 `000195` 到 `000201` 与完整 production
    seed 集合，回放 failed immutable-checksum `000200` 的受审 replacement，并验证 final v3、双 correction
    audit 的时间/证据哈希绑定、generated checksum 和 immutable-source 成功记录兼容跳过；另以独立空库
    按真实 `migration -> production seed` 顺序执行并重跑 seed，验证 seed 后新增 asset scope 收敛为 exact v3
    与双 correction audit；若 fixture 存在当前 `JH_LEASING_LEAD` 责任角色，还必须验证 000009 唯一补授
    `workorder:create`。post-v3 缺行、额外 key 与定义漂移必须失败关闭
  - CI workflow 的 run shell 必须显式启用 `pipefail`；任何通过 `tee` 留存日志的 migration、seed、
    bootstrap、baseline 或 login 命令都必须传播原命令的非零退出码
  - 人工故障注入需覆盖两表 status/checksum 分歧、单边缺行和第二表写失败整体回滚
  - production seed 后检查 `OPERATIONS_OWNER`、`EXECUTIVE`、`AUDITOR` 的代表性安全/工程权限

更多运行态排查可参考 [../deployment/troubleshooting.md](../deployment/troubleshooting.md)。
