# 实施计划

1. TenantsService 在 create/updateLoginSettings/assignModules 的 asset 模块路径调用统一、串行化的 scope provisioning：确定唯一有效园区来源、拒绝重复投影、恢复 disabled 投影，并初始化 12 controls/24 audits。
2. 扩展 000194 classifier 的严格 seed-reconcile 状态。
3. 更新 production seed 000007 的动态租户修复契约并触发本次生产 seed。
4. 在隔离 PostgreSQL 验证 missing asset → seed → ready_exact。
5. 执行单测、lint、typecheck、build、Release Smoke。
6. 中文 PR、Codex Review、合并并监控部署成功。

## 验证记录

- 隔离 PostgreSQL/API：创建 `system+asset` 新租户，`biz_park=1`、`asset_park=1 enabled` 且编码一致。
- Review 修复隔离验证：新租户创建响应 201，同一事务落库 `asset_park=1`、runtime controls=12、contract audits=24、final v3 controls=12；在 `RUN_PRODUCTION_SEED=no` 语义下诊断仍为 `ready_exact`、blocked=0。
- 独立模块分配：从 system-only 租户启用 asset 后生成唯一 enabled 投影；disabled 投影由业务写路径恢复。
- 历史收敛：删除投影后分类为 `ready_missing_asset_seed_reconcile`；运行 production seed 后 13 个 scope 全部 `ready_exact`；disabled 投影保持 `invalid_scope`。
- `verify-000194-runtime-control-retry.sh`：历史重试链与 fresh-order fixture 通过。
- 全仓：lint、typecheck、API 1147 项单测（1134 通过、13 跳过）、全部 Web 单测、API/Web build 通过。
