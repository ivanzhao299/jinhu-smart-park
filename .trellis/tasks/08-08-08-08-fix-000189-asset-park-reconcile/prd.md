# 修复 000189 资产园区投影部署重试

## Goal

修复生产部署 run 31259810154 中 003_asset_park_scope_reconcile 前置项误拒绝历史园区数据，并补充可重试与同类回归合同。

## Requirements

- 保持已成功的历史 migration `000189_property_b_module_rbac_definitions.sql` 字节不变。
- 只修正生产中记录为 `failed` 且事务已回滚的
  `003_asset_park_scope_reconcile.sql`，允许 runner 以新 checksum 安全重试。
- 已有且唯一有效的 `asset_park` 投影必须直接视为满足条件，不得因缺少同 scope
  `biz_park` 而误报失败，也不得覆盖、重启用或改写该资产记录。
- 缺失 `asset_park` 时优先从同 scope 唯一有效的 `biz_park` 投影；默认生产 scope
  `10000001/20000001` 允许从全局唯一的 active `park_code=JH` 历史基线行投影，兼容旧 seed
  在 `ON CONFLICT (park_code)` 时保留旧 scope ID 的状态。
- 非法 scope、失效/重复租户、重复资产投影、缺失或歧义来源继续 fail closed，并输出不含密钥的分类计数。
- production seed 使用同一来源优先级和后置唯一性合同，避免迁移与 seed 再次漂移。
- Release Smoke 必须真实回放“已有 asset_park 但无同 scope biz_park”与“默认 JH park
  仍是 legacy scope 且 asset_park 缺失”两种生产历史。
- 同步 migration prerequisite 合同测试、部署文档和 Trellis 运维规范。

## Acceptance Criteria

- [x] `003` 在已有唯一 active `asset_park`、同 scope `biz_park` 缺失时成功且不改资产行。
- [x] `003` 能把唯一 active legacy-scope `JH` 园区投影到默认 canonical scope。
- [x] 同 scope 唯一 `biz_park` 始终优先于默认 fallback；所有歧义/无来源状态仍失败。
- [x] failed prerequisite 通过 runner 更新 checksum 后成功，随后不可变 `000189` 成功。
- [x] production seed 与 prerequisite 的解析合同一致且幂等。
- [ ] 静态合同、真实 PostgreSQL 回放、Release Smoke、shell/YAML/diff 门禁通过。
- [ ] 提交、推送并创建 Draft PR；不自动部署或合并。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
