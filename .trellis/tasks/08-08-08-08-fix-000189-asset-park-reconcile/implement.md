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
