# Execution Plan

1. 从最新 `origin/main` 建 `codex/fix-housing-g01-uat-runtime-entry`，核验 #413 main CI/Deploy。
2. 阅读既有 UAT safety、docker compose psql、runtime control 与审计表模式，冻结命令参数和 SQL CAS。
3. 新增命令、根 package script、契约测试和 UAT 文档；不修改 production deploy/seed/migration。
4. 运行契约测试、相关静态契约、lint/typecheck/build 与 `git diff --check`；执行 Trellis check。
5. 在 Issue #405 评论最小方案与安全边界，commit/push/PR `Closes #405`，Codex review ≤3，修复有效 finding 后等待 PR CI。
6. merge 后周期性核验 main CI 与 Deploy Production 双绿；等待期间准备复测环境与矩阵。
7. 从全修复 main 重建隔离 UAT，使用新命令启用 approval runtime，完成 C03-D/C04-C10、DB/截图/manifest/residual/清理。
8. 提交复测报告 PR，review/CI/merge/main 双绿后归档 #405 子任务和住房 UAT 父任务。

## Closure evidence (2026-08-27)

- 步骤 1-6 已由 PR [#414](https://github.com/ivanzhao299/jinhu-smart-park/pull/414)（Closes #405，merge `27de6069`）完成：生产相似目标 fail-closed、disposable 环境 CAS 启用与同事务 `sys_op_log` 审计均有契约验证；PR CI、后续 main CI 与 Deploy 成功。
- 步骤 7-8 已由 `RUN_ID=20260827-114806` 最终复测及报告 PR [#426](https://github.com/ivanzhao299/jinhu-smart-park/pull/426) 完成；runtime 入口只用于隔离非生产环境，没有生产直操作。
- residual 依 PR [#428](https://github.com/ivanzhao299/jinhu-smart-park/pull/428) 新 SOP：保留 immutable 审计记录，以 compose 数据卷整体销毁、project 资源 0、四端口 0 为归零证据；没有禁用 trigger、`session_replication_role` 或 TRUNCATE。
- 真人具名签署、跨园区 fixture 与 Chrome MCP `N/A` 限制继续保留。
