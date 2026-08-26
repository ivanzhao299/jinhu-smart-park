# Execution Plan

## Implement

- [x] 亲读 property operations service 的单条/批量 snapshot SQL、executor 与现有 PG specs。
- [x] 补充完整 execute path 的真实 PostgreSQL 回归，复现 transition-log INSERT 参数推导失败。
- [x] 对 transition-log INSERT 的 tenant/park SELECT 参数添加最小显式 cast，保持 scope 与返回结构不变。
- [x] 运行 targeted unit/PG specs、lint、typecheck、build。

## Review and release

- [x] Trellis full-scope check，审查 SQL 类型、tenant scope、测试真实性。
- [ ] commit/push `codex/fix-housing-04-mode-executor-sql`，PR 关联 #406。
- [ ] Codex review 最多三轮；required CI 全绿后 squash merge。
- [ ] 核验 merge main CI 与 Deploy Production 双绿。
- [ ] 修复全上线后的统一住房 UAT 中重放 C03-D。

## Rollback points

- PG spec 不能稳定复现：停止猜测，保留 Issue 证据并重新定位 SQL。
- 需要 migration/seed：停止本 PR，先做逐租户与生产合规论证。
- 修复改变业务谓词或 effect proof：回退到只处理参数类型的最小面。
