# Execution Plan

- [x] 读取 shared/RBAC/seed/migration 规范及 000262 教训。
- [x] 更新 bundle、template 和 production seed canonical metadata。
- [x] 编写 tenant-aware forward migration 与静态契约。
- [x] 真实 PostgreSQL multi-tenant/replay/drift 验证。
- [x] full quality gate、review、PR、CI、merge、main 双绿：PR [#410](https://github.com/ivanzhao299/jinhu-smart-park/pull/410)，merge `09b4da0e`；PR Release Smoke 与 Deploy 成功，后续 main CI 成功链覆盖该提交。
- [x] 统一住房修复复测中真实审批岗重放：最终复测恢复普通审批角色后，独立审批账号从 `/housing/tasks?requestId=...` 读取并批准任务，executor 推进至 `long_rent/enabled/version 2`。

## Closure evidence (2026-08-27)

- 最终证据见 `docs/uat/housing-final-retest-uat-20260827-114806.md` 与 PR [#426](https://github.com/ivanzhao299/jinhu-smart-park/pull/426)；修复发布链及后续 main CI/Deploy 已通过。
- residual 按 PR [#428](https://github.com/ivanzhao299/jinhu-smart-park/pull/428) 新口径，以独占 RUN_ID 环境数据卷整体销毁、project/端口归零通过 immutable 类门禁；审计保护未被绕过。
- 真人具名签署、跨园区 fixture、Chrome MCP `N/A` 限制保留。
