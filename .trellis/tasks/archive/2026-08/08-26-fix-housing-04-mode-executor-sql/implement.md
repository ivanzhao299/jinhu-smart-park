# Execution Plan

## Implement

- [x] 亲读 property operations service 的单条/批量 snapshot SQL、executor 与现有 PG specs。
- [x] 补充完整 execute path 的真实 PostgreSQL 回归，复现 transition-log INSERT 参数推导失败。
- [x] 对 transition-log INSERT 的 tenant/park SELECT 参数添加最小显式 cast，保持 scope 与返回结构不变。
- [x] 运行 targeted unit/PG specs、lint、typecheck、build。

## Review and release

- [x] Trellis full-scope check，审查 SQL 类型、tenant scope、测试真实性。
- [x] commit/push `codex/fix-housing-04-mode-executor-sql`，PR [#408](https://github.com/ivanzhao299/jinhu-smart-park/pull/408) 关联 #406。
- [x] Codex review 完成；required CI 全绿后 squash merge `10feefb6`。
- [x] merge main CI 与 Deploy Production 双绿。
- [x] 修复上线后统一住房 UAT 重放 C03-D：后续轮批准执行成功，最终轮 mode 为 `long_rent/enabled/version 2`。

## Closure evidence (2026-08-27)

- 三轮递进证据见 `housing-full-flow-uat-20260826-120125.md`、`housing-fix-retest-uat-20260826-193245.md`、`housing-final-retest-uat-20260827-114806.md`；最终报告 PR [#426](https://github.com/ivanzhao299/jinhu-smart-park/pull/426) 双绿。
- residual 依 PR [#428](https://github.com/ivanzhao299/jinhu-smart-park/pull/428) 新 SOP，以隔离环境数据卷整体销毁、project/端口归零通过 immutable 类门禁；审计 trigger 未被绕过。
- 真人签署、跨园区与 Chrome MCP `N/A` 限制保留。

## Rollback points

- PG spec 不能稳定复现：停止猜测，保留 Issue 证据并重新定位 SQL。
- 需要 migration/seed：停止本 PR，先做逐租户与生产合规论证。
- 修复改变业务谓词或 effect proof：回退到只处理参数类型的最小面。
