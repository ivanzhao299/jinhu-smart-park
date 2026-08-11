# Phase 3 本地质量门（2026-08-06）

## 最终结论

- 冲突与闭包相关 targeted tests：PASS。
- workspace lint、typecheck、unit tests、production build：PASS。
- 全新隔离 PostgreSQL 16 上迁移、production seed、bootstrap-admin、严格初始化
  baseline：PASS。
- `000199_floor_layout_deleted_file_backfill.sql` 在全新库执行成功且历史记录为 1。
- 隔离门禁清理后 containers/volumes/networks residual：`0/0/0`。
- 开放 P0/P1：无。

## 代码质量门

使用 Node `v22.23.2` / pnpm workspace 运行：

- `pnpm --filter @jinhu/shared build`：PASS。
- `pnpm --filter @jinhu/api build`：PASS。
- `pnpm --filter @jinhu/web lint`：PASS。
- `pnpm typecheck`：PASS。
- `pnpm test:unit`：PASS；API 1030 tests（1017 pass、13 skip、0 fail），Web
  floor-layout 10/10、safety 32/32、system 22/22。
- `pnpm build`：PASS；API Nest build 和 Web Next.js production build，158/158
  static pages。
- `pnpm lint`：首次发现
  `homestay-identity-checkin-atomic.pg.spec.ts` 在 `finally` 中抛错违反
  `no-unsafe-finally`；将主错误/cleanup 错误及聚合抛出移动到 `finally` 之后，目标
  ESLint、目标测试及 workspace lint 重跑 PASS。

已通过的 targeted suites 包括 Files、Identity、Property、offline queue、upload，以及
迁移/RBAC collision regression。详细测试计数见 `conflict-adjudication-20260806.md` 和
`phase2-audit-20260806.md`。

## 隔离 release-init 门禁

### 隔离边界

- 使用临时 Compose project `pr192-phase3-20260806`。
- 唯一 PostgreSQL 容器和唯一 named volume；不发布宿主端口。
- 数据库为一次性 `jinhu_pr192_phase3_20260806_retry`。
- 未连接或修改 `jinhu_uat_20260804`、`jinhu_smart_park`。
- 生产安全变量显式设置：文件存储根目录、SMS fixed code 空值、SMS code visible
  false、WeChat mock false。

### 结果

- migration files：199 succeeded / 0 failed / 0 skipped。
- migration prerequisites：2 succeeded / 0 failed。
- 双 migration history conflict：0。
- 最后成功 migration：`000199_floor_layout_deleted_file_backfill.sql`。
- production seed：PASS；active permission rows 852。
- bootstrap-admin：created；admin rows 1。
- `STRICT=true pnpm db:check:init`：全部检查 PASS。
- cleanup：containers 0、volumes 0、networks 0。

第一次空库执行迁移、seed、bootstrap 均成功，但严格 baseline 因测试环境未显式设置
`FILE_STORAGE_LOCAL_ROOT`、`AUTH_SMS_CODE_VISIBLE` 和
`AUTH_WECHAT_MOCK_ENABLED` 返回 WARN/exit 1。该一次性库随后清理为 residual 0；第二次
从新的空库、按生产安全基线显式设置变量后全部 PASS。这个预检失败归类为门禁 harness
配置，不是产品、migration 或 seed 缺陷。

第二次外层自写 `EXIT` trap 最终返回 1，但仓库命令日志、数据库断言和 Compose cleanup
均成功。独立 reviewer 确认未见 P0/P1；随后用独立 shell 逐项断言迁移、seed、bootstrap、
严格 baseline 日志以及当前 Docker residual，命令 exit 0。不得把自写 trap 的状态捕获
问题描述为仓库 gate 失败。

## 尚未覆盖

- GitHub PR verify 与带 `run-release-smoke` label 的 release-smoke 尚未运行；属于 Phase 4。
- final PR head 的 rollback 19/19 和 formal performance 30/30 尚未运行；属于 Phase 5。
- 本地 release-init 只覆盖 PostgreSQL 初始化合同；API 容器健康与登录流保留给干净
  GitHub Actions release-smoke runner，避免本机固定 production Compose 名称污染现有服务。
