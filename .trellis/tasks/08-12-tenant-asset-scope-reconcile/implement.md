# 实施计划

1. 抽取统一、串行化的 asset scope provisioning；TenantsService create/updateLoginSettings/assignModules、SaaS tenant-module assign/enable 及 AssetsService createPark 共用同一 tenant/park 事务锁，确定唯一有效园区来源、拒绝重复投影、恢复 disabled 投影，并初始化 12 controls/24 audits。
2. 扩展 000194 classifier 的严格 seed-reconcile 状态。
3. 更新 production seed 000007 的动态租户修复契约并触发本次生产 seed。
4. 在隔离 PostgreSQL 验证 missing asset → seed → ready_exact。
5. 执行单测、lint、typecheck、build、Release Smoke。
6. 中文 PR、Codex Review、合并并监控部署成功。
7. Review 生命周期补强：禁用/过期 asset assignment 后保留完整 signed history 为 validation-only scope；active/retained 均拒绝 disabled 非删除重复投影，并同步 diagnostic/000008/PG fixture。
8. Review 授权与审计补强：所有非删除园区同步模块/TENANT_ADMIN 权限，仅 active 园区 provision asset；retained 租户过期不误判；active/retained 的修正审计内容和 evidence 均严格校验。
9. inactive-only 租户仍以首个非删除园区作为授权参考 scope 完成模块与 TENANT_ADMIN 收敛，不把 inactive 园区当成资产 canonical source。
10. Review #5 补齐所有资产园区 mutation：create 执行完整 canonical provisioning，update/delete 共用 scope 锁且 active assignment 下禁止破坏 enabled 投影；inactive park 强制停用 asset assignment/权限；默认 scope 多来源时与 000007 一致选择全局唯一 JH。
11. Review #6 将 canonical biz_park create/update/delete 纳入同一锁并同步投影；active/retained history 均保护唯一 enabled 投影与 active source；资产投影 DTO 的派生字段改为 canonical 一致性断言；tenant disable/expiry 在 diagnostic/seed 中归入 retained scope。
12. Review #7 同步 000007 的 active tenant 过滤；跨 scope 的全局 JH fallback mutation 同时获取默认 scope 锁并同步默认投影；面积一致性按数值比较以兼容 numeric 标度。
13. Review #8：园区去重 active 优先；canonical 冗余来源允许安全清理；inactive 园区提供 system + park read/update 恢复通道；应用侧补审计时间链；retained scope 仅 final contract ready。

## 验证记录

- 隔离 PostgreSQL/API：创建 `system+asset` 新租户，`biz_park=1`、`asset_park=1 enabled` 且编码一致。
- Review 修复隔离验证：新租户创建响应 201，同一事务落库 `asset_park=1`、runtime controls=12、contract audits=24、final v3 controls=12；在 `RUN_PRODUCTION_SEED=no` 语义下诊断仍为 `ready_exact`、blocked=0。
- 独立模块分配：从 system-only 租户启用 asset 后生成唯一 enabled 投影；disabled 投影由业务写路径恢复。
- 历史收敛：删除投影后分类为 `ready_missing_asset_seed_reconcile`；运行 production seed 后 13 个 scope 全部 `ready_exact`；disabled 投影保持 `invalid_scope`。
- `verify-000194-runtime-control-retry.sh`：历史重试链与 fresh-order fixture 通过；覆盖停用 asset assignment 的 `ready_retained_exact`、控制签名漂移双重阻断、disabled 非删除重复投影双重阻断。
- Review #4 完整 PG 重跑通过：active scope 审计 evidence 篡改被 diagnostic/seed 同时阻断；租户过期后的 retained scope 仍为 `ready_retained_exact`；缺失控制继续输出精确 `missing_control` 分类。
- API 针对性 21 项测试通过；API lint、typecheck、build 通过；migration prerequisite contract 与脚本语法通过。
- 全仓：lint、typecheck、API 1153 项单测（1140 通过、13 跳过）、全部 Web 单测、API/Web build 通过。
