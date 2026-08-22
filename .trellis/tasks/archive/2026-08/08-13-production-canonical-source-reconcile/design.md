# 技术设计

## 边界与顺序

1. 预部署只读诊断识别“唯一投影可确定 survivor、000207 尚未成功”的历史歧义，允许发布进入 migration。
2. `000207` 在单事务中创建不可变审计结构、锁定候选 scope、校验 exact evidence、审计并软停用非匹配来源。
3. migration runner 记录 `000207` 成功。
4. `prod-deploy.sh` 在 migration 后重新执行 000189/000194 enforce；任何非 ready 状态立即停止，API 保持停止。
5. 可选 production seed 执行；服务启动、健康检查、UAT 和 Docker cleanup 继续原有流程。

## Migration Contract

- 文件：`database/migrations/000207_asset_scope_canonical_source_reconcile.sql`。
- 候选 scope 来自有效 `asset` assignment；仅处理 active canonical source count > 1 的 scope。
- survivor 必须是唯一 enabled/nondeleted `asset_park.park_code` 在同 scope active/nondeleted `biz_park` 中的唯一匹配。
- 使用固定 migration advisory lock，再 `FOR UPDATE` 锁定候选 assignment、tenant、asset projection 与 biz park 行。
- 每个 retired 行先插入审计，再更新 `status=0,is_deleted=true,version=version+1`；使用固定 `update_by/remark`。
- evidence hash 对 migration key、scope、survivor、retired、before/after 状态版本和 occurred_at 的规范文本计算 SHA-256。
- 审计表使用唯一 migration/scope/retired identity，并通过 trigger 禁止 UPDATE/DELETE。
- 后置条件要求每个处理 scope 只有一个 active source、其 ID/code 等于 survivor、审计数等于 retired 数；否则回滚。

## Diagnostic Contract

- 000189/000194 共享可证明条件：tenant=1、asset enabled=1/nondeleted=1、source>1、projection code match=1。
- 临时 ready 分类还要求 000207 在两张 migration history 中都没有 succeeded；若已成功后再次出现歧义，分类必须 invalid。
- 000194 还必须保留 controls/audits exact-set 与 evidence 校验，不能让新分类抢占 extra/missing/definition/audit drift。

## Deployment Contract

- 不把 migration 后诊断放在 GitHub runner 的 migration 前步骤，而放进远端 `prod-deploy.sh` 的 `run_migrations_and_optional_seed`：migration 成功后、seed 前执行。
- 后置诊断使用同一 Compose/数据库配置；失败时不启动 API，不继续 seed。
- 源码回滚仍不逆转数据库；000207 成功后旧源码只作为应用回滚，新 runner 必须能读取新 history。

## Compatibility And Rollback

- 新 migration forward-only；恢复依赖发布前数据库备份与审计证据，不提供自动 down。
- 对无候选歧义的 clean/fresh 数据库只创建审计结构并 no-op。
- production seed 保持不变，避免职责混合。
