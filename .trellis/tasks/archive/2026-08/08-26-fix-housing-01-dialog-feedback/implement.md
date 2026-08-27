# Execution Plan

- [x] 读取 Web 规范、通用 dialog、operation 写入链和现有测试。
- [x] 增加 dialog 内错误槽并接入 mode transition feedback。
- [x] 补充 source contract 回归并运行 Web 验证。
- [x] review、PR、CI、merge、main 双绿：PR [#409](https://github.com/ivanzhao299/jinhu-smart-park/pull/409)，merge `ca455978`；PR CI、main CI 与 Deploy 均成功。
- [x] 统一住房修复复测中真实 Chrome 重放：最终复测 C02 无审批人 409 在 dialog 内以 `role=alert` 可见，失败不关闭弹窗；见 `docs/uat/housing-final-retest-uat-20260827-114806.md`。

## Closure evidence (2026-08-27)

- 修复链 #408/#409/#410/#413/#414 与 Issue #420（修复 PR #423）均已上线；最终证据报告由 PR [#426](https://github.com/ivanzhao299/jinhu-smart-park/pull/426) 合并且 main CI/Deploy 双绿。
- residual 按 PR [#428](https://github.com/ivanzhao299/jinhu-smart-park/pull/428) 的新 SOP 重分类：可删业务 fixture 精确清理；immutable 审计/效果记录保留，以 `RUN_ID=20260827-114806` compose 数据卷整体销毁、project 资源 0、四端口监听 0 为归零证据，未禁用 trigger、未使用 `session_replication_role`、未 TRUNCATE。
- 真人具名签署、跨园区 fixture 与 Chrome MCP 本轮 `N/A` 继续如实保留，不作为本修复任务的虚构 PASS 证据。
