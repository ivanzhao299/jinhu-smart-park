# 实施计划

1. 重构 `003_asset_park_scope_reconcile.sql` 的 target/source 状态计算、分类预检与后置条件。
2. 同步 `database/seeds/production/000007_asset_park_scope_reconcile.sql`。
3. 扩展静态 prerequisite contract，冻结 fallback 边界、写边界和 target-wide postcondition。
4. 扩展 Release Smoke 的 isolated `000189` retry：
   - 手工执行 prerequisite，验证已有 asset/no exact biz 不写坏数据；
   - 构造 legacy-scope `JH` + missing asset，经 runner 验证 checksum 更新、fallback 与 000189 成功。
5. 同步 prerequisite README、生产部署/迁移策略和 Trellis 运维规范。
6. 运行真实 PostgreSQL 回放、静态合同、YAML/shell/diff 检查和相关 CI 门禁。
7. 独立复核后提交、推送、创建 Draft PR，并触发 Codex review；不自动部署/合并。
8. 增加只读生产 scope 诊断脚本与 workflow_dispatch 诊断模式，并以静态合同证明它不进入部署写路径。
9. 在 API/full 正常部署的源码同步前运行同一 enforce 门禁，失败时保留当前线上源码与服务。
10. 用分支 workflow 执行只读诊断，根据非敏感生产证据设计确定性数据修复，并把实际形态补入 Release Smoke。
11. 按 break-loop 复盘测试形态缺口与隐含假设，更新 Trellis migration prerequisite/运维规范。
